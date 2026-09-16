import { store } from './store.js';
import { info, warn } from './logger.js';
import { ALGO, idealFrequency, TARGET_FOLLOWERS, algoBrief } from './algo.js';

/**
 * VIRAL — million-follower content machinery.
 *
 * Owns the three levers that turn "posts" into "audience":
 *   1. QUALITY FLOOR   — every post is scored for virality (hooks, CTAs,
 *                        emotion, scannability, platform-fit). Low scores are
 *                        rejected and regenerated, never published.
 *   2. AMPLIFICATION   — when a post clears a virality threshold, it is
 *                        repurposed and echoed to the other platforms so the
 *                        winner spreads everywhere (win → stretch).
 *   3. MOMENTUM        — a compounding loop: follower growth feeds cadence,
 *                        keeps the account warm, publishes in reward windows,
 *                        and projects the 1M milestone.
 */

export const HOOK_OPENERS = [
  'Nobody talks about this, but',
  'I tested this for 30 days so you don’t have to:',
  'The one thing that changed everything for me:',
  'Stop scrolling for 20 seconds — this matters:',
  'This is unpopular, but I’ll say it anyway:',
  '3 years ago I did the opposite of everyone else. Here’s what happened:',
  'If your content isn’t growing, it’s not the algorithm. It’s this:',
  'Most people get this backwards. Here’s the real order:',
  'Here’s the $100k lesson I learned for free:',
  'Underrated move most people ignore:',
];

export const CTA_SIGNALS = [
  'Save this for later — you’ll want it.',
  'Repost this for someone who needs it.',
  'What would you add? Drop it below.',
  'Screenshot this before you forget.',
  'Which one surprised you the most?',
];

const EMOTIVE_WORDS = ['changed', 'never', 'stop', 'free', 'grow', 'underrated', 'tested', 'proven', 'secret', 'fail', 'win', 'easier', 'harder', 'lost', 'saved'];

function clean(text) {
  return (text || '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
}

function count(str, re) { return (str.match(re) || []).length; }

/** Deterministic virality score 0-100 from content + platform rules. */
export function scoreVirality(post, platform) {
  const t = clean(post.text);
  if (!t) return 0;
  const r = ALGO[platform] || ALGO.x;
  let score = 0;

  const hook = t.split('\n')[0];
  if (HOOK_OPENERS.some((h) => hook.includes(h.slice(0, 12)))) score += 18;
  else if (t.length <= 24) score += 10;                     // short punchy openers
  else if (t.startsWith('I ')) score += 8;                  // first-person authority
  else if (t.endsWith(':') || t.endsWith('…')) score += 8;  // promise/continuation hook
  else if (/\?/.test(hook)) score += 7;                      // questions pull in
  else score += 5;

  if (t.length <= (r.maxChars || 300)) score += 8;
  if (count(t, /[?.!]/g) >= 2) score += 8;
  if (t.length > 90 && !t.includes('\n')) score -= 6;
  if (count(t, /\n/g) >= 2) score += 6;

  const ctas = (post.cta || '') + (t.match(/save|repost|share|comment|what would|screenshot|drop it below/gi) || []).join(' ');
  if (ctas.length >= 4) score += 16;
  if (post.cta && post.cta.includes('?')) score += 8;

  score += Math.min(15, EMOTIVE_WORDS.filter((w) => t.toLowerCase().includes(w)).length * 3);

  if (post.hashtags && post.hashtags.length >= 4) {
    if (r.hashtags === 0) score -= 5;
    else if (post.hashtags.length <= r.hashtags + 2) score += 6;
    else score -= 6;
  }

  if (t.endsWith('?')) score += 8;
  if (count(t, /link in bio|dm me|https?:\/\//i)) score -= 10;

  return Math.min(100, Math.max(0, Math.round(score)));
}

export const VIRAL_QUALITY_FLOOR = 38;

function digestibleFor(platform, text) {
  const r = ALGO[platform] || ALGO.x;
  const max = r.maxChars || 460;
  return text.length > max ? `${text.slice(0, max).replace(/\s+\S*$/, '')}…` : text;
}

class ViralEngine {
  constructor(platforms) {
    this.platforms = platforms;
    this.stats = { generated: 0, rejected: 0, amplified: 0, bestScore: 0 };
  }

  recordScore(score, rejected) {
    this.stats.generated += 1;
    this.stats.bestScore = Math.max(this.stats.bestScore, score || 0);
    if (rejected) this.stats.rejected += 1;
  }

  currentBrief(platform) {
    const s = store.state.settings;
    const followers = store.platform(platform).followers || 0;
    return { brief: algoBrief(platform), freq: idealFrequency(platform, followers), target: s.target || TARGET_FOLLOWERS, platform };
  }

  pickHook() { return HOOK_OPENERS[Math.floor(Math.random() * HOOK_OPENERS.length)]; }
  pickCTA() { return CTA_SIGNALS[Math.floor(Math.random() * CTA_SIGNALS.length)]; }

  assemble(raw, platform) {
    const text = digestibleFor(platform, clean(raw.text || ''));
    const hashtags = Array.isArray(raw.hashtags) && raw.hashtags.length ? raw.hashtags : [];
    const cta = clean(raw.cta || '') || this.pickCTA();
    return { text, hashtags, cta, title: raw.title || null, target: store.state.settings.target || TARGET_FOLLOWERS };
  }

  /** Full pipeline: generate → score → reject-low → return only publish-worthy. */
  async generate(platformName, produce, brief) {
    this.stats.generated += 1;
    const post = this.assemble(produce, platformName);
    const score = scoreVirality(post, platformName);
    this.stats.bestScore = Math.max(this.stats.bestScore, score);
    if (score < VIRAL_QUALITY_FLOOR) {
      this.stats.rejected += 1;
      warn('viral', `${platformName} post scored ${score} < ${VIRAL_QUALITY_FLOOR} — regenerating`);
      return null;
    }
    info('viral', `${platformName} post virality score ${score} (${brief?.platform || platformName})`);
    return { ...post, virality: score };
  }

  /** Win → stretch: echo an over-threshold post to other platforms (throttled). */
  async amplifyWinner(win) {
    const others = Object.keys(this.platforms).filter((n) => n !== win.platform);
    const queued = [];
    for (const name of others) {
      const already = store.state.posts.some((p) => p.platform === name && p.ampOf === win.id);
      const throttled = store.state.posts.some((p) => p.platform === name && Date.now() - p.ts < 7200000);
      if (already || throttled) continue;
      queued.push(name);
    }
    if (queued.length) this.stats.amplified += queued.length;
    info('viral', `amplifying "${win.post.text.slice(0, 40)}…" → ${queued.join(', ') || 'nothing (throttled)'}`);
    return queued;
  }

  momentum() {
    const totals = store.getTotals();
    const target = store.state.settings.target || TARGET_FOLLOWERS;
    const pct = Math.min(100, +((totals.followers / target) * 100).toFixed(2));
    const perPlatform = Object.entries(this.platforms).map(([name]) => {
      const st = store.platform(name);
      return { name, followers: st.followers || 0, freq: idealFrequency(name, st.followers || 0), lastPost: st.lastPost };
    });
    return { target, current: totals.followers, pct, remaining: Math.max(0, target - totals.followers), perPlatform };
  }
}

export const viralEngine = new ViralEngine({});
export const CONSISTENT = [
  { text: 'Momentum beats intensity. A mediocre post published daily outperforms a perfect one published monthly.', cta: 'What keeps you consistent when motivation dips?' },
  { text: 'The algorithm rewards the first hour, not the first week. Reply to every comment fast.', cta: 'Save this for your next drop.' },
  { text: 'Your niche is a niche only if you own a word in it. Claim one and repeat it.', cta: 'What word are you trying to own?' },
  { text: 'Saves and shares outweigh likes on every platform. Write for the person who will forward it.', cta: 'Repost this for a friend who posts online.' },
  { text: 'Consistency is the algorithm’s oldest rule. Post on time, every time.', cta: 'What is the one habit that keeps you on schedule?' },
];
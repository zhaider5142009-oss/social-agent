import { ai } from '../core/ai.js';
import { config } from '../config.js';
import { store } from '../core/store.js';
import { info, warn } from '../core/logger.js';
import { humanizeReply } from '../core/humanizer.js';
import { viralEngine, scoreVirality, CONSISTENT, VIRAL_QUALITY_FLOOR } from '../core/viral.js';
import { ALGO, idealFrequency, TARGET_FOLLOWERS } from '../core/algo.js';

const PLATFORM_RULES = {
  x: 'Short, sharp, thread-friendly; 1-2 lines max; punchy hook; 1-3 hashtags.',
  instagram: 'Caption 100-200 chars plus 8-12 hashtags; ask a question to drive comments; emojis allowed.',
  telegram: 'Newsletter-style paragraph; call-to-action; HTML-friendly plain text; no hashtags.',
  linkedin: 'Professional, story-driven; 3-6 short paragraphs; insights and lessons; subtle CTA.',
  discord: 'Casual community message; short; encourage a reaction or reply.',
  reddit: 'Valuable, non-spammy; conversational; formatted for markdown subreddits.',
  youtube: 'Hook-first video title + description; keyword-forward; clear value promise.',
  tiktok: 'Trendy hook line; short; guidance for video creators (we tag the script).',
  whatsapp: 'Short broadcast-style note; friendly; low-key CTA.',
  patreon: 'Exclusive-community tone; thanks supporters; preview + CTA to join.',
  snapchat: 'Very short story caption; casual; includes a visual idea.',
};

function fallbackPost(platform) {
  const item = CONSISTENT[Math.floor(Math.random() * CONSISTENT.length)];
  const tags = platform === 'tiktok' || platform === 'instagram' ? ['#growth', '#ai'] : ['#growth'];
  return { text: item.text, hashtags: tags, cta: item.cta, title: null };
}

export class ContentGenerator {
  constructor(platforms) {
    this.platforms = platforms;
  }

  async generateForPlatform(platformName, topic, tone, opts = {}) {
    const rule = PLATFORM_RULES[platformName] || 'Write a natural, engaging post.';
    const brief = viralEngine.currentBrief(platformName);
    const { freq, target } = brief;
    const followers = store.platform(platformName).followers || 0;
    const ctx = Object.entries(this.platforms)
      .map(([name, p]) => `${name} (${p.mode()})`)
      .join(', ');
    const winners = opts.winners || [];

    // Amplified repost (win → stretch): adapt the winning post to this platform.
    if (opts.sourcePost?.text) {
      const briefText = `This post WON on ${opts.sourcePost.platform || 'another platform'} (+${opts.sourcePost.gain || 0} followers). Adapt its core idea into a ${platformName} post with ${rule} Keep the strongest hook; never copy verbatim. Return JSON {"text":"...","hashtags":["..."],"title":"...","cta":"..."}`;
      for (let attempt = 0; attempt < 3; attempt++) {
        const out = await ai.plan(briefText, opts.sourcePost.text, { model: config.openrouter.modelFast, maxTokens: 600 });
        const post = viralEngine.assemble(out || {}, platformName);
        const sc = scoreVirality(post, platformName);
        viralEngine.recordScore(sc, sc < VIRAL_QUALITY_FLOOR);
        if (sc >= VIRAL_QUALITY_FLOOR) return { ...post, virality: sc, ampOf: opts.sourcePost.id };
        warn('content', `repost attempt ${attempt + 1} scored below floor for ${platformName}`);
      }
    }

    const sys = `You are the chief content engineer of an autonomous growth agent targeting ${target.toLocaleString()} followers.
Platform: ${platformName.toUpperCase()}. Rules: ${rule}
ALGORITHM BRIEF:
${brief.brief}
Momentum: publish ${freq}x/day, in reward windows.
Learn from these winners: ${winners.length ? winners.join(' | ') : 'none yet'}
Return JSON: {"text":"the post","hashtags":["#.."],"title":"optional title","cta":"one line inviting a save/reply/share"}`;

    const user = `Topic: ${topic || 'a valuable insight about the niche'}
Tone: ${tone || 'professional'} but human, not robotic.
Platform landscape right now: ${ctx}
Current followers on ${platformName}: ${followers}
Write the post now. Hook in the first line. Under 1200 characters. CTA that the algorithm rewards.`;

    let post = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const out = await ai.plan(sys, user, { model: config.openrouter.modelFast, maxTokens: 600 });
      post = viralEngine.assemble(out || {}, platformName);
      const sc = scoreVirality(post, platformName);
      viralEngine.recordScore(sc, sc < VIRAL_QUALITY_FLOOR);
      if (sc >= VIRAL_QUALITY_FLOOR) {
        info('content', `generated ${platformName} post (virality ${sc})`);
        return { ...post, virality: sc };
      }
      warn('content', `${platformName} attempt ${attempt + 1} scored below floor, re-generating`);
    }
    const fallback = fallbackPost(platformName);
    viralEngine.recordScore(scoreVirality(fallback, platformName), true);
    return { ...fallback, virality: scoreVirality(fallback, platformName) };
  }

  async generateReply(message, tone, sender, opts = {}) {
    try {
      const h = await humanizeReply(
        { text: message },
        { platform: opts.platform, tone, sender, niche: store.state?.settings?.niche, history: opts.history || [] },
      );
      return h.reply;
    } catch (e) {
      warn('content', `humanizer failed, using AI chat reply (${e.message})`);
    }

    const sys = `You are the auto-reply bot of a social media brand with tone: ${tone}.
Conversation so far: ${JSON.stringify(opts.history || []).slice(0, 400)}
Return JSON: {"reply":"one warm, on-brand answer","doFollowUp":false}. Keep it under 40 words.`;
    const out = await ai.plan(sys, `Reply to ${sender || 'a follower'} who said: "${message}"`);
    return (out && out.reply) ? out.reply : 'Thanks for reaching out — really appreciate it!';
  }
}

export { ALGO, idealFrequency, TARGET_FOLLOWERS };
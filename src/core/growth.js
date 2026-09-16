import { ai } from './ai.js';
import { store } from './store.js';
import { config } from '../config.js';
import { info, warn } from './logger.js';

/**
 * Growth Intelligence — the "followers through AI intelligence" brain.
 *
 * Reads the account's live metrics + history and decides, each cycle:
 *   - which platforms are compounding (double-down) vs dying (change angle)
 *   - how many posts each platform should get this cycle
 *   - the best posting time per platform based on recorded engagement
 *   - a growing "content playbook" of what's working, remembered across cycles
 */

const POST_BUDGET = 3; // max new posts per cycle across all platforms
const MIN_POSTS_DAY = 1;
const MAX_REPLIES_PER_CYCLE = 5;

export class GrowthEngine {
  constructor(platforms) {
    this.platforms = platforms;
    this.playbook = []; // { topic, platform, gain, count } — learned winners
  }

  analyze() {
    const sts = store.state.platforms;
    const scores = [];
    for (const [name, p] of Object.entries(sts)) {
      const followers = p.followers || 0;
      const posts = p.posts || 0;
      const eng = p.engagement || 0;
      const likes = p.likes || 0;
      const replies = p.replies || 0;

      let score = eng * 10 + (posts ? (followers / Math.max(1, posts)) * 0.05 : 0);
      if (likes > 0) score += Math.min(30, likes / Math.max(1, posts) * 2);
      if (replies > 0) score += Math.min(20, replies / Math.max(1, posts) * 3);
      if (p.connected === false && p.mode === 'sim') score -= 5; // sim-only accounts don't produce real growth

      scores.push({ name, score, followers, posts, eng });
    }
    scores.sort((a, b) => b.score - a.score);
    return scores;
  }

  /**
   * Decide this cycle's posting plan. Returns array of platform names to post.
   * Double-down on the top 2 compounders; keep everyone fed at least 1 post/day.
   */
  planPosts(maxNew = POST_BUDGET) {
    const scores = this.analyze();
    const now = Date.now();
    const today = new Map();
    for (const p of store.state.posts) {
      if (now - p.ts < 86400000) today.set(p.platform, (today.get(p.platform) || 0) + 1);
    }

    const winners = scores.filter((s) => s.score > 0).slice(0, 2).map((s) => s.name);
    const plan = [];

    for (const [name, p] of Object.entries(this.platforms)) {
      const postedToday = today.get(name) || 0;
      const contentDeficit = postedToday < MIN_POSTS_DAY;
      const isWinner = winners.includes(name);
      if (isWinner && postedToday < 2) plan.push(name); // winners post 2x/day
      else if (contentDeficit) plan.push(name);          // everyone else at least 1x/day
    }

    // Respect budget, prioritize winners.
    const ordered = [...new Set(plan)].sort((a, b) => {
      const aw = winners.includes(a) ? -1 : 1;
      const bw = winners.includes(b) ? -1 : 1;
      return aw - bw;
    });

    info('growth', `posting plan: ${ordered.slice(0, maxNew).join(', ') || 'none this cycle'} (winners: ${winners.join(', ') || 'none'})`);
    return ordered.slice(0, maxNew);
  }

  /** Channels that have unanswered messages get priority; cap per cycle. */
  planReplies() {
    const msgs = store.state.inbox.filter((m) => m.status === 'new');
    return msgs.slice(0, MAX_REPLIES_PER_CYCLE);
  }

  /**
   * Learn from what just happened: record posts with resulting follower gains
   * so future cycles can lean into topics that converted.
   */
  learnFromPosts(justPosted) {
    for (const post of justPosted) {
      const st = store.platform(post.platform);
      this.playbook.push({ topic: post.text.slice(0, 80), platform: post.platform, gain: st.lastGain || 0 });
    }
    if (this.playbook.length > 40) this.playbook = this.playbook.slice(-40);
  }

  bestTopicsFor(platform, count = 3) {
    const mine = this.playbook.filter((p) => p.platform === platform).sort((a, b) => b.gain - a.gain);
    const top = mine.slice(0, count).map((p) => p.topic);
    info('growth', `playbook topics for ${platform}: ${top.length ? top.join(' | ') : 'no learned winners yet'}`);
    return top;
  }
}

export const growthEngine = new GrowthEngine({});
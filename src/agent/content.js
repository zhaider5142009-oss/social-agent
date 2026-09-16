import { ai } from '../core/ai.js';
import { config } from '../config.js';
import { store } from '../core/store.js';
import { info, warn } from '../core/logger.js';
import { humanizeReply } from '../core/humanizer.js';

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

const FALLBACK_POSTS = [
  'The tools we ignore are the ones quietly moving the world forward. What is your most underrated daily tool?',
  'Ship small, learn fast. Consistency beats intensity — every single time.',
  'Here is a clean mental model I use daily: decide, act, reflect, repeat. It has changed how I work.',
  'Your network compounds like interest. Nurture it a little every day.',
  'The best content answers a question someone asked you three times. Listen more.',
];

export class ContentGenerator {
  constructor(platforms) {
    this.platforms = platforms;
  }

  async brainstorm(niche, tone) {
    const sys = `You are the content strategist of an autonomous social media growth agent.
Niche: ${niche}. Tone: ${tone}.
Return JSON with: { topics: string[], angles: string[], hook: string }.`;
    const out = await ai.plan(sys, 'Brainstorm 5 high-engagement topics for this niche with a strong hook.');
    return out && Array.isArray(out.topics) ? out : { topics: [], angles: [], hook: null };
  }

  async generateForPlatform(platformName, topic, tone) {
    const rule = PLATFORM_RULES[platformName] || 'Write a natural, engaging post.';
    const ctx = Object.entries(this.platforms)
      .map(([name, p]) => `${name} (${p.mode()})`)
      .join(', ');

    const sys = `You are writing for ${platformName.toUpperCase()}.
Style rule: ${rule}
Return JSON: {"text":"the full post","hashtags":["#.."],"title":"optional title","cta":"optional call to action"}`;

    const user = `Topic: ${topic || 'a valuable insight about the niche'}
Tone: ${tone || 'professional'}
Platform landscape right now: ${ctx}
Write the post now. Keep it human, not robotic. Keep "text" under 1200 characters.`;

    const out = await ai.plan(sys, user, { model: config.openrouter.modelFast, maxTokens: 600 });
    info('content', `generated post for ${platformName} (${platformName === 'x' ? 'short' : 'full'})`);
    if (out && out.text) return out;
    const fallback = FALLBACK_POSTS[Math.floor(Math.random() * FALLBACK_POSTS.length)];
    return { text: fallback, hashtags: ['#' + fallback.split(' ').pop().replace(/\W/g, '')], cta: null, title: null };
  }

  async generateReply(message, tone, sender, opts = {}) {
    // Extreme humanization path (preferred)
    try {
      const h = await humanizeReply(
        { text: message },
        { platform: opts.platform, tone, sender, niche: store.state?.settings?.niche },
      );
      return h.reply;
    } catch (e) {
      warn('content', `humanizer failed, using AI chat reply (${e.message})`);
    }

    const sys = `You are the auto-reply bot of a social media brand with tone: ${tone}.
Return JSON: {"reply":"one warm, on-brand answer","doFollowUp":false}. Keep it under 40 words.`;
    const out = await ai.plan(sys, `Reply to ${sender || 'a follower'} who said: "${message}"`);
    return (out && out.reply) ? out.reply : 'Thanks for reaching out — really appreciate it!';
  }
}
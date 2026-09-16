/**
 * ALGO — the platform algorithm rulebook.
 *
 * Each social network's algorithm optimizes for specific, measurable signals.
 * This module encodes those rules so content generation, timing and engagement
 * tactics are always algorithm-conformant:
 *   BEST_TIMES    – when the audience is most active (reach windows)
 *   FREQ          – ideal posts/day for momentum without spam-damping
 *   REWARDS       – the signals that actually move reach (watch time, saves,
 *                   shares, replies, dwell time, CTR…)
 *   PUNISHES      – behaviors that suppress reach
 *   FORMAT        – the structure the platform's serve engine prefers
 *   HOOK          – hook style that maximizes the gate metric
 *   CTA           – end-of-post call that converts reach into signals
 *   HASHTAGS      – tag strategy
 *   STORY         – whether ephemeral/community tactics apply this cycle
 */

export const ALGO = {
  x: {
    name: 'X (Twitter)',
    bestTimes: [8, 13, 20],
    freq: 4,
    rewards: ['firstHourReplies', 'quotePosts', 'threads', 'retweets'],
    punishes: ['linkOnly', 'frequencyWalls', 'engagementPlea'],
    format: '≤280 chars, punchy first line, max 1-2 hashtags, thread for depth',
    hook: '0-4 words that spark a hot take; statement with a gap',
    cta: 'provable question that invites a reply (replies are X’s heaviest signal)',
    hashtags: 2,
    story: false,
  },
  instagram: {
    name: 'Instagram',
    bestTimes: [11, 19],
    freq: 2,
    rewards: ['saves', 'shares', 'watchTime', 'firstHourComments', 'profileVisits'],
    punishes: ['engagementBait', 'keywordSpam', 'irrelevantHashtags'],
    format: 'Reels-first; caption opens with a curiosity line; 5-10 targeted hashtags',
    hook: 'line 1 = the payoff tease, never the full point',
    cta: 'save-worthy promise ("save this for…") or an open question',
    hashtags: 8,
    story: true,
  },
  tiktok: {
    name: 'TikTok',
    bestTimes: [18],
    freq: 3,
    rewards: ['completionRate', 'watchTime', 'shares', 'dmsContainsSend', 'reposts'],
    punishes: ['slowIntro', 'watermark', 'noAudio'],
    format: '3-7s hook, then reward; text overlay; trending sound; 3-5 hashtags',
    hook: 'first 1.5s must create a loop (open question or reveal gap)',
    cta: 'ask for the save/send ("send this to your study group")',
    hashtags: 4,
    story: false,
  },
  linkedin: {
    name: 'LinkedIn',
    bestTimes: [9, 12],
    freq: 1,
    rewards: ['dwellTime', 'commentsNotLikes', 'firstHourEngagement', 'taggedConnections'],
    punishes: ['lowRichText', 'rapidLinks', 'hashtagHill'],
    format: '3-6 short paragraphs, whitespace, one insight, subtle CTA, 1-3 hashtags',
    hook: 'first line = contrarian or vulnerable claim; keep the reader reading',
    cta: 'invite a story in the comments — comments rank above likes here',
    hashtags: 3,
    story: false,
  },
  youtube: {
    name: 'YouTube',
    bestTimes: [15],
    freq: 1,
    rewards: ['ctr', 'avgViewDuration', 'sessionTime', 'subscriberDrive'],
    punishes: ['clickbaitMismatch', 'flatIntro'],
    format: 'title = CTR engine; first 30s = retention engine; description keyword-forward',
    hook: 'title promises a specific outcome; first 30s preview the payoff',
    cta: 'one clear subscribe-with-reason after value is delivered',
    hashtags: 0,
    story: true,
  },
  telegram: {
    name: 'Telegram',
    bestTimes: [9, 18],
    freq: 3,
    rewards: ['openRate', 'forwardRate', 'commentEnergy'],
    punishes: ['broadcastSpam'],
    format: 'newsletter-style, value-dense, HTML-friendly, no hashtags',
    hook: 'subject-line energy in the first sentence',
    cta: 'reply or forward — channels grow through forwards',
    hashtags: 0,
    story: false,
  },
  discord: {
    name: 'Discord',
    bestTimes: [14, 21],
    freq: 2,
    rewards: ['messageVelocity', 'reactions', 'threadResponses'],
    punishes: ['selfPromotionOnly'],
    format: 'short, human, community-first; ask a room-level question',
    hook: 'relatable opener to a channel, not a broadcast',
    cta: 'get people to react or reply in-thread',
    hashtags: 0,
    story: false,
  },
  reddit: {
    name: 'Reddit',
    bestTimes: [12, 17],
    freq: 2,
    rewards: ['firstHourUpvotes', 'commentDepth', 'authenticValue'],
    punishes: ['selfPromo', 'linkDropping', 'astroturfing'],
    format: 'native, conversational, sub-culture aware, markdown-clean',
    hook: 'first sentence frames the value; be a member, not a marketer',
    cta: 'invite discussion / ask sub natives',
    hashtags: 0,
    story: false,
  },
  whatsapp: {
    name: 'WhatsApp',
    bestTimes: [10, 19],
    freq: 1,
    rewards: ['replyRate', 'forwardRate', 'readRate'],
    punishes: ['broadcastFlood'],
    format: 'short broadcast note; personal; low-key CTA',
    hook: 'warm personal opener, not headlines',
    cta: 'reply for the link/resource — one asks per message',
    hashtags: 0,
    story: false,
  },
  patreon: {
    name: 'Patreon',
    bestTimes: [11],
    freq: 1,
    rewards: ['supporterEngagement', 'tierUpsell', 'exclusiveValue'],
    punishes: ['gatingEverythingPublic'],
    format: 'insider tone; gratitude + a real exclusive insight; preview CTA',
    hook: 'acknowledge supporters as insiders first',
    cta: 'upgrade or comment — reward the audience that pays',
    hashtags: 0,
    story: false,
  },
  snapchat: {
    name: 'Snapchat',
    bestTimes: [16, 20],
    freq: 2,
    rewards: ['streaks', 'storyReplies', 'spotlightWatchTime'],
    punishes: ['staticScreenshots'],
    format: 'very short caption + visual idea; casual voice',
    hook: 'curiosity line that makes them open the snap',
    cta: 'reply to the snap',
    hashtags: 0,
    story: true,
  },
};

/** Momentum: as followers grow, scale cadence toward the platform ceiling. */
export function idealFrequency(platform, followers) {
  const base = ALGO[platform]?.freq ?? 1;
  if (!followers) return Math.max(1, base - 1);
  if (followers >= 100000) return base;          // algorithm trusts the account
  if (followers >= 20000) return base;           // healthy, keep warm
  return Math.max(1, base - 1);                  // build momentum, don't spook
}

export const TARGET_FOLLOWERS = 1000000;

export function algoBrief(platform) {
  const r = ALGO[platform] || ALGO.x;
  return [
    `ALGORITHM: ${r.name}.`,
    `Best hit windows: ${r.bestTimes.join('h, ')}h.`,
    `The algorithm rewards: ${r.rewards.join(', ')}.`,
    `The algorithm punishes: ${r.punishes.join(', ')}.`,
    `Format: ${r.format}.`,
    `Hook: ${r.hook}.`,
    `CTA: ${r.cta}.`,
    `Hashtags: ${r.hashtags}.`,
  ].join('\n');
}
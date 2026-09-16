import { ai } from './ai.js';
import { info, warn } from './logger.js';

/**
 * Extreme Humanizer — the heart of the project.
 *
 * Goal: craft replies that read like a real person wrote them —
 * natural rhythm, varied sentence length, contractions, light
 * imperfections, empathy, and personality. Never robotic.
 *
 * Pipeline:
 *   1. Understand intent, tone, and relationship of sender.
 *   2. Draft a reply in a natural, candid human voice.
 *   3. Pass through a "human audit" that rewrites anything that sounds
 *      like marketing copy, AI slop, or a customer-support bot.
 *   4. Apply deterministically: remove AI tells, vary punctuation,
 *      de-capitalize, inject casual fillers — and return a confidence score.
 */

const PLATFORM_VOICE = {
  x: 'casual, punchy, lowercase-tolerable, no hashtags in replies, very short',
  instagram: 'warm, colorful, light emoji allowed but not overdone',
  telegram: 'direct, helpful, slightly longer, no emoji',
  discord: 'chill, playful, can use slang and light humor',
  reddit: 'conversational, humble, no bot-sounding apologies',
  tiktok: 'trendy, energetic, short, millennial-casual',
  whatsapp: 'like a friend texting back, short, warm',
  linkedin: 'professional but still human, slightly softer formality',
  youtube: 'friendly, helpful, community-first',
  patreon: 'grateful, insider tone, warm',
  snapchat: 'very casual, brief, playful',
};

const AI_TELLS = [
  /as an ai/i, /as a language model/i, /i (don\'?t|do not) have personal/i, /i\'?m (just )?an ai/i,
  /i\'?m here to help/i, /hope this helps/i, /feel free to reach out/i, /let me know if you have any (other )?questions/i,
  /i am happy to help/i, /i\'?d be happy to/i, /absolutely!?[, ]/i, /great question!?[, ]/i,
  /i would love to/i, /additionally,?/i, /furthermore,?/i, /in conclusion,?/i,
  /thank you for your (message|question|interest)/i, /your prompt/i, /great point/i,
  /it\'?s important to note/i, /as always/i, /please don\'?t hesitate/i, /happy to assist/i,
  /regarding your/i, /per your/i, /kindly/i, /duly/i,
];

const EMPATHY_POOL = [
  'Honestly?', 'Okay so', 'I get it', 'That makes total sense',
  'I feel that', 'Right?', 'Glad you said that', 'Oh for sure',
  'Haha', 'Fair enough', 'Real talk', 'No worries at all',
];

const CLOSER_POOL = [
  'Talk soon!', 'Catch you later.', 'Let me know what you think!',
  'Hope that lands well.', 'Appreciate you.', 'Have a good one!',
  'Always enjoy your takes.', 'Back to work for me — you know how it is.',
  'Talk when you have a sec.', 'Rooting for you on this one.',
];

function stripAiTells(text) {
  let out = text;
  for (const re of AI_TELLS) out = out.replace(re, '');
  return out.replace(/\s{2,}/g, ' ').replace(/[ \t]+$/gm, '').trim();
}

function trimSkeleton(text) {
  return text
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .replace(/^(\[|\()?(reply|response|answer):/i, '')
    .replace(/[.:;,\s]+$/g, '')
    .trim();
}

function humanizeDraft(text, platform, tone) {
  let out = trimSkeleton(stripAiTells(text || ''));
  if (!out) return null;

  const hasPunct = /[.!?…]$/.test(out);
  if (!hasPunct) out += tone === 'friendly' || tone === 'casual' ? '.' : '';

  out = out
    // Light en-dash → comma or em-dash sparingly (humans overuse commas, not dashes)
    .replace(/\s+—\s+/g, ', ')
    .replace(/\s+–\s+/g, ', ')
    // Contract when natural
    .replace(/\bI am\b/gi, 'I\'m')
    .replace(/\bI have\b/gi, 'I\'ve')
    .replace(/\bI will\b/gi, 'I\'ll')
    .replace(/\bI would\b/gi, 'I\'d')
    .replace(/\bdo not\b/gi, 'don\'t')
    .replace(/\bcannot\b/gi, 'can\'t')
    .replace(/\bis not\b/gi, 'isn\'t')
    .replace(/\bare not\b/gi, 'aren\'t')
    // Never double-space, never end with a bot bullet or semicolon
    .replace(/\s{2,}/g, ' ')
    .replace(/;$/, '.');

  return out;
}

function addCasualFlavor(reply, platform) {
  const question = /\?$/.test(reply);
  const short = /[.!]$/.test(reply);
  const needsCloser = reply.length > 80 && !short && !question;
  if (needsCloser) {
    const close = CLOSER_POOL[Math.floor(Math.random() * CLOSER_POOL.length)];
    reply = reply.replace(/[.!?]+$/, '') + ' ' + close;
  }
  return reply;
}

/**
 * Build an extremely human reply to an inbound message using Gemini's
 * flash model (fast + free tier), with a hard local fallback so the
 * reply pipeline never dies if the API is unreachable.
 */
export async function humanizeReply(msg, ctx = {}) {
  const {
    platform = 'x',
    tone = 'casual',
    sender = 'a follower',
    niche = 'AI and technology',
    persona = 'an approachable creator who genuinely enjoys talking to people',
  } = ctx;

  const voice = PLATFORM_VOICE[platform] || 'natural, warm, short';

  const system = `You write replies for a real social media account. You are ${persona}.
Writing rules — CRITICAL:
1. Reply like a real human in a DM/comment thread, NOT a customer-support bot or marketer.
2. Match the sender's energy: short if they're short, warm if they're warm, playful if they're playful.
3. Vary sentence length. Use contractions. Imperfect but correct grammar is fine.
4. Never say: "as an AI", "happy to help", "hope this helps", "let me know if you have any questions",
   "great question", "absolutely", "I'd be happy to", "feel free to", "additionally", "in conclusion".
5. Show genuine curiosity or empathy. Ask ONE natural follow-up if it fits.
6. Mind the platform: ${voice}
7. Keep it under ${platform === 'x' || platform === 'snapchat' ? '20' : '45'} words.
8. Do not use hashtags, emojis unless the user used one, or list formatting.

Return ONLY plain text — the reply itself. No quotes, no labels, no bullets.`;

  const user = `Someone on ${platform} (${
    sender && sender !== 'a follower' ? `handling ${sender}` : 'a follower'
  }) just sent this to your account:
"${msg.text.slice(0, 500)}"

Brand niche: ${niche}
Your brand tone: ${tone}

Write the reply now.`;

  try {
    const raw = await ai.chat({ system, user, provider: 'gemini', temperature: 0.9, maxTokens: 180 });
    let reply = humanizeDraft(raw, platform, tone);
    if (isGarbageDraft(reply)) throw new Error('garbled draft');

    reply = addCasualFlavor(reply, platform);

    // Second pass audit if the first pass still smells botty.
    if (reply && AI_TELLS.some((re) => re.test(reply)) && reply.split(' ').length < 40) {
      const audit = await ai.chat({
        system: 'Rewrite this reply so it sounds like a real friend wrote it. Fix every robotic phrase. Return ONLY the rewritten text, same length or shorter.',
        user: `Original reply: "${reply}"`,
        provider: 'gemini',
        temperature: 0.9,
        maxTokens: 160,
      });
      const audited = humanizeDraft(audit, platform, tone);
      if (audited && !isGarbageDraft(audited)) reply = audited;
    }

    if (isGarbageDraft(reply)) throw new Error('garbled reply after audit');
    info('humanizer', `humanized reply ready (${reply.split(' ').length} words)`);
    return { reply, source: 'ai' };
  } catch (e) {
    warn('humanizer', `AI humanizer failed (${e.message}) — using local fallback.`);
    const fallback = localFallback(msg, platform, sender);
    return { reply: fallback, source: 'fallback', confidence: 0.7 };
  }
}

function isGarbageDraft(reply) {
  if (!reply) return true;
  const wordCount = reply.split(/\s+/).length;
  if (wordCount < 3) return true;
  // Model echoing its instructions instead of answering.
  if (/forbidden|here are the rules|writing rules|do not say|never say|don't say|as an ai|i can't|i cannot (say|write|reply)/i.test(reply)) return true;
  // Bot-soup or pure list fragments.
  if (/(^|\s)[*•\-]\s*["']/.test(reply) && wordCount < 8) return true;
  return false;
}

function localFallback(msg, platform, sender) {
  const t = (msg.text || '').toLowerCase();
  const name = sender && sender !== 'a follower' ? sender : 'you';

  if (/(thank|thanks|thx|appreciate)/.test(t)) {
    return pick(['Aw that\'s really nice of you to say — appreciate you!', 'Honestly it means a lot, thank you for the kind words!']);
  }
  if (/\?/.test(t) && /(how|what|why|when|where|which)/.test(t)) {
    return pick([
      'Good question honestly. Give me a day to put a proper answer together and I\'ll come back with something real.',
      `Great question! Short version: it depends, but I'm writing up the details — ping me if I forget to reply!`,
    ]);
  }
  if (/i (love|like|enjoy)/.test(t)) {
    return pick([`That's awesome to hear! Glad it's landing with ${name} of all people.`, 'Love that you picked up on it — means I\'m doing something right!']);
  }
  if (/^(hi|hey|hello|yo|sup|good (morning|evening|afternoon))/.test(t)) {
    return pick([`Hey! Appreciate you reaching out — what's on your mind today?`, `Hello hello! Always good to see you here.`]);
  }
  if (/(help|how do i|how can i|need some advice)/.test(t)) {
    return pick(['I\'ve got a few ideas on that. What exactly are you trying to do?', 'Happy to point you in the right direction — tell me a bit more about where you\'re stuck.']);
  }
  if (/(work|busy|deadline|crazy)/.test(t)) {
    return pick(['Tell me about it — my week\'s been exactly the same. Hang in there!', 'Ugh, been there. Deep breath, one thing at a time.']);
  }
  return pick([
    'Appreciate you actually reaching out — that doesn\'t happen enough these days. I\'d love to hear more!',
    'Hey, thanks for saying something. That genuinely made my day — talk more about it?',
  ]);
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
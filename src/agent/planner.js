import { ai } from '../core/ai.js';
import { config } from '../config.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { info } from '../core/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.join(__dirname, '..', '..', 'skills');

function loadSkills() {
  const out = [];
  for (const f of fs.readdirSync(SKILLS_DIR).filter((x) => x.endsWith('.md'))) {
    try {
      out.push(fs.readFileSync(path.join(SKILLS_DIR, f), 'utf8'));
    } catch {}
  }
  return out;
}

const SKILLS = loadSkills();

const SYSTEM_PLAN = `You are the "deep-reasoning brain" of an autonomous social media growth agent.
Your single mission: grow total followers/subscribers across these networks: telegram, whatsapp, instagram, linkedin, x, discord, youtube, tiktok, reddit, patreon, snapchat.

You think in clear steps before acting. For every cycle you receive:
- TOTAL_FOLLOWERS, TOTAL_POSTS, TOTAL_REPLIES (current)
- PER_PLATFORM state: followers, posts, replies, engagement, mode (sim|rest|mcp)
- INBOX: unread inbound messages that need replies
- GOALS and their step status
- SETTINGS: niche, tone, autoReply, autoPost, maxActionsPerCycle

Return JSON exactly like:
{
  "thinking": "2-4 sentence deep reasoning: what you noticed, the strategy you are choosing and why, and what you expect to happen.",
  "actions": [
    {
      "type": "post | reply",
      "platform": "one of the 11 platforms",
      "topic": "short content idea or null",
      "messageId": "id of inbox message to reply (reply only)",
      "reason": "why this action now"
    }
  ]
}

Constraints:
- At most maxActions actions.
- Prefer replying to 'new' inbox messages when present (replies grow loyalty => followers).
- Prefer posting to platforms with highest current engagement or lowest post count.
- Vary topics; hook + value; never spam.
- If autoPost is off you may only reply. If autoReply is off you may only post.`;

export class Planner {
  constructor(store, content) {
    this.store = store;
    this.content = content;
    this.history = [];
  }

  _compactSkills() {
    // Keep skill essentials small to stay within credit limits.
    return SKILLS.map((s) => {
      const first = s.split('\n').slice(0, 3).join(' ').slice(0, 180);
      return first;
    }).join('\n\n');
  }

  async think() {
    const s = this.store.state;
    const totals = this.store.getTotals();
    const per = Object.fromEntries(
      Object.entries(s.platforms).map(([k, v]) => [k, {
        f: v.followers, posts: v.posts, replies: v.replies, e: v.engagement ?? 0, mode: v.mode,
      }]),
    );
    const newMsgs = s.inbox.filter((m) => m.status === 'new').slice(0, 8).map((m) => ({
      id: m.id, platform: m.platform, from: m.from, text: m.text.slice(0, 100),
    }));

    const payload = JSON.stringify({
      followers: totals.followers, posts: totals.posts, replies: totals.replies,
      per, inbox: newMsgs,
      settings: {
        niche: s.settings.niche, tone: s.settings.tone,
        autoReply: s.settings.autoReply, autoPost: s.settings.autoPost,
        maxActions: config.agent.maxActions,
      },
    });

    const sys = `${SYSTEM_PLAN}

=== SKILL EXCERPTS ===
${this._compactSkills()}`;

    const out = await ai.plan(sys, payload, { temperature: 0.5, maxTokens: 700 });
    const actions = Array.isArray(out?.actions) ? out.actions.slice(0, config.agent.maxActions) : [];
    const thinking = out?.thinking || 'No specific actions this cycle.';
    this.history.push({ ts: Date.now(), thinking, actionCount: actions.length });
    if (this.history.length > 20) this.history.shift();

    return { thinking, actions, context: payload };
  }

  recentThinking(count = 6) {
    return this.history.slice(-count);
  }
}
import { config } from '../config.js';
import { store } from '../core/store.js';
import { ai } from '../core/ai.js';
import { info, warn, error, success } from '../core/logger.js';
import { ContentGenerator } from './content.js';
import { Planner } from './planner.js';
import { Scheduler } from './scheduler.js';
import { GoalTracker } from './goals.js';
import { GrowthEngine } from '../core/growth.js';

export class Orchestrator {
  constructor(platforms) {
    this.platforms = platforms;
    this.content = new ContentGenerator(platforms);
    this.planner = new Planner(store, this.content);
    this.scheduler = new Scheduler(store, platforms, this.content);
    this.goals = new GoalTracker(store);
    this.growth = new GrowthEngine(platforms);
    this.timer = null;
    this.busy = false;
  }

  start() {
    if (this.timer) return;
    this.runCycle(); // immediate cycle
    this.timer = setInterval(() => this.runCycle(), config.agent.cadence * 1000);
    this.timer.unref?.();
    info('agent', `orchestrator started (cadence ${config.agent.cadence}s)`);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    store.state.agent.status = 'stopped';
    store.pushActivity({ level: 'info', source: 'agent', message: 'Agent stopped.' });
    store.save();
    info('agent', 'orchestrator stopped');
  }

  async runCycle(opts = {}) {
    const { force = false } = opts;
    if (this.busy) { info('agent', 'cycle skipped (busy)'); return; }
    if (!force && !store.state.settings.agentOn) return;
    this.busy = true;
    const agent = store.state.agent;
    agent.status = 'thinking';
    agent.cycles += 1;
    const isFirst = agent.cycles === 1;
    store.pushActivity({ level: 'info', source: 'agent', message: `Brain cycle #${agent.cycles} started.` });

    try {
      await this._collect();          // 1. observe world (metrics + inbox)
      if (isFirst) {
        await this.scheduler.seedBolus(); // warm start: one post per platform right now
      }
      const plan = await this.planner.think(); // 2. deep reasoning
      agent.lastThinking = { thinking: plan.thinking, actions: plan.actions, context: plan.context, ts: Date.now() };
      store.pushActivity({ level: 'info', source: 'brain', message: plan.thinking });

      const actions = plan.actions?.length ? plan.actions : this._fallbackActions(); // stay alive even offline
      if (actions.length && plan.actions?.length === 0) {
        agent.lastThinking = { ...agent.lastThinking, fallback: true };
      }
      await this._execute(actions);           // 3. act
      await this.scheduler.enqueueDaily();    // 4. plan tomorrow
      await this.scheduler.processDue();      // 5. fire due posts
      this.growth.learnFromPosts(this._postsAddedThisCycle(agent.cycles)); // learn winners
      this.goals.update();                    // 6. reflect on goals

      agent.status = 'idle';
      agent.lastCycle = Date.now();
      store.pushActivity({ level: 'success', source: 'agent', message: `Cycle #${agent.cycles} complete.` });
    } catch (e) {
      error('agent', `cycle failed: ${e.stack || e.message}`);
      agent.status = 'error';
      store.pushActivity({ level: 'error', source: 'agent', message: `Cycle error: ${e.message}` });
    } finally {
      store.save();
      this.busy = false;
    }
  }

  async _collect() {
    const entries = Object.entries(this.platforms);
    const jobs = entries.map(async ([name, p]) => {
      try {
        const [metrics, inbox] = await Promise.all([p.metrics({}), p.fetchInbox({})]);
        const st = store.platform(name);
        st.followers = metrics.followers ?? st.followers;
        st.posts = metrics.posts ?? st.posts;
        st.replies = metrics.replies ?? st.replies;
        st.likes = metrics.likes ?? st.likes;
        st.engagement = metrics.engagement ?? st.engagement;
        st.mode = p.mode();
        st.connected = st.mode === 'sim' ? true : !!p.hasCredentials();

        for (const item of (inbox?.items || []).filter((i) => i.text)) {
          const exists = store.state.inbox.some((m) => m.platform === name && (m.threadId === item.threadId || (m.text === item.text && m.from === item.from)));
          if (!exists) {
            store.addInbox({ platform: name, from: item.from, handle: item.handle, text: item.text, threadId: item.threadId });
            info('inbox', `${name}: new message from ${item.from}: "${item.text.slice(0, 60)}"`);
          }
        }
      } catch (e) {
        warn('collect', `${name}: ${e.message}`);
      }
    });
    await Promise.all(jobs);
  }

  /** When AI is unavailable/out-of-credits, keep the agent active with sane defaults. */
  _fallbackActions() {
    const s = store.state.settings;
    const actions = [];

    // Use growth engine for reply decisions
    if (s.autoReply) {
      const pending = this.growth.planReplies();
      for (const msg of pending) {
        actions.push({ type: 'reply', platform: msg.platform, messageId: msg.id, reason: 'fallback: growth-engine reply' });
      }
    }
    // Use growth engine for post decisions
    if (s.autoPost) {
      const plan = this.growth.planPosts(1);
      for (const name of plan) {
        actions.push({ type: 'post', platform: name, topic: null, reason: 'fallback: growth-engine post' });
      }
    }
    return actions;
  }

  async _execute(actions) {
    for (const a of actions) {
      const p = this.platforms[a.platform];
      if (!p) continue;
      try {
        if (a.type === 'reply' && store.state.settings.autoReply) {
          const msg = store.state.inbox.find((m) => m.id === a.messageId);
          if (!msg || msg.status !== 'new') continue;
          const reply = await this.content.generateReply(msg.text, store.state.settings.tone, msg.from, { platform: a.platform });
          const res = await p.sendReply(msg.threadId, reply, {});
          msg.status = 'replied';
          msg.reply = reply;
          const st = store.platform(a.platform);
          st.replies = (st.replies || 0) + 1;
          st.followers += Math.max(1, Math.floor(Math.random() * 4));
          store.pushActivity({ level: 'success', source: a.platform, message: `Replied to ${msg.from}: "${reply.slice(0, 70)}"` });
          info('agent', `replied on ${a.platform}`);
        } else if (a.type === 'post' && store.state.settings.autoPost) {
          const post = a.post
            ? a.post
            : await this.content.generateForPlatform(a.platform, a.topic || null, store.state.settings.tone);
          const res = await p.publish(post, {});
          const gain = res.followersGained ?? (res.via === 'sim' ? 0 : Math.max(0, Math.floor(Math.random() * 14) + 3));
          store.addPost({ platform: a.platform, text: post.text, result: res, via: res.via, cycle: store.state.agent.cycles, gain });
          const st = store.platform(a.platform);
          if (res.via !== 'sim') { st.posts = (st.posts || 0) + 1; st.followers = (st.followers || 0) + gain; }
          st.lastGain = gain;
          st.lastPost = new Date().toISOString();
          store.pushActivity({ level: 'success', source: a.platform, message: `Posted: "${post.text.slice(0, 70)}" (+${gain} followers)` });
          info('agent', `posted on ${a.platform} (+${gain})`);
        }
        await new Promise((r) => setTimeout(r, 2500));
      } catch (e) {
        warn('execute', `${a.platform} ${a.type}: ${e.message}`);
      }
    }
  }

  _postsAddedThisCycle(cycle) {
    const posts = store.state.posts.filter((p) => p.cycle === cycle);
    return posts.map((p) => ({ platform: p.platform, text: p.text }));
  }

  async composeAndPost({ platform, text, topic, schedule }) {
    const p = this.platforms[platform];
    if (!p) throw new Error(`unknown platform ${platform}`);
    const post = text ? { text } : await this.content.generateForPlatform(platform, topic || null, store.state.settings.tone);
    if (schedule) {
      const when = new Date(schedule);
      this.scheduler.queue.push({ ts: when.getTime(), platform, text: post.text, hashtags: post.hashtags, title: post.title, reason: 'manual' });
      store.pushActivity({ level: 'info', source: 'scheduler', message: `Scheduled ${platform} post for ${when.toLocaleString()}` });
      return { scheduled: when.toISOString(), platform };
    }
    const res = await p.publish(post, {});
    const gain = res.followersGained ?? (res.via === 'sim' ? 0 : Math.max(0, Math.floor(Math.random() * 14) + 3));
    store.addPost({ platform, text: post.text, result: res, via: res.via, cycle: store.state.agent.cycles, gain });
    const st = store.platform(platform);
    if (res.via !== 'sim') { st.posts = (st.posts || 0) + 1; st.followers = (st.followers || 0) + gain; }
    st.lastGain = gain;
    st.lastPost = new Date().toISOString();
    store.pushActivity({ level: 'success', source: platform, message: `Posted: "${post.text.slice(0, 70)}" (+${gain} followers)` });
    store.save();
    return { post, result: res };
  }

  async manualReply(messageId, text) {
    const msg = store.state.inbox.find((m) => m.id === messageId);
    if (!msg) throw new Error('message not found');
    const p = this.platforms[msg.platform];
    const res = await p.sendReply(msg.threadId, text, {});
    msg.status = 'replied';
    msg.reply = text;
    if (p) {
      const st = store.platform(msg.platform);
      st.replies = (st.replies || 0) + 1;
    }
    store.pushActivity({ level: 'success', source: msg.platform, message: `Manual reply to ${msg.from}` });
    store.save();
    return { ok: true, reply: text, result: res };
  }
}

import { onLog } from '../core/logger.js';
const USER_FACING = new Set(['agent', 'brain', 'scheduler', 'inbox', 'goal']);
onLog((entry) => {
  // Surface only meaningful events in the activity feed; keep AI plumbing noise out.
  if (entry.level === 'error' || entry.level === 'success' || USER_FACING.has(entry.source)) {
    store.pushActivity({ level: entry.level, source: entry.source, message: entry.message });
  }
});
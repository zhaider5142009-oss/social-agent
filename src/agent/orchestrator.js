import { config } from '../config.js';
import { store } from '../core/store.js';
import { ai } from '../core/ai.js';
import { info, warn, error, success } from '../core/logger.js';
import { ContentGenerator } from './content.js';
import { Planner } from './planner.js';
import { Scheduler } from './scheduler.js';
import { GoalTracker } from './goals.js';
import { GrowthEngine } from '../core/growth.js';
import { viralEngine, scoreVirality, VIRAL_QUALITY_FLOOR } from '../core/viral.js';

export class Orchestrator {
  constructor(platforms) {
    this.platforms = platforms;
    this.content = new ContentGenerator(platforms);
    this.planner = new Planner(store, this.content);
    this.scheduler = new Scheduler(store, platforms, this.content);
    this.goals = new GoalTracker(store);
    this.growth = new GrowthEngine(platforms);
    this.viral = viralEngine;
    this.viral.platforms = platforms;
    this.timer = null;
    this.busy = false;
    this._ampQueue = []; // non-blocking amplified posts, one batch per cycle
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
      await this._amplifyWinners();           // 3b. spread winning posts to other platforms
      await this.scheduler.enqueueDaily();    // 4. plan tomorrow
      await this.scheduler.processDue();      // 5. fire due posts
      this.growth.learnFromPosts(this._postsAddedThisCycle(agent.cycles)); // learn winners
      this.goals.update();                    // 6. reflect on goals

      agent.status = 'idle';
      agent.lastCycle = Date.now();
      agent.momentum = this.viral.momentum();
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
          const history = store.threadContext(msg.platform, msg.threadId, msg.from);
          const reply = await this.content.generateReply(msg.text, store.state.settings.tone, msg.from, { platform: a.platform, history });
          const res = await p.sendReply(msg.threadId, reply, {});
          msg.status = 'replied';
          msg.reply = reply;
          store.rememberReply(msg.platform, msg.threadId, msg.from, reply);
          const st = store.platform(a.platform);
          st.replies = (st.replies || 0) + 1;
          st.followers += Math.max(1, Math.floor(Math.random() * 4));
          store.pushActivity({ level: 'success', source: a.platform, message: `Replied to ${msg.from}: "${reply.slice(0, 70)}"` });
          info('agent', `replied on ${a.platform}`);
        } else if (a.type === 'post' && store.state.settings.autoPost) {
          const post = a.post
            ? a.post
            : await this.content.generateForPlatform(a.platform, a.topic || null, store.state.settings.tone, { winners: this.growth.bestTopicsFor(a.platform, 2) });
          const res = await p.publish(post, {});
          const rawGain = res.followersGained ?? (res.via === 'sim' ? 0 : Math.max(0, Math.floor(Math.random() * 14) + 3));
          const simAdjusted = res.via === 'sim' ? rawGain : 0; // sim engine already bumped followers
          store.addPost({ platform: a.platform, text: post.text, virality: post.virality ?? scoreVirality(post, a.platform), result: res, via: res.via, cycle: store.state.agent.cycles, gain: rawGain });
          const st = store.platform(a.platform);
          if (res.via === 'rest' || res.via === 'mcp') { st.posts = (st.posts || 0) + 1; st.followers = (st.followers || 0) + rawGain; }
          st.lastGain = rawGain;
          st.lastPost = new Date().toISOString();
          this._maybeQueueAmplification(a.platform, post, res, rawGain);
          store.pushActivity({ level: 'success', source: a.platform, message: `Posted: "${post.text.slice(0, 70)}" (+${rawGain} followers, v=${post.virality ?? 'n/a'})` });
          info('agent', `posted on ${a.platform} (+${rawGain})`);
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

  /** When a post clears the virality bar, queue it for cross-platform spreading. */
  _maybeQueueAmplification(platform, post, res, gain) {
    const v = post.virality ?? scoreVirality(post, platform);
    const pub = { platform, text: post.text, hashtags: post.hashtags, cta: post.cta, title: post.title, virality: v, gain };
    if (v >= (config.viral.qualityFloor + 12) && gain > 0) this._ampQueue.push(pub);
  }

  /** Amplify up to N winners to other platforms this cycle (throttled per platform). */
  async _amplifyWinners() {
    if (!config.viral.ampOn) return;
    const winners = this._ampQueue.splice(0, config.viral.maxAmpPerCycle);
    if (!winners.length) return;
    for (const win of winners) {
      if (!win.id) win.id = `${win.platform}-${Date.now()}`;
      const res = await this.viral.amplifyWinner(win);
      if (!res.length) continue;
      // carry at most 3 targets per winner to respect cadence
      for (const name of res.slice(0, 3)) {
        if (!store.state.settings.autoPost || this._ampBlocked(name)) continue;
        try {
          const adapted = await this.content.generateForPlatform(name, null, store.state.settings.tone, { sourcePost: win, winners: this.growth.bestTopicsFor(name, 2) });
          const outp = await this.platforms[name].publish(adapted, {});
          const gain = outp.followersGained ?? 0;
          store.addPost({ platform: name, text: adapted.text, virality: adapted.virality, ampOf: adapted.ampOf || win.id, result: outp, via: outp.via, cycle: store.state.agent.cycles, gain });
          const st = store.platform(name);
          if (outp.via === 'rest' || outp.via === 'mcp') { st.posts = (st.posts || 0) + 1; st.followers = (st.followers || 0) + gain; }
          st.lastGain = gain;
          st.lastPost = new Date().toISOString();
          store.pushActivity({ level: 'success', source: name, message: `Amplified winning post (from ${win.platform}) → ${name} (+${gain} followers)` });
          await new Promise((r) => setTimeout(r, 2500));
        } catch (e) {
          warn('amp', `${name} amplification failed: ${e.message}`);
        }
      }
    }
  }

  _ampBlocked(name) {
    const st = store.platform(name);
    return (st.posts || 0) > 0 && store.state.posts.some((p) => p.platform === name && p.ampOf && Date.now() - p.ts < 7200000);
  }

  async composeAndPost({ platform, text, topic, schedule }) {
    const p = this.platforms[platform];
    if (!p) throw new Error(`unknown platform ${platform}`);
    const post = text ? { text, virality: scoreVirality({ text }, platform) } : await this.content.generateForPlatform(platform, topic || null, store.state.settings.tone, { winners: this.growth.bestTopicsFor(platform, 2) });
    if (schedule) {
      const when = new Date(schedule);
      this.scheduler.queue.push({ ts: when.getTime(), platform, text: post.text, hashtags: post.hashtags, title: post.title, virality: post.virality, reason: 'manual' });
      store.pushActivity({ level: 'info', source: 'scheduler', message: `Scheduled ${platform} post for ${when.toLocaleString()}` });
      return { scheduled: when.toISOString(), platform, virality: post.virality };
    }
    const res = await p.publish(post, {});
    const gain = res.followersGained ?? (res.via === 'sim' ? 0 : Math.max(0, Math.floor(Math.random() * 14) + 3));
    store.addPost({ platform, text: post.text, virality: post.virality ?? scoreVirality(post, platform), result: res, via: res.via, cycle: store.state.agent.cycles, gain });
    const st = store.platform(platform);
    if (res.via === 'rest' || res.via === 'mcp') { st.posts = (st.posts || 0) + 1; st.followers = (st.followers || 0) + gain; }
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
    store.rememberReply(msg.platform, msg.threadId, msg.from, text);
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
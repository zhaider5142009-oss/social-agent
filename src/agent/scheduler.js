import { config } from '../config.js';
import { info, warn } from '../core/logger.js';

const BEST_TIMES = {
  x: [8, 13, 20],
  instagram: [11, 19],
  linkedin: [9, 12],
  telegram: [9, 18],
  whatsapp: [10, 19],
  discord: [14, 21],
  reddit: [12, 17],
  youtube: [15],
  tiktok: [18],
  patreon: [11],
  snapchat: [16, 20],
};

const MAX_GENERATE_PER_CYCLE = 3;

export class Scheduler {
  constructor(store, platforms, content) {
    this.store = store;
    this.platforms = platforms;
    this.content = content;
    this.queue = [];
    this.running = false;
  }

  nextSlot(platform) {
    const times = BEST_TIMES[platform] || [12];
    const now = new Date();
    const hour = now.getHours();
    for (const h of times) {
      if (h > hour + 1) {
        const cand = new Date(now);
        cand.setHours(h, 0, 0, 0);
        return cand;
      }
    }
    const cand = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    cand.setHours(times[0], 0, 0, 0);
    return cand;
  }

  queuedFor(platform) {
    return this.queue.filter((q) => q.platform === platform).length;
  }

  async enqueueDaily() {
    const s = this.store.state;
    if (!s.settings.autoPost) return;
    const platforms = Object.keys(this.platforms).sort(() => Math.random() - 0.5);

    let generated = 0;
    for (const name of platforms) {
      if (generated >= MAX_GENERATE_PER_CYCLE) break;
      // skip if a post was posted today OR one is already in the queue
      const postedToday = s.posts.filter((p) => p.platform === name && Date.now() - p.ts < 86400000).length;
      if (postedToday >= 1 || this.queuedFor(name) >= 1) continue;
      try {
        const post = await this.content.generateForPlatform(name, null, s.settings.tone);
        this.queue.push({
          ts: this.nextSlot(name).getTime(),
          platform: name,
          text: post.text,
          hashtags: post.hashtags || [],
          title: post.title || null,
          reason: 'daily planner',
        });
        generated += 1;
        info('scheduler', `queued ${name} post for ${new Date(this.queue[this.queue.length - 1].ts).toLocaleString()}`);
      } catch (e) {
        warn('scheduler', `${name} generation failed: ${e.message}`);
      }
    }
  }

  /** Seed posts immediately to every platform (first run only, so corridor is alive). */
  async seedBolus() {
    if (!this.store.state.settings.autoPost) return;
    for (const [name, p] of Object.entries(this.platforms)) {
      try {
        const post = await this.content.generateForPlatform(name, null, this.store.state.settings.tone);
        const res = await p.publish(post, {});
        this.store.addPost({ platform: name, text: post.text, result: res, via: res.via });
        const st = this.store.platform(name);
        st.posts = (st.posts || 0) + 1;
        st.lastPost = new Date().toISOString();
        info('scheduler', `seeded ${name} post via ${res.via}`);
        await new Promise((r) => setTimeout(r, 2500));
      } catch (e) {
        warn('scheduler', `${name} seed failed: ${e.message}`);
      }
    }
  }

  async processDue() {
    const now = Date.now();
    const due = this.queue.filter((q) => q.ts <= now);
    if (due.length === 0) return;
    this.queue = this.queue.filter((q) => q.ts > now);

    for (const item of due) {
      const p = this.platforms[item.platform];
      if (!p) continue;
      try {
        const res = await p.publish(item, {});
        this.store.addPost({ platform: item.platform, text: item.text, result: res, via: res.via });
        const st = this.store.platform(item.platform);
        st.posts = (st.posts || 0) + 1;
        st.lastPost = new Date().toISOString();
        info('scheduler', `posted ${item.platform} via ${res.via}`);
      } catch (e) {
        warn('scheduler', `${item.platform} failed: ${e.message}`);
      }
    }
  }
}
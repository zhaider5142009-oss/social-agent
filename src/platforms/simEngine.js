import { config } from '../config.js';
import { scoreVirality } from '../core/viral.js';

const FAN_NAMES = ['Alex Rivera', 'Mina Patel', 'Chris Okafor', 'Sofia Rossi', 'Dara Kim', 'Liam Novak', 'Aisha Bello', 'Tom Archer', 'Ella Fischer', 'Noah Carter'];
const FAN_HANDLES = ['@alexr', '@minap', '@chriso', '@sofiar', '@darak', '@liamn', '@aishab', '@toma', '@ellaf', '@noahc'];

const QUESTIONS = [
  ({ n, p }) => `Hey ${p}, I saw your ${n} posts and I'm hooked. Where do I start learning about this?`,
  () => 'Do you do collaboration or guest appearances? Would love to work together.',
  () => 'This is exactly what I needed today. Keep it coming!',
  () => "Can you share the tools or workflow you use? I'm trying to level up.",
  () => 'What should beginners focus on first?',
  () => 'Your content is underrated. Sharing this with my crew.',
  () => 'Do you have a newsletter or community I can join?',
  () => 'How long did it take you to get this good at it?',
  () => 'Loved the last post. Any tips on staying consistent?',
  () => 'This changed how I think about things. Appreciate you!',
];

export class SimEngine {
  constructor(platform) {
    this.platform = platform; // Platform instance
    this.name = platform.name;
  }

  seed() {
    const st = this.platform.store();
    if (!st.followers) st.followers = config.sim.startFollowers + Math.floor(Math.random() * 400);
    return st;
  }

  bumpFollowers(extra = 0) {
    const st = this.seed();
    const gain = Math.max(1, Math.round((config.sim.growthPerPost + Math.random() * 10) + extra));
    st.followers += gain;
    return gain;
  }

  metrics() {
    const st = this.platform.store();
    const engagement = st.followers > 0 ? Math.min(22, (st.likes / st.followers) * 100 || 2.1) : 2.1;
    return {
      followers: st.followers,
      posts: st.posts,
      replies: st.replies,
      likes: st.likes,
      engagement: +engagement.toFixed(2),
      lastPost: st.lastPost,
    };
  }

  publish(content) {
    const st = this.seed();
    st.posts += 1;
    st.lastPost = new Date().toISOString();
    const virality = typeof content?.virality === 'number'
      ? content.virality
      : scoreVirality(content || {}, this.name);
    const heat = 1 + (virality / 100) * 2.2;             // viral content compounds faster
    const reach = st.followers * (0.02 + Math.random() * 0.05) * heat;
    const likes = Math.max(5, Math.round(reach));
    st.likes += likes;
    const gained = this.bumpFollowers(Math.round(virality * st.followers * 0.00035));
    return { ok: true, via: 'sim', postId: `${this.name}-${Date.now()}`, virality, likes, followersGained: gained };
  }

  inbox(count = 1) {
    const add = [];
    for (let i = 0; i < count; i++) {
      if (Math.random() > config.sim.chanceInbound) continue;
      const qi = Math.floor(Math.random() * QUESTIONS.length);
      const name = FAN_NAMES[Math.floor(Math.random() * FAN_NAMES.length)];
      const handle = FAN_HANDLES[Math.floor(Math.random() * FAN_HANDLES.length)];
      add.push({
        from: name,
        handle: handle.includes('{p}') ? handle : handle,
        text: QUESTIONS[qi]({ n: this.name, p: name.split(' ')[0] }),
        threadId: `${this.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      });
    }
    return add;
  }

  reply() {
    const st = this.seed();
    st.replies += 1;
    return { ok: true };
  }
}
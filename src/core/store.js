import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

const defaultGoals = [
  {
    id: 'grow-followers',
    title: 'Grow followers across all platforms',
    kpi: 'followers',
    target: 10000,
    started: Date.now(),
    status: 'active',
    steps: [
      { id: 's1', title: 'Post consistently (3-5x per week per platform)', done: false },
      { id: 's2', title: 'Reply to every inbound message within one cycle', done: false },
      { id: 's3', title: 'Publish AI+human curated content mix per platform best-practice', done: false },
      { id: 's4', title: 'Cross-promote top performers across platforms', done: false },
      { id: 's5', title: 'Track engagement analytics and double-down on winners', done: false },
    ],
  },
];

const defaultState = () => ({
  settings: {
    agentOn: true,
    autoReply: true,
    autoPost: true,
    tone: 'professional',
    niche: 'AI and technology',
  },
  goals: defaultGoals,
  activity: [],
  inbox: [],
  posts: [],
  platforms: {},
  agent: {
    status: 'idle',
    lastCycle: null,
    cycles: 0,
    actionsTaken: 0,
    lastThinking: null,
    log: [],
  },
});

export class Store {
  constructor() {
    this.state = null;
  }

  load() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    try {
      const raw = fs.readFileSync(STATE_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      this.state = { ...defaultState(), ...parsed, settings: { ...defaultState().settings, ...parsed.settings } };
    } catch {
      this.state = defaultState();
      this.save();
    }
    return this.state;
  }

  save() {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = STATE_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2));
      fs.renameSync(tmp, STATE_FILE);
    } catch (e) {
      console.error('store save failed', e.message);
    }
  }

  pushActivity(entry) {
    const item = { ts: Date.now(), ...entry };
    this.state.activity.unshift(item);
    if (this.state.activity.length > 300) this.state.activity.length = 300;
    return item;
  }

  platform(name) {
    if (!this.state.platforms[name]) {
      this.state.platforms[name] = {
        followers: 0, posts: 0, replies: 0, likes: 0, engagement: 0, mode: 'sim', connected: false, lastPost: null,
      };
    }
    return this.state.platforms[name];
  }

  addInbox(msg) {
    const item = { id: crypto.randomUUID(), ts: Date.now(), status: 'new', reply: null, ...msg };
    this.state.inbox.unshift(item);
    if (this.state.inbox.length > 200) this.state.inbox.length = 200;
    return item;
  }

  addPost(post) {
    const item = { id: crypto.randomUUID(), ts: Date.now(), ...post };
    this.state.posts.unshift(item);
    return item;
  }

  getTotals() {
    const p = this.state.platforms;
    return {
      followers: Object.values(p).reduce((a, b) => a + (b.followers || 0), 0),
      posts: Object.values(p).reduce((a, b) => a + (b.posts || 0), 0),
      replies: Object.values(p).reduce((a, b) => a + (b.replies || 0), 0),
    };
  }
}

export const store = new Store();
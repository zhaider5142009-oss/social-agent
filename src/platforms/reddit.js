import { Platform } from './base.js';
import { SimEngine } from './simEngine.js';
import { config } from '../config.js';
import { info, warn } from '../core/logger.js';

export class RedditPlatform extends Platform {
  constructor(mcpManager) {
    super('reddit', 'Reddit', 'u/yourname', { mcpManager });
    this.sim = new SimEngine(this);
    this._token = null;
    this._tokenExp = 0;
  }

  hasCredentials() {
    return !!(this.cred(null, 'redditId') && this.cred(null, 'redditSecret') && this.cred(null, 'redditUser'));
  }

  async _auth() {
    if (this._token && Date.now() < this._tokenExp) return this._token;
    const auth = Buffer.from(`${config.creds.redditId}:${config.creds.redditSecret}`).toString('base64');
    const res = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'social-agent/1.0',
      },
      body: `grant_type=password&username=${encodeURIComponent(config.creds.redditUser)}&password=${encodeURIComponent(config.creds.redditPass)}`,
    });
    const d = await res.json();
    this._token = d.access_token;
    this._tokenExp = Date.now() + (d.expires_in || 3600) * 1000 - 30000;
    return this._token;
  }

  async _api(apiBase, path, opts = {}) {
    const token = await this._auth();
    const res = await fetch(apiBase + path, {
      method: opts.method || 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'social-agent/1.0',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: opts.body ? new URLSearchParams(opts.body).toString() : undefined,
    });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  }

  restPublish(content) {
    const sub = content.subreddit || (this.opts.subreddit || 'technology');
    return this._api('https://oauth.reddit.com', '/api/submit', {
      method: 'POST',
      body: {
        api_type: 'json',
        kind: 'self',
        sr: sub,
        title: content.title || content.text.slice(0, 80),
        text: content.text,
      },
    }).then((r) => ({ ok: r.status === 200 && !!r.data?.json?.data?.id, postId: r.data?.json?.data?.id, raw: r.data }));
  }

  async restInbox() {
    const r = await this._api('https://oauth.reddit.com', '/message/inbox?limit=25');
    if (r.status !== 200) return [];
    return (r.data?.data?.children || [])
      .filter((c) => c.kind === 't1')
      .map((c) => ({
        from: c.data.author,
        handle: `u/${c.data.author}`,
        text: c.data.body,
        threadId: `t1_${c.data.id}`,
      }));
  }

  restReply(threadId, text) {
    return this._api('https://oauth.reddit.com', '/api/comment', {
      method: 'POST',
      body: { api_type: 'json', thing_id: threadId, text },
    }).then((r) => ({ ok: r.status === 200, raw: r.data }));
  }

  restMetrics() {
    return this._api('https://oauth.reddit.com', '/api/v1/me').then((r) => {
      const me = r.data;
      return {
        mode: 'rest',
        followers: Number(me.total_karma || 0),
        posts: Number(me.link_karma || 0),
        replies: Number(me.comment_karma || 0),
        likes: 0, engagement: 0,
      };
    });
  }

  mcpPublish(content) { return this.tryMcp(this.tool('publish', ['reddit_post', 'submit_post']), { subreddit: content.subreddit || 'technology', title: content.title || content.text.slice(0, 80), text: content.text }); }
  mcpReply(threadId, text) { return this.tryMcp(this.tool('reply', ['reddit_reply', 'reply_comment']), { thing_id: threadId, text }); }
  mcpInbox() { return this.tryMcp(this.tool('inbox', ['reddit_inbox', 'list_messages']), {}); }
  mcpMetrics() { return this.tryMcp(this.tool('metrics', ['reddit_profile', 'account_metrics']), {}); }

  simPublish(content) { return this.sim.publish(content); }
  simInbox() { return this.sim.inbox(1); }
  simReply(threadId, text) { return this.sim.reply(); }
  simMetrics() { return this.sim.metrics(); }
}
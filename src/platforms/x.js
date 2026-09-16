import crypto from 'node:crypto';
import { Platform } from './base.js';
import { SimEngine } from './simEngine.js';
import { config } from '../config.js';
import { info, warn } from '../core/logger.js';

export class XPlatform extends Platform {
  constructor(mcpManager) {
    super('x', 'X (Twitter)', '@yourhandle', { mcpManager });
    this.sim = new SimEngine(this);
  }

  hasCredentials() {
    return !!(this.cred(null, 'xBearer') || (this.cred(null, 'xKey') && this.cred(null, 'xSecret')));
  }

  _oauth1(method, url, bodyParams = {}) {
    const oauth = {
      oauth_consumer_key: config.creds.xKey,
      oauth_nonce: crypto.randomBytes(16).toString('hex'),
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
      oauth_token: config.creds.xAToken,
      oauth_version: '1.0',
    };
    const all = { ...bodyParams, ...oauth };
    const base = Object.keys(all).sort().map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(all[k])}`).join('&');
    const sigBase = `${method.toUpperCase()}&${encodeURIComponent(url)}&${encodeURIComponent(base)}`;
    const sigKey = `${encodeURIComponent(config.creds.xSecret)}&${encodeURIComponent(config.creds.xASecret)}`;
    oauth.oauth_signature = crypto.createHmac('sha1', sigKey).update(sigBase).digest('base64');
    return 'OAuth ' + Object.entries(oauth)
      .map(([k, v]) => `${encodeURIComponent(k)}="${encodeURIComponent(v)}"`)
      .join(', ');
  }

  async restPublish(content) {
    const url = 'https://api.twitter.com/2/tweets';
    const headers = {};
    if (this.cred(null, 'xKey')) headers.Authorization = this._oauth1('POST', url, { text: content.text });
    else if (this.cred(null, 'xBearer')) headers.Authorization = `Bearer ${config.creds.xBearer}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: content.text }),
    }).catch((e) => ({ ok: false, raw: e.message }));
    if (res.ok !== undefined) return res;
    const data = await res.json();
    return { ok: !!data.data?.id, postId: data.data?.id, raw: data };
  }

  restInbox() {
    if (!this.cred(null, 'xBearer')) return [];
    return fetch('https://api.twitter.com/2/users/me', { headers: { Authorization: `Bearer ${config.creds.xBearer}` } })
      .then((r) => r.json())
      .then(() => [])
      .catch(() => []);
  }

  restReply(threadId, text) {
    return this.restPublish({ text, in_reply_to: threadId });
  }

  restMetrics() {
    return Promise.resolve({ mode: 'rest', followers: 0, posts: 0, replies: 0, likes: 0, engagement: 0 });
  }

  mcpPublish(content) { return this.tryMcp(this.tool('publish', ['post_tweet', 'create_tweet', 'tweet']), { text: content.text }); }
  mcpReply(threadId, text) { return this.tryMcp(this.tool('reply', ['reply_tweet', 'tweet_reply', 'send_reply']), { tweet_id: threadId, text }); }
  mcpInbox() { return this.tryMcp(this.tool('inbox', ['list_dms', 'get_mentions', 'get_timeline']), {}); }
  mcpMetrics() { return this.tryMcp(this.tool('metrics', ['account_stats', 'twitter_metrics', 'get_metrics']), {}); }

  simPublish(content) { return this.sim.publish(content); }
  simInbox() { return this.sim.inbox(1); }
  simReply(threadId, text) { return this.sim.reply(); }
  simMetrics() { return this.sim.metrics(); }
}
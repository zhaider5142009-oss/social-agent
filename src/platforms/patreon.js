import { Platform } from './base.js';
import { SimEngine } from './simEngine.js';
import { config } from '../config.js';
import { info, warn } from '../core/logger.js';

export class PatreonPlatform extends Platform {
  constructor(mcpManager) {
    super('patreon', 'Patreon', 'YourPatreon', { mcpManager });
    this.sim = new SimEngine(this);
  }

  hasCredentials() {
    return !!this.cred(null, 'patreon');
  }

  restPublish(content) {
    // Patreon v2 API: create a post for a campaign needs campaign id.
    return fetch('https://www.patreon.com/api/oauth2/v2/posts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.creds.patreon}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          type: 'post',
          attributes: {
            title: content.title || content.text.slice(0, 80),
            content: content.text,
            is_paid: false,
            tags: content.tags || [],
          },
        },
      }),
    }).then(async (r) => ({ ok: r.ok, postId: (await r.json().catch(() => ({}))).data?.id, raw: r.status }));
  }

  restInbox() { return []; }

  restReply(threadId, text) {
    return fetch(`https://www.patreon.com/api/oauth2/v2/posts/${threadId}/comments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.creds.patreon}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { type: 'comment', attributes: { body: text } } }),
    }).then(async (r) => ({ ok: r.ok, raw: r.status }));
  }

  restMetrics() {
    return fetch('https://www.patreon.com/api/oauth2/v2/identity?include=memberships', {
      headers: { Authorization: `Bearer ${config.creds.patreon}` },
    }).then((r) => r.json()).then((d) => ({
      mode: 'rest',
      followers: Number(d.data?.attributes?.full_name ? 0 : 0),
      posts: 0, replies: 0, likes: 0, engagement: 0,
    })).catch(() => ({ mode: 'rest', followers: 0, posts: 0, replies: 0, likes: 0, engagement: 0 }));
  }

  mcpPublish(content) { return this.tryMcp(this.tool('publish', ['patreon_post', 'create_post']), { title: content.title || content.text.slice(0, 80), text: content.text }); }
  mcpReply(threadId, text) { return this.tryMcp(this.tool('reply', ['patreon_reply', 'reply_comment']), { post_id: threadId, text }); }
  mcpInbox() { return this.tryMcp(this.tool('inbox', ['patreon_inbox', 'list_comments']), {}); }
  mcpMetrics() { return this.tryMcp(this.tool('metrics', ['patreon_stats', 'campaign_metrics']), {}); }

  simPublish(content) { return this.sim.publish(content); }
  simInbox() { return this.sim.inbox(1); }
  simReply(threadId, text) { return this.sim.reply(); }
  simMetrics() { return this.sim.metrics(); }
}
import { Platform } from './base.js';
import { SimEngine } from './simEngine.js';
import { config } from '../config.js';
import { info, warn } from '../core/logger.js';

export class LinkedInPlatform extends Platform {
  constructor(mcpManager) {
    super('linkedin', 'LinkedIn', 'Your Name', { mcpManager });
    this.sim = new SimEngine(this);
  }

  hasCredentials() {
    return !!this.cred(null, 'linkedin');
  }

  restPublish(content) {
    return fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.creds.linkedin}`,
        'X-Restli-Protocol-Version': '2.0.0',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        author: `urn:li:person:${content.linkedinPersonId || ''}`,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text: content.text },
            shareMediaCategory: 'NONE',
          },
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
      }),
    })
      .then(async (r) => ({ ok: r.ok, postId: await r.text().catch(() => ''), raw: r.status }));
  }

  restInbox() { return []; }

  restReply(threadId, text) {
    return fetch('https://api.linkedin.com/v2/socialActions/' + encodeURIComponent(threadId) + '/comments', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.creds.linkedin}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: text }),
    }).then((r) => Promise.resolve({ ok: r.ok, raw: r.status }));
  }

  restMetrics() {
    return fetch('https://api.linkedin.com/v2/me?projection=(id,localizedFirstName,localizedLastName)', {
      headers: { Authorization: `Bearer ${config.creds.linkedin}` },
    }).then((r) => r.json()).then(() => Promise.resolve({ mode: 'rest', followers: 0, posts: 0, replies: 0, likes: 0, engagement: 0 }));
  }

  mcpPublish(content) { return this.tryMcp(this.tool('publish', ['linkedin_post', 'post_update', 'create_post']), { text: content.text }); }
  mcpReply(threadId, text) { return this.tryMcp(this.tool('reply', ['linkedin_reply', 'reply_comment']), { thread_id: threadId, text }); }
  mcpInbox() { return this.tryMcp(this.tool('inbox', ['linkedin_inbox', 'list_messages']), {}); }
  mcpMetrics() { return this.tryMcp(this.tool('metrics', ['linkedin_stats', 'profile_metrics']), {}); }

  simPublish(content) { return this.sim.publish(content); }
  simInbox() { return this.sim.inbox(1); }
  simReply(threadId, text) { return this.sim.reply(); }
  simMetrics() { return this.sim.metrics(); }
}
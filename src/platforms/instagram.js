import { Platform } from './base.js';
import { SimEngine } from './simEngine.js';
import { config } from '../config.js';
import { info, warn } from '../core/logger.js';

export class InstagramPlatform extends Platform {
  constructor(mcpManager) {
    super('instagram', 'Instagram', '@yourhandle', { mcpManager });
    this.sim = new SimEngine(this);
  }

  hasCredentials() {
    return !!this.cred(null, 'instagram');
  }

  restPublish(content) {
    // Instagram Graph API: create container then publish.
    const containerUrl = `https://graph.facebook.com/v19.0/${config.creds.instagramBusiness}/media`;
    const publishUrl = `https://graph.facebook.com/v19.0/${config.creds.instagramBusiness}/media_publish`;
    const imageUrl = content.imageUrl || content.image_url;
    const createBody = imageUrl
      ? { image_url: imageUrl, caption: content.text }
      : { media_type: 'TEXT' };
    return fetch(containerUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.creds.instagram}` },
      body: new URLSearchParams(createBody),
    })
      .then((r) => r.json())
      .then(async (c) => {
        if (!c.id) return { ok: false, raw: c };
        const pub = await fetch(publishUrl, {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.creds.instagram}` },
          body: new URLSearchParams({ creation_id: c.id }),
        }).then((r) => r.json());
        return { ok: !!pub.id, postId: pub.id, raw: pub };
      });
  }

  restInbox() {
    // Mentions/DMs require the IG Messaging API (for allowed clients only).
    return [];
  }

  restReply(threadId, text) { return Promise.resolve({ ok: false, raw: 'DM reply requires IG Messaging API access' }); }

  restMetrics() {
    return fetch(
      `https://graph.facebook.com/v19.0/${config.creds.instagramBusiness}?fields=followers_count,media_count`,
      { headers: { Authorization: `Bearer ${config.creds.instagram}` } },
    ).then((r) => r.json()).then((d) => ({
      mode: 'rest',
      followers: d.followers_count || 0,
      posts: d.media_count || 0,
      replies: 0, likes: 0, engagement: 0,
    }));
  }

  mcpPublish(content) { return this.tryMcp(this.tool('publish', ['instagram_post', 'create_post', 'post_photo']), { caption: content.text, image_url: content.imageUrl }); }
  mcpReply(threadId, text) { return this.tryMcp(this.tool('reply', ['instagram_reply', 'reply_comment', 'send_dm']), { thread_id: threadId, text }); }
  mcpInbox() { return this.tryMcp(this.tool('inbox', ['instagram_inbox', 'list_comments', 'get_dms']), {}); }
  mcpMetrics() { return this.tryMcp(this.tool('metrics', ['instagram_stats', 'account_metrics']), {}); }

  simPublish(content) { return this.sim.publish(content); }
  simInbox() { return this.sim.inbox(1); }
  simReply(threadId, text) { return this.sim.reply(); }
  simMetrics() { return this.sim.metrics(); }
}
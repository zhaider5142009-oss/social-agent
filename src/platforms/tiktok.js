import { Platform } from './base.js';
import { SimEngine } from './simEngine.js';
import { config } from '../config.js';
import { info, warn } from '../core/logger.js';

export class TikTokPlatform extends Platform {
  constructor(mcpManager) {
    super('tiktok', 'TikTok', '@yourhandle', { mcpManager });
    this.sim = new SimEngine(this);
  }

  hasCredentials() {
    return !!this.cred(null, 'tiktok');
  }

  restPublish(content) {
    // Content Posting API: POST /v2/post/publish/video/init then upload.
    return fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.creds.tiktok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        post_info: { title: content.text || content.title || '', privacy_level: 'SELF_ONLY' },
      }),
    }).then(async (r) => ({ ok: r.ok, raw: await r.text().catch(() => r.status) }));
  }

  restInbox() { return []; }

  restReply(threadId, text) {
    // Reply/Comment API available to approved apps via POST /v2/post/comment/reply/
    return fetch('https://open.tiktokapis.com/v2/post/comment/reply/', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.creds.tiktok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment_id: threadId, reply_text: text }),
    }).then(async (r) => ({ ok: r.ok, raw: await r.text().catch(() => r.status) }));
  }

  restMetrics() {
    return fetch('https://open.tiktokapis.com/v2/research/user/info/?fields=display_name,biography,stats', {
      headers: { Authorization: `Bearer ${config.creds.tiktok}` },
    }).then((r) => r.json()).then((d) => {
      const st = d?.data?.user?.stats || {};
      return {
        mode: 'rest',
        followers: Number(st.follower_count || 0),
        posts: Number(st.video_count || 0),
        replies: 0, likes: Number(st.like_count || 0), engagement: 0,
      };
    }).catch(() => ({ mode: 'rest', followers: 0, posts: 0, replies: 0, likes: 0, engagement: 0 }));
  }

  mcpPublish(content) { return this.tryMcp(this.tool('publish', ['tiktok_post', 'post_video', 'upload_video']), { text: content.text || content.title, videoPath: content.videoPath }); }
  mcpReply(threadId, text) { return this.tryMcp(this.tool('reply', ['tiktok_reply', 'reply_comment']), { comment_id: threadId, text }); }
  mcpInbox() { return this.tryMcp(this.tool('inbox', ['tiktok_comments', 'list_comments']), {}); }
  mcpMetrics() { return this.tryMcp(this.tool('metrics', ['tiktok_stats', 'account_metrics']), {}); }

  simPublish(content) { return this.sim.publish(content); }
  simInbox() { return this.sim.inbox(1); }
  simReply(threadId, text) { return this.sim.reply(); }
  simMetrics() { return this.sim.metrics(); }
}
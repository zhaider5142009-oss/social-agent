import { Platform } from './base.js';
import { SimEngine } from './simEngine.js';
import { config } from '../config.js';
import { info, warn } from '../core/logger.js';

export class YouTubePlatform extends Platform {
  constructor(mcpManager) {
    super('youtube', 'YouTube', 'YourChannel', { mcpManager });
    this.sim = new SimEngine(this);
  }

  hasCredentials() {
    return !!this.cred(null, 'youtube');
  }

  restPublish(content) {
    // Video upload requires OAuth; we post a community-style post where the
    // authenticated API permits. Live upload is left to MCP tooling / OAuth.
    return Promise.resolve({ ok: false, raw: 'video upload requires OAuth workflow' });
  }

  restInbox() {
    if (!this.cred(null, 'youtube')) return Promise.resolve([]);
    const files = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&allThreadsRelatedToChannelId=${config.creds.youtubeChannel}&maxResults=10&key=${config.creds.youtube}`;
    return fetch(files).then((r) => r.json()).then((d) =>
      (d.items || []).map((it) => {
        const s = it.snippet?.topLevelComment?.snippet || {};
        return { from: s.authorDisplayName || 'viewer', handle: '', text: s.textOriginal || '', threadId: it.id || `${Date.now()}` };
      }),
    ).catch(() => []);
  }

  restReply(threadId, text) {
    // Requires OAuth2 user token; REST variant needs an authorized client token.
    return Promise.resolve({ ok: false, raw: 'reply requires OAuth workflow' });
  }

  restMetrics() {
    if (!this.cred(null, 'youtube') || !this.cred(null, 'youtubeChannel')) return Promise.resolve({ mode: 'rest', followers: 0, posts: 0, replies: 0, likes: 0, engagement: 0 });
    const q = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${config.creds.youtubeChannel}&key=${config.creds.youtube}`;
    return fetch(q).then((r) => r.json()).then((d) => {
      const st = d.items?.[0]?.statistics || {};
      return {
        mode: 'rest',
        followers: Number(st.subscriberCount || 0),
        posts: Number(st.videoCount || 0),
        replies: 0, likes: Number(st.likeCount || 0), engagement: 0,
      };
    }).catch(() => ({ mode: 'rest', followers: 0, posts: 0, replies: 0, likes: 0, engagement: 0 }));
  }

  mcpPublish(content) { return this.tryMcp(this.tool('publish', ['youtube_post', 'upload_video', 'post_community']), { title: content.title || content.text.slice(0, 80), text: content.text }); }
  mcpReply(threadId, text) { return this.tryMcp(this.tool('reply', ['youtube_reply', 'reply_comment']), { comment_id: threadId, text }); }
  mcpInbox() { return this.tryMcp(this.tool('inbox', ['youtube_comments', 'list_comments']), {}); }
  mcpMetrics() { return this.tryMcp(this.tool('metrics', ['youtube_stats', 'channel_metrics']), {}); }

  simPublish(content) { return this.sim.publish(content); }
  simInbox() { return this.sim.inbox(1); }
  simReply(threadId, text) { return this.sim.reply(); }
  simMetrics() { return this.sim.metrics(); }
}
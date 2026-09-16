import { Platform } from './base.js';
import { SimEngine } from './simEngine.js';
import { config } from '../config.js';
import { info, warn } from '../core/logger.js';

export class SnapchatPlatform extends Platform {
  constructor(mcpManager) {
    super('snapchat', 'Snapchat', '@yourusername', { mcpManager });
    this.sim = new SimEngine(this);
  }

  hasCredentials() {
    return !!this.cred(null, 'snapchat');
  }

  restPublish(content) {
    // Snap's public Lens/Business API does not offer standard wall posts.
    // This connector surfaces a clear path: plug a real MCP server via mcp.servers.json
    return Promise.resolve({ ok: false, raw: 'snapchat wall posts require MCP connector' });
  }

  restInbox() { return []; }

  restReply(threadId, text) {
    return Promise.resolve({ ok: false, raw: 'snapchat replies require MCP connector' });
  }

  restMetrics() {
    return Promise.resolve({ mode: 'rest', followers: 0, posts: 0, replies: 0, likes: 0, engagement: 0 });
  }

  mcpPublish(content) { return this.tryMcp(this.tool('publish', ['snapchat_post', 'send_snap', 'post_story']), { text: content.text, imageUrl: content.imageUrl }); }
  mcpReply(threadId, text) { return this.tryMcp(this.tool('reply', ['snapchat_reply', 'send_reply']), { thread_id: threadId, text }); }
  mcpInbox() { return this.tryMcp(this.tool('inbox', ['snapchat_inbox', 'list_messages']), {}); }
  mcpMetrics() { return this.tryMcp(this.tool('metrics', ['snapchat_stats', 'account_metrics']), {}); }

  simPublish(content) { return this.sim.publish(content); }
  simInbox() { return this.sim.inbox(1); }
  simReply(threadId, text) { return this.sim.reply(); }
  simMetrics() { return this.sim.metrics(); }
}
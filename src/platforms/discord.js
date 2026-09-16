import { Platform } from './base.js';
import { SimEngine } from './simEngine.js';
import { config } from '../config.js';
import { info, warn } from '../core/logger.js';

export class DiscordPlatform extends Platform {
  constructor(mcpManager) {
    super('discord', 'Discord', 'your-server', { mcpManager });
    this.sim = new SimEngine(this);
  }

  hasCredentials() {
    return !!this.cred(null, 'discordBot');
  }

  _api(method, path, body) {
    return fetch(`https://discord.com/api/v10${path}`, {
      method,
      headers: { Authorization: `Bot ${config.creds.discordBot}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  restPublish(content) {
    const channelId = content.channelId || config.creds.discordChannel;
    if (!channelId) return Promise.resolve({ ok: false, raw: 'no channel id' });
    return this._api('POST', `/channels/${channelId}/messages`, { content: content.text })
      .then(async (r) => ({ ok: r.ok, postId: (await r.json().catch(() => ({}))).id, raw: r.status }));
  }

  restInbox() {
    const channelId = this.cred(null, 'discordChannel');
    if (!channelId) return Promise.resolve([]);
    return this._api('GET', `/channels/${channelId}/messages?limit=25`)
      .then((r) => r.json())
      .then((msgs) =>
        (msgs || [])
          .filter((m) => !m.author?.bot && m.content)
          .map((m) => ({
            from: m.author?.username || 'unknown',
            handle: m.author?.id ? `<@${m.author.id}>` : '',
            text: m.content,
            threadId: m.id,
          })),
      )
      .catch(() => []);
  }

  restReply(threadId, text) {
    const channelId = this.cred(null, 'discordChannel');
    if (!channelId) return Promise.resolve({ ok: false, raw: 'no channel id' });
    return this._api('POST', `/channels/${channelId}/messages`, { content: text, message_reference: { message_id: threadId } })
      .then(async (r) => ({ ok: r.ok, raw: r.status }));
  }

  restMetrics() {
    return Promise.resolve({ mode: 'rest', followers: 0, posts: 0, replies: 0, likes: 0, engagement: 0 });
  }

  mcpPublish(content) { return this.tryMcp(this.tool('publish', ['discord_post', 'send_message', 'post_message']), { channel_id: content.channelId || config.creds.discordChannel, text: content.text }); }
  mcpReply(threadId, text) { return this.tryMcp(this.tool('reply', ['discord_reply', 'reply_message']), { channel_id: config.creds.discordChannel, message_id: threadId, text }); }
  mcpInbox() { return this.tryMcp(this.tool('inbox', ['discord_inbox', 'list_messages']), {}); }
  mcpMetrics() { return this.tryMcp(this.tool('metrics', ['discord_stats', 'server_metrics']), {}); }

  simPublish(content) { return this.sim.publish(content); }
  simInbox() { return this.sim.inbox(1); }
  simReply(threadId, text) { return this.sim.reply(); }
  simMetrics() { return this.sim.metrics(); }
}
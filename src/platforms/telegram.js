import { Platform } from './base.js';
import { SimEngine } from './simEngine.js';
import { config } from '../config.js';
import { info, warn } from '../core/logger.js';

export class TelegramPlatform extends Platform {
  constructor(mcpManager) {
    super('telegram', 'Telegram', '@yourchannel', { mcpManager });
    this.sim = new SimEngine(this);
  }

  hasCredentials() {
    return !!this.cred(null, 'telegramBot');
  }

  _api(method, params) {
    return fetch(`https://api.telegram.org/bot${config.creds.telegramBot}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    }).then((r) => r.json());
  }

  restPublish(content) {
    const chatId = config.creds.telegramChannel;
    return this._api('sendMessage', { chat_id: chatId, text: content.text, parse_mode: 'HTML' }).then((r) => ({
      ok: !!r.ok,
      postId: r.result?.message_id,
      raw: r.description || r,
    }));
  }

  restInbox() {
    return this._api('getUpdates', { timeout: 0, allowed_updates: ['message'] }).then((r) => {
      if (!r.ok) return [];
      return (r.result || [])
        .filter((u) => u.message?.text)
        .map((u) => ({
          from: u.message.from?.first_name + (u.message.from?.last_name ? ' ' + u.message.from.last_name : ''),
          handle: u.message.from?.username ? '@' + u.message.from.username : '',
          text: u.message.text,
          threadId: String(u.update_id),
        }));
    });
  }

  restReply(threadId, text) {
    const chatId = config.creds.telegramChannel;
    return this._api('sendMessage', { chat_id: chatId, text, reply_to_message_id: Number(threadId) || undefined }).then((r) => ({
      ok: !!r.ok,
      raw: r.description || r,
    }));
  }

  restMetrics() {
    return this._api('getMe', {}).then((r) => ({
      mode: 'rest',
      handle: r.ok ? '@' + (r.result.username || 'channel') : null,
      followers: 0, // Telegram exposes no public follower count without Bot API channel stats
      posts: 0, replies: 0, likes: 0, engagement: 0,
    }));
  }

  mcpPublish(content) { return this.tryMcp(this.tool('publish', ['post_message', 'send_message']), { chat_id: config.creds.telegramChannel, text: content.text }); }
  mcpReply(threadId, text) { return this.tryMcp(this.tool('reply', ['reply_message', 'send_message']), { chat_id: config.creds.telegramChannel, text, reply_to_message_id: Number(threadId) || undefined }); }
  mcpInbox() { return this.tryMcp(this.tool('inbox', ['list_messages', 'get_updates']), {}); }
  mcpMetrics() { return this.tryMcp(this.tool('metrics', ['get_metrics', 'channel_stats']), {}); }

  simPublish(content) { return this.sim.publish(content); }
  simInbox() { return this.sim.inbox(1); }
  simReply(threadId, text) { return this.sim.reply(); }
  simMetrics() { return this.sim.metrics(); }
}
import { Platform } from './base.js';
import { SimEngine } from './simEngine.js';
import { config } from '../config.js';
import { info, warn } from '../core/logger.js';

export class WhatsAppPlatform extends Platform {
  constructor(mcpManager) {
    super('whatsapp', 'WhatsApp', '@yourwa', { mcpManager });
    this.sim = new SimEngine(this);
  }

  hasCredentials() {
    return !!(this.cred(null, 'whatsappToken') && this.cred(null, 'whatsappPhone'));
  }

  _api(path, body) {
    return fetch(`https://graph.facebook.com/v19.0/${config.creds.whatsappPhone}/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.creds.whatsappToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }).then((r) => r.json());
  }

  restPublish(content) {
    return this._api('messages', {
      messaging_product: 'whatsapp',
      to: content.to || 'broadcast',
      type: 'text',
      text: { body: content.text },
    }).then((r) => ({ ok: !!r.messages, postId: r.messages?.[0]?.id, raw: r }));
  }

  restInbox() {
    // WhatsApp Cloud API delivers webhooks; we poll via the classic path is not public —
    // treat as sim here unless webhook arrives (history handled by server/webhook).
    return [];
  }

  restReply(threadId, text) {
    return this._api('messages', {
      messaging_product: 'whatsapp',
      to: threadId,
      type: 'text',
      text: { body: text },
    }).then((r) => ({ ok: !!r.messages, raw: r }));
  }

  restMetrics() {
    return Promise.resolve({ mode: 'rest', followers: 0, posts: 0, replies: 0, likes: 0, engagement: 0 });
  }

  mcpPublish(content) { return this.tryMcp(this.tool('publish', ['send_whatsapp', 'whatsapp_send', 'post_message']), { to: content.to || 'broadcast', text: content.text }); }
  mcpReply(threadId, text) { return this.tryMcp(this.tool('reply', ['whatsapp_reply', 'reply_message']), { to: threadId, text }); }
  mcpInbox() { return this.tryMcp(this.tool('inbox', ['list_whatsapp_messages', 'get_updates']), {}); }
  mcpMetrics() { return this.tryMcp(this.tool('metrics', ['whatsapp_stats', 'get_metrics']), {}); }

  simPublish(content) { return this.sim.publish(content); }
  simInbox() { return this.sim.inbox(1); }
  simReply(threadId, text) { return this.sim.reply(); }
  simMetrics() { return this.sim.metrics(); }
}
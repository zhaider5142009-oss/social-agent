import { config } from '../config.js';
import { store } from '../core/store.js';
import { info, warn } from '../core/logger.js';

/**
 * Base platform connector.
 *
 * Transport priority per operation:
 *   1. MCP  — if a server is configured for this platform in mcp.servers.json
 *   2. REST — if platform credentials are present in .env
 *   3. SIM  — realistic simulation so the full loop is demonstrable offline
 *
 * Subclasses implement rest*() / sim*() and declare the MCP tool names they
 * accept, so any real MCP server exposing the same tool surface plugs in.
 */
export class Platform {
  constructor(name, label, handle, opts = {}) {
    this.name = name;          // telegram, x, instagram, ...
    this.label = label;        // "Telegram"
    this.handle = handle;      // @handle
    this.opts = opts;
    this.mcp = opts.mcpManager || null;
    this.byId = (n) => n;      // normalize MCP tool names
  }

  badge(name) {
    return this.byId(name);
  }

  mcpTools() {
    return this.mcp?.tools(this.name) ?? [];
  }

  mode() {
    if (this.mcp?.hasServer(this.name)) return 'mcp';
    if (this.hasCredentials()) return 'rest';
    return 'sim';
  }

  hasCredentials() { return false; }

  cred(field, key) {
    return config.creds[key] ?? config.creds[field] ?? '';
  }

  // ---- MCP tool name conventions -------------------------------------------
  tool(which, variants) {
    const tools = this.mcpTools().map((t) => t.name);
    for (const v of variants) {
      if (tools.includes(v)) return v;
    }
    return null;
  }

  async tryMcp(toolName, args) {
    if (!toolName) throw new Error(`${this.label}: MCP tool not found`);
    return await this.mcp.call(this.name, toolName, args);
  }

  // ---- unified capability surface -----------------------------------------
  async publish(content, ctx = {}) {
    const m = this.mode();
    if (m === 'mcp') return { via: 'mcp', ...(await this.mcpPublish(content)) };
    if (m === 'rest') return { via: 'rest', ...(await this.restPublish(content)) };
    return { via: 'sim', ...(await this.simPublish(content, ctx)) };
  }

  async fetchInbox(ctx = {}) {
    const m = this.mode();
    if (m === 'mcp') return { mode: 'mcp', items: await this.mcpInbox() };
    if (m === 'rest') return { mode: 'rest', items: await this.restInbox() };
    return { mode: 'sim', items: await this.simInbox(ctx) };
  }

  async sendReply(threadId, text, ctx = {}) {
    const m = this.mode();
    if (m === 'mcp') return { via: 'mcp', ...(await this.mcpReply(threadId, text)) };
    if (m === 'rest') return { via: 'rest', ...(await this.restReply(threadId, text)) };
    return { via: 'sim', ...(await this.simReply(threadId, text, ctx)) };
  }

  async metrics(ctx = {}) {
    const m = this.mode();
    if (m === 'mcp') return { mode: 'mcp', ...(await this.mcpMetrics()) };
    if (m === 'rest') return { mode: 'rest', ...(await this.restMetrics()) };
    return { mode: 'sim', ...(await this.simMetrics(ctx)) };
  }

  // Override these in subclasses:
  async mcpPublish() { throw new Error('mcpPublish not implemented'); }
  async mcpInbox() { return []; }
  async mcpReply() { throw new Error('mcpReply not implemented'); }
  async mcpMetrics() { return {}; }
  async restPublish() { throw new Error('restPublish not implemented'); }
  async restInbox() { return []; }
  async restReply() { throw new Error('restReply not implemented'); }
  async restMetrics() { return {}; }
  async simPublish() { return { ok: true, postId: null }; }
  async simInbox() { return []; }
  async simReply() { return { ok: true }; }
  async simMetrics() { return {}; }

  // shared simulation helpers ------------------------------------------------
  simFollowersBase() {
    return config.sim.startFollowers;
  }

  store() {
    return store.platform(this.name);
  }
}

export const logInfo = info;
export const logWarn = warn;
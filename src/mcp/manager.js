import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StdioMCPClient, HttpMCPClient } from './client.js';
import { info, warn, error } from '../core/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MCP_CONFIG = path.join(__dirname, '..', '..', 'mcp.servers.json');
const MCP_CONFIG_EXAMPLE = path.join(__dirname, '..', '..', 'mcp.servers.example.json');

/**
 * MCP Manager: loads mcp.servers.json, connects to each server, and exposes
 * per-platform tool dispatching. If a platform is not mapped to an MCP server,
 * the connector falls back to REST (credentials) then simulation.
 */
export class MCPManager {
  constructor() {
    this.servers = new Map(); // platform -> client
    this.config = {};
    this.connected = [];
  }

  load() {
    let raw = null;
    const file = fs.existsSync(MCP_CONFIG) ? MCP_CONFIG : MCP_CONFIG_EXAMPLE;
    try {
      raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      this.config = raw;
      info('mcp', `config loaded from ${file}: ${Object.keys(raw).length} platform mappings`);
    } catch (e) {
      warn('mcp', `no valid mcp.servers.json (${e.message}). Defaulting to REST/simulation.`);
      try {
        raw = JSON.parse(fs.readFileSync(MCP_CONFIG_EXAMPLE, 'utf8'));
        this.config = raw;
      } catch {}
    }
    return this.config;
  }

  async connectAll() {
    const entries = Object.entries(this.config).filter(([k]) => !k.startsWith('_'));
    const tasks = entries.map(async ([platform, spec]) => {
      try {
        const client = await this._connect(spec);
        this.servers.set(platform, client);
        this.connected.push(platform);
        info('mcp', `connected MCP server for ${platform}`);
      } catch (e) {
        warn('mcp', `${platform}: MCP server unavailable (${e.message}). Falling back.`);
      }
    });
    await Promise.all(tasks);
    return this.connected;
  }

  async _connect(spec) {
    if (spec.type === 'stdio') {
      const c = new StdioMCPClient({
        name: spec.name || 'mcp',
        command: spec.command,
        args: spec.args || [],
        env: spec.env || {},
        cwd: spec.cwd,
      });
      await c.connect();
      return c;
    }
    if (spec.type === 'http' || spec.type === 'sse' || spec.url) {
      const c = new HttpMCPClient({ name: spec.name || 'mcp', url: spec.url, headers: spec.headers, token: spec.token });
      await c.connect();
      return c;
    }
    throw new Error(`unknown transport type "${spec.type}"`);
  }

  hasServer(platform) {
    return this.servers.has(platform);
  }

  client(platform) {
    return this.servers.get(platform) || null;
  }

  tools(platform) {
    return this.client(platform)?.listTools() ?? [];
  }

  async call(platform, tool, args = {}) {
    const c = this.client(platform);
    if (!c) throw new Error(`no MCP server for ${platform}`);
    return await c.call(tool, args);
  }
}

export const mcpManager = new MCPManager();
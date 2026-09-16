import { spawn } from 'node:child_process';
import { info, warn, error } from '../core/logger.js';

let rpcId = 0;

class PendingTxn {
  constructor(method, params) {
    this.id = ++rpcId;
    this.method = method;
    this.params = params;
    this.resolve = null;
    this.reject = null;
    this.promise = new Promise((res, rej) => {
      this.resolve = res;
      this.reject = rej;
    });
  }
}

/**
 * MCP client for stdio transport (spawned server process).
 * Speaks JSON-RPC 2.0 + MCP protocol (initialize, tools/list, tools/call).
 */
export class StdioMCPClient {
  constructor({ name, command, args = [], env = {}, cwd }) {
    this.name = name;
    this.command = command;
    this.args = args;
    this.env = env;
    this.cwd = cwd;
    this.proc = null;
    this.pending = new Map();
    this.buffer = '';
    this.ready = false;
    this.tools = [];
  }

  connect(timeout = 20000) {
    info('mcp', `spawning ${this.name}: ${this.command} ${this.args.join(' ')}`);
    this.proc = spawn(this.command, this.args, {
      env: { ...process.env, ...this.env },
      cwd: this.cwd,
      shell: process.platform === 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.proc.stdout.on('data', (d) => this._onData(d));
    this.proc.stderr.on('data', (d) => {
      const msg = d.toString().trim();
      if (msg) info('mcp', `${this.name} stderr: ${msg}`);
    });
    this.proc.on('exit', (code) => {
      info('mcp', `${this.name} exited (${code})`);
      this.ready = false;
      const err = new Error(`${this.name} process exited (${code})`);
      this.pending.forEach((t) => t.reject(err));
      this.pending.clear();
    });

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${this.name} connect timeout`)), timeout);
      const finish = (ok) => {
        clearTimeout(timer);
        ok ? resolve(this) : reject(new Error(`${this.name} handshake failed`));
      };
      this._send('initialize', {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'social-agent', version: '1.0.0' },
      })
        .then((res) => {
          const accepted = res?.result?.capabilities;
          return this._send('notifications/initialized', {}, true);
        })
        .then(() => this._send('tools/list', {}))
        .then((res) => {
          this.tools = res?.result?.tools ?? [];
          this.ready = true;
          info('mcp', `${this.name}: ${this.tools.length} tools available`);
          finish(true);
        })
        .catch((e) => finish(false));
    });
  }

  _onData(chunk) {
    this.buffer += chunk.toString('utf8');
    let idx;
    while ((idx = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        this._handleMessage(msg);
      } catch (e) {
        warn('mcp', `${this.name}: bad JSON line: ${line.slice(0, 120)}`);
      }
    }
  }

  _handleMessage(msg) {
    if (msg.id && this.pending.has(msg.id)) {
      const t = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) t.reject(new Error(msg.error.message || `${this.name} rpc error`));
      else t.resolve(msg);
      return;
    }
    if (msg.method === 'notifications/message') {
      warn('mcp', `${this.name} notification: ${msg.params?.message}`);
    }
  }

  async _send(method, params = {}, isNotification = false) {
    const body = { jsonrpc: '2.0', method, params };
    if (isNotification) {
      this.proc.stdin.write(JSON.stringify(body) + '\n');
      return { result: {} };
    }
    const t = new PendingTxn(method, params);
    this.pending.set(t.id, t);
    this.proc.stdin.write(JSON.stringify({ ...body, id: t.id }) + '\n');
    return t.promise;
  }

  hasTool(name) {
    return this.tools.some((t) => t.name === name);
  }

  listTools() {
    return this.tools;
  }

  async call(name, args = {}) {
    if (!this.ready) throw new Error(`${this.name} not connected`);
    if (!this.hasTool(name)) throw new Error(`${this.name} has no tool "${name}"`);
    const res = await this._send('tools/call', { name, arguments: args });
    const content = res?.result?.content ?? [];
    const text = content.map((c) => c.text).join('\n').trim();
    let data = null;
    try { if (text) data = JSON.parse(text); } catch { data = text; }
    return { ok: !res?.result?.isError, data, raw: text };
  }

  close() {
    try { this.proc?.kill(); } catch {}
  }
}

/**
 * MCP client for HTTP transports (streamable HTTP / POST JSON-RPC).
 * Sends POST requests; parses JSON or SSE payloads. Best-effort session support.
 */
export class HttpMCPClient {
  constructor({ name, url, headers = {}, token }) {
    this.name = name;
    this.url = url;
    this.headers = {};
    if (token) this.headers.Authorization = `Bearer ${token}`;
    Object.assign(this.headers, headers);
    this.tools = [];
    this.ready = false;
  }

  async connect(timeout = 20000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const init = await this._post('initialize', {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'social-agent', version: '1.0.0' },
      }, controller.signal);
      if (init?.result?.serverInfo?.name) {
        this.sessionId = init.sessionId;
        await this._post('notifications/initialized', {}, controller.signal, true);
        const list = await this._post('tools/list', {}, controller.signal);
        this.tools = list?.result?.tools ?? [];
        this.ready = true;
        info('mcp', `${this.name} (http): ${this.tools.length} tools`);
        return this;
      }
      throw new Error(`${this.name}: handshake unexpected`);
    } catch (e) {
      clearTimeout(timer);
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  async _post(method, params, signal, isNotification = false) {
    const body = { jsonrpc: '2.0', method, params };
    if (!isNotification) body.id = ++rpcId;

    const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...this.headers };
    if (this.sessionId) headers['MCP-Session-Id'] = this.sessionId;

    const res = await fetch(this.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });
    const sessionId = res.headers.get('mcp-session-id');
    if (sessionId) this.sessionId = sessionId;

    const ctype = res.headers.get('content-type') || '';
    if (ctype.includes('text/event-stream')) {
      const raw = await res.text();
      const events = raw.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim());
      for (const ev of events) {
        const parsed = JSON.parse(ev);
        if (parsed.id === body.id) return parsed;
      }
      return { result: {} };
    }
    const json = await res.json();
    return json?.result ? { result: json.result, sessionId } : json;
  }

  hasTool(name) {
    return this.tools.some((t) => t.name === name);
  }

  listTools() {
    return this.tools;
  }

  async call(name, args = {}) {
    if (!this.ready) throw new Error(`${this.name} not connected`);
    if (!this.hasTool(name)) throw new Error(`${this.name} has no tool "${name}"`);
    const res = await this._post('tools/call', { name, arguments: args });
    const content = res?.result?.content ?? [];
    const text = content.map((c) => c.text).join('\n').trim();
    let data = null;
    try { if (text) data = JSON.parse(text); } catch { data = text; }
    return { ok: !res?.result?.isError, data, raw: text };
  }

  close() {}
}
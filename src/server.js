import express from 'express';
import path from 'node:path';
import http from 'node:http';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { store } from './core/store.js';
import { ai } from './core/ai.js';
import { mcpManager } from './mcp/manager.js';
import { onLog } from './core/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

export function startServer(platforms, orchestrator) {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use(express.static(PUBLIC_DIR));

  const sseClients = new Set();

  const platformMeta = () =>
    Object.fromEntries(
      Object.entries(platforms).map(([name, p]) => [name, { label: p.label, handle: p.handle, tools: p.mcpTools().map((t) => t.name), mode: p.mode() }]),
    );

  app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    sseClients.add(res);
    const ping = setInterval(() => {
      res.write(`event: ping\ndata: ${Date.now()}\n\n`);
    }, 15000);
    req.on('close', () => {
      clearInterval(ping);
      sseClients.delete(res);
    });
  });

  const broadcast = (entry) => {
    const payload = `event: activity\ndata: ${JSON.stringify(entry)}\n\n`;
    for (const c of sseClients) c.write(payload);
  };
  onLog(broadcast);

  const api = express.Router();

  api.get('/state', (req, res) => {
    res.json({
      settings: store.state.settings,
      totals: store.getTotals(),
      platforms: store.state.platforms,
      inbox: store.state.inbox,
      activity: store.state.activity.slice(0, 60),
      posts: store.state.posts.slice(0, 30),
      goals: store.state.goals,
      agent: {
        status: store.state.agent.status,
        cycles: store.state.agent.cycles,
        lastCycle: store.state.agent.lastCycle,
        lastThinking: store.state.agent.lastThinking,
      },
      mcp: { platforms: Object.keys(store.state.platforms), connected: mcpManager.connected },
      platformMeta: platformMeta(),
      aiUsage: ai.stats(),
      running: !!orchestrator.timer,
    });
  });

  api.get('/platforms', (req, res) => {
    const meta = platformMeta();
    res.json(
      Object.entries(platforms).map(([name, p]) => ({
        name,
        label: p.label,
        handle: p.handle,
        mode: p.mode(),
        tools: p.mcpTools().map((t) => t.name),
      })),
    );
  });

  api.post('/agent/cycle', async (req, res) => {
    const { manual } = req.body || {};
    await orchestrator.runCycle({ force: !!manual });
    res.json({ ok: true, status: store.state.agent.status });
  });

  api.post('/agent/toggle', (req, res) => {
    store.state.settings.agentOn = !store.state.settings.agentOn;
    if (store.state.settings.agentOn) { orchestrator.start(); store.state.agent.status = 'running'; }
    else orchestrator.stop();
    store.save();
    res.json({ ok: true, agentOn: store.state.settings.agentOn, running: !!orchestrator.timer });
  });

  api.post('/settings', (req, res) => {
    const { tone, niche, autoReply, autoPost, target } = req.body || {};
    if (tone) store.state.settings.tone = tone;
    if (niche) store.state.settings.niche = niche;
    if (typeof autoReply === 'boolean') store.state.settings.autoReply = autoReply;
    if (typeof autoPost === 'boolean') store.state.settings.autoPost = autoPost;
    const g = store.state.goals[0];
    if (target && g) g.target = Number(target);
    store.save();
    res.json({ ok: true, settings: store.state.settings });
  });

  api.post('/post', async (req, res) => {
    try {
      const { platform, text, topic, schedule } = req.body || {};
      if (!platform) return res.status(400).json({ ok: false, error: 'platform required' });
      const out = await orchestrator.composeAndPost({ platform, text, topic, schedule });
      res.json({ ok: true, ...out });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  api.post('/post-all', async (req, res) => {
    try {
      const { text, topic, schedule } = req.body || {};
      const results = {};
      for (const [name, p] of Object.entries(platforms)) {
        try { results[name] = await orchestrator.composeAndPost({ platform: name, text, topic, schedule }); }
        catch (e) { results[name] = { ok: false, error: e.message }; }
      }
      res.json({ ok: true, results });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  api.get('/inbox', (req, res) => res.json(store.state.inbox));

  api.post('/reply/:id', async (req, res) => {
    try {
      const { text } = req.body || {};
      if (!text) return res.status(400).json({ ok: false, error: 'text required' });
      const out = await orchestrator.manualReply(req.params.id, text);
      res.json({ ok: true, ...out });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  api.delete('/inbox/:id', (req, res) => {
    store.state.inbox = store.state.inbox.filter((m) => m.id !== req.params.id);
    store.save();
    res.json({ ok: true });
  });

  api.get('/goals', (req, res) => res.json(store.state.goals));

  app.use('/api', api);

  const server = http.createServer(app);
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n  [ERROR] Port ${config.port} is already in use.`);
      console.error(`  Another Social Agent instance may already be running.`);
      console.error(`  Close the other instance, or set PORT=<number> in .env\n`);
      process.exit(1);
    }
    throw err;
  });
  server.listen(config.port, () => {
    const url = `http://localhost:${config.port}`;
    console.log(`\n   SOCIAL AGENT running`);
    console.log(`   open  ${url}\n`);
    // Auto-open browser (best-effort, no crash if desktop env unavailable)
    try {
      if (process.platform === 'win32') exec(`start "" "${url}"`);
      else if (process.platform === 'linux') exec(`xdg-open "${url}"`);
      else exec(`open "${url}"`);
    } catch {}
  });
  return server;
}
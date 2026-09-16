import { config } from './config.js';
import { store } from './core/store.js';
import { mcpManager } from './mcp/manager.js';
import { createPlatforms } from './platforms/index.js';
import { Orchestrator } from './agent/orchestrator.js';
import { startServer } from './server.js';
import { info, warn } from './core/logger.js';

await store.load();
// Apply the million-follower target from config (user can override in Settings UI).
store.state.settings.target = config.viral.target;
store.state.goals[0].target = config.viral.target;
// Preserve persisted platform rows across restarts; only seed truly-missing ones below.

mcpManager.load();
mcpManager.connectAll().catch((e) => info('mcp', `connectAll issue: ${e.message}`));

const platforms = createPlatforms(mcpManager);

// seed simulator follower bases so the dashboard starts populated
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
await delay(400); // let MCP connects settle
for (const [name, p] of Object.entries(platforms)) {
  const st = store.platform(name);
  if (!st.followers) st.followers = p.simFollowersBase();
  st.mode = p.mode();
  st.connected = true;
}
store.save();

const orchestrator = new Orchestrator(platforms);
const server = startServer(platforms, orchestrator);

if (store.state.settings.agentOn) {
  orchestrator.start();
}

// Restore scheduler queue from previous run
if (store.state.agent.scheduleQueue) {
  orchestrator.scheduler.queue = store.state.agent.scheduleQueue;
  store.state.agent.scheduleQueue = null;
}

// Persist scheduler queue + state on shutdown
const shutdown = async () => {
  info('agent', 'Shutting down...');
  orchestrator.stop();
  store.state.agent.scheduleQueue = orchestrator.scheduler.queue;
  store.save();
  mcpManager.closeAll();
  server.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException', async (err) => {
  console.error('[FATAL]', err);
  await shutdown();
});
process.on('unhandledRejection', (err) => {
  warn('agent', `Unhandled rejection: ${err?.message || err}`);
});

export { orchestrator, platforms, server };
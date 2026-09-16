import { config } from './config.js';
import { store } from './core/store.js';
import { mcpManager } from './mcp/manager.js';
import { createPlatforms } from './platforms/index.js';
import { Orchestrator } from './agent/orchestrator.js';
import { startServer } from './server.js';
import { info } from './core/logger.js';

await store.load();
store.state.platforms = {}; // connectors own fresh platform stat rows

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

export { orchestrator, platforms, server };
# Social Agent — Autonomous AI Social Media Manager

An autonomous agent that manages your entire social presence across **11 platforms** — posting,
replying, and growing followers — powered by a **deep-reasoning OpenRouter brain**, working
**MCP connectors**, REST adapters, and a clean white web UI.

## Platforms covered (MCP-first)

| Platform  | Transport priority                                  |
|-----------|-----------------------------------------------------|
| Telegram  | MCP → REST (Bot API) → simulation                    |
| WhatsApp  | MCP → REST (WhatsApp Cloud API) → simulation         |
| Instagram | MCP → REST (Graph API) → simulation                  |
| LinkedIn  | MCP → REST (LinkedIn v2) → simulation                |
| X (Twitter)| MCP → REST (v2 + OAuth1 signing) → simulation       |
| Discord   | MCP → REST (Bot API) → simulation                    |
| YouTube   | MCP → REST (Data API) → simulation                   |
| TikTok    | MCP → REST (Content Posting API) → simulation        |
| Reddit    | MCP → REST (OAuth2) → simulation                     |
| Patreon   | MCP → REST (v2) → simulation                         |
| Snapchat  | MCP → REST → simulation                              |

Every connector auto-selects its mode: if an MCP server is registered in `mcp.servers.json` → MCP;
else if credentials exist in `.env` → REST; else **simulation** so the whole agent loop is
fully functional out of the box.

## What the agent does on every brain cycle

1. **Observe** — pulls metrics + inbox from all 11 platforms.
2. **Deep reason** — a planning LLM reads total followers, per-platform state, unread inbox,
   goals and the skills library, then returns a step-by-step action plan with reasoning.
3. **Act** — executes auto-replies (AI-crafted, platform-aware) and posts, one at a time, with
   rate limiting, retries with backoff, and a circuit breaker.
4. **Plan tomorrow** — a scheduler queues platform best-practice posts (timing-aware).
5. **Reflect** — updates goal progress and adapts.

On first launch it posts a "seed bolt" to every platform so the dashboard is instantly alive.

## Quick start

```bash
# Prereq: Node.js 20.6+
npm install
cp .env.example .env   # edit creds as needed
npm start
# open http://localhost:3000
```

The OpenRouter API key is already in your `.env`. The account's remaining credit is small, so the
agent keeps `max_tokens` low and retries/backoff automatically. Add credits at
https://openrouter.ai/settings/credits for higher ceilings.

## Connecting a real MCP server

Edit `mcp.servers.json` (copy the shape from `mcp.servers.example.json`):

```json
{
  "x": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "your-x-mcp-server"],
    "env": { "API_KEY": "" }
  },
  "whatsapp": {
    "type": "http",
    "url": "http://localhost:8765/mcp",
    "token": ""
  }
}
```

Supported transports: `stdio` (spawn + JSON-RPC over stdio) and `http`/`sse` (streamable HTTP).
If the server exposes the platform's expected tool names, the connector calls them; otherwise it
falls back to REST/simulation automatically.

## REST mode (no MCP needed)

Fill tokens in `.env` (e.g. `TELEGRAM_BOT_TOKEN`, `DISCORD_BOT_TOKEN`, `REDDIT_CLIENT_ID`+`SECRET`,
`X_API_KEY`+`X_API_SECRET`, `WHATSAPP_TOKEN`, `INSTAGRAM_ACCESS_TOKEN`, `LINKEDIN_ACCESS_TOKEN`,
`YOUTUBE_API_KEY`, `TIKTOK_ACCESS_TOKEN`, `PATREON_ACCESS_TOKEN`). Connectors auto-promote to local.

## UI

Clean white dashboard: KPIs, live brain-thinking panel, per-platform cards, inbox with one-click
AI replies, composer (single or all platforms), goals with progress steps, live activity feed
(SSE), and settings (niche, tone, target, auto toggles).

## Project structure

```
src/
  index.js                 entrypoint
  config.js                env config
  core/                    logger, JSON store, OpenRouter client (queue/retry/breaker)
  mcp/                     stdio + HTTP MCP clients, manager
  platforms/               base connector + 11 platform adapters + sim engine
  agent/
    orchestrator.js        the autonomous loop
    planner.js             deep-reasoning brain (loads skills/)
    content.js             platform-aware post/reply generation
    scheduler.js           best-time queue + first-run seed
    goals.js               KPI goal tracking
  server.js                Express + REST + SSE
public/                    white UI (HTML/CSS/JS)
skills/                    markdown skill library injected into the planner
data/state.json            persisted state (created at runtime)
```

## Notes on live posting

- Simulation mode produces realistic followers, engagement and inbound fan messages so you can
  watch the entire agent loop work without any accounts.
- To go fully live, add one platform's credentials at a time and watch the UI badge switch from
  `sim` → `rest` (or `mcp`).
- Never commit `.env` to source control; rotate the key if it was ever shared publicly.
# Social Agent — Autonomous AI Social Media Manager

An autonomous agent that manages your entire social presence across **11 platforms** — posting,
replying, and growing followers — powered by an **AI brain (Gemini + OpenRouter)** that replies to
messages in an **extremely human way** and uses **growth intelligence** to win followers on every
platform.

## The ultimate goal

**Reply to every message through AI with an extreme human touch, and grow followers through AI
intelligence** — all from one ChatGPT-style control room.

- The **Extreme Humanizer** reads each inbound message, understands the sender's energy, and writes
  a reply that reads like a real person wrote it — contractions, natural rhythm, empathy, curiosity,
  one thoughtful follow-up question, zero bot phrases (`happy to help`, `hope this helps`, `as an AI`…).
  Every draft passes an AI-tell scrub and a second-pass "human audit." If the API is down, a local
  fallback library still answers warmly.
- The **Growth Intelligence engine** scores every platform after each cycle, double-downs on the
  ones compounding (LinkedIn > Telegram > Discord-style rankings), and **learns a playbook** of which
  content actually gained followers, so future posts lean into winners.

## Virality engine (million-follower machinery)

Every post is manufactured by a three-lever viral system, aimed at a default **1,000,000 followers**:

1. **Algorithm rulebook** (`src/core/algo.js`) — each platform's live algorithm signals are encoded:
   what it *rewards* (watch time, saves, shares, first-hour replies, dwell time, CTR…), what it
   *punishes* (link-only posts, tag spam, slow intros, engagement-bait…), its reward windows, ideal
   format and hook style. No post is ever written "generic" — it is written to the platform's serve
   engine.
2. **Virality scoring & quality floor** (`src/core/viral.js`) — every draft is scored 0-100 for hook,
   CTA, emotive pull, scannability and platform-fit. Drafts below the floor (default 38) are
   re-generated up to 5× and never published. Winners (floor+12) are **amplified** — repurposed and
   spread to every other platform so a winning idea echoes everywhere.
3. **Momentum loop** — follower growth feeds cadence: frequency scales toward each platform's ideal,
   publishing happens in reward windows, and the UI tracks the live projection to the 1M milestone.

Simulation now rewards virality: high-scoring posts compound faster, so you can watch quality content
out-perform mediocre content in real time, exactly like a real platform algorithm.

## ChatGPT-style UI

The web UI is modeled after ChatGPT: a collapsible dark sidebar with all features:

- **Dashboard** — KPIs, composer (post now / all platforms), recent posts, platform health.
- **Analytics** — real, measured analytics from running cycles: portfolio velocity (followers/day),
  ETA to 1M, per-platform growth, engagement, virality and algorithm conformance — no estimates.
- **Connectors** — ChatGPT-style **Connect** flow: each platform shows a single **Connect** button
  with its live status badge (`Connected` / `Demo mode`). Connect opens the exact credentials panel
  (with links to get them), then **Save & connect** / **Test** / **Cancel**.
- **Inbox** — live incoming messages on all platforms; each has **Send** and an **✨ AI** button
  that drafts a humanized reply for you to send. Replies are **thread-aware** — every message keeps
  its own conversation history (that thread ID), and the AI answers with full context of who said
  what, just like ChatGPT.
- **Brain & Thinking** — the agent's deep reasoning, plus a **humanizer test bench**.
- **Growth Intel** — platform scores and the learned playbook.
- **Viral Engine** — **Momentum to 1M** tracker, the full per-platform **algorithm rulebook**, and a
  **viral content lab** that generates + scores an algorithm-conformant post on demand.
- **Activity Log** — everything the agent did, via live SSE.
- **Settings** — niche, tone, follower target, auto toggles, AI provider status.

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
2. **Deep reason** — a planning LLM reads total followers, per-platform state, unread inbox, goals
   and the skills library, then returns an action plan with reasoning.
3. **Act** — executes **humanized, thread-aware auto-replies** (each conversation keeps its own
   history and is answered with full context) and posts chosen by the **growth engine**, one at a
   time, with rate limiting and a circuit breaker.
4. **Plan tomorrow** — a scheduler queues platform best-practice posts (timing-aware).
5. **Learn** — records which posts gained followers into the playbook.
6. **Reflect** — updates goal progress and adapts.

On first launch it posts a "seed bolt" to every platform so the dashboard is instantly alive.

## Quick start

```bash
# Prereq: Node.js 20.6+
npm install
cp .env.example .env   # add your GEMINI_API_KEY and/or OPENROUTER_API_KEY + platform creds
npm start
# open http://localhost:3000
```

### AI providers

- **Gemini (default)** — put your key in `GEMINI_API_KEY`. The agent tries `GEMINI_MODEL`
  (default `gemini-3.6-flash`) and automatically falls back through a chain of flash models if a
  model is rate-limited or overloaded (429/503), so replies keep flowing.
- **OpenRouter** — set `OPENROUTER_API_KEY` for the deep-reasoning planner. Low-balance accounts
  trigger an automatic fallback engine that keeps the agent active (steady cadence posts +
  growth-engine replies) — the agent never goes inert.

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

Fill tokens from the **Connectors** tab in the UI (it saves them to `.env`), or edit `.env`
directly (e.g. `TELEGRAM_BOT_TOKEN`, `DISCORD_BOT_TOKEN`, `REDDIT_CLIENT_ID`+`SECRET`,
`X_API_KEY`+`X_API_SECRET`, `WHATSAPP_TOKEN`, `INSTAGRAM_ACCESS_TOKEN`, `LINKEDIN_ACCESS_TOKEN`,
`YOUTUBE_API_KEY`, `TIKTOK_ACCESS_TOKEN`, `PATREON_ACCESS_TOKEN`). Connectors auto-promote to
REST mode when credentials are present.

## Project structure

```
src/
  index.js                 entrypoint
  config.js                env config
  connectors.js            connector catalog (task, function, creds, dev-portal links)
  core/
    logger.js              logging + activity feed
    store.js               JSON store (persisted to data/state.json)
    ai.js                  AI client (Gemini + OpenRouter, queue/retry/model-chain breaker)
    humanizer.js           ★ extreme humanizer — replies that read like a real person (thread-aware)
    growth.js              ★ growth intelligence — scores, posting plan, learned playbook
    viral.js               ★ virality engine — scoring, quality floor, amplification, momentum
    algo.js                ★ platform algorithm rulebook (rewards, punishes, windows, formats)
    analysis.js            real analytics — growth/day, engagement, virality, ETA to 1M
  mcp/                     stdio + HTTP MCP clients, manager
  platforms/               base connector + 11 platform adapters + sim engine (virality-aware)
  agent/
    orchestrator.js        the autonomous loop
    planner.js             deep-reasoning brain (loads skills/)
    content.js             algorithm-conformant, virality-scored post/reply generation
    scheduler.js           best-time queue + first-run seed
    goals.js               KPI goal tracking (1M target by default)
  server.js                Express + REST + SSE
public/                    ChatGPT-style dark UI (HTML/CSS/JS) — Analytics, Virtual Engine, Connect flow
skills/                    markdown skill library injected into the planner
data/state.json            persisted state (created at runtime)
```

## Notes on live posting

- Simulation mode produces realistic followers, engagement and inbound fan messages so you can
  watch the entire agent loop work without any accounts.
- To go fully live, connect one platform at a time from the **Connectors** tab and watch the mode
  badge switch from `sim` → `rest` (or `mcp`).
- Never commit `.env` to source control; rotate any key that was ever shared publicly. The
  `.env.example` ships with placeholders only.
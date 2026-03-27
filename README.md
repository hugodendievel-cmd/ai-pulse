# AI Pulse

AI news intelligence dashboard — LLM releases, acquisitions, research papers, trending models, and community buzz. Your own AI analyst.

10+ sources. One command. Zero cloud.

<img width="2535" height="1203" alt="Capture d’écran 2026-03-19 à 20 49 52" src="https://github.com/user-attachments/assets/6f8d6634-b2c3-4884-b8a7-dc3b3c10ffbe" />

## Quick Start

### npx (recommended)

```bash
npx ai-pulse
```

That's it. Opens at `http://localhost:3200`. On first run, a `.env` file is created in your current directory for configuration.

### From source

```bash
git clone <your-repo-url>
cd ai-dashboard
npm install
npm start
```

### Configuration

Edit `.env` in your working directory:

```bash
# LLM (optional — enables AI briefing, model radar, signals)
LLM_PROVIDER=openai       # anthropic | openai | gemini | disabled
LLM_API_KEY=sk-...
LLM_MODEL=gpt-5.4         # optional override

# Server
PORT=3200
REFRESH_INTERVAL_MINUTES=15

# Optional
GITHUB_TOKEN=              # higher GitHub API rate limits
```

Dashboard opens at `http://localhost:3200`. First sweep takes ~5–30s, then auto-refreshes every 15 minutes via SSE.

## What You Get

### Live Dashboard

A Jarvis-style HUD with:

- **Stats bar** — article count, model count, paper count, repo stars, freshness ring
- **AI Briefing** — LLM-powered summary, top stories, trends (optional, needs LLM key)
- **Model Radar** — LLM-detected model releases with status badges
- **Signals** — AI industry signals with confidence indicators
- **🔥 Trending** — engagement-sorted articles from all news sources
- **🆕 Newest** — date-sorted latest articles
- **Trending Models** — Hugging Face models sorted by trending score
- **Latest Papers** — ArXiv cs.AI, cs.CL, cs.LG, cs.CV papers
- **GitHub Trending** — hot AI/ML repositories
- **Reddit** — top posts from r/MachineLearning, r/LocalLLaMA, r/artificial, r/singularity
- **Hacker News** — AI-related stories from the front page
- **Product Hunt** — AI product launches
- **Light / dark mode** — toggle with persistence
- **Paywall bypass** — 🔓 button on news articles

### Smart Refresh

- Sweeps only run when someone is viewing the dashboard (saves LLM costs)
- When a viewer arrives with stale data, an immediate sweep is triggered
- All sources queried in parallel (~1–30s)
- Real-time progress pushed via SSE

### Optional LLM Layer

Connect an LLM for enhanced analysis:

- **AI briefing** — summary, top stories, trends, model radar, signals
- **Providers:** Anthropic Claude, OpenAI GPT, Google Gemini
- Graceful fallback when LLM is unavailable

## Data Sources (10)

| Source       | What                                                         | Key?     |
| ------------ | ------------------------------------------------------------ | -------- |
| Hacker News  | AI stories from the front page                               | None     |
| ArXiv        | AI/ML/NLP/CV papers                                          | None     |
| Hugging Face | Trending models & datasets                                   | None     |
| GitHub       | Trending AI repositories                                     | Optional |
| TechCrunch   | AI news RSS                                                  | None     |
| The Verge    | AI news RSS                                                  | None     |
| VentureBeat  | AI news RSS                                                  | None     |
| Reddit       | r/MachineLearning, r/LocalLLaMA, r/artificial, r/singularity | None     |
| Google News  | AI search RSS                                                | None     |
| Product Hunt | AI product launches                                          | None     |

**All sources work without API keys.** GitHub token is optional (for higher rate limits).

## API Keys Setup

All sources work **without API keys**. Optional keys unlock higher rate limits and LLM analysis.

### LLM Provider (optional)

Set `LLM_PROVIDER` in `.env` to one of: `anthropic`, `openai`, `gemini`

| Provider  | Env Var       | Default Model          |
| --------- | ------------- | ---------------------- |
| anthropic | `LLM_API_KEY` | claude-sonnet-4-6      |
| openai    | `LLM_API_KEY` | gpt-5.4                |
| gemini    | `LLM_API_KEY` | gemini-3-flash-preview |

## Architecture

```
ai-pulse/
├── cli.mjs                    # npx entrypoint (bin)
├── server.mjs                 # Express server (SSE, auto-refresh, LLM)
├── diag.mjs                   # Diagnostic script
├── .env.example               # Template (copied on first run)
├── package.json               # Runtime: express only
│
├── apis/
│   ├── briefing.mjs           # Master orchestrator — all sources in parallel
│   ├── save-briefing.mjs      # CLI: save timestamped + latest.json
│   ├── utils/
│   │   ├── fetch.mjs          # safeFetch() — timeout, retries, abort
│   │   └── env.mjs            # .env loader (cwd → package root fallback)
│   └── sources/               # 10 self-contained source modules
│       ├── hackernews.mjs     # Each exports briefing() → structured data
│       ├── arxiv.mjs          # Standalone: node apis/sources/arxiv.mjs
│       └── ...
│
├── dashboard/
│   └── public/
│       └── index.html         # Self-contained Jarvis HUD (inline CSS/JS)
│
└── lib/
    ├── llm/                   # LLM abstraction (3 providers, raw fetch)
    │   ├── provider.mjs       # Base class
    │   ├── anthropic.mjs      # Claude
    │   ├── openai.mjs         # GPT
    │   ├── gemini.mjs         # Gemini
    │   ├── analysis.mjs       # AI news analysis/synthesis
    │   └── index.mjs          # Factory: createLLMProvider()
    └── delta/                 # Change tracking between sweeps
        ├── engine.mjs         # Delta computation
        ├── memory.mjs         # Hot memory (3 runs)
        └── index.mjs          # Re-exports
```

Runtime data is stored in your working directory under `.ai-pulse/`.

### Design Principles

- **Pure ESM** — every file is `.mjs` with explicit imports
- **Minimal dependencies** — Express is the only runtime dependency
- **Parallel execution** — `Promise.allSettled()` fires all sources simultaneously
- **Graceful degradation** — missing keys produce empty arrays, not crashes
- **npx-ready** — resolves package assets via `import.meta.url`, user data via `process.cwd()`
- **Self-contained dashboard** — single HTML file with inline CSS/JS

## npm Scripts

| Script               | Command                            | Description                       |
| -------------------- | ---------------------------------- | --------------------------------- |
| `npm start`          | `node cli.mjs`                     | Start via CLI (same as `npx`)     |
| `npm run dev`        | `node --trace-warnings server.mjs` | Start with trace warnings (dev)   |
| `npm run sweep`      | `node apis/briefing.mjs`           | Run a single sweep, output JSON   |
| `npm run brief:save` | `node apis/save-briefing.mjs`      | Run sweep + save timestamped JSON |
| `npm run diag`       | `node diag.mjs`                    | Run diagnostics                   |

## API Endpoints

| Endpoint          | Description                       |
| ----------------- | --------------------------------- |
| `GET /`           | Dashboard HUD                     |
| `GET /api/data`   | Current intelligence data (JSON)  |
| `GET /api/health` | Server status, uptime, LLM status |
| `GET /events`     | SSE stream for live push updates  |

## Configuration

| Variable                   | Default      | Description                                    |
| -------------------------- | ------------ | ---------------------------------------------- |
| `PORT`                     | 3200         | Server port                                    |
| `REFRESH_INTERVAL_MINUTES` | 15           | Auto-refresh interval                          |
| `LLM_PROVIDER`             | disabled     | `anthropic`, `openai`, `gemini`, or `disabled` |
| `LLM_API_KEY`              | —            | API key for LLM provider                       |
| `LLM_MODEL`                | per-provider | Override model selection                       |
| `GITHUB_TOKEN`             | —            | GitHub PAT (optional, higher rate limits)      |

## License

MIT

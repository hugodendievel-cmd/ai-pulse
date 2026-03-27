// server.mjs — Express server with SSE, auto-refresh, LLM analysis
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runSweep } from "./apis/briefing.mjs";
import "./apis/utils/env.mjs";
import { computeDelta, getPrevious, pushSweep } from "./lib/delta/index.mjs";
import { analyzeWithLLM } from "./lib/llm/analysis.mjs";
import { createLLMProvider } from "./lib/llm/index.mjs";
import log from "./lib/logger.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env.PORT || "3200", 10);
const REFRESH_MS =
  parseInt(process.env.REFRESH_INTERVAL_MINUTES || "15", 10) * 60_000;
const MAX_SSE_CLIENTS = parseInt(process.env.MAX_SSE_CLIENTS || "200", 10);
const SSE_HEARTBEAT_MS = 30_000;

const app = express();
const sseClients = new Set();

const MAX_LLM_CALLS_PER_DAY = parseInt(
  process.env.MAX_LLM_CALLS_PER_DAY || "100",
  10,
);

let currentData = null;
let llm = null;
let sweepCount = 0;
let lastSweepTime = null;
let lastSweepDurationMs = null;
let sourceStats = {}; // per-source success/failure counts
let llmCallsToday = 0;
let llmBudgetDay = new Date().toDateString();
let sweepProgress = null;
let sweepProgressHistory = [];
let sweepInProgress = false;

// ── Trust proxy (Railway / Cloudflare) ──
app.set("trust proxy", 1);

// ── Security headers ──
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // 'unsafe-inline' required: Railway injects inline scripts whose hash
        // changes per deploy, making hash/nonce approaches impractical.
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false, // allows external images/fonts if needed later
  }),
);

// ── Rate limiting ──
app.use(
  rateLimit({
    windowMs: 60_000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." },
  }),
);

// ── Static files with cache control ──
app.use(
  express.static(resolve(__dirname, "dashboard", "public"), {
    maxAge: "1h",
    etag: true,
  }),
);

// ── API ──
app.get("/api/data", (_req, res) => {
  if (!currentData)
    return res.status(503).json({ error: "First sweep in progress" });
  res.json(currentData);
});

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    sweepCount,
    lastSweep: lastSweepTime,
    lastSweepDurationMs,
    llm: llm ? `${llm.name}/${llm.model}` : "disabled",
    sources: currentData?.sweep?.sourcesTotal || 0,
    sseClients: sseClients.size,
    llmBudget: {
      callsToday: llmCallsToday,
      dailyLimit: MAX_LLM_CALLS_PER_DAY,
      remaining: Math.max(0, MAX_LLM_CALLS_PER_DAY - llmCallsToday),
    },
    sourceStats,
  });
});

// ── SSE ──
app.get("/events", (req, res) => {
  // Cap SSE connections to prevent resource exhaustion
  if (sseClients.size >= MAX_SSE_CLIENTS) {
    log.warn(
      { clients: sseClients.size },
      "SSE connection rejected — limit reached",
    );
    return res.status(503).json({ error: "Too many connections" });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write("data: connected\n\n");

  // Replay progress events for late-joining clients
  for (const p of sweepProgressHistory) {
    res.write(`data: ${JSON.stringify({ type: "progress", ...p })}\n\n`);
  }
  if (currentData) {
    res.write(
      `data: ${JSON.stringify({ type: "update", data: currentData })}\n\n`,
    );
  }
  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));

  // If data is stale, trigger a fresh sweep
  const dataAge = lastSweepTime
    ? Date.now() - new Date(lastSweepTime).getTime()
    : Infinity;
  if (dataAge > REFRESH_MS) {
    log.info(
      { ageMin: Math.round(dataAge / 60000) },
      "Viewer arrived with stale data — triggering sweep",
    );
    sweep();
  }
});

// ── SSE heartbeat to detect dead connections ──
setInterval(() => {
  for (const client of sseClients) {
    try {
      client.write(":heartbeat\n\n");
    } catch {
      sseClients.delete(client);
    }
  }
}, SSE_HEARTBEAT_MS);

function broadcast(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

// ── Sweep cycle ──
async function sweep() {
  if (sweepInProgress) return;
  sweepInProgress = true;
  const sweepStart = Date.now();
  try {
    sweepProgressHistory = [];
    sweepProgress = { done: 0, total: 10, source: "Starting…", status: "ok" };
    sweepProgressHistory.push(sweepProgress);
    broadcast({ type: "progress", ...sweepProgress });
    const sweepData = await runSweep((progress) => {
      sweepProgress = progress;
      sweepProgressHistory.push(progress);
      broadcast({ type: "progress", ...progress });
    });
    sweepProgress = null;

    // Track per-source stats
    for (const s of sweepData.sources) {
      if (!sourceStats[s.source]) sourceStats[s.source] = { ok: 0, error: 0 };
      sourceStats[s.source][s.status === "ok" ? "ok" : "error"]++;
    }

    const previous = getPrevious();
    const delta = computeDelta(sweepData, previous);
    pushSweep(sweepData);

    let analysis = null;
    if (llm) {
      // Reset daily counter at midnight
      const today = new Date().toDateString();
      if (today !== llmBudgetDay) {
        llmCallsToday = 0;
        llmBudgetDay = today;
      }

      if (llmCallsToday >= MAX_LLM_CALLS_PER_DAY) {
        log.warn(
          { llmCallsToday, limit: MAX_LLM_CALLS_PER_DAY },
          "Daily LLM call budget exhausted — skipping analysis",
        );
      } else {
        try {
          llmCallsToday++;
          analysis = await analyzeWithLLM(llm, sweepData);
          if (analysis) log.info({ llmCallsToday }, "LLM analysis complete");
        } catch (err) {
          log.error({ err: err.message }, "LLM analysis failed");
        }
      }
    }

    currentData = {
      sweep: sweepData,
      delta,
      analysis,
      generatedAt: new Date().toISOString(),
    };

    sweepCount++;
    lastSweepTime = new Date().toISOString();
    lastSweepDurationMs = Date.now() - sweepStart;
    log.info(
      {
        sweepCount,
        durationMs: lastSweepDurationMs,
        ok: sweepData.sourcesOk,
        total: sweepData.sourcesTotal,
      },
      "Sweep complete",
    );
    broadcast({ type: "update", data: currentData });
  } catch (err) {
    log.error({ err: err.message }, "Sweep failed");
  } finally {
    sweepInProgress = false;
  }
}

// ── Boot ──
let server;
async function boot() {
  try {
    llm = await createLLMProvider();
    if (llm)
      log.info({ provider: llm.name, model: llm.model }, "LLM initialized");
    else log.info("LLM disabled");
  } catch (err) {
    log.warn({ err: err.message }, "LLM init failed");
  }

  server = app.listen(PORT, () => {
    console.log(`\n  ┌─────────────────────────────────────────┐`);
    console.log(`  │       AI PULSE — Intelligence HUD       │`);
    console.log(`  │                                         │`);
    console.log(`  │   Dashboard:  http://localhost:${PORT}     │`);
    console.log(`  │   Sources:    10                        │`);
    console.log(
      `  │   Refresh:    every ${REFRESH_MS / 60000} min              │`,
    );
    console.log(
      `  │   LLM:        ${(llm ? `${llm.name}` : "disabled").padEnd(24)}  │`,
    );
    console.log(`  └─────────────────────────────────────────┘\n`);
  });

  // First sweep after a short delay so SSE clients can connect
  setTimeout(sweep, 2000);
  // Then every REFRESH_MS — but only if someone is watching
  setInterval(() => {
    if (sseClients.size > 0) {
      sweep();
    } else {
      log.info("No active viewers — skipping sweep");
    }
  }, REFRESH_MS);
}

// ── Graceful shutdown ──
function shutdown(signal) {
  log.info({ signal }, "Shutting down gracefully…");
  // Close SSE connections
  for (const client of sseClients) {
    try {
      client.end();
    } catch {
      /* ignore */
    }
  }
  sseClients.clear();

  if (server) {
    server.close(() => {
      log.info("Server closed");
      process.exit(0);
    });
    // Force exit after 10s if connections linger
    setTimeout(() => process.exit(1), 10_000);
  } else {
    process.exit(0);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

boot();

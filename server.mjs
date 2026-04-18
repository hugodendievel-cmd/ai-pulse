// server.mjs — Express server with SSE, auto-refresh, LLM analysis
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  runDigestSweep,
  runSweep,
  SOURCE_COUNT,
  SOURCE_NAMES,
} from "./apis/briefing.mjs";
import "./apis/utils/env.mjs";
import { computeDelta, getPrevious, pushSweep } from "./lib/delta/index.mjs";
import { loadLatestDigest, saveDigest } from "./lib/digest/store.mjs";
import { analyzeWithLLM } from "./lib/llm/analysis.mjs";
import { createLLMProvider } from "./lib/llm/index.mjs";
import { generateWeeklyDigest } from "./lib/llm/weekly-digest.mjs";
import log from "./lib/logger.mjs";
import { createSweepProgressTracker } from "./lib/sweep-progress.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Cache-busting version tag derived from package.json
const PKG_VERSION = JSON.parse(
  readFileSync(resolve(__dirname, "package.json"), "utf-8"),
).version;

const PORT = Number.parseInt(process.env.PORT || "3200", 10);
const REFRESH_MS =
  Number.parseInt(process.env.REFRESH_INTERVAL_MINUTES || "15", 10) * 60_000;
const MAX_SSE_CLIENTS = Number.parseInt(
  process.env.MAX_SSE_CLIENTS || "200",
  10,
);
const SSE_HEARTBEAT_MS = 30_000;

const app = express();
const sseClients = new Set();

const MAX_LLM_CALLS_PER_DAY = Number.parseInt(
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

app.use(express.json());

// ── Serve index.html with cache-busted asset URLs ──
app.get("/", (_req, res) => {
  const htmlPath = resolve(__dirname, "dashboard", "public", "index.html");
  let html = readFileSync(htmlPath, "utf-8");
  html = html.replace(/\.css"/g, `.css?v=${PKG_VERSION}"`);
  html = html.replace(/\.js"/g, `.js?v=${PKG_VERSION}"`);
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Content-Type", "text/html");
  res.send(html);
});

// ── Static files with cache control ──
const isDev = process.env.NODE_ENV !== "production";
app.use(
  express.static(resolve(__dirname, "dashboard", "public"), {
    maxAge: isDev ? 0 : "1h",
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
    sourceCount: SOURCE_COUNT,
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

// ── Weekly Digest API ──
let digestGenerating = false;

app.get("/api/digest", (_req, res) => {
  const digest = loadLatestDigest();
  if (!digest)
    return res.status(404).json({ error: "No digest available yet" });
  res.json(digest);
});

app.post("/api/digest/generate", async (_req, res) => {
  if (!llm) return res.status(503).json({ error: "LLM not configured" });
  if (digestGenerating)
    return res
      .status(409)
      .json({ error: "Digest generation already in progress" });

  // Allow only one digest per day
  const existing = loadLatestDigest();
  if (existing?.generatedAt) {
    const generatedDate = new Date(existing.generatedAt).toDateString();
    if (generatedDate === new Date().toDateString()) {
      return res.status(429).json({
        error: "Digest already generated today. Try again tomorrow.",
      });
    }
  }

  digestGenerating = true;
  try {
    // Budget check
    const today = new Date().toDateString();
    if (today !== llmBudgetDay) {
      llmCallsToday = 0;
      llmBudgetDay = today;
    }
    if (llmCallsToday >= MAX_LLM_CALLS_PER_DAY) {
      return res.status(429).json({ error: "Daily LLM budget exhausted" });
    }

    // Run a dedicated 7-day sweep across all sources
    const sweepData = await runDigestSweep();
    llmCallsToday++;
    const digest = await generateWeeklyDigest(llm, sweepData);
    if (!digest)
      return res.status(500).json({ error: "Digest generation failed" });

    const saved = saveDigest(digest);
    log.info({ weekId: saved.weekId }, "Weekly digest generated");
    broadcast({ type: "digest", data: saved });
    res.json(saved);
  } catch (err) {
    log.error({ err: err.message }, "Digest generation failed");
    res.status(500).json({ error: "Digest generation failed" });
  } finally {
    digestGenerating = false;
  }
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

  const dataAge = lastSweepTime
    ? Date.now() - new Date(lastSweepTime).getTime()
    : Infinity;
  const isStale = dataAge > REFRESH_MS;

  if (sweepInProgress && sweepProgress) {
    // Sweep is live — send current progress snapshot for late joiners
    res.write(
      `data: ${JSON.stringify({ type: "progress", ...sweepProgress })}\n\n`,
    );
  } else if (currentData && !isStale) {
    // Data is fresh — send it immediately
    res.write(
      `data: ${JSON.stringify({ type: "update", data: currentData })}\n\n`,
    );
  }
  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));

  // If data is stale, trigger a fresh sweep so the client waits on the loading screen
  if (isStale && !sweepInProgress) {
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

function publishSweepProgress(progress) {
  sweepProgress = progress;
  broadcast({ type: "progress", ...progress });
}

// ── Sweep cycle ──
function trackSourceStats(sources) {
  for (const s of sources) {
    if (!sourceStats[s.source]) sourceStats[s.source] = { ok: 0, error: 0 };
    sourceStats[s.source][s.status === "ok" ? "ok" : "error"]++;
  }
}

async function runLLMAnalysis(sweepData) {
  if (!llm) {
    return {
      analysis: null,
      state: "disabled",
      detail: "LLM disabled",
    };
  }

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
    return {
      analysis: null,
      state: "skipped",
      detail: "Daily budget exhausted",
    };
  }

  try {
    llmCallsToday++;
    const analysis = await analyzeWithLLM(llm, sweepData);
    if (analysis) {
      log.info({ llmCallsToday }, "LLM analysis complete");
      return {
        analysis,
        state: "ok",
        detail: "Briefing ready",
      };
    }

    log.warn("LLM analysis returned no structured briefing");
    return {
      analysis: null,
      state: "error",
      detail: "Briefing unavailable",
    };
  } catch (err) {
    log.error({ err: err.message }, "LLM analysis failed");
    return {
      analysis: null,
      state: "error",
      detail: "Briefing failed",
    };
  }
}

async function sweep() {
  if (sweepInProgress) return;
  sweepInProgress = true;
  const sweepStart = Date.now();
  try {
    const progressTracker = createSweepProgressTracker({
      sourceNames: SOURCE_NAMES,
      llmEnabled: Boolean(llm),
    });

    publishSweepProgress(progressTracker.snapshot());
    const sweepData = await runSweep((progress) => {
      publishSweepProgress(
        progressTracker.markSource(progress.source, progress.status),
      );
    });

    trackSourceStats(sweepData.sources);

    const previous = getPrevious();
    const delta = computeDelta(sweepData, previous);
    pushSweep(sweepData);

    let llmResult = {
      analysis: null,
      state: "disabled",
      detail: "LLM disabled",
    };

    if (llm) {
      publishSweepProgress(progressTracker.startLlm());
      llmResult = await runLLMAnalysis(sweepData);
      publishSweepProgress(progressTracker.finishLlm(llmResult));
    }

    currentData = {
      sweep: sweepData,
      delta,
      analysis: llmResult.analysis,
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
    sweepProgress = null;
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
    console.log(
      `  │   Sources:    ${SOURCE_COUNT}${" ".repeat(24 - String(SOURCE_COUNT).length)}│`,
    );
    console.log(
      `  │   Refresh:    every ${REFRESH_MS / 60000} min              │`,
    );
    const llmLabel = llm ? llm.name : "disabled";
    console.log(`  │   LLM:        ${llmLabel.padEnd(24)}  │`);
    console.log(`  └─────────────────────────────────────────┘\n`);
  });

  // First sweep after a short delay so SSE clients can connect
  setTimeout(sweep, 2000);
  // Then every REFRESH_MS — but only if someone is watching and data is old enough.
  // Skip iterations that land before the first sweep has ever completed.
  setInterval(() => {
    if (!lastSweepTime) return; // first sweep hasn't finished yet
    if (sseClients.size === 0) {
      log.info("No active viewers — skipping sweep");
      return;
    }
    const elapsed = Date.now() - new Date(lastSweepTime).getTime();
    if (elapsed < REFRESH_MS) return;
    sweep();
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

await boot();

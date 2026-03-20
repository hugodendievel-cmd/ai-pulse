// server.mjs — Express server with SSE, auto-refresh, LLM analysis
import express from "express";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runSweep } from "./apis/briefing.mjs";
import "./apis/utils/env.mjs";
import { computeDelta, getPrevious, pushSweep } from "./lib/delta/index.mjs";
import { analyzeWithLLM } from "./lib/llm/analysis.mjs";
import { createLLMProvider } from "./lib/llm/index.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env.PORT || "3200", 10);
const REFRESH_MS =
  parseInt(process.env.REFRESH_INTERVAL_MINUTES || "15", 10) * 60_000;

const app = express();
const sseClients = new Set();

let currentData = null;
let llm = null;
let sweepCount = 0;
let lastSweepTime = null;
let sweepProgress = null; // tracks current sweep { done, total, source, status }
let sweepProgressHistory = []; // all progress events for the current/last sweep
let sweepInProgress = false;

// ── Static files ──
app.use(express.static(resolve(__dirname, "dashboard", "public")));

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
    llm: llm ? `${llm.name}/${llm.model}` : "disabled",
    sources: currentData?.sweep?.sourcesTotal || 0,
  });
});

// ── SSE ──
app.get("/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write("data: connected\n\n");
  // Replay all progress events for late-joining clients
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

  // If data is stale (older than refresh interval), trigger a fresh sweep
  const dataAge = lastSweepTime
    ? Date.now() - new Date(lastSweepTime).getTime()
    : Infinity;
  if (dataAge > REFRESH_MS) {
    console.log(
      `[AI Pulse] Viewer arrived with stale data (${Math.round(dataAge / 60000)}m old) — triggering sweep`,
    );
    sweep();
  }
});

function broadcast(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    client.write(payload);
  }
}

// ── Sweep cycle ──
async function sweep() {
  if (sweepInProgress) return;
  sweepInProgress = true;
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
    const previous = getPrevious();
    const delta = computeDelta(sweepData, previous);
    pushSweep(sweepData);

    let analysis = null;
    if (llm) {
      try {
        analysis = await analyzeWithLLM(llm, sweepData);
        if (analysis) console.log("[AI Pulse] LLM analysis complete");
      } catch (err) {
        console.error(`[AI Pulse] LLM analysis failed: ${err.message}`);
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
    broadcast({ type: "update", data: currentData });
  } catch (err) {
    console.error(`[AI Pulse] Sweep failed: ${err.message}`);
  } finally {
    sweepInProgress = false;
  }
}

// ── Boot ──
async function boot() {
  try {
    llm = await createLLMProvider();
    if (llm) console.log(`[AI Pulse] LLM: ${llm.name}/${llm.model}`);
    else console.log("[AI Pulse] LLM: disabled");
  } catch (err) {
    console.warn(`[AI Pulse] LLM init failed: ${err.message}`);
  }

  app.listen(PORT, () => {
    console.log(`\n  ┌─────────────────────────────────────────┐`);
    console.log(`  │          AI PULSE — Intelligence HUD     │`);
    console.log(`  │                                           │`);
    console.log(`  │   Dashboard:  http://localhost:${PORT}       │`);
    console.log(`  │   Sources:    10                          │`);
    console.log(
      `  │   Refresh:    every ${REFRESH_MS / 60000} min              │`,
    );
    console.log(
      `  │   LLM:        ${(llm ? `${llm.name}` : "disabled").padEnd(24)}│`,
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
      console.log("[AI Pulse] No active viewers — skipping sweep");
    }
  }, REFRESH_MS);
}

boot();

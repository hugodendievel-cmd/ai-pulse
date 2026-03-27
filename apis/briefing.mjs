// apis/briefing.mjs — Master orchestrator: runs all AI news sources in parallel
import log from "../lib/logger.mjs";
import { briefing as arxiv } from "./sources/arxiv.mjs";
import { briefing as githubTrending } from "./sources/github-trending.mjs";
import { briefing as googleNews } from "./sources/google-news.mjs";
import { briefing as hackernews } from "./sources/hackernews.mjs";
import { briefing as huggingface } from "./sources/huggingface.mjs";
import { briefing as newsapi } from "./sources/newsapi.mjs";
import { briefing as producthunt } from "./sources/producthunt.mjs";
import { briefing as reddit } from "./sources/reddit.mjs";
import { briefing as simonwillison } from "./sources/simonwillison.mjs";
import { briefing as techcrunch } from "./sources/techcrunch.mjs";
import { briefing as theverge } from "./sources/theverge.mjs";
import { briefing as venturebeat } from "./sources/venturebeat.mjs";
import { sanitizeItem } from "./utils/sanitize.mjs";

const SOURCES = [
  { name: "Hacker News", fn: hackernews },
  { name: "ArXiv", fn: arxiv },
  { name: "Hugging Face", fn: huggingface },
  { name: "GitHub Trending", fn: githubTrending },
  { name: "TechCrunch", fn: techcrunch },
  { name: "The Verge", fn: theverge },
  { name: "VentureBeat", fn: venturebeat },
  { name: "Reddit", fn: reddit },
  { name: "Google News", fn: googleNews },
  { name: "NewsAPI", fn: newsapi },
  { name: "Product Hunt", fn: producthunt },
  { name: "Simon Willison", fn: simonwillison },
];

export const SOURCE_COUNT = SOURCES.length;
export const SOURCE_NAMES = SOURCES.map(({ name }) => name);

/** Sanitize all items returned by a source */
function sanitizeSourceData(data) {
  if (!data) return data;
  if (data.items) {
    data.items = data.items.map(sanitizeItem);
  }
  if (data.models?.items) {
    data.models.items = data.models.items.map(sanitizeItem);
  }
  if (data.datasets?.items) {
    data.datasets.items = data.datasets.items.map(sanitizeItem);
  }
  return data;
}

export async function runSweep(onProgress) {
  const start = Date.now();
  log.info(
    { sources: SOURCES.length },
    "Sweep started — querying sources in parallel",
  );

  let done = 0;
  const results = await Promise.allSettled(
    SOURCES.map(async (s) => {
      const t0 = Date.now();
      try {
        const data = await s.fn();
        const sanitizedData = sanitizeSourceData(data);
        const ms = Date.now() - t0;
        log.info({ source: s.name, ms }, "Source OK");
        done++;
        onProgress?.({
          done,
          total: SOURCES.length,
          source: s.name,
          status: "ok",
        });
        return { source: s.name, status: "ok", data: sanitizedData };
      } catch (err) {
        const ms = Date.now() - t0;
        log.warn({ source: s.name, ms, err: err.message }, "Source failed");
        done++;
        onProgress?.({
          done,
          total: SOURCES.length,
          source: s.name,
          status: "error",
        });
        return { source: s.name, status: "error", error: err.message };
      }
    }),
  );

  const sources = results.map((r) =>
    r.status === "fulfilled" ? r.value : r.reason,
  );
  const okCount = sources.filter((s) => s.status === "ok").length;
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  log.info({ ok: okCount, total: SOURCES.length, elapsed }, "Sweep complete");

  return {
    timestamp: new Date().toISOString(),
    sweepDurationMs: Date.now() - start,
    sourcesOk: okCount,
    sourcesTotal: SOURCES.length,
    sources,
  };
}

/**
 * Digest-specific sweep: fetches from all sources with a 7-day window
 * where supported (Google News, NewsAPI). Other sources return their
 * current hot/trending content which is inherently recent.
 */
export async function runDigestSweep() {
  const DIGEST_DAYS = 7;
  const start = Date.now();
  log.info("Digest sweep started — fetching 7-day content from all sources");

  const results = await Promise.allSettled(
    SOURCES.map(async (s) => {
      const t0 = Date.now();
      try {
        const data = await s.fn({ days: DIGEST_DAYS });
        const sanitizedData = sanitizeSourceData(data);
        const ms = Date.now() - t0;
        log.info({ source: s.name, ms }, "Digest source OK");
        return { source: s.name, status: "ok", data: sanitizedData };
      } catch (err) {
        const ms = Date.now() - t0;
        log.warn(
          { source: s.name, ms, err: err.message },
          "Digest source failed",
        );
        return { source: s.name, status: "error", error: err.message };
      }
    }),
  );

  const sources = results.map((r) =>
    r.status === "fulfilled" ? r.value : r.reason,
  );
  const okCount = sources.filter((s) => s.status === "ok").length;

  log.info(
    { ok: okCount, total: SOURCES.length, ms: Date.now() - start },
    "Digest sweep complete",
  );

  return {
    timestamp: new Date().toISOString(),
    sweepDurationMs: Date.now() - start,
    sourcesOk: okCount,
    sourcesTotal: SOURCES.length,
    sources,
  };
}

// CLI mode
if (import.meta.url === `file://${process.argv[1]}`) {
  await import("./utils/env.mjs");
  const d = await runSweep();
  console.log(JSON.stringify(d, null, 2));
}

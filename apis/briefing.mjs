// apis/briefing.mjs — Master orchestrator: runs all AI news sources in parallel
import { briefing as arxiv } from "./sources/arxiv.mjs";
import { briefing as githubTrending } from "./sources/github-trending.mjs";
import { briefing as googleNews } from "./sources/google-news.mjs";
import { briefing as hackernews } from "./sources/hackernews.mjs";
import { briefing as huggingface } from "./sources/huggingface.mjs";
import { briefing as newsapi } from "./sources/newsapi.mjs";
import { briefing as producthunt } from "./sources/producthunt.mjs";
import { briefing as reddit } from "./sources/reddit.mjs";
import { briefing as techcrunch } from "./sources/techcrunch.mjs";
import { briefing as theverge } from "./sources/theverge.mjs";
import { briefing as venturebeat } from "./sources/venturebeat.mjs";

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
];

export async function runSweep(onProgress) {
  const start = Date.now();
  console.log(
    `[AI Pulse] Sweep started — querying ${SOURCES.length} sources in parallel…`,
  );

  let done = 0;
  const results = await Promise.allSettled(
    SOURCES.map(async (s) => {
      const t0 = Date.now();
      try {
        const data = await s.fn();
        console.log(`  ✓ ${s.name} (${Date.now() - t0}ms)`);
        done++;
        onProgress?.({
          done,
          total: SOURCES.length,
          source: s.name,
          status: "ok",
        });
        return { source: s.name, status: "ok", data };
      } catch (err) {
        console.log(`  ✗ ${s.name} — ${err.message} (${Date.now() - t0}ms)`);
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

  console.log(
    `[AI Pulse] Sweep complete — ${okCount}/${SOURCES.length} sources OK (${elapsed}s)`,
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
  import("./utils/env.mjs");
  runSweep().then((d) => console.log(JSON.stringify(d, null, 2)));
}

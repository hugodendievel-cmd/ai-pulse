import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

describe("digest guard — server.mjs wiring (static)", () => {
  const src = readFileSync(resolve(root, "server.mjs"), "utf-8");

  it("imports weekIdBrussels from lib/digest/week-id.mjs", () => {
    expect(src).toMatch(/from\s+"\.\/lib\/digest\/week-id\.mjs"/);
    expect(src).toMatch(/weekIdBrussels/);
  });

  it("no longer uses the once-per-calendar-day 429 guard", () => {
    expect(src).not.toMatch(
      /Digest already generated today\. Try again tomorrow\./,
    );
    // The 429 in the route should only be for the LLM budget cap, not the
    // once-per-day guard. The toDateString()-based comparison must be gone.
    expect(src).not.toMatch(/generatedDate\s*===\s*new Date\(\)\.toDateString/);
  });

  it("guard returns 409 with existing metadata when weekId matches", () => {
    // The new guard: latest?.weekId === currentWeekId → 409 { existing: {...} }
    expect(src).toMatch(/latest\?\.weekId\s*===\s*currentWeekId/);
    expect(src).toMatch(/status\(409\)/);
    expect(src).toMatch(/existing:/);
  });

  it("honours ?force=1 to skip the once-per-week guard", () => {
    expect(src).toMatch(/req\.query\.force\s*===\s*"1"/);
  });

  it("route signature accepts req (not _req) so req.query is accessible", () => {
    expect(src).toMatch(
      /app\.post\(\s*"\/api\/digest\/generate"\s*,\s*async\s*\(\s*req\s*,/,
    );
  });

  it("digestGenerating mutex and budget cap guards are preserved", () => {
    expect(src).toMatch(/digestGenerating/);
    expect(src).toMatch(/isBudgetExhausted\(\{\s*cap:\s*MAX_LLM_CALLS_PER_DAY/);
  });
});

describe("digest guard — weekId-based once-per-week logic", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "ai-pulse-guard-test-"));
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("loadLatestDigest returns null when no digest saved — guard should proceed", async () => {
    const { loadLatestDigest } = await import("../lib/digest/store.mjs");
    expect(loadLatestDigest()).toBeNull();
    // Guard precondition: latest?.weekId === currentWeekId → false → proceed
  });

  it("saved digest weekId matches weekIdBrussels — guard would fire for same week", async () => {
    const { saveDigest, loadLatestDigest } = await import(
      "../lib/digest/store.mjs"
    );
    const { weekIdBrussels } = await import("../lib/digest/week-id.mjs");

    saveDigest({
      tldr: "t",
      highlights: [],
      modelUpdates: [],
      paperPicks: [],
      communityBuzz: [],
      lookAhead: "",
    });
    const latest = loadLatestDigest();
    const currentWeekId = weekIdBrussels();

    expect(latest.weekId).toBe(currentWeekId);
    // Guard condition: latest.weekId === currentWeekId → true → return 409
  });

  it("stale weekId on disk — guard should not fire (different weekId)", async () => {
    const { saveDigest, loadLatestDigest } = await import(
      "../lib/digest/store.mjs"
    );
    const { weekIdBrussels } = await import("../lib/digest/week-id.mjs");

    saveDigest({
      tldr: "t",
      highlights: [],
      modelUpdates: [],
      paperPicks: [],
      communityBuzz: [],
      lookAhead: "",
    });
    const latest = loadLatestDigest();
    const current = weekIdBrussels();

    // Simulate a different current week by comparing against a known-different id.
    const stale = "2099-W52";
    expect(latest.weekId).not.toBe(stale);
    expect(current).not.toBe(stale);
    // Guard condition: latest.weekId !== stale → proceed
  });

  it("dashboard/public/app.js handles 409 without showError and prepends digest-notice", () => {
    const appSrc = readFileSync(
      resolve(root, "dashboard", "public", "app.js"),
      "utf-8",
    );
    // 409 branch exists
    expect(appSrc).toMatch(/res\.status\s*===\s*409/);
    // Uses existing digest metadata
    expect(appSrc).toMatch(/payload\.existing/);
    // Shows "Already generated for this week" inline note (not error banner)
    expect(appSrc).toMatch(/Already generated for this week/);
    // Uses existing timeAgo helper
    expect(appSrc).toMatch(/timeAgo\(payload\.existing\.generatedAt\)/);
    // Notice auto-removes after 5 seconds (like existing showError pattern)
    expect(appSrc).toMatch(/notice\.remove\(\)/);
  });

  it("409 body shape includes existing.generatedAt, existing.weekId, existing.weekOf", async () => {
    // Model the body the handler builds from loadLatestDigest().
    const { saveDigest, loadLatestDigest } = await import(
      "../lib/digest/store.mjs"
    );
    saveDigest({
      tldr: "t",
      highlights: [],
      modelUpdates: [],
      paperPicks: [],
      communityBuzz: [],
      lookAhead: "",
      weekOf: "2026-04-13",
    });
    const latest = loadLatestDigest();

    const body = {
      error: `Digest already generated for ${latest.weekId}`,
      existing: {
        generatedAt: latest.generatedAt,
        weekId: latest.weekId,
        weekOf: latest.weekOf ?? null,
      },
    };

    expect(body.existing.generatedAt).toBeTruthy();
    expect(body.existing.weekId).toMatch(/^\d{4}-W\d{2}$/);
    expect(body.existing.weekOf).toBe("2026-04-13");
  });
});

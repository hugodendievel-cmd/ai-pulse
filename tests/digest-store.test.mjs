import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("lib/digest/store.mjs — Brussels weekId", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "ai-pulse-store-test-"));
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("saveDigest stores a weekId in YYYY-Www format", async () => {
    const { saveDigest } = await import("../lib/digest/store.mjs");
    const saved = saveDigest({
      tldr: "test",
      highlights: [],
      modelUpdates: [],
      paperPicks: [],
      communityBuzz: [],
      lookAhead: "",
    });
    expect(saved.weekId).toMatch(/^\d{4}-W\d{2}$/);
    expect(saved.generatedAt).toBeTruthy();
  });

  it("saveDigest weekId matches weekIdBrussels()", async () => {
    const { saveDigest } = await import("../lib/digest/store.mjs");
    const { weekIdBrussels } = await import("../lib/digest/week-id.mjs");
    const saved = saveDigest({
      tldr: "t",
      highlights: [],
      modelUpdates: [],
      paperPicks: [],
      communityBuzz: [],
      lookAhead: "",
    });
    expect(saved.weekId).toBe(weekIdBrussels());
  });

  it("loadLatestDigest returns the saved digest with matching weekId", async () => {
    const { saveDigest, loadLatestDigest } = await import(
      "../lib/digest/store.mjs"
    );
    const { weekIdBrussels } = await import("../lib/digest/week-id.mjs");
    saveDigest({
      tldr: "hello",
      highlights: [],
      modelUpdates: [],
      paperPicks: [],
      communityBuzz: [],
      lookAhead: "",
    });
    const latest = loadLatestDigest();
    expect(latest).not.toBeNull();
    expect(latest.weekId).toBe(weekIdBrussels());
  });
});

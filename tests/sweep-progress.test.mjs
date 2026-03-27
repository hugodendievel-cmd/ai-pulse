import { describe, expect, it } from "vitest";

import { createSweepProgressTracker } from "../lib/sweep-progress.mjs";

describe("createSweepProgressTracker", () => {
  it("tracks source completion and llm lifecycle", () => {
    const tracker = createSweepProgressTracker({
      sourceNames: ["Hacker News", "ArXiv"],
      llmEnabled: true,
    });

    const initial = tracker.snapshot();
    expect(initial.phase).toBe("sources");
    expect(initial.percent).toBe(0);
    expect(initial.steps.map((step) => step.state)).toEqual([
      "running",
      "running",
      "pending",
    ]);

    const afterFirstSource = tracker.markSource("Hacker News", "ok");
    expect(afterFirstSource.percent).toBe(33);
    expect(afterFirstSource.totals.sourcesDone).toBe(1);
    expect(afterFirstSource.steps[0].state).toBe("ok");

    const afterSecondSource = tracker.markSource("ArXiv", "error");
    expect(afterSecondSource.percent).toBe(67);
    expect(afterSecondSource.totals.sourcesError).toBe(1);

    const llmRunning = tracker.startLlm();
    expect(llmRunning.phase).toBe("llm");
    expect(llmRunning.llm.state).toBe("running");

    const ready = tracker.finishLlm({ state: "ok" });
    expect(ready.phase).toBe("ready");
    expect(ready.percent).toBe(100);
    expect(ready.llm.state).toBe("ok");
  });

  it("does not count the llm step when it is disabled", () => {
    const tracker = createSweepProgressTracker({
      sourceNames: ["Hacker News", "ArXiv"],
      llmEnabled: false,
    });

    tracker.markSource("Hacker News", "ok");
    const ready = tracker.markSource("ArXiv", "ok");

    expect(ready.totals.total).toBe(2);
    expect(ready.percent).toBe(100);
    expect(ready.phase).toBe("ready");
    expect(ready.llm.state).toBe("disabled");
  });

  it("preserves completed source states for late join snapshots", () => {
    const tracker = createSweepProgressTracker({
      sourceNames: ["Hacker News", "ArXiv", "Reddit"],
      llmEnabled: true,
    });

    tracker.markSource("Hacker News", "ok");
    tracker.markSource("ArXiv", "error");
    const snapshot = tracker.startLlm();

    expect(snapshot.steps).toEqual([
      expect.objectContaining({ label: "Hacker News", state: "ok" }),
      expect.objectContaining({ label: "ArXiv", state: "error" }),
      expect.objectContaining({ label: "Reddit", state: "running" }),
      expect.objectContaining({ label: "LLM briefing", state: "running" }),
    ]);
  });
});

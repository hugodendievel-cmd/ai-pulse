import { describe, expect, it } from "vitest";

import { SOURCE_COUNT, SOURCE_NAMES } from "../apis/briefing.mjs";

describe("apis/briefing.mjs exports", () => {
  it("SOURCE_COUNT equals SOURCE_NAMES.length", () => {
    expect(SOURCE_COUNT).toBe(SOURCE_NAMES.length);
  });

  it("SOURCE_COUNT is 12", () => {
    // Canary: if a source is added or removed without updating this test,
    // the test fails and forces a deliberate count update.
    expect(SOURCE_COUNT).toBe(12);
  });

  it("SOURCE_NAMES includes NewsAPI and Simon Willison", () => {
    expect(SOURCE_NAMES).toContain("NewsAPI");
    expect(SOURCE_NAMES).toContain("Simon Willison");
  });
});

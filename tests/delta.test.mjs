import { describe, expect, it } from "vitest";
import { computeDelta } from "../lib/delta/engine.mjs";

describe("computeDelta", () => {
  it("returns isFirst when no previous sweep", () => {
    const current = {
      sources: [
        {
          source: "Test",
          status: "ok",
          data: { items: [{ title: "Item 1", url: "https://example.com" }] },
        },
      ],
    };
    const delta = computeDelta(current, null);
    expect(delta.isFirst).toBe(true);
    expect(delta.newItems).toEqual([]);
  });

  it("detects new items", () => {
    const prev = {
      sources: [
        {
          source: "Test",
          status: "ok",
          data: {
            category: "news",
            items: [{ title: "Old Item", url: "https://example.com/old" }],
          },
        },
      ],
    };
    const curr = {
      sources: [
        {
          source: "Test",
          status: "ok",
          data: {
            category: "news",
            items: [
              { title: "Old Item", url: "https://example.com/old" },
              { title: "New Item", url: "https://example.com/new" },
            ],
          },
        },
      ],
    };
    const delta = computeDelta(curr, prev);
    expect(delta.isFirst).toBe(false);
    expect(delta.newItems).toHaveLength(1);
    expect(delta.newItems[0].title).toBe("New Item");
  });

  it("detects removed items", () => {
    const prev = {
      sources: [
        {
          source: "Test",
          status: "ok",
          data: {
            items: [{ title: "Item A" }, { title: "Item B" }],
          },
        },
      ],
    };
    const curr = {
      sources: [
        {
          source: "Test",
          status: "ok",
          data: { items: [{ title: "Item A" }] },
        },
      ],
    };
    const delta = computeDelta(curr, prev);
    expect(delta.removedItems).toHaveLength(1);
    expect(delta.removedItems[0].title).toBe("Item B");
  });

  it("detects score surges", () => {
    const prev = {
      sources: [
        {
          source: "HN",
          status: "ok",
          data: { items: [{ title: "Hot Post", score: 100 }] },
        },
      ],
    };
    const curr = {
      sources: [
        {
          source: "HN",
          status: "ok",
          data: { items: [{ title: "Hot Post", score: 200 }] },
        },
      ],
    };
    const delta = computeDelta(curr, prev);
    expect(delta.changes).toHaveLength(1);
    expect(delta.changes[0].type).toBe("surge");
    expect(delta.changes[0].oldValue).toBe(100);
    expect(delta.changes[0].newValue).toBe(200);
  });

  it("skips failed sources", () => {
    const prev = {
      sources: [
        {
          source: "Broken",
          status: "error",
          data: null,
        },
      ],
    };
    const curr = {
      sources: [
        {
          source: "Broken",
          status: "error",
          data: null,
        },
      ],
    };
    const delta = computeDelta(curr, prev);
    expect(delta.newItems).toEqual([]);
    expect(delta.removedItems).toEqual([]);
  });
});

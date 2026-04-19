import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { shouldTriggerSweep } from "../lib/sweep-cooldown.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const FIFTEEN_MIN = 15 * 60 * 1000;

describe("shouldTriggerSweep — unit", () => {
  it("returns true when lastSweepTime is null and no sweep is in progress (boot path)", () => {
    expect(
      shouldTriggerSweep({
        lastSweepTime: null,
        now: Date.now(),
        cooldownMs: FIFTEEN_MIN,
        sweepInProgress: false,
      }),
    ).toBe(true);
  });

  it("returns false when lastSweepTime is recent (<cooldownMs)", () => {
    const now = Date.now();
    expect(
      shouldTriggerSweep({
        lastSweepTime: now - 5 * 60 * 1000,
        now,
        cooldownMs: FIFTEEN_MIN,
        sweepInProgress: false,
      }),
    ).toBe(false);
  });

  it("returns true when lastSweepTime is stale (>cooldownMs)", () => {
    const now = Date.now();
    expect(
      shouldTriggerSweep({
        lastSweepTime: now - 16 * 60 * 1000,
        now,
        cooldownMs: FIFTEEN_MIN,
        sweepInProgress: false,
      }),
    ).toBe(true);
  });

  it("returns false when a sweep is already in progress, regardless of time", () => {
    const now = Date.now();
    expect(
      shouldTriggerSweep({
        lastSweepTime: null,
        now,
        cooldownMs: FIFTEEN_MIN,
        sweepInProgress: true,
      }),
    ).toBe(false);
    expect(
      shouldTriggerSweep({
        lastSweepTime: now - 30 * 60 * 1000,
        now,
        cooldownMs: FIFTEEN_MIN,
        sweepInProgress: true,
      }),
    ).toBe(false);
  });

  it("returns true exactly at the cooldown threshold (at-threshold allowed)", () => {
    const now = Date.now();
    expect(
      shouldTriggerSweep({
        lastSweepTime: now - FIFTEEN_MIN,
        now,
        cooldownMs: FIFTEEN_MIN,
        sweepInProgress: false,
      }),
    ).toBe(true);
  });

  it("accepts lastSweepTime as an ISO string (server.mjs stores it as ISO)", () => {
    const now = Date.now();
    // Recent — should not trigger
    expect(
      shouldTriggerSweep({
        lastSweepTime: new Date(now - 5 * 60 * 1000).toISOString(),
        now,
        cooldownMs: FIFTEEN_MIN,
        sweepInProgress: false,
      }),
    ).toBe(false);
    // Stale — should trigger
    expect(
      shouldTriggerSweep({
        lastSweepTime: new Date(now - 16 * 60 * 1000).toISOString(),
        now,
        cooldownMs: FIFTEEN_MIN,
        sweepInProgress: false,
      }),
    ).toBe(true);
  });
});

describe("sweep-cooldown integration in server.mjs (static handler shape)", () => {
  const src = readFileSync(resolve(root, "server.mjs"), "utf-8");

  it("imports shouldTriggerSweep from lib/sweep-cooldown.mjs", () => {
    expect(src).toMatch(
      /from\s+"\.\/lib\/sweep-cooldown\.mjs"/,
    );
    expect(src).toMatch(/shouldTriggerSweep/);
  });

  it("/events on-connect path uses shouldTriggerSweep to decide whether to trigger a sweep", () => {
    // The on-connect handler must gate the sweep() call behind shouldTriggerSweep.
    expect(src).toMatch(/shouldTriggerSweep\s*\(/);
  });

  it("setInterval tick uses shouldTriggerSweep as a safety net", () => {
    // There should be at least two call sites: on-connect + interval.
    const matches = src.match(/shouldTriggerSweep\s*\(/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("preserves viewer-gating — interval sweep is skipped when zero SSE clients are connected", () => {
    expect(src).toMatch(/sseClients\.size\s*===\s*0/);
  });

  it("preserves the sweepInProgress mutex inside sweep()", () => {
    expect(src).toMatch(/if\s*\(\s*sweepInProgress\s*\)\s*return/);
  });

  it("broadcasts currentData + progress history to late-joining clients inside the cooldown window", () => {
    // When the server decides NOT to trigger a sweep on connect (cooldown), it
    // should still send the cached currentData (existing catch-up animation).
    expect(src).toMatch(/type:\s*"update"/);
  });

  it("ties the cooldown to REFRESH_MS (no new env var)", () => {
    // shouldTriggerSweep must be called with cooldownMs: REFRESH_MS.
    expect(src).toMatch(/cooldownMs:\s*REFRESH_MS/);
  });
});

describe("/events on-connect path — behavioural coverage via pure helper", () => {
  // The helper is what decides. These tests exercise the decision surface
  // that the /events handler now delegates to — following the handler-shape
  // style from tests/health-budget.test.mjs (no supertest, no boot).

  it("a client connecting 5 min after a sweep does NOT trigger a new one", () => {
    const now = Date.now();
    const decision = shouldTriggerSweep({
      lastSweepTime: now - 5 * 60 * 1000,
      now,
      cooldownMs: FIFTEEN_MIN,
      sweepInProgress: false,
    });
    expect(decision).toBe(false);
  });

  it("a client connecting 16 min after a sweep DOES trigger a new one", () => {
    const now = Date.now();
    const decision = shouldTriggerSweep({
      lastSweepTime: now - 16 * 60 * 1000,
      now,
      cooldownMs: FIFTEEN_MIN,
      sweepInProgress: false,
    });
    expect(decision).toBe(true);
  });

  it("a client connecting on a fresh boot (no sweep yet) triggers a sweep", () => {
    const decision = shouldTriggerSweep({
      lastSweepTime: null,
      now: Date.now(),
      cooldownMs: FIFTEEN_MIN,
      sweepInProgress: false,
    });
    expect(decision).toBe(true);
  });

  it("a second client connecting while a sweep is in flight does NOT trigger a parallel sweep", () => {
    const now = Date.now();
    const decision = shouldTriggerSweep({
      lastSweepTime: now - 30 * 60 * 1000, // would otherwise be stale
      now,
      cooldownMs: FIFTEEN_MIN,
      sweepInProgress: true,
    });
    expect(decision).toBe(false);
  });

  it("interval tick with zero clients is gated separately (viewer-gating still enforced in server.mjs)", () => {
    // This is a static assertion — see the integration block above.
    const src = readFileSync(resolve(root, "server.mjs"), "utf-8");
    expect(src).toMatch(/sseClients\.size\s*===\s*0/);
  });
});

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

describe("/api/health llmBudget wiring (static)", () => {
  const src = readFileSync(resolve(root, "server.mjs"), "utf-8");

  it("imports the persistent budget helpers from lib/llm/budget.mjs", () => {
    expect(src).toMatch(
      /from\s+"\.\/lib\/llm\/budget\.mjs"/,
    );
    expect(src).toMatch(/incrementBudget/);
    expect(src).toMatch(/isBudgetExhausted/);
    expect(src).toMatch(/loadBudget/);
  });

  it("no longer defines the in-process llmCallsToday / llmBudgetDay vars", () => {
    expect(src).not.toMatch(/let\s+llmCallsToday\s*=/);
    expect(src).not.toMatch(/let\s+llmBudgetDay\s*=/);
  });

  it("/api/health llmBudget block sources from isBudgetExhausted and exposes skipReason conditionally", () => {
    expect(src).toMatch(/llmBudget:\s*\(\(\)\s*=>/);
    expect(src).toMatch(/isBudgetExhausted\(\{\s*cap:\s*MAX_LLM_CALLS_PER_DAY/);
    expect(src).toMatch(/\.\.\.\(b\.exhausted\s*\?\s*\{\s*skipReason:/);
  });
});

describe("/api/health llmBudget — behavior via budget module", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "ai-pulse-health-budget-test-"));
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // Reproduces the exact shape the /api/health handler builds. If the
  // server.mjs IIFE changes, this test has to change too.
  function buildLlmBudgetField(isBudgetExhausted, cap) {
    const b = isBudgetExhausted({ cap });
    return {
      callsToday: b.count,
      dailyLimit: b.cap,
      remaining: Math.max(0, b.cap - b.count),
      ...(b.exhausted ? { skipReason: b.skipReason } : {}),
    };
  }

  it("callsToday matches persisted count after increments", async () => {
    const { incrementBudget, isBudgetExhausted } = await import(
      "../lib/llm/budget.mjs"
    );
    incrementBudget();
    incrementBudget();

    const field = buildLlmBudgetField(isBudgetExhausted, 100);
    expect(field.callsToday).toBe(2);
    expect(field.dailyLimit).toBe(100);
    expect(field.remaining).toBe(98);
    expect(field.skipReason).toBeUndefined();
  });

  it("skipReason is exposed when the cap is reached", async () => {
    const { incrementBudget, isBudgetExhausted } = await import(
      "../lib/llm/budget.mjs"
    );
    incrementBudget();
    incrementBudget();
    incrementBudget();

    const field = buildLlmBudgetField(isBudgetExhausted, 3);
    expect(field.callsToday).toBe(3);
    expect(field.dailyLimit).toBe(3);
    expect(field.remaining).toBe(0);
    expect(field.skipReason).toBe("Daily LLM budget exhausted");
  });
});

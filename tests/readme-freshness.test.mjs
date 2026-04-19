// tests/readme-freshness.test.mjs — Guardrail against stale wording in README.md.
// Reads README.md and asserts none of the known-stale v1.1 keywords are present.
// No network calls; no fixtures.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const readme = readFileSync(resolve(__dirname, "../README.md"), "utf-8");

const STALE = [
  { pattern: /10 sources/i, label: '"10 sources"' },
  { pattern: /10\+ sources/i, label: '"10+ sources"' },
  { pattern: /Data Sources \(10\)/i, label: '"Data Sources (10)"' },
  { pattern: /gpt-5\.4/, label: "stale OpenAI model gpt-5.4" },
  { pattern: /gemini-3-flash-preview/, label: "stale Gemini model gemini-3-flash-preview" },
  { pattern: /paywall/i, label: "paywall mention" },
  { pattern: /inline CSS\/JS/i, label: '"inline CSS/JS" architecture claim' },
  { pattern: /single HTML file with inline/i, label: "single-file-with-inline claim" },
];

describe("README freshness — no stale keywords", () => {
  for (const { pattern, label } of STALE) {
    it(`README.md does not contain ${label}`, () => {
      expect(readme).not.toMatch(pattern);
    });
  }
});

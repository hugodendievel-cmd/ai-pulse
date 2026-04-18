import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function readFile(rel) {
  return readFileSync(resolve(root, rel), "utf-8");
}

describe("no hardcoded source count of 10", () => {
  it("diag.mjs does not contain a stale hardcoded 10-entry source slug list", () => {
    const src = readFile("diag.mjs");
    // After this story, diag.mjs drives its iteration from SOURCE_NAMES.
    // If a dev reintroduces a hardcoded array, it must include the missing
    // "newsapi" and "simonwillison" slugs (or use SOURCE_NAMES).
    const hasOldTenList =
      src.includes('"producthunt"') &&
      !src.includes('"newsapi"') &&
      !src.includes('"simonwillison"') &&
      !src.includes("SOURCE_NAMES");
    expect(hasOldTenList).toBe(false);
  });

  it("server.mjs has no source-count hardcoded 10 (parseInt radix uses excluded)", () => {
    const src = readFile("server.mjs");
    expect(src).not.toMatch(/sweepProgress\.total\s*=\s*10/);
    expect(src).not.toMatch(/sourcesTotal\s*=\s*10/);
  });
});

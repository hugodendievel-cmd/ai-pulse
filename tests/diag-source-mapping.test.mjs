import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { SOURCE_NAMES } from "../apis/briefing.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

/**
 * Parse the NAME_TO_SLUG object literal from diag.mjs.
 *
 * diag.mjs is a top-level-await script that boots modules with side effects,
 * so we can't safely `import` it from a test. Parsing the literal is robust
 * enough for this guardrail: we just need the mapping keys + values.
 */
function loadNameToSlug() {
  const src = readFileSync(resolve(root, "diag.mjs"), "utf-8");
  const match = src.match(/const NAME_TO_SLUG\s*=\s*{([\s\S]*?)};/);
  if (!match) throw new Error("NAME_TO_SLUG literal not found in diag.mjs");
  const body = match[1];
  const entries = {};
  // Match: `"Key": "value",` OR `Key: "value",` (bare identifier keys like ArXiv)
  const entryRe = /(?:"([^"]+)"|([A-Za-z0-9_]+))\s*:\s*"([^"]+)"/g;
  let m;
  while ((m = entryRe.exec(body)) !== null) {
    const key = m[1] ?? m[2];
    entries[key] = m[3];
  }
  return entries;
}

describe("diag.mjs NAME_TO_SLUG coverage", () => {
  it("has a slug mapping for every SOURCE_NAME", () => {
    const mapping = loadNameToSlug();
    const missing = SOURCE_NAMES.filter((name) => !(name in mapping));
    expect(missing).toEqual([]);
  });

  it("every mapped slug resolves to a real module under apis/sources/", () => {
    const mapping = loadNameToSlug();
    const broken = Object.entries(mapping).filter(
      ([, slug]) => !existsSync(resolve(root, "apis/sources", `${slug}.mjs`)),
    );
    expect(broken).toEqual([]);
  });
});

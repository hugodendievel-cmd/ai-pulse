import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const html = readFileSync(
  resolve(root, "dashboard/public/index.html"),
  "utf-8",
);
const source = readFileSync(
  resolve(root, "apis/sources/simonwillison.mjs"),
  "utf-8",
);

describe("Simon Willison category/panel consistency", () => {
  it("source file exports category: community", () => {
    expect(source).toMatch(/category:\s*["']community["']/);
  });

  it("HTML panel has data-section=community (not code)", () => {
    const panelBlockMatch = html.match(
      /<!--\s*Simon Willison\s*-->\s*<div[^>]*data-section="([^"]+)"/,
    );
    expect(panelBlockMatch).not.toBeNull();
    expect(panelBlockMatch[1]).toBe("community");
  });

  it("source category and HTML data-section both equal community", () => {
    const sourceCategory = source.match(/category:\s*["'](\w+)["']/)?.[1];
    const panelSection = html.match(
      /<!--\s*Simon Willison\s*-->\s*<div[^>]*data-section="(\w+)"/,
    )?.[1];
    expect(sourceCategory).toBe(panelSection);
  });
});

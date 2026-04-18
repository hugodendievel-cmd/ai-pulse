import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(
  resolve(__dirname, "../dashboard/public/style.css"),
  "utf-8",
);

// Count definitions (property declarations, not usages)
function countDefinitions(varName) {
  // Matches lines like: --text-dim: #value;
  const re = new RegExp(`${varName}\\s*:`, "g");
  return (css.match(re) || []).length;
}

// Check that a variable is defined inside :root
function definedInRoot(varName) {
  // Extract the :root block and check for the variable inside it
  const rootMatch = css.match(/:root\s*\{([^}]+)\}/);
  if (!rootMatch) return false;
  return rootMatch[1].includes(`${varName}:`);
}

describe("digest panel CSS variables", () => {
  it("--text-dim has at least 3 definitions (one per theme)", () => {
    expect(countDefinitions("--text-dim")).toBeGreaterThanOrEqual(3);
  });

  it("--card has at least 3 definitions (one per theme)", () => {
    expect(countDefinitions("--card")).toBeGreaterThanOrEqual(3);
  });

  it("--text-dim is defined in :root (dark theme fallback)", () => {
    expect(definedInRoot("--text-dim")).toBe(true);
  });

  it("--card is defined in :root (dark theme fallback)", () => {
    expect(definedInRoot("--card")).toBe(true);
  });
});

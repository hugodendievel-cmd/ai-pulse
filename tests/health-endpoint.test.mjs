import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { SOURCE_COUNT } from "../apis/briefing.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

describe("/api/health sourceCount field", () => {
  it("SOURCE_COUNT is the value health will report", () => {
    expect(typeof SOURCE_COUNT).toBe("number");
    expect(SOURCE_COUNT).toBeGreaterThan(0);
  });

  it("server.mjs /api/health response includes sourceCount: SOURCE_COUNT", () => {
    const src = readFileSync(resolve(root, "server.mjs"), "utf-8");
    // Confirm the literal wiring: sourceCount set from SOURCE_COUNT.
    expect(src).toMatch(/sourceCount:\s*SOURCE_COUNT/);
  });
});

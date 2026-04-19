import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(
  resolve(__dirname, "../dashboard/public/style.css"),
  "utf-8",
);

describe("mobile-responsive panel stacking", () => {
  it("style.css contains a @media (max-width: 768px) block", () => {
    expect(css).toMatch(/@media\s*\(max-width:\s*768px\)/);
  });

  it("the 768px block forces .col-4 to full-width (system A)", () => {
    const block =
      css.match(/@media\s*\(max-width:\s*768px\)\s*\{([\s\S]*?)\n\}/)?.[1] ??
      "";
    expect(block).toMatch(/\.col-4/);
    expect(block).toMatch(/grid-column:\s*span\s*12/);
  });

  it("the 768px block resets --col-span to 12 for .panel[class*='col-'] (system B)", () => {
    const block =
      css.match(/@media\s*\(max-width:\s*768px\)\s*\{([\s\S]*?)\n\}/)?.[1] ??
      "";
    expect(block).toMatch(/\.panel\[class\*=["']col-["']\]/);
    expect(block).toMatch(/--col-span:\s*12/);
  });

  it(".col-6 and .col-8 are also covered by the 768px system A override", () => {
    const block =
      css.match(/@media\s*\(max-width:\s*768px\)\s*\{([\s\S]*?)\n\}/)?.[1] ??
      "";
    expect(block).toMatch(/\.col-6/);
    expect(block).toMatch(/\.col-8/);
  });
});

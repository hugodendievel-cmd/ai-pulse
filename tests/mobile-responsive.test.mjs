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

  it("the system B mobile override appears AFTER the unconditional .panel.col-X rules (source order wins equal-specificity fight)", () => {
    const unconditionalIdx = css.indexOf(".panel.col-6  { --col-span: 6; }");
    expect(unconditionalIdx).toBeGreaterThan(-1);

    // Find a 768px @media block that contains `.panel[class*="col-"] { --col-span: 12 }`
    // AND appears after the unconditional rule.
    const overrideRegex =
      /@media\s*\(max-width:\s*768px\)\s*\{[^}]*\.panel\[class\*=["']col-["']\][^}]*--col-span:\s*12/g;
    let foundAfter = false;
    for (const m of css.matchAll(overrideRegex)) {
      if (m.index > unconditionalIdx) {
        foundAfter = true;
        break;
      }
    }
    expect(foundAfter).toBe(true);
  });

  it("the 768px block stacks .stats-bar to a single column", () => {
    const blocks = [...css.matchAll(/@media\s*\(max-width:\s*768px\)\s*\{([\s\S]*?)\n\}/g)]
      .map((m) => m[1])
      .join("\n");
    expect(blocks).toMatch(/\.stats-bar\s*\{[^}]*grid-template-columns:\s*1fr/);
  });

  it("unconditional .panel-toggle rule pins the chevron to the right at ALL viewports (keeps count next to title on desktop too)", () => {
    // Match the declaration inside the unconditional .panel-toggle rule.
    expect(css).toMatch(
      /\.panel-toggle\s*\{[^}]*margin-left:\s*auto/,
    );
  });

  it("the 768px block hides kbd-help-btn and the ⌘K hint inside .search-trigger", () => {
    const blocks = [...css.matchAll(/@media\s*\(max-width:\s*768px\)\s*\{([\s\S]*?)\n\}/g)]
      .map((m) => m[1])
      .join("\n");
    expect(blocks).toMatch(/\.kbd-help-btn\s*\{[^}]*display:\s*none/);
    expect(blocks).toMatch(/\.search-trigger\s+kbd\s*\{[^}]*display:\s*none/);
  });
});

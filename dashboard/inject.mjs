// dashboard/inject.mjs — Inject latest sweep data into a self-contained static HTML
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(__dirname, "..");

const runsDir = resolve(process.cwd(), "runs");
const htmlPath = resolve(pkgRoot, "dashboard", "public", "index.html");
const cssPath = resolve(pkgRoot, "dashboard", "public", "style.css");
const jsPath = resolve(pkgRoot, "dashboard", "public", "app.js");

let data;
try {
  data = JSON.parse(readFileSync(resolve(runsDir, "latest.json"), "utf-8"));
} catch {
  console.error(
    "[Inject] No runs/latest.json found. Run a sweep first: npm run sweep",
  );
  process.exit(1);
}

let html = readFileSync(htmlPath, "utf-8");
const css = readFileSync(cssPath, "utf-8");
const js = readFileSync(jsPath, "utf-8");

// Inline CSS and JS so the static file is self-contained
html = html.replace(
  '<link rel="stylesheet" href="/style.css" />',
  `<style>${css}</style>`,
);
// Remove preconnect hints since fonts will be loaded externally
html = html.replaceAll(/<link rel="preconnect"[^>]*\/>\s*/g, "");
html = html.replace(
  '<script src="/app.js"></script>',
  `<script>${js}</script>`,
);

// Inject data as a script that auto-renders
const injection = `<script>
(function(){
  const d = ${JSON.stringify({ sweep: data, delta: { isFirst: true }, analysis: null, generatedAt: data.timestamp })};
  document.addEventListener('DOMContentLoaded', () => { render(d); hideLoading(); });
})();
</script>`;

const injectedHtml = html.replace("</body>", `${injection}\n</body>`);
const outPath = resolve(process.cwd(), "index-static.html");
writeFileSync(outPath, injectedHtml);
console.log(`[Inject] Written to ${outPath}`);

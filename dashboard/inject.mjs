// dashboard/inject.mjs — Inject latest sweep data into static HTML
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(__dirname, "..");

const runsDir = resolve(process.cwd(), "runs");
const htmlPath = resolve(pkgRoot, "dashboard", "public", "index.html");

let data;
try {
  data = JSON.parse(readFileSync(resolve(runsDir, "latest.json"), "utf-8"));
} catch {
  console.error(
    "[Inject] No runs/latest.json found. Run a sweep first: npm run sweep",
  );
  process.exit(1);
}

const html = readFileSync(htmlPath, "utf-8");

// Inject data as a script that auto-renders
const injection = `<script>
// Injected data from latest sweep
(function(){
  const d = ${JSON.stringify({ sweep: data, delta: { isFirst: true }, analysis: null, generatedAt: data.timestamp })};
  document.addEventListener('DOMContentLoaded', () => { render(d); hideLoading(); });
})();
</script>`;

const injectedHtml = html.replace("</body>", `${injection}\n</body>`);
const outPath = resolve(process.cwd(), "index-static.html");
writeFileSync(outPath, injectedHtml);
console.log(`[Inject] Written to ${outPath}`);

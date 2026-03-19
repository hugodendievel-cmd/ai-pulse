// diag.mjs — Diagnostic script for AI Pulse

console.log("\n  AI PULSE — Diagnostics\n  ─────────────────────\n");

// Node version
const [major] = process.versions.node.split(".").map(Number);
console.log(
  `  Node.js:  v${process.versions.node} ${major >= 22 ? "✓" : "✗ (need 22+)"}`,
);

// Imports
const modules = [["express", () => import("express")]];
for (const [name, fn] of modules) {
  try {
    await fn();
    console.log(`  ${name}: ✓`);
  } catch {
    console.log(`  ${name}: ✗ (npm install)`);
  }
}

// Source imports
const sources = [
  "hackernews",
  "arxiv",
  "huggingface",
  "github-trending",
  "techcrunch",
  "theverge",
  "venturebeat",
  "reddit",
  "google-news",
  "producthunt",
];
console.log(`\n  Sources:`);
for (const s of sources) {
  try {
    await import(`./apis/sources/${s}.mjs`);
    console.log(`    ${s}: ✓`);
  } catch (err) {
    console.log(`    ${s}: ✗ (${err.message})`);
  }
}

// Port check
const port = process.env.PORT || 3200;
try {
  const { createServer } = await import("node:net");
  await new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on("error", reject);
    srv.listen(port, () => {
      srv.close();
      resolve();
    });
  });
  console.log(`\n  Port ${port}: ✓ (available)`);
} catch {
  console.log(`\n  Port ${port}: ✗ (in use)`);
}

// .env check
try {
  const { readFileSync } = await import("node:fs");
  readFileSync(".env", "utf-8");
  console.log(`  .env: ✓`);
} catch {
  console.log(`  .env: ✗ (copy .env.example to .env)`);
}

console.log("\n  Done.\n");

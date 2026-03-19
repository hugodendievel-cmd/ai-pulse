// lib/delta/memory.mjs — Hot memory (last 3 runs) + persistence
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Store runtime data in the user's cwd (persists across runs)
const MEMORY_DIR = resolve(process.cwd(), ".ai-pulse", "memory");
const HOT_FILE = resolve(MEMORY_DIR, "hot.json");
const MAX_HOT = 3;

mkdirSync(MEMORY_DIR, { recursive: true });

let hot = [];
try {
  hot = JSON.parse(readFileSync(HOT_FILE, "utf-8"));
} catch {
  hot = [];
}

export function pushSweep(sweep) {
  hot.push(sweep);
  if (hot.length > MAX_HOT) hot.shift();
  writeFileSync(HOT_FILE, JSON.stringify(hot, null, 2));
}

export function getPrevious() {
  return hot.length >= 2 ? hot[hot.length - 2] : null;
}

export function getLatest() {
  return hot.length ? hot[hot.length - 1] : null;
}

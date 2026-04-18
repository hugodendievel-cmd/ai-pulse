// lib/delta/memory.mjs — Hot memory (last 3 runs) + persistence
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Store runtime data in the user's cwd (persists across runs)
const MEMORY_DIR = resolve(process.cwd(), ".ai-pulse", "memory");
const HOT_FILE = resolve(MEMORY_DIR, "hot.json");
const MAX_HOT = 3;

// Lazy in-process buffer — populated on first write or first read attempt
let hot = null; // null = not yet loaded

function loadHot() {
  if (hot !== null) return;
  try {
    hot = JSON.parse(readFileSync(HOT_FILE, "utf-8"));
  } catch {
    hot = [];
  }
}

export function ensureMemoryDir() {
  mkdirSync(MEMORY_DIR, { recursive: true });
}

export function pushSweep(sweep) {
  loadHot();
  hot.push(sweep);
  if (hot.length > MAX_HOT) hot.shift();
  ensureMemoryDir();
  writeFileSync(HOT_FILE, JSON.stringify(hot, null, 2));
}

export function getPrevious() {
  loadHot();
  return hot.length >= 2 ? hot[hot.length - 2] : undefined;
}

export function getLatest() {
  loadHot();
  return hot.length ? hot[hot.length - 1] : undefined;
}

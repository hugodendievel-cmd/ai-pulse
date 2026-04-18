// lib/digest/store.mjs — Weekly digest persistence
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { sanitizeDigest } from "../../apis/utils/sanitize.mjs";

const DIGEST_DIR = resolve(process.cwd(), ".ai-pulse", "digests");
mkdirSync(DIGEST_DIR, { recursive: true });

/**
 * Save a weekly digest with a week identifier.
 */
export function saveDigest(digest) {
  const weekId = getWeekId();
  const filePath = resolve(DIGEST_DIR, `${weekId}.json`);
  const clean = sanitizeDigest(digest);
  const payload = {
    ...clean,
    generatedAt: new Date().toISOString(),
    weekId,
  };
  writeFileSync(filePath, JSON.stringify(payload, null, 2));
  writeFileSync(
    resolve(DIGEST_DIR, "latest.json"),
    JSON.stringify(payload, null, 2),
  );
  return payload;
}

/**
 * Load the latest saved digest.
 */
export function loadLatestDigest() {
  const latest = resolve(DIGEST_DIR, "latest.json");
  if (!existsSync(latest)) return null;
  try {
    return JSON.parse(readFileSync(latest, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Get a week identifier string like "2025-W29".
 */
function getWeekId(date = new Date()) {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

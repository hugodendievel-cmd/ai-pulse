// apis/utils/sanitize.mjs — Server-side text sanitization for external source data

/**
 * Strip HTML tags and decode common entities from untrusted text.
 * This is defense-in-depth: the frontend also escapes, but we sanitize
 * on ingestion to guard against compromised sources.
 */
export function sanitizeText(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/<[^>]*>/g, "") // strip HTML tags
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = parseInt(n, 10);
      return code >= 32 && code <= 126 ? String.fromCharCode(code) : "";
    })
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // strip control chars
    .trim();
}

/**
 * Sanitize a URL — only allow http(s) protocols.
 */
export function sanitizeUrl(str) {
  if (typeof str !== "string") return "";
  const trimmed = str.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
    return "";
  } catch {
    return "";
  }
}

/**
 * Sanitize all string fields in an item object (shallow).
 * URL-like fields get URL sanitization; others get text sanitization.
 */
const URL_FIELDS = new Set(["url", "permalink", "hnLink", "pdfUrl"]);

export function sanitizeItem(item) {
  if (!item || typeof item !== "object") return item;
  const clean = {};
  for (const [key, val] of Object.entries(item)) {
    if (typeof val === "string") {
      clean[key] = URL_FIELDS.has(key) ? sanitizeUrl(val) : sanitizeText(val);
    } else if (Array.isArray(val)) {
      clean[key] = val.map((v) =>
        typeof v === "string" ? sanitizeText(v) : v,
      );
    } else {
      clean[key] = val;
    }
  }
  return clean;
}

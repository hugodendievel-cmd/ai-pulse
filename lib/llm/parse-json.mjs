// lib/llm/parse-json.mjs — Shared LLM JSON response parser
import log from "../logger.mjs";

const SNIPPET_MAX = 200;

/**
 * Strip an outer markdown code fence from the response if present.
 * Handles ```json, ```JSON, ```js, and plain ``` fences.
 * @param {string} text
 * @returns {string}
 */
function stripFences(text) {
  return text
    .replace(/^```[a-zA-Z]*\n?([\s\S]*?)```\s*$/m, "$1")
    .trim();
}

/**
 * Locate the first balanced {...} block via brace-depth counting.
 * Handles string literals and escape sequences so that `{` / `}` inside
 * strings do not affect depth.
 * @param {string} text
 * @returns {string|null}
 */
function extractJsonBlock(text) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  let start = -1;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === "\\" && inString) {
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}

/**
 * Extract and parse a JSON object from a raw LLM response string.
 *
 * Handles:
 *   - Plain JSON
 *   - Markdown-fenced JSON (```json ... ```, ``` ... ```)
 *   - Prose before/after the JSON block
 *
 * Never throws — logs via pino and returns `null` on any failure.
 *
 * @param {string} raw       – Raw text from the LLM
 * @param {object} [opts]
 * @param {string[]} [opts.required]  – Field names that must be present; returns null if any absent
 * @param {object}  [opts.defaults]   – Default values for missing optional fields
 * @param {string}  [opts.provider]   – Provider name for structured log bindings
 * @param {string}  [opts.model]      – Model name for structured log bindings
 * @returns {object|null}
 */
export function parseLlmJson(
  raw,
  { required = [], defaults = {}, provider = "", model = "" } = {},
) {
  try {
    const text = typeof raw === "string" ? raw : String(raw ?? "");
    const unfenced = stripFences(text);
    const block = extractJsonBlock(unfenced);
    if (!block) {
      throw new Error("no balanced JSON object found");
    }

    const parsed = JSON.parse(block);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("parsed value is not a plain object");
    }

    for (const [key, value] of Object.entries(defaults)) {
      if (parsed[key] === undefined) parsed[key] = value;
    }

    const missing = required.filter(
      (k) => parsed[k] === undefined || parsed[k] === null,
    );
    if (missing.length > 0) {
      log.warn(
        { provider, model, missing },
        "parseLlmJson: missing required fields",
      );
      return null;
    }

    return parsed;
  } catch (err) {
    const snippet =
      typeof raw === "string"
        ? raw.slice(0, SNIPPET_MAX)
        : String(raw ?? "").slice(0, SNIPPET_MAX);
    log.error(
      { err: err.message, provider, model, snippet },
      "parseLlmJson: failed to parse LLM response",
    );
    return null;
  }
}

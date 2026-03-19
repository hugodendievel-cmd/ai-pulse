// apis/utils/fetch.mjs — safeFetch with timeout, retries, abort, auto-JSON
const DEFAULT_TIMEOUT = 15_000;
const DEFAULT_RETRIES = 2;

export async function safeFetch(url, opts = {}) {
  const {
    timeout = DEFAULT_TIMEOUT,
    retries = DEFAULT_RETRIES,
    json = true,
    headers = {},
    ...rest
  } = opts;

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers,
        ...rest,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return json ? await res.json() : await res.text();
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < retries) await sleep(1000 * (attempt + 1));
    }
  }
  throw lastErr;
}

export async function safeFetchText(url, opts = {}) {
  return safeFetch(url, { ...opts, json: false });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

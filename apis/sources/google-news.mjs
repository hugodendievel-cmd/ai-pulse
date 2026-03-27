// apis/sources/google-news.mjs — Google News AI RSS (no key needed)
import { safeFetchText } from "../utils/fetch.mjs";
import { parseRss } from "../utils/xml.mjs";

const QUERIES = [
  "artificial+intelligence",
  "large+language+model",
  "AI+acquisition",
  "AI+startup+funding",
];

export async function briefing({ days = 3 } = {}) {
  let when = "3d";
  if (days <= 1) when = "1d";
  else if (days > 3) when = "7d";
  const results = await Promise.allSettled(
    QUERIES.map((q) =>
      safeFetchText(
        `https://news.google.com/rss/search?q=${q}+when:${when}&hl=en-US&gl=US&ceid=US:en`,
        { timeout: 15000 },
      ),
    ),
  );

  const seen = new Set();
  const items = [];
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const item of parseRss(r.value)) {
      if (seen.has(item.title)) continue;
      seen.add(item.title);
      items.push(item);
    }
  }

  items.sort((a, b) => new Date(b.published) - new Date(a.published));

  return {
    source: "Google News",
    category: "news",
    count: items.length,
    items: items.slice(0, 25),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const d = await briefing();
  console.log(JSON.stringify(d, null, 2));
}

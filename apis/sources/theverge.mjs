// apis/sources/theverge.mjs — The Verge AI RSS (no key needed)
import { safeFetchText } from "../utils/fetch.mjs";
import { parseAtom } from "../utils/xml.mjs";

const FEED_URL =
  "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml";

export async function briefing() {
  const xml = await safeFetchText(FEED_URL, { timeout: 15000 });
  const items = parseAtom(xml);

  return {
    source: "The Verge",
    category: "news",
    count: items.length,
    items: items.slice(0, 15),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  briefing().then((d) => console.log(JSON.stringify(d, null, 2)));
}

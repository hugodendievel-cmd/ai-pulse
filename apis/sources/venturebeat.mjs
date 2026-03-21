// apis/sources/venturebeat.mjs — VentureBeat AI RSS (no key needed)
import { safeFetchText } from "../utils/fetch.mjs";
import { parseRss } from "../utils/xml.mjs";

const FEED_URL = "https://venturebeat.com/category/ai/feed/";

export async function briefing() {
  const xml = await safeFetchText(FEED_URL, { timeout: 15000 });
  const items = parseRss(xml);

  return {
    source: "VentureBeat",
    category: "news",
    count: items.length,
    items: items.slice(0, 15),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  briefing().then((d) => console.log(JSON.stringify(d, null, 2)));
}

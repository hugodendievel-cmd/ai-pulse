// apis/sources/theverge.mjs — The Verge AI RSS (no key needed)
import { safeFetchText } from "../utils/fetch.mjs";

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

function parseAtom(xml) {
  const entries = xml.split("<entry>").slice(1);
  return entries.map((entry) => {
    const get = (tag) => {
      const m = entry.match(
        new RegExp(
          `<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`,
        ),
      );
      return m ? m[1].trim() : "";
    };
    const linkMatch = entry.match(/href="([^"]+)"/);
    return {
      title: get("title"),
      url: linkMatch ? linkMatch[1] : "",
      published: get("published") || get("updated"),
      description: get("summary")
        .replace(/<[^>]+>/g, "")
        .slice(0, 250),
      author: get("name"),
    };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  briefing().then((d) => console.log(JSON.stringify(d, null, 2)));
}

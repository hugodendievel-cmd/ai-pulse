// apis/sources/techcrunch.mjs — TechCrunch AI RSS (no key needed)
import { safeFetchText } from "../utils/fetch.mjs";

const FEED_URL =
  "https://techcrunch.com/category/artificial-intelligence/feed/";

const AI_KEYWORDS =
  /\b(ai|llm|gpt|claude|anthropic|openai|google|meta|microsoft|nvidia|startup|acquisition|funding|launch|model|chatbot|copilot|agent|generative)\b/i;

export async function briefing() {
  const xml = await safeFetchText(FEED_URL, { timeout: 15000 });
  const items = parseRss(xml).filter(
    (i) => AI_KEYWORDS.test(i.title) || AI_KEYWORDS.test(i.description),
  );

  return {
    source: "TechCrunch",
    category: "news",
    count: items.length,
    items: items.slice(0, 15),
  };
}

function parseRss(xml) {
  const items = xml.split("<item>").slice(1);
  return items.map((item) => {
    const get = (tag) => {
      const m = item.match(
        new RegExp(
          `<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`,
        ),
      );
      return m ? m[1].trim() : "";
    };
    return {
      title: get("title"),
      url: get("link"),
      published: get("pubDate"),
      description: get("description")
        .replace(/<[^>]+>/g, "")
        .slice(0, 250),
      creator: get("dc:creator"),
    };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  briefing().then((d) => console.log(JSON.stringify(d, null, 2)));
}

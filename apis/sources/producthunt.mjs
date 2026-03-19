// apis/sources/producthunt.mjs — Product Hunt AI products (no key needed — uses Atom feed)
import { safeFetchText } from "../utils/fetch.mjs";

const AI_KEYWORDS =
  /\b(ai|llm|gpt|chatbot|copilot|agent|machine learning|generative|automation|assistant|neural|language model|deep learning)\b/i;

export async function briefing() {
  let items = [];
  try {
    const xml = await safeFetchText("https://www.producthunt.com/feed", {
      timeout: 15000,
    });
    items = parseAtom(xml).filter(
      (i) => AI_KEYWORDS.test(i.title) || AI_KEYWORDS.test(i.description),
    );
  } catch (err) {
    return {
      source: "Product Hunt",
      category: "products",
      error: err.message,
      items: [],
    };
  }

  return {
    source: "Product Hunt",
    category: "products",
    count: items.length,
    items: items.slice(0, 15),
  };
}

function parseAtom(xml) {
  const entries = xml.split("<entry>").slice(1);
  return entries.map((entry) => {
    const get = (tag) => {
      const m = entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
      return m ? m[1].trim() : "";
    };
    const linkMatch = entry.match(/<link[^>]*href="([^"]+)"/);
    return {
      title: get("title"),
      url: linkMatch ? linkMatch[1] : "",
      published: get("published") || get("updated"),
      description: get("content")
        .replace(/<[^>]+>/g, "")
        .replace(/&lt;[^&]*&gt;/g, "")
        .trim()
        .slice(0, 250),
    };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  briefing().then((d) => console.log(JSON.stringify(d, null, 2)));
}

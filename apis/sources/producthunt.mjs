// apis/sources/producthunt.mjs — Product Hunt AI products (no key needed — uses Atom feed)
import { safeFetchText } from "../utils/fetch.mjs";
import { parseAtom } from "../utils/xml.mjs";

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

if (import.meta.url === `file://${process.argv[1]}`) {
  briefing().then((d) => console.log(JSON.stringify(d, null, 2)));
}

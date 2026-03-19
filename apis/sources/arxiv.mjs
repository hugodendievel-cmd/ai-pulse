// apis/sources/arxiv.mjs — ArXiv AI/ML papers (no key needed)
import { safeFetchText } from "../utils/fetch.mjs";

const CATEGORIES = ["cs.AI", "cs.CL", "cs.LG", "cs.CV"];
const MAX_RESULTS = 25;

export async function briefing() {
  const query = CATEGORIES.map((c) => `cat:${c}`).join("+OR+");
  const url = `https://export.arxiv.org/api/query?search_query=${query}&sortBy=submittedDate&sortOrder=descending&max_results=${MAX_RESULTS}`;

  const xml = await safeFetchText(url, { timeout: 20000 });
  const papers = parseArxivXml(xml);

  return {
    source: "ArXiv",
    category: "research",
    count: papers.length,
    items: papers,
  };
}

function parseArxivXml(xml) {
  const entries = xml.split("<entry>").slice(1);
  return entries.map((entry) => {
    const get = (tag) => {
      const m = entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
      return m ? m[1].trim() : "";
    };
    const authors = [
      ...entry.matchAll(/<author>\s*<name>([^<]+)<\/name>/g),
    ].map((m) => m[1]);
    const categories = [...entry.matchAll(/category[^>]*term="([^"]+)"/g)].map(
      (m) => m[1],
    );
    const id = get("id");
    return {
      title: get("title").replace(/\s+/g, " "),
      authors: authors.slice(0, 5),
      abstract: get("summary").replace(/\s+/g, " ").slice(0, 300),
      categories,
      published: get("published"),
      url: id,
      pdfUrl: id.replace("/abs/", "/pdf/"),
    };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  briefing().then((d) => console.log(JSON.stringify(d, null, 2)));
}

// apis/utils/xml.mjs — Shared XML/RSS/Atom parser using fast-xml-parser
import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  cdataPropName: "__cdata",
  trimValues: true,
  parseTagValue: false,
  processEntities: {
    enabled: true,
    maxTotalExpansions: 100_000,
  },
});

/**
 * Parse an RSS 2.0 feed and return an array of item objects.
 */
export function parseRss(xml) {
  const doc = parser.parse(xml);
  const channel = doc?.rss?.channel;
  if (!channel) return [];
  const rawItems = Array.isArray(channel.item)
    ? channel.item
    : channel.item
      ? [channel.item]
      : [];

  return rawItems.map((item) => ({
    title: text(item.title),
    url: text(item.link),
    published: text(item.pubDate),
    description: stripHtml(text(item.description)).slice(0, 250),
    creator: text(item["dc:creator"]),
    source: text(item.source),
  }));
}

/**
 * Parse an Atom feed and return an array of entry objects.
 */
export function parseAtom(xml) {
  const doc = parser.parse(xml);
  const feed = doc?.feed;
  if (!feed) return [];
  const rawEntries = Array.isArray(feed.entry)
    ? feed.entry
    : feed.entry
      ? [feed.entry]
      : [];

  return rawEntries.map((entry) => {
    // Atom <link> can be an object or array of objects with @_href
    let url = "";
    if (Array.isArray(entry.link)) {
      const alt =
        entry.link.find((l) => l["@_rel"] === "alternate") || entry.link[0];
      url = alt?.["@_href"] || "";
    } else if (entry.link) {
      url = entry.link["@_href"] || text(entry.link);
    }

    return {
      title: text(entry.title),
      url,
      published: text(entry.published) || text(entry.updated),
      description: stripHtml(text(entry.summary || entry.content)).slice(
        0,
        250,
      ),
      author: text(entry.author?.name),
    };
  });
}

/**
 * Parse ArXiv Atom/XML and return paper entries.
 */
export function parseArxiv(xml) {
  const doc = parser.parse(xml);
  const feed = doc?.feed;
  if (!feed) return [];
  const rawEntries = Array.isArray(feed.entry)
    ? feed.entry
    : feed.entry
      ? [feed.entry]
      : [];

  return rawEntries.map((entry) => {
    // Authors
    const authorList = Array.isArray(entry.author)
      ? entry.author
      : entry.author
        ? [entry.author]
        : [];
    const authors = authorList
      .map((a) => text(a.name))
      .filter(Boolean)
      .slice(0, 5);

    // Categories
    const catList = Array.isArray(entry.category)
      ? entry.category
      : entry.category
        ? [entry.category]
        : [];
    const categories = catList.map((c) => c["@_term"]).filter(Boolean);

    const id = text(entry.id);
    return {
      title: text(entry.title).replace(/\s+/g, " "),
      authors,
      abstract: text(entry.summary).replace(/\s+/g, " ").slice(0, 300),
      categories,
      published: text(entry.published),
      url: id,
      pdfUrl: id.replace("/abs/", "/pdf/"),
    };
  });
}

/** Extract text from a value that may be string, CDATA, or nested object */
function text(val) {
  if (val == null) return "";
  if (typeof val === "string") return val.trim();
  if (typeof val === "number") return String(val);
  if (val.__cdata) return String(val.__cdata).trim();
  if (val["#text"]) return String(val["#text"]).trim();
  return "";
}

/** Strip HTML tags from a string */
function stripHtml(str) {
  return str
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;[^&]*&gt;/g, "")
    .trim();
}

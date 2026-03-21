import { describe, expect, it } from "vitest";
import { parseArxiv, parseAtom, parseRss } from "../apis/utils/xml.mjs";

describe("parseRss", () => {
  it("parses a minimal RSS 2.0 feed", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <title>Test Feed</title>
        <item>
          <title>First Post</title>
          <link>https://example.com/1</link>
          <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
          <description>A short description</description>
        </item>
        <item>
          <title>Second Post</title>
          <link>https://example.com/2</link>
        </item>
      </channel>
    </rss>`;
    const items = parseRss(xml);
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe("First Post");
    expect(items[0].url).toBe("https://example.com/1");
    expect(items[0].description).toBe("A short description");
    expect(items[1].title).toBe("Second Post");
  });

  it("handles single item (not wrapped in array)", () => {
    const xml = `<rss><channel><item><title>Only One</title><link>https://a.com</link></item></channel></rss>`;
    const items = parseRss(xml);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Only One");
  });

  it("returns empty array for invalid XML", () => {
    expect(parseRss("not xml at all")).toEqual([]);
    expect(parseRss("<rss><channel></channel></rss>")).toEqual([]);
  });

  it("strips HTML from descriptions", () => {
    const xml = `<rss><channel><item><title>T</title><link>http://a.com</link><description>&lt;p&gt;Hello <b>world</b>&lt;/p&gt;</description></item></channel></rss>`;
    const items = parseRss(xml);
    expect(items[0].description).not.toContain("<b>");
    expect(items[0].description).not.toContain("<p>");
  });
});

describe("parseAtom", () => {
  it("parses a minimal Atom feed", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <title>Test Atom</title>
      <entry>
        <title>Atom Entry 1</title>
        <link rel="alternate" href="https://example.com/atom/1" />
        <published>2024-01-01T00:00:00Z</published>
        <summary>Summary text</summary>
        <author><name>Alice</name></author>
      </entry>
    </feed>`;
    const entries = parseAtom(xml);
    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe("Atom Entry 1");
    expect(entries[0].url).toBe("https://example.com/atom/1");
    expect(entries[0].author).toBe("Alice");
    expect(entries[0].description).toBe("Summary text");
  });

  it("returns empty array for missing feed", () => {
    expect(parseAtom("<html></html>")).toEqual([]);
  });
});

describe("parseArxiv", () => {
  it("parses ArXiv Atom entries", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <id>http://arxiv.org/abs/2401.00001v1</id>
        <title>
          A Very
          Long Paper Title
        </title>
        <summary>This paper explores interesting things about AI.</summary>
        <published>2024-01-15T00:00:00Z</published>
        <author><name>Author One</name></author>
        <author><name>Author Two</name></author>
        <category term="cs.AI" />
        <category term="cs.LG" />
      </entry>
    </feed>`;
    const papers = parseArxiv(xml);
    expect(papers).toHaveLength(1);
    expect(papers[0].title).toBe("A Very Long Paper Title");
    expect(papers[0].authors).toEqual(["Author One", "Author Two"]);
    expect(papers[0].categories).toEqual(["cs.AI", "cs.LG"]);
    expect(papers[0].url).toBe("http://arxiv.org/abs/2401.00001v1");
    expect(papers[0].pdfUrl).toBe("http://arxiv.org/pdf/2401.00001v1");
    expect(papers[0].abstract).toContain("interesting things");
  });

  it("returns empty for non-feed XML", () => {
    expect(parseArxiv("<notfeed/>")).toEqual([]);
  });
});

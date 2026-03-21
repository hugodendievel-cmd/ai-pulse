import { describe, expect, it } from "vitest";
import {
  sanitizeItem,
  sanitizeText,
  sanitizeUrl,
} from "../apis/utils/sanitize.mjs";

describe("sanitizeText", () => {
  it("strips HTML tags", () => {
    expect(sanitizeText('<script>alert("xss")</script>Hello')).toBe(
      'alert("xss")Hello',
    );
  });

  it("decodes common HTML entities", () => {
    expect(sanitizeText("Tom &amp; Jerry")).toBe("Tom & Jerry");
    expect(sanitizeText("&lt;b&gt;bold&lt;/b&gt;")).toBe("<b>bold</b>");
    expect(sanitizeText("she said &quot;hi&quot;")).toBe('she said "hi"');
  });

  it("strips control characters", () => {
    expect(sanitizeText("hello\x00\x01\x02world")).toBe("helloworld");
  });

  it("returns empty string for non-strings", () => {
    expect(sanitizeText(null)).toBe("");
    expect(sanitizeText(undefined)).toBe("");
    expect(sanitizeText(42)).toBe("");
  });

  it("trims whitespace", () => {
    expect(sanitizeText("  hello  ")).toBe("hello");
  });
});

describe("sanitizeUrl", () => {
  it("allows http URLs", () => {
    expect(sanitizeUrl("http://example.com")).toBe("http://example.com/");
  });

  it("allows https URLs", () => {
    expect(sanitizeUrl("https://example.com/path?q=1")).toBe(
      "https://example.com/path?q=1",
    );
  });

  it("rejects javascript: URLs", () => {
    expect(sanitizeUrl("javascript:alert(1)")).toBe("");
  });

  it("rejects data: URLs", () => {
    expect(sanitizeUrl("data:text/html,<h1>XSS</h1>")).toBe("");
  });

  it("returns empty for invalid URLs", () => {
    expect(sanitizeUrl("not a url")).toBe("");
  });

  it("returns empty for non-strings", () => {
    expect(sanitizeUrl(null)).toBe("");
    expect(sanitizeUrl(undefined)).toBe("");
  });
});

describe("sanitizeItem", () => {
  it("sanitizes text fields", () => {
    const item = sanitizeItem({
      title: "<b>Breaking</b> News",
      url: "https://example.com/article",
      score: 42,
    });
    expect(item.title).toBe("Breaking News");
    expect(item.url).toBe("https://example.com/article");
    expect(item.score).toBe(42);
  });

  it("sanitizes URL fields", () => {
    const item = sanitizeItem({
      url: "javascript:alert(1)",
      permalink: "https://reddit.com/r/test",
    });
    expect(item.url).toBe("");
    expect(item.permalink).toBe("https://reddit.com/r/test");
  });

  it("sanitizes string arrays", () => {
    const item = sanitizeItem({
      authors: ["<b>Alice</b>", "Bob & Carol"],
    });
    expect(item.authors).toEqual(["Alice", "Bob & Carol"]);
  });

  it("handles null/undefined", () => {
    expect(sanitizeItem(null)).toBe(null);
    expect(sanitizeItem(undefined)).toBe(undefined);
  });
});

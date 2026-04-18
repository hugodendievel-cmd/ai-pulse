import { describe, expect, it } from "vitest";
import { sanitizeDigest } from "../apis/utils/sanitize.mjs";

describe("sanitizeDigest", () => {
  it("strips <script> tags from tldr", () => {
    const result = sanitizeDigest({
      tldr: "<script>alert(1)</script>Weekly summary",
    });
    expect(result.tldr).toBe("alert(1)Weekly summary");
  });

  it("strips <script> tags from highlights[0].body", () => {
    const result = sanitizeDigest({
      highlights: [
        {
          title: "T",
          body: "<script>alert(1)</script>Content",
          category: "research",
          impact: "high",
          url: "",
        },
      ],
    });
    expect(result.highlights[0].body).toBe("alert(1)Content");
  });

  it("rejects javascript: URL in highlights[0].url", () => {
    const result = sanitizeDigest({
      highlights: [
        {
          title: "T",
          body: "B",
          category: "research",
          impact: "high",
          url: "javascript:alert(1)",
        },
      ],
    });
    expect(result.highlights[0].url).toBe("");
  });

  it("preserves valid https URL in modelUpdates[0].url", () => {
    const result = sanitizeDigest({
      modelUpdates: [
        {
          name: "GPT-X",
          org: "OpenAI",
          summary: "Released",
          url: "https://openai.com/blog/gptx",
        },
      ],
    });
    expect(result.modelUpdates[0].url).toBe("https://openai.com/blog/gptx");
  });

  it("decodes HTML entities in communityBuzz strings", () => {
    const result = sanitizeDigest({
      communityBuzz: ["Llama &amp; friends", "&lt;script&gt; fears"],
    });
    expect(result.communityBuzz[0]).toBe("Llama & friends");
    expect(result.communityBuzz[1]).toBe("<script> fears");
  });

  it("leaves normal prose text unchanged", () => {
    const input = {
      tldr: "A big week for open-source LLMs.",
      lookAhead: "Watch for GPT-5 announcements next week.",
    };
    const result = sanitizeDigest(input);
    expect(result.tldr).toBe(input.tldr);
    expect(result.lookAhead).toBe(input.lookAhead);
  });

  it("does not throw when optional arrays are absent", () => {
    expect(() => sanitizeDigest({ tldr: "Summary only" })).not.toThrow();
    expect(() => sanitizeDigest({})).not.toThrow();
    expect(() => sanitizeDigest(null)).not.toThrow();
  });

  it("passes unknown top-level fields through unchanged", () => {
    const result = sanitizeDigest({
      tldr: "T",
      futureField: "untouched",
      nested: { x: 1 },
    });
    expect(result.futureField).toBe("untouched");
    expect(result.nested).toEqual({ x: 1 });
  });
});

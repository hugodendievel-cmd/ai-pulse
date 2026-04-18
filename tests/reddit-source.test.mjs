import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("apis/sources/reddit.mjs", () => {
  let fetchSpy;
  const originalClientId = process.env.REDDIT_CLIENT_ID;
  const originalClientSecret = process.env.REDDIT_CLIENT_SECRET;

  beforeEach(() => {
    // Mock the global fetch (used for OAuth token request)
    fetchSpy = vi.spyOn(globalThis, "fetch");
    vi.resetModules();
    // Reset env credentials before each test
    delete process.env.REDDIT_CLIENT_ID;
    delete process.env.REDDIT_CLIENT_SECRET;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("../apis/utils/fetch.mjs");
    // Restore original env
    if (originalClientId === undefined) {
      delete process.env.REDDIT_CLIENT_ID;
    } else {
      process.env.REDDIT_CLIENT_ID = originalClientId;
    }
    if (originalClientSecret === undefined) {
      delete process.env.REDDIT_CLIENT_SECRET;
    } else {
      process.env.REDDIT_CLIENT_SECRET = originalClientSecret;
    }
  });

  it("credentials unset → fetches public JSON endpoint, never calls OAuth", async () => {
    const safeFetchMock = vi
      .fn()
      .mockResolvedValue({ data: { children: [] } });
    vi.doMock("../apis/utils/fetch.mjs", () => ({
      safeFetch: safeFetchMock,
    }));

    const { briefing } = await import("../apis/sources/reddit.mjs");
    const result = await briefing();

    // OAuth token endpoint should NOT have been called
    expect(fetchSpy).not.toHaveBeenCalled();

    // All calls should use the public www.reddit.com URL pattern
    expect(safeFetchMock).toHaveBeenCalled();
    for (const call of safeFetchMock.mock.calls) {
      expect(call[0]).toMatch(/^https:\/\/www\.reddit\.com/);
      expect(call[0]).not.toMatch(/oauth\.reddit\.com/);
    }

    // briefing() still returns a normal shape
    expect(result).toBeDefined();
    expect(result.source).toBe("Reddit");
  });

  it("credentials set → calls OAuth token endpoint first, then uses oauth.reddit.com", async () => {
    process.env.REDDIT_CLIENT_ID = "test-id";
    process.env.REDDIT_CLIENT_SECRET = "test-secret";

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "tok-abc", expires_in: 3600 }),
    });

    const safeFetchMock = vi
      .fn()
      .mockResolvedValue({ data: { children: [] } });
    vi.doMock("../apis/utils/fetch.mjs", () => ({
      safeFetch: safeFetchMock,
    }));

    const { briefing } = await import("../apis/sources/reddit.mjs");
    await briefing();

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(fetchSpy.mock.calls[0][0]).toBe(
      "https://www.reddit.com/api/v1/access_token",
    );

    expect(safeFetchMock).toHaveBeenCalled();
    for (const call of safeFetchMock.mock.calls) {
      expect(call[0]).toMatch(/^https:\/\/oauth\.reddit\.com/);
    }
  });

  it("after successful OAuth, second briefing() reuses cached token", async () => {
    process.env.REDDIT_CLIENT_ID = "test-id";
    process.env.REDDIT_CLIENT_SECRET = "test-secret";

    // Only one token response — if a second fetch() call happens, the test fails
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "tok-abc", expires_in: 3600 }),
    });

    const safeFetchMock = vi
      .fn()
      .mockResolvedValue({ data: { children: [] } });
    vi.doMock("../apis/utils/fetch.mjs", () => ({
      safeFetch: safeFetchMock,
    }));

    const { briefing } = await import("../apis/sources/reddit.mjs");
    await briefing();
    await briefing();

    // fetch (OAuth) called exactly once; second call used the cache
    expect(fetchSpy).toHaveBeenCalledOnce();

    // Both sets of safeFetch calls carry the same Authorization header
    for (const call of safeFetchMock.mock.calls) {
      expect(call[1].headers.Authorization).toBe("Bearer tok-abc");
    }
  });

  it("expired token → next briefing() acquires a new token", async () => {
    process.env.REDDIT_CLIENT_ID = "test-id";
    process.env.REDDIT_CLIENT_SECRET = "test-secret";

    // Token expires in 61 seconds → expiresAt = Date.now() + (61 - 60) * 1000 = Date.now() + 1000
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "tok-first", expires_in: 61 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "tok-second", expires_in: 3600 }),
      });

    const safeFetchMock = vi
      .fn()
      .mockResolvedValue({ data: { children: [] } });
    vi.doMock("../apis/utils/fetch.mjs", () => ({
      safeFetch: safeFetchMock,
    }));

    vi.useFakeTimers();
    try {
      const { briefing } = await import("../apis/sources/reddit.mjs");

      await briefing(); // acquires tok-first
      vi.advanceTimersByTime(2000); // advance 2 s past the 1 s TTL
      await briefing(); // cache expired → acquires tok-second

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("credential rotation → second briefing() discards cache and fetches new token", async () => {
    process.env.REDDIT_CLIENT_ID = "id-a";
    process.env.REDDIT_CLIENT_SECRET = "sec-a";

    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "tok-a", expires_in: 3600 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "tok-b", expires_in: 3600 }),
      });

    const safeFetchMock = vi
      .fn()
      .mockResolvedValue({ data: { children: [] } });
    vi.doMock("../apis/utils/fetch.mjs", () => ({
      safeFetch: safeFetchMock,
    }));

    const { briefing } = await import("../apis/sources/reddit.mjs");

    await briefing(); // acquires tok-a

    // Rotate credentials
    process.env.REDDIT_CLIENT_ID = "id-b";
    process.env.REDDIT_CLIENT_SECRET = "sec-b";

    await briefing(); // cache mismatch → acquires tok-b

    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // Second OAuth call must encode the new credentials
    const secondCallAuthHeader = fetchSpy.mock.calls[1][1].headers.Authorization;
    const expectedB64 = Buffer.from("id-b:sec-b").toString("base64");
    expect(secondCallAuthHeader).toBe(`Basic ${expectedB64}`);
  });

  it("OAuth failure → falls back to public JSON, logs pino.warn, briefing() resolves", async () => {
    process.env.REDDIT_CLIENT_ID = "test-id";
    process.env.REDDIT_CLIENT_SECRET = "test-secret";

    // OAuth request returns 401
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 401 });

    const safeFetchMock = vi
      .fn()
      .mockResolvedValue({ data: { children: [] } });
    vi.doMock("../apis/utils/fetch.mjs", () => ({
      safeFetch: safeFetchMock,
    }));

    // Spy on pino warn — import logger before the module-under-test
    const logMod = await import("../lib/logger.mjs");
    const warnSpy = vi
      .spyOn(logMod.default, "warn")
      .mockImplementation(() => {});
    const errorSpy = vi
      .spyOn(logMod.default, "error")
      .mockImplementation(() => {});

    const { briefing } = await import("../apis/sources/reddit.mjs");
    const result = await briefing();

    // briefing() must resolve
    expect(result).toBeDefined();
    expect(result.source).toBe("Reddit");

    // safeFetch must have used public URL
    for (const call of safeFetchMock.mock.calls) {
      expect(call[0]).toMatch(/^https:\/\/www\.reddit\.com/);
    }

    // pino.warn must have been called — not error
    expect(warnSpy).toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

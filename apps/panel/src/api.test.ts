import { afterEach, describe, expect, it, vi } from "vitest";
import { age, api, ApiError, duration, privateAudioUrl } from "./api";
afterEach(() => vi.unstubAllGlobals());
describe("private authenticated requests", () => {
  it("always uses same-origin cookies and avoids caches", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ operator: { id: "one" } })),
      );
    vi.stubGlobal("fetch", fetch);
    await api("/auth/me");
    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/me",
      expect.objectContaining({
        credentials: "same-origin",
        cache: "no-store",
      }),
    );
  });
  it("preserves revision conflicts for the caller to refresh", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Conflito de revisão" }), {
          status: 409,
        }),
      ),
    );
    await expect(api("/incidents/id/claim")).rejects.toEqual(
      new ApiError(409, "Conflito de revisão"),
    );
  });
  it("restricts audio to private same-origin endpoints", () => {
    vi.stubGlobal("window", {
      location: { origin: "https://central.example" },
    });
    expect(privateAudioUrl("/api/audio/one/content")).toBe(
      "/api/audio/one/content",
    );
    for (const url of [
      "https://other.example/api/audio/one/content",
      "//other.example/api/audio/one/content",
      "/public/one.aac",
      "/api/audio/one/content?token=secret",
      "/api/audio/one/content#data",
    ])
      expect(() => privateAudioUrl(url)).toThrow();
  });
});
describe("signal age", () => {
  it("does not report future timestamps as negative and preserves missing signals", () => {
    expect(age(null)).toBe(null);
    expect(
      age("2026-10-18T12:00:05Z", Date.parse("2026-10-18T12:00:00Z")),
    ).toBe(0);
    expect(duration(65)).toBe("1 min");
    expect(duration(null)).toBe("Sem sinal");
  });
});

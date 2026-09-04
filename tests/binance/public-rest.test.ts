import { describe, expect, it } from "vitest";
import { binancePublicGet } from "@/adapters/binance/public-rest";

describe("public REST allowlist", () => {
  it("rejects caller-supplied write or unknown paths", async () => {
    await expect(binancePublicGet("/api/v3/order")).rejects.toThrow(/允许列表/);
    await expect(binancePublicGet("/sapi/v1/asset/transfer")).rejects.toThrow(
      /允许列表/,
    );
  });

  it("falls back to the official market-data host after a geo block", async () => {
    const original = globalThis.fetch;
    const urls: string[] = [];
    globalThis.fetch = async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("api.binance.com"))
        return new Response("Restricted access", { status: 451 });
      return new Response(JSON.stringify([[1, "81000"]]), { status: 200 });
    };
    try {
      const data = await binancePublicGet("/api/v3/klines", {
        symbol: "BTCUSDT",
        interval: "1h",
        limit: 2,
      });
      expect(data).toEqual([[1, "81000"]]);
      expect(urls[0]).toContain("https://api.binance.com/api/v3/klines");
      expect(urls[1]).toContain("https://data-api.binance.vision/api/v3/klines");
    } finally {
      globalThis.fetch = original;
    }
  });
});

import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { binancePublicGet } from "@/adapters/binance/public-rest";
import { fetchByCapability } from "@/adapters/binance/source-router";

beforeAll(() =>
  Object.assign(process.env, {
    APP_SECRET: "1".repeat(64),
    APP_ORIGIN: "http://localhost:3000",
    MONGODB_URI: "mongodb://localhost:27017",
    REDIS_URL: "redis://localhost:6379",
    APP_ENV: "test",
    MONGODB_DB: "binance_agent_os_dev",
  }),
);

describe("binance source routing", () => {
  it("refuses private or withdraw paths on the public REST client", async () => {
    await expect(binancePublicGet("/sapi/v1/capital/withdraw/apply")).rejects.toThrow(
      /允许列表/,
    );
    await expect(binancePublicGet("/api/v3/account")).rejects.toThrow(/允许列表/);
  });
  it("labels candle and depth reads as public REST, not MCP", async () => {
    const original = globalThis.fetch;
    const urls: string[] = [];
    globalThis.fetch = async (input) => {
      urls.push(String(input));
      return new Response(JSON.stringify([]), { status: 200 });
    };
    try {
      const candles = await fetchByCapability("user-1", "candles", {
        symbol: "BTCUSDT",
        interval: "1d",
      });
      const depth = await fetchByCapability("user-1", "depth", {
        symbol: "BTCUSDT",
      });
      expect(candles.source).toBe("binance_public_rest");
      expect(depth.source).toBe("binance_public_rest");
      expect(urls.some((url) => url.includes("/api/v3/klines"))).toBe(true);
      expect(urls.some((url) => url.includes("/api/v3/depth"))).toBe(true);
      expect(urls.join()).not.toContain("mcp");
    } finally {
      globalThis.fetch = original;
    }
  });
  it("does not unwrap Binance secrets in the Next.js app", () => {
    const client = readFileSync(
      new URL("../../src/adapters/binance/executor-client.ts", import.meta.url),
      "utf8",
    );
    expect(client).toContain("envelope");
    expect(client).not.toContain("unwrapCredential");
    expect(client).not.toContain("apiSecret");
  });
});

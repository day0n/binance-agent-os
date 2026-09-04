import { describe, expect, it } from "vitest";
import { binancePublicGet } from "@/adapters/binance/public-rest";

describe("public REST allowlist", () => {
  it("rejects caller-supplied write or unknown paths", async () => {
    await expect(binancePublicGet("/api/v3/order")).rejects.toThrow(/允许列表/);
    await expect(binancePublicGet("/sapi/v1/asset/transfer")).rejects.toThrow(
      /允许列表/,
    );
  });
});

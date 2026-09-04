import { describe, expect, it } from "vitest";
import { signQuery } from "./signer";

describe("binance signer", () => {
  it("appends hmac hex without logging the secret", () => {
    const query = new URLSearchParams({ symbol: "BTCUSDT", timestamp: "1" });
    const signed = signQuery(query, "test-secret");
    expect(signed.get("signature")).toMatch(/^[a-f0-9]{64}$/);
    expect(signed.toString()).not.toContain("test-secret");
  });
});

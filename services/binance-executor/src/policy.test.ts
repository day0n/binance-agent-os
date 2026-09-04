import { describe, expect, it } from "vitest";
import {
  allowedEndpoint,
  assertActionLimits,
  redact,
} from "./policy";

describe("executor policy", () => {
  it("allows only the documented Binance endpoints", () => {
    expect(allowedEndpoint("POST", "/api/v3/order")).toBe(true);
    expect(allowedEndpoint("DELETE", "/api/v3/order")).toBe(true);
    expect(allowedEndpoint("POST", "/sapi/v1/asset/transfer")).toBe(true);
    expect(allowedEndpoint("POST", "/sapi/v1/capital/withdraw/apply")).toBe(false);
    expect(allowedEndpoint("POST", "/fapi/v1/order")).toBe(false);
    expect(allowedEndpoint("GET", "/api/v3/klines")).toBe(true);
  });
  it("enforces the 5 USDT hard cap", () => {
    expect(assertActionLimits("spot.marketOrder", "5", 5)).toBe("5.00000000");
    expect(() => assertActionLimits("spot.marketOrder", "5.01", 5)).toThrow();
    expect(assertActionLimits("spot.cancelOrder", "100", 5)).toBe("0");
  });
  it("redacts secrets from logs", () => {
    const text = redact({
      password: "super-secret-password",
      signature: "abc123",
      cookie: "bao_auth=token",
    });
    expect(text).not.toContain("super-secret-password");
    expect(text).not.toContain("abc123");
    expect(text).toContain("[redacted]");
  });
});

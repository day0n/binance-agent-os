import { beforeAll, describe, expect, it } from "vitest";
import { requireSameOrigin } from "@/adapters/http/session";
import { AUTH_COOKIE, AUTH_SESSION_MS, LOGIN_RATE, REGISTER_RATE } from "@/domain/auth";
import { AppError } from "@/domain/errors";

beforeAll(() =>
  Object.assign(process.env, {
    APP_SECRET: "1".repeat(64),
    AUTH_PEPPER: "pepper-test-value-not-for-production-use-32",
    APP_ORIGIN: "http://localhost:3000",
    MONGODB_URI: "mongodb://localhost:27017",
    REDIS_URL: "redis://localhost:6379",
    APP_ENV: "test",
    MONGODB_DB: "binance_agent_os_dev",
  }),
);

describe("origin and session cookie policy", () => {
  it("rejects a mismatched Origin on write helpers", () => {
    expect(() =>
      requireSameOrigin(
        new Request("http://localhost:3000/api/chat/messages", {
          headers: { origin: "https://evil.example" },
        }),
      ),
    ).toThrow(AppError);
    expect(() =>
      requireSameOrigin(
        new Request("http://localhost:3000/api/chat/messages", {
          headers: { origin: "http://localhost:3000" },
        }),
      ),
    ).not.toThrow();
  });
  it("keeps the opaque cookie name, 7-day lifetime, and auth rate limits", () => {
    expect(AUTH_COOKIE).toBe("bao_auth");
    expect(AUTH_SESSION_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(REGISTER_RATE).toEqual({ limit: 5, seconds: 3600 });
    expect(LOGIN_RATE).toEqual({ limit: 10, seconds: 900 });
  });
});

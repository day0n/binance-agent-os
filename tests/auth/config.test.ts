import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  config,
  HARD_ACTION_DAILY_MAX_USDT,
  HARD_ACTION_MAX_USDT,
} from "@/platform/config";

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

afterEach(() => {
  delete process.env.BINANCE_WRITES_ENABLED;
  delete process.env.BINANCE_PRODUCTION_WRITES_ENABLED;
  delete process.env.ACTION_MAX_USDT;
  delete process.env.ACTION_DAILY_MAX_USDT;
});

describe("action cap configuration", () => {
  it("defaults write switches off and cannot raise hard caps", () => {
    delete process.env.BINANCE_WRITES_ENABLED;
    delete process.env.BINANCE_PRODUCTION_WRITES_ENABLED;
    delete process.env.ACTION_MAX_USDT;
    delete process.env.ACTION_DAILY_MAX_USDT;
    const c = config();
    expect(c.BINANCE_WRITES_ENABLED).toBe(false);
    expect(c.BINANCE_PRODUCTION_WRITES_ENABLED).toBe(false);
    expect(HARD_ACTION_MAX_USDT).toBe(5);
    expect(HARD_ACTION_DAILY_MAX_USDT).toBe(20);
    expect(c.ACTION_MAX_USDT).toBe(5);
    expect(c.ACTION_DAILY_MAX_USDT).toBe(20);
  });
  it("allows lowering but rejects raising the 5/20 USDT caps", () => {
    process.env.ACTION_MAX_USDT = "1";
    process.env.ACTION_DAILY_MAX_USDT = "4";
    expect(config().ACTION_MAX_USDT).toBe(1);
    expect(config().ACTION_DAILY_MAX_USDT).toBe(4);
    process.env.ACTION_MAX_USDT = "6";
    expect(() => config()).toThrow();
    process.env.ACTION_MAX_USDT = "1";
    process.env.ACTION_DAILY_MAX_USDT = "21";
    expect(() => config()).toThrow();
    delete process.env.ACTION_MAX_USDT;
    delete process.env.ACTION_DAILY_MAX_USDT;
  });
});

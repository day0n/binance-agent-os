import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  encrypt,
  decrypt,
  signSession,
  verifySession,
  sha256,
} from "@/platform/crypto";
import { config } from "@/platform/config";
import { publicError } from "@/domain/errors";
import {
  parseBindings,
  validateBinding,
  mappedArguments,
  atPath,
} from "@/adapters/binance/policy";
import { eventsAfter, type RunRecord } from "@/adapters/persistence/store";

beforeAll(() => {
  Object.assign(process.env, {
    APP_SECRET: "1".repeat(64),
    APP_ORIGIN: "http://localhost:3000",
    MONGODB_URI: "mongodb://localhost:27017",
    REDIS_URL: "redis://localhost:6379",
    APP_ENV: "test",
    MONGODB_DB: "binance_agent_os_dev",
  });
});
describe("credential and owner boundary", () => {
  it("encrypts with random IVs and rejects tampering", () => {
    const a = encrypt({ access_token: "test-fixture-not-a-real-token" });
    const b = encrypt({ access_token: "test-fixture-not-a-real-token" });
    expect(a).not.toEqual(b);
    expect(a).not.toContain("test-fixture");
    expect(decrypt(a)).toEqual({
      access_token: "test-fixture-not-a-real-token",
    });
    expect(() => decrypt(`AAAA.${a.split(".").slice(1).join(".")}`)).toThrow();
  });
  it("rejects modified, expired and malformed owner cookies", () => {
    const id = randomUUID();
    const token = signSession(id, Date.now() + 60000);
    expect(verifySession(token)).toBe(id);
    expect(verifySession(token.replace(id, randomUUID()))).toBeNull();
    expect(verifySession(signSession(id, Date.now() - 1))).toBeNull();
    expect(verifySession("abc")).toBeNull();
  });
  it("redacts unknown SDK failures", () => {
    const safe = publicError(
      new Error("secret://user:password@host TOKEN=private"),
    );
    expect(JSON.stringify(safe)).not.toContain("password");
    expect(safe.code).toBe("INTERNAL_ERROR");
  });
  it("refuses the reference project's database", () => {
    const previous = process.env.MONGODB_DB;
    process.env.MONGODB_DB = "lumen_agent";
    expect(() => config()).toThrow();
    process.env.MONGODB_DB = previous;
  });
  it("prefers the isolated marketplace Redis connection", () => {
    const previous = process.env.BAO_REDIS_URL;
    process.env.BAO_REDIS_URL = "rediss://isolated.example.test:6380";
    expect(config().REDIS_URL).toBe("rediss://isolated.example.test:6380");
    if (previous) process.env.BAO_REDIS_URL = previous;
    else delete process.env.BAO_REDIS_URL;
  });
});
describe("MCP fail-closed policy", () => {
  const schema = { type: "object", properties: { symbol: { type: "string" } } };
  const binding = {
    name: "read_candles",
    schemaHash: sha256(schema),
    argumentMap: { symbol: "symbol" },
    fixedArguments: {},
    resultPath: "data",
  };
  it("does not invent bindings for unknown capabilities", () => {
    expect(parseBindings("{}")).toEqual({});
    expect(() => parseBindings('{"withdraw":{"name":"withdraw"}}')).toThrow();
  });
  it("requires an exact approved name and schema fingerprint", () => {
    expect(() =>
      validateBinding(binding, { name: "read_candles", inputSchema: schema }),
    ).not.toThrow();
    expect(() =>
      validateBinding(binding, {
        name: "read_candles",
        inputSchema: { ...schema, description: "changed" },
      }),
    ).toThrow();
    expect(() =>
      validateBinding(
        { ...binding, name: "create_order" },
        { name: "create_order", inputSchema: schema },
      ),
    ).toThrow();
  });
  it("does not pass caller-supplied arbitrary action parameters", () => {
    expect(
      mappedArguments(binding, {
        symbol: "BTCUSDT",
        action: "buy",
        amount: "100000",
      }),
    ).toEqual({ symbol: "BTCUSDT" });
  });
  it("rejects write methods even in a generic approved binding", () => {
    expect(() =>
      validateBinding(
        { ...binding, fixedArguments: { method: "POST" } },
        { name: binding.name, inputSchema: schema },
      ),
    ).toThrow();
  });
  it("extracts only the configured result shape", () => {
    expect(atPath({ data: [1, 2] }, "data")).toEqual([1, 2]);
    expect(() => atPath({}, "missing")).toThrow();
    expect(() => atPath({}, "__proto__")).toThrow();
  });
});
describe("event replay", () => {
  it("returns ordered events after the cursor without internal keys", () => {
    const run = {
      events: ["a", "b", "c"].map((key) => ({
        key,
        runId: "r",
        at: "2025-01-01",
        type: "run.started",
        message: key,
      })),
    } as RunRecord;
    const result = eventsAfter(run, 1);
    expect(result.map((e) => e.id)).toEqual(["2", "3"]);
    expect(result[0]).not.toHaveProperty("key");
    expect(eventsAfter(run, 3)).toEqual([]);
  });
});

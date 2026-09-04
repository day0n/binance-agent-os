import { beforeAll, describe, expect, it } from "vitest";
import {
  assertUsername,
  canonicalizeUsername,
  isLoginLocked,
  isPasswordLengthValid,
  LOGIN_LOCK_AFTER,
  passwordByteLength,
} from "@/domain/auth";
import {
  assertPasswordPolicy,
  hashPassword,
  SCRYPT_PARAMS,
  verifyPassword,
} from "@/application/auth/password";
import { constantTimeEqual, hashToken, randomToken } from "@/platform/crypto";

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

const pepper = "pepper-test-value-not-for-production-use-32";

describe("username and password rules", () => {
  it("canonicalizes and rejects invalid usernames", () => {
    expect(canonicalizeUsername("Alice_01")).toBe("alice_01");
    expect(assertUsername("Alice_01").usernameCanonical).toBe("alice_01");
    expect(() => assertUsername("ab")).toThrow();
    expect(() => assertUsername("Bad Name")).toThrow();
    expect(() => assertUsername("has.dot")).toThrow();
    expect(() => assertUsername("-leading")).toThrow();
  });
  it("measures UTF-8 bytes without normalizing unicode", () => {
    const composed = "e" + "\u0301".repeat(11);
    expect(passwordByteLength(composed)).toBe(1 + 22);
    expect(isPasswordLengthValid("short")).toBe(false);
    expect(isPasswordLengthValid("twelvechars!")).toBe(true);
    expect(isPasswordLengthValid("x".repeat(129))).toBe(false);
    expect(() => assertPasswordPolicy("tooshort")).toThrow();
  });
  it("locks after ten failures", () => {
    expect(LOGIN_LOCK_AFTER).toBe(10);
    expect(
      isLoginLocked({ lockedUntil: new Date(Date.now() + 60_000) }),
    ).toBe(true);
    expect(
      isLoginLocked({ lockedUntil: new Date(Date.now() - 1) }),
    ).toBe(false);
  });
});

describe("scrypt password hashing", () => {
  it("uses independent salts and constant-time verify", async () => {
    expect(SCRYPT_PARAMS).toEqual({
      N: 32768,
      r: 8,
      p: 1,
      keylen: 64,
      saltBytes: 16,
    });
    const password = "correct-horse-battery";
    const a = await hashPassword(password, pepper);
    const b = await hashPassword(password, pepper);
    expect(a.passwordSalt).not.toEqual(b.passwordSalt);
    expect(a.passwordHash).not.toEqual(b.passwordHash);
    expect(await verifyPassword(password, a.passwordHash, a.passwordSalt, pepper)).toBe(
      true,
    );
    expect(
      await verifyPassword("wrong-password-xx", a.passwordHash, a.passwordSalt, pepper),
    ).toBe(false);
    expect(
      await verifyPassword(password, a.passwordHash, a.passwordSalt, "other-pepper-value-32-bytes-long!!"),
    ).toBe(false);
  });
});

describe("opaque session tokens", () => {
  it("hashes tokens and compares in constant time", () => {
    const token = randomToken(32);
    expect(token).not.toContain(".");
    expect(hashToken(token)).toHaveLength(64);
    expect(hashToken(token)).toEqual(hashToken(token));
    expect(constantTimeEqual("abcd", "abcd")).toBe(true);
    expect(constantTimeEqual("abcd", "abce")).toBe(false);
    expect(constantTimeEqual("abcd", "abc")).toBe(false);
  });
});

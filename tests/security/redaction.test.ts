import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { publicError } from "@/domain/errors";
import { toPublicUser, type User } from "@/domain/auth";

describe("secret redaction", () => {
  it("never returns password hashes on the public user object", () => {
    const user: User = {
      id: "u1",
      usernameCanonical: "alice",
      usernameDisplay: "Alice",
      passwordHash: "HASH-MUST-NOT-LEAK",
      passwordSalt: "SALT-MUST-NOT-LEAK",
      passwordVersion: 1,
      status: "active",
      failedLoginCount: 0,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
    expect(JSON.stringify(toPublicUser(user))).not.toContain("HASH");
    expect(JSON.stringify(toPublicUser(user))).not.toContain("SALT");
  });
  it("keeps a structured redaction helper in the executor", () => {
    const policy = readFileSync(
      new URL(
        "../../services/binance-executor/src/policy.ts",
        import.meta.url,
      ),
      "utf8",
    );
    expect(policy).toContain("function redact");
    expect(policy).toMatch(/api[_-]?secret|password|signature|cookie/);
  });
  it("does not echo raw SDK secrets through publicError", () => {
    const safe = publicError(new Error("authorization=Bearer secret-token"));
    expect(JSON.stringify(safe)).not.toContain("secret-token");
  });
  it("keeps withdraw and futures paths out of the executor allowlist", () => {
    const policy = readFileSync(
      new URL(
        "../../services/binance-executor/src/policy.ts",
        import.meta.url,
      ),
      "utf8",
    );
    expect(policy).not.toContain("withdraw");
    expect(policy).not.toContain("/fapi/");
    expect(policy).not.toContain("/dapi/");
  });
});

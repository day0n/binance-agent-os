import assert from "node:assert/strict";
import { USERNAME_PATTERN, PASSWORD_MIN_BYTES, PASSWORD_MAX_BYTES } from "../src/domain/auth";
import { SCRYPT_PARAMS } from "../src/application/auth/password";

assert.equal(USERNAME_PATTERN.source, "^[a-z0-9_][a-z0-9_-]{2,31}$");
assert.equal(PASSWORD_MIN_BYTES, 12);
assert.equal(PASSWORD_MAX_BYTES, 128);
assert.deepEqual(SCRYPT_PARAMS, {
  N: 32768,
  r: 8,
  p: 1,
  keylen: 64,
  saltBytes: 16,
});
console.log(JSON.stringify({ ok: true, check: "auth-config" }));

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { AppError } from "@/domain/errors";
import { isPasswordLengthValid } from "@/domain/auth";

function scryptHash(password: Buffer, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password,
      salt,
      SCRYPT_PARAMS.keylen,
      {
        N: SCRYPT_PARAMS.N,
        r: SCRYPT_PARAMS.r,
        p: SCRYPT_PARAMS.p,
        maxmem: 64 * 1024 * 1024,
      },
      (error, derived) => {
        if (error) reject(error);
        else resolve(derived);
      },
    );
  });
}

export const SCRYPT_PARAMS = {
  N: 32768,
  r: 8,
  p: 1,
  keylen: 64,
  saltBytes: 16,
} as const;

function passwordBuffer(password: string, pepper: string) {
  return Buffer.concat([
    Buffer.from(password, "utf8"),
    Buffer.from(pepper, "utf8"),
  ]);
}

export function assertPasswordPolicy(password: string) {
  if (!isPasswordLengthValid(password))
    throw new AppError(
      "PASSWORD_INVALID",
      "密码长度须为 12 至 128 个 UTF-8 字节。",
      422,
    );
}

export async function hashPassword(password: string, pepper: string) {
  assertPasswordPolicy(password);
  const salt = randomBytes(SCRYPT_PARAMS.saltBytes);
  const derived = await scryptHash(passwordBuffer(password, pepper), salt);
  return {
    passwordHash: derived.toString("base64"),
    passwordSalt: salt.toString("base64"),
    passwordVersion: 1 as const,
  };
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
  passwordSalt: string,
  pepper: string,
) {
  if (!isPasswordLengthValid(password)) return false;
  const salt = Buffer.from(passwordSalt, "base64");
  const expected = Buffer.from(passwordHash, "base64");
  if (salt.length !== SCRYPT_PARAMS.saltBytes || expected.length !== SCRYPT_PARAMS.keylen)
    return false;
  const derived = await scryptHash(passwordBuffer(password, pepper), salt);
  return (
    derived.length === expected.length && timingSafeEqual(derived, expected)
  );
}

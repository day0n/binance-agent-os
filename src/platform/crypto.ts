import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { config } from "./config";
import { AppError } from "@/domain/errors";

export const sha256 = (value: unknown) =>
  createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function constantTimeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function deriveCsrfToken(sessionToken: string) {
  return createHmac("sha256", config().AUTH_PEPPER)
    .update(sessionToken)
    .digest("base64url");
}

function key() {
  return createHash("sha256").update(config().APP_SECRET).digest();
}

export function encrypt(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value)),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), data]
    .map((b) => b.toString("base64url"))
    .join(".");
}

export function decrypt<T>(value: string): T {
  try {
    const [iv, tag, data] = value
      .split(".")
      .map((x) => Buffer.from(x, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    return JSON.parse(
      Buffer.concat([decipher.update(data), decipher.final()]).toString(),
    ) as T;
  } catch {
    throw new AppError(
      "CONNECTION_INVALID",
      "连接凭据已失效，请重新授权。",
      401,
    );
  }
}

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
export function signSession(ownerId: string, expires: number) {
  const payload = `${ownerId}.${expires}`;
  return `${payload}.${createHmac("sha256", key()).update(payload).digest("base64url")}`;
}
export function verifySession(value: string): string | null {
  const [id, expiry, mac, extra] = value.split(".");
  if (
    extra ||
    !id ||
    !/^[0-9a-f-]{36}$/.test(id) ||
    !Number.isSafeInteger(Number(expiry)) ||
    Number(expiry) <= Date.now()
  )
    return null;
  const expected = signSession(id, Number(expiry)).split(".")[2];
  const a = Buffer.from(mac ?? "");
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}

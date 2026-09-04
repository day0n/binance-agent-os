import { AppError } from "./errors";

export const USERNAME_PATTERN = /^[a-z0-9_][a-z0-9_-]{2,31}$/;
export const PASSWORD_MIN_BYTES = 12;
export const PASSWORD_MAX_BYTES = 128;
export const AUTH_COOKIE = "bao_auth";
export const AUTH_SESSION_MS = 7 * 24 * 60 * 60 * 1000;
export const LOGIN_LOCK_AFTER = 10;
export const LOGIN_LOCK_MS = 15 * 60 * 1000;
export const REGISTER_RATE = { limit: 5, seconds: 3600 } as const;
export const LOGIN_RATE = { limit: 10, seconds: 900 } as const;
export const PASSWORD_CONFIRM_RATE = { limit: 5, seconds: 600 } as const;

export type UserStatus = "active" | "disabled";

export type User = {
  id: string;
  usernameCanonical: string;
  usernameDisplay: string;
  passwordHash: string;
  passwordSalt: string;
  passwordVersion: 1;
  status: UserStatus;
  failedLoginCount: number;
  lockedUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type PublicUser = {
  id: string;
  username: string;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type AuthSession = {
  id: string;
  userId: string;
  tokenHash: string;
  csrfTokenHash: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
};

export function canonicalizeUsername(input: string) {
  return input.trim().toLowerCase();
}

export function usernameDisplayOf(input: string) {
  return input.trim();
}

export function assertUsername(input: string) {
  const canonical = canonicalizeUsername(input);
  if (!USERNAME_PATTERN.test(canonical))
    throw new AppError(
      "USERNAME_INVALID",
      "用户名须为 3 至 32 位 ASCII：字母、数字、下划线或连字符。",
      422,
    );
  return {
    usernameCanonical: canonical,
    usernameDisplay: usernameDisplayOf(input),
  };
}

export function passwordByteLength(password: string) {
  return Buffer.byteLength(password, "utf8");
}

export function isPasswordLengthValid(password: string) {
  const bytes = passwordByteLength(password);
  return bytes >= PASSWORD_MIN_BYTES && bytes <= PASSWORD_MAX_BYTES;
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    username: user.usernameDisplay,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function isLoginLocked(user: Pick<User, "lockedUntil">, now = new Date()) {
  return Boolean(user.lockedUntil && user.lockedUntil.getTime() > now.getTime());
}

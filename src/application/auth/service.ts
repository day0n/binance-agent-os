import {
  AUTH_SESSION_MS,
  LOGIN_LOCK_AFTER,
  LOGIN_LOCK_MS,
  LOGIN_RATE,
  PASSWORD_CONFIRM_RATE,
  REGISTER_RATE,
  assertUsername,
  isLoginLocked,
  toPublicUser,
  type PublicUser,
} from "@/domain/auth";
import { AppError } from "@/domain/errors";
import { hashPassword, verifyPassword } from "@/application/auth/password";
import {
  createAuthSession,
  findAuthSessionByTokenHash,
  findUserByCanonical,
  findUserById,
  insertUser,
  recordLoginFailure,
  recordLoginSuccess,
  revokeAllAuthSessions,
  revokeAuthSession,
  updatePassword,
  writeAudit,
} from "@/adapters/persistence/auth-store";
import { rateLimit } from "@/adapters/persistence/redis";
import { config } from "@/platform/config";
import { deriveCsrfToken, hashToken, randomToken } from "@/platform/crypto";

const GENERIC_LOGIN = "用户名或密码不正确。";

export type AuthResult = {
  user: PublicUser;
  csrfToken: string;
  sessionToken: string;
  expiresAt: Date;
};

function pepper() {
  return config().AUTH_PEPPER;
}

export async function registerAccount(
  username: string,
  password: string,
  ip: string,
): Promise<AuthResult> {
  const names = assertUsername(username);
  await rateLimit(`register:${ip}`, REGISTER_RATE.limit, REGISTER_RATE.seconds);
  const hashed = await hashPassword(password, pepper());
  const user = await insertUser({
    ...names,
    ...hashed,
    status: "active",
    failedLoginCount: 0,
  });
  await writeAudit({
    userId: user.id,
    action: "auth.register",
    summary: "registered local account",
  });
  return issueSession(user.id);
}

export async function loginAccount(
  username: string,
  password: string,
  ip: string,
): Promise<AuthResult> {
  let names: ReturnType<typeof assertUsername>;
  try {
    names = assertUsername(username);
  } catch {
    throw new AppError("AUTH_FAILED", GENERIC_LOGIN, 401);
  }
  await rateLimit(
    `login:${names.usernameCanonical}:${ip}`,
    LOGIN_RATE.limit,
    LOGIN_RATE.seconds,
  );
  const user = await findUserByCanonical(names.usernameCanonical);
  if (!user || user.status !== "active")
    throw new AppError("AUTH_FAILED", GENERIC_LOGIN, 401);
  if (isLoginLocked(user))
    throw new AppError("AUTH_FAILED", GENERIC_LOGIN, 401);
  const ok = await verifyPassword(
    password,
    user.passwordHash,
    user.passwordSalt,
    pepper(),
  );
  if (!ok) {
    const next = user.failedLoginCount + 1;
    await recordLoginFailure(
      user.id,
      next >= LOGIN_LOCK_AFTER
        ? new Date(Date.now() + LOGIN_LOCK_MS)
        : undefined,
    );
    throw new AppError("AUTH_FAILED", GENERIC_LOGIN, 401);
  }
  await recordLoginSuccess(user.id);
  await writeAudit({
    userId: user.id,
    action: "auth.login",
    summary: "logged in",
  });
  return issueSession(user.id);
}

export async function logoutAccount(sessionId: string, userId: string) {
  await revokeAuthSession(sessionId, userId);
  await writeAudit({
    userId,
    action: "auth.logout",
    summary: "logged out",
  });
}

export async function changeAccountPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
) {
  await rateLimit(
    `password:${userId}`,
    PASSWORD_CONFIRM_RATE.limit,
    PASSWORD_CONFIRM_RATE.seconds,
  );
  const user = await findUserById(userId);
  if (!user || user.status !== "active")
    throw new AppError("AUTH_FAILED", GENERIC_LOGIN, 401);
  const ok = await verifyPassword(
    currentPassword,
    user.passwordHash,
    user.passwordSalt,
    pepper(),
  );
  if (!ok) throw new AppError("AUTH_FAILED", GENERIC_LOGIN, 401);
  const hashed = await hashPassword(newPassword, pepper());
  await updatePassword(userId, hashed);
  await revokeAllAuthSessions(userId);
  await writeAudit({
    userId,
    action: "auth.change_password",
    summary: "changed password and revoked sessions",
  });
}

export async function currentUserFromToken(sessionToken: string) {
  const session = await findAuthSessionByTokenHash(hashToken(sessionToken));
  if (!session) return null;
  const user = await findUserById(session.userId);
  if (!user || user.status !== "active") return null;
  return { user, session, csrfToken: deriveCsrfToken(sessionToken) };
}

async function issueSession(userId: string): Promise<AuthResult> {
  const sessionToken = randomToken(32);
  const csrfToken = deriveCsrfToken(sessionToken);
  const expiresAt = new Date(Date.now() + AUTH_SESSION_MS);
  await createAuthSession({
    userId,
    tokenHash: hashToken(sessionToken),
    csrfTokenHash: hashToken(csrfToken),
    expiresAt,
  });
  const user = await findUserById(userId);
  if (!user) throw new AppError("NOT_FOUND", "账号不存在。", 404);
  return {
    user: toPublicUser(user),
    csrfToken,
    sessionToken,
    expiresAt,
  };
}

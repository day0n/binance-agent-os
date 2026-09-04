import { randomUUID } from "node:crypto";
import type { AuthSession, PublicUser, User } from "@/domain/auth";
import { toPublicUser } from "@/domain/auth";
import { AppError } from "@/domain/errors";
import { database } from "./mongo";

export type UserDocument = Omit<User, "id"> & { _id: string };
export type SessionDocument = Omit<AuthSession, "id"> & { _id: string };

function asUser(doc: UserDocument): User {
  return { ...doc, id: doc._id };
}

function asSession(doc: SessionDocument): AuthSession {
  return { ...doc, id: doc._id };
}

export async function insertUser(user: Omit<User, "id" | "createdAt" | "updatedAt">) {
  const now = new Date();
  const doc: UserDocument = {
    _id: randomUUID(),
    ...user,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await (await database()).collection<UserDocument>("users").insertOne(doc);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: number }).code === 11000
    )
      throw new AppError("USERNAME_TAKEN", "用户名不可用。", 409);
    throw error;
  }
  return asUser(doc);
}

export async function findUserByCanonical(usernameCanonical: string) {
  const doc = await (await database())
    .collection<UserDocument>("users")
    .findOne({ usernameCanonical });
  return doc ? asUser(doc) : null;
}

export async function findUserById(id: string) {
  const doc = await (await database())
    .collection<UserDocument>("users")
    .findOne({ _id: id });
  return doc ? asUser(doc) : null;
}

export async function recordLoginFailure(userId: string, lockedUntil?: Date) {
  await (
    await database()
  )
    .collection<UserDocument>("users")
    .updateOne(
      { _id: userId },
      {
        $inc: { failedLoginCount: 1 },
        $set: {
          updatedAt: new Date(),
          ...(lockedUntil ? { lockedUntil } : {}),
        },
      },
    );
}

export async function recordLoginSuccess(userId: string) {
  await (
    await database()
  )
    .collection<UserDocument>("users")
    .updateOne(
      { _id: userId },
      {
        $set: { failedLoginCount: 0, updatedAt: new Date() },
        $unset: { lockedUntil: "" },
      },
    );
}

export async function updatePassword(
  userId: string,
  password: Pick<User, "passwordHash" | "passwordSalt" | "passwordVersion">,
) {
  const result = await (
    await database()
  )
    .collection<UserDocument>("users")
    .updateOne(
      { _id: userId, status: "active" },
      { $set: { ...password, updatedAt: new Date() } },
    );
  if (!result.matchedCount) throw new AppError("NOT_FOUND", "账号不存在。", 404);
}

export async function createAuthSession(input: {
  userId: string;
  tokenHash: string;
  csrfTokenHash: string;
  expiresAt: Date;
}) {
  const now = new Date();
  const doc: SessionDocument = {
    _id: randomUUID(),
    userId: input.userId,
    tokenHash: input.tokenHash,
    csrfTokenHash: input.csrfTokenHash,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: input.expiresAt,
  };
  await (await database()).collection<SessionDocument>("auth_sessions").insertOne(doc);
  return asSession(doc);
}

export async function findAuthSessionByTokenHash(tokenHash: string) {
  const doc = await (await database())
    .collection<SessionDocument>("auth_sessions")
    .findOne({
      tokenHash,
      revokedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    });
  return doc ? asSession(doc) : null;
}

export async function touchAuthSession(id: string, userId: string) {
  await (
    await database()
  )
    .collection<SessionDocument>("auth_sessions")
    .updateOne({ _id: id, userId }, { $set: { lastSeenAt: new Date() } });
}

export async function revokeAuthSession(id: string, userId: string) {
  await (
    await database()
  )
    .collection<SessionDocument>("auth_sessions")
    .updateOne(
      { _id: id, userId, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    );
}

export async function revokeAllAuthSessions(userId: string) {
  await (
    await database()
  )
    .collection<SessionDocument>("auth_sessions")
    .updateMany(
      { userId, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    );
}

export async function writeAudit(entry: {
  userId?: string;
  action: string;
  summary: string;
  metadata?: Record<string, string>;
}) {
  await (
    await database()
  )
    .collection<{
      _id: string;
      userId?: string;
      action: string;
      summary: string;
      metadata: Record<string, string>;
      createdAt: Date;
    }>("audit_log")
    .insertOne({
      _id: randomUUID(),
      userId: entry.userId,
      action: entry.action,
      summary: entry.summary,
      metadata: entry.metadata ?? {},
      createdAt: new Date(),
    });
}

export function publicUserJson(user: User): PublicUser {
  return toPublicUser(user);
}

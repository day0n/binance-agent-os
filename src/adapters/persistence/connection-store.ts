import { randomUUID } from "node:crypto";
import type {
  BinanceConnection,
  BinanceConnectionRole,
  BinanceEnvironment,
  PermissionDigest,
} from "@/domain/connections";
import { AppError } from "@/domain/errors";
import { database } from "./mongo";

export type ConnectionDoc = Omit<BinanceConnection, "id"> & { _id: string };
export type EnrollmentDoc = {
  _id: string;
  userId: string;
  aad: string;
  kmsKeyVersion: string;
  expiresAt: Date;
  consumedAt?: Date;
  createdAt: Date;
};

function asConnection(doc: ConnectionDoc): BinanceConnection {
  return { ...doc, id: doc._id };
}

export async function listConnections(userId: string) {
  return (
    await (await database())
      .collection<ConnectionDoc>("binance_connections")
      .find({ userId, status: { $ne: "revoked" } })
      .sort({ updatedAt: -1 })
      .toArray()
  ).map((doc) => {
    const connection = asConnection(doc);
    return {
      id: connection.id,
      role: connection.role,
      environment: connection.environment,
      apiKeyFingerprint: connection.apiKeyFingerprint,
      permissions: connection.permissions,
      status: connection.status,
      lastVerifiedAt: connection.lastVerifiedAt,
      createdAt: connection.createdAt,
    };
  });
}

export async function getConnection(id: string, userId: string) {
  const doc = await (await database())
    .collection<ConnectionDoc>("binance_connections")
    .findOne({ _id: id, userId });
  if (!doc || doc.status === "revoked")
    throw new AppError("NOT_FOUND", "连接不存在。", 404);
  return asConnection(doc);
}

export async function findConnection(
  userId: string,
  environment: BinanceEnvironment,
  role: BinanceConnectionRole,
) {
  const doc = await (await database())
    .collection<ConnectionDoc>("binance_connections")
    .findOne({ userId, environment, role, status: { $ne: "revoked" } });
  return doc ? asConnection(doc) : null;
}

export async function upsertConnection(input: {
  userId: string;
  role: BinanceConnectionRole;
  environment: BinanceEnvironment;
  apiKeyFingerprint: string;
  envelope: BinanceConnection["envelope"];
}) {
  const now = new Date();
  const existing = await findConnection(input.userId, input.environment, input.role);
  if (existing) {
    await (
      await database()
    )
      .collection<ConnectionDoc>("binance_connections")
      .updateOne(
        { _id: existing.id, userId: input.userId },
        {
          $set: {
            apiKeyFingerprint: input.apiKeyFingerprint,
            envelope: input.envelope,
            status: "pending",
            updatedAt: now,
          },
        },
      );
    return getConnection(existing.id, input.userId);
  }
  const doc: ConnectionDoc = {
    _id: randomUUID(),
    ...input,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
  await (await database()).collection<ConnectionDoc>("binance_connections").insertOne(doc);
  return asConnection(doc);
}

export async function markConnectionVerified(
  id: string,
  userId: string,
  permissions: PermissionDigest,
) {
  await (
    await database()
  )
    .collection<ConnectionDoc>("binance_connections")
    .updateOne(
      { _id: id, userId },
      {
        $set: {
          status: "verified",
          permissions,
          lastVerifiedAt: new Date(),
          updatedAt: new Date(),
        },
      },
    );
}

export async function revokeConnection(id: string, userId: string) {
  const result = await (
    await database()
  )
    .collection<ConnectionDoc>("binance_connections")
    .updateOne(
      { _id: id, userId, status: { $ne: "revoked" } },
      { $set: { status: "revoked", updatedAt: new Date() } },
    );
  if (!result.matchedCount) throw new AppError("NOT_FOUND", "连接不存在。", 404);
}

export async function createEnrollment(
  userId: string,
  aad: string,
  kmsKeyVersion: string,
) {
  const doc: EnrollmentDoc = {
    _id: randomUUID(),
    userId,
    aad,
    kmsKeyVersion,
    expiresAt: new Date(Date.now() + 10 * 60_000),
    createdAt: new Date(),
  };
  await (await database()).collection<EnrollmentDoc>("kms_enrollments").insertOne(doc);
  return doc;
}

export async function consumeEnrollment(
  enrollmentId: string,
  userId: string,
  aad: string,
) {
  const result = await (
    await database()
  )
    .collection<EnrollmentDoc>("kms_enrollments")
    .findOneAndUpdate(
      {
        _id: enrollmentId,
        userId,
        aad,
        consumedAt: { $exists: false },
        expiresAt: { $gt: new Date() },
      },
      { $set: { consumedAt: new Date() } },
    );
  if (!result)
    throw new AppError("ENROLLMENT_INVALID", "加密上下文已过期，请重试。", 409);
  return result;
}

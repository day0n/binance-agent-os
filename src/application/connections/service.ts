import { credentialEnvelopeSchema } from "@/domain/connections";
import { AppError } from "@/domain/errors";
import { PASSWORD_CONFIRM_RATE } from "@/domain/auth";
import { config } from "@/platform/config";
import { verifyPassword } from "@/application/auth/password";
import { findUserById, writeAudit } from "@/adapters/persistence/auth-store";
import { rateLimit } from "@/adapters/persistence/redis";
import {
  consumeEnrollment,
  createEnrollment,
  findConnection,
  listConnections,
  revokeConnection,
  upsertConnection,
} from "@/adapters/persistence/connection-store";

export async function encryptionContext(userId: string) {
  const c = config();
  if (!c.KMS_PUBLIC_KEY || !c.KMS_KEY_RESOURCE)
    throw new AppError(
      "KMS_UNCONFIGURED",
      "KMS 公钥尚未配置，不能接收币安密钥信封。",
      503,
    );
  const aad = `binance-agent-os:${c.APP_ENV}:${userId}`;
  const enrollment = await createEnrollment(userId, aad, c.KMS_KEY_RESOURCE);
  return {
    enrollmentId: enrollment._id,
    publicKey: c.KMS_PUBLIC_KEY,
    kmsKeyVersion: c.KMS_KEY_RESOURCE,
    aad,
    algorithm: "RSA-OAEP-3072-SHA256",
  };
}

export async function saveConnection(userId: string, body: unknown) {
  const parsed = credentialEnvelopeSchema.safeParse(body);
  if (!parsed.success)
    throw new AppError("INVALID_INPUT", "连接信封格式无效。", 422);
  await rateLimit(
    `password:${userId}`,
    PASSWORD_CONFIRM_RATE.limit,
    PASSWORD_CONFIRM_RATE.seconds,
  );
  const user = await findUserById(userId);
  if (!user) throw new AppError("AUTH_FAILED", "用户名或密码不正确。", 401);
  const ok = await verifyPassword(
    parsed.data.password,
    user.passwordHash,
    user.passwordSalt,
    config().AUTH_PEPPER,
  );
  if (!ok) throw new AppError("AUTH_FAILED", "用户名或密码不正确。", 401);
  await consumeEnrollment(
    parsed.data.enrollmentId,
    userId,
    parsed.data.aad,
  );
  const otherRole = parsed.data.role === "read" ? "trade" : "read";
  const other = await findConnection(
    userId,
    parsed.data.environment,
    otherRole,
  );
  if (other && other.apiKeyFingerprint === parsed.data.apiKeyFingerprint)
    throw new AppError(
      "CONNECTION_ROLE_COLLISION",
      "只读与交易不能使用相同的 API Key 指纹。",
      422,
    );
  const connection = await upsertConnection({
    userId,
    role: parsed.data.role,
    environment: parsed.data.environment,
    apiKeyFingerprint: parsed.data.apiKeyFingerprint,
    envelope: {
      encryptedDek: parsed.data.encryptedDek,
      ciphertext: parsed.data.ciphertext,
      iv: parsed.data.iv,
      authTag: parsed.data.authTag,
      kmsKeyVersion: parsed.data.kmsKeyVersion,
      aad: parsed.data.aad,
    },
  });
  await writeAudit({
    userId,
    action: "connection.upsert",
    summary: "stored encrypted binance envelope",
    metadata: { role: parsed.data.role, environment: parsed.data.environment },
  });
  return {
    id: connection.id,
    role: connection.role,
    environment: connection.environment,
    apiKeyFingerprint: connection.apiKeyFingerprint,
    status: connection.status,
  };
}

export async function removeConnection(
  id: string,
  userId: string,
  password: string,
) {
  await rateLimit(
    `password:${userId}`,
    PASSWORD_CONFIRM_RATE.limit,
    PASSWORD_CONFIRM_RATE.seconds,
  );
  const user = await findUserById(userId);
  if (!user) throw new AppError("AUTH_FAILED", "用户名或密码不正确。", 401);
  const ok = await verifyPassword(
    password,
    user.passwordHash,
    user.passwordSalt,
    config().AUTH_PEPPER,
  );
  if (!ok) throw new AppError("AUTH_FAILED", "用户名或密码不正确。", 401);
  await revokeConnection(id, userId);
  await writeAudit({
    userId,
    action: "connection.revoke",
    summary: "revoked encrypted binance envelope",
  });
}

export { listConnections };

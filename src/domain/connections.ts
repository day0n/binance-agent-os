import { z } from "zod";

export const binanceConnectionRoleSchema = z.enum(["read", "trade"]);
export type BinanceConnectionRole = z.infer<typeof binanceConnectionRoleSchema>;

export const binanceEnvironmentSchema = z.enum(["spot_testnet", "production"]);
export type BinanceEnvironment = z.infer<typeof binanceEnvironmentSchema>;

export type PermissionDigest = {
  spotTrading: boolean;
  internalTransfer: boolean;
  withdraw: boolean;
  futures: boolean;
  margin: boolean;
  options: boolean;
  reading: boolean;
  ipRestrict: boolean;
};

export type BinanceConnection = {
  id: string;
  userId: string;
  role: BinanceConnectionRole;
  environment: BinanceEnvironment;
  apiKeyFingerprint: string;
  envelope: {
    encryptedDek: string;
    ciphertext: string;
    iv: string;
    authTag: string;
    kmsKeyVersion: string;
    aad: string;
  };
  permissions?: PermissionDigest;
  status: "pending" | "verified" | "failed" | "revoked";
  lastVerifiedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

export const credentialEnvelopeSchema = z
  .object({
    role: binanceConnectionRoleSchema,
    environment: binanceEnvironmentSchema,
    enrollmentId: z.string().min(8).max(128),
    encryptedDek: z.string().min(16).max(4096),
    ciphertext: z.string().min(16).max(16384),
    iv: z.string().min(8).max(128),
    authTag: z.string().min(8).max(128),
    kmsKeyVersion: z.string().min(1).max(256),
    aad: z.string().min(1).max(1024),
    apiKeyFingerprint: z.string().regex(/^[a-f0-9]{16,64}$/),
    password: z.string().min(1).max(256),
  })
  .strict();

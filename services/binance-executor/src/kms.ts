import { KeyManagementServiceClient } from "@google-cloud/kms";
import { createDecipheriv } from "node:crypto";
import type {
  CredentialEnvelope,
  DecryptedCredential,
} from "@binance-agent-os/executor-contracts";

const kms = new KeyManagementServiceClient();

export async function unwrapCredential(
  envelope: CredentialEnvelope,
): Promise<DecryptedCredential> {
  const [result] = await kms.asymmetricDecrypt({
    name: envelope.kmsKeyVersion,
    ciphertext: Buffer.from(envelope.encryptedDek, "base64"),
  });
  if (!result.plaintext) throw new Error("KMS_DECRYPT_FAILED");
  const dek = Buffer.from(result.plaintext as Uint8Array);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    dek,
    Buffer.from(envelope.iv, "base64"),
  );
  decipher.setAAD(Buffer.from(envelope.aad, "utf8"));
  decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
  const json = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  dek.fill(0);
  const parsed = JSON.parse(json) as DecryptedCredential;
  if (!parsed.apiKey || !parsed.apiSecret) throw new Error("CREDENTIAL_INVALID");
  return parsed;
}

export type CredentialEnvelope = {
  encryptedDek: string;
  ciphertext: string;
  iv: string;
  authTag: string;
  kmsKeyVersion: string;
  aad: string;
};

export type DecryptedCredential = {
  apiKey: string;
  apiSecret: string;
};

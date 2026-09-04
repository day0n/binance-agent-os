export async function encryptBinanceCredentials(input: {
  apiKey: string;
  apiSecret: string;
  publicKeyPem: string;
  aad: string;
}) {
  const dek = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(
    JSON.stringify({ apiKey: input.apiKey, apiSecret: input.apiSecret }),
  );
  const aad = new TextEncoder().encode(input.aad);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad },
    dek,
    plaintext,
  );
  const payload = new Uint8Array(encrypted);
  const ciphertext = payload.slice(0, payload.length - 16);
  const authTag = payload.slice(payload.length - 16);
  const rawDek = await crypto.subtle.exportKey("raw", dek);
  const rsa = await crypto.subtle.importKey(
    "spki",
    pemToBuffer(input.publicKeyPem),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
  const wrapped = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, rsa, rawDek);
  return {
    encryptedDek: bufferToBase64(wrapped),
    ciphertext: bufferToBase64(ciphertext),
    iv: bufferToBase64(iv),
    authTag: bufferToBase64(authTag),
  };
}

function pemToBuffer(pem: string) {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const raw = atob(body);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

function bufferToBase64(value: ArrayBuffer | Uint8Array) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function fingerprintApiKey(apiKey: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(apiKey),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

import { randomBytes } from "node:crypto";
import {
  auth,
  type OAuthClientProvider,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { database } from "@/adapters/persistence/mongo";
import {
  config,
  MCP_ENDPOINT,
  AUTH_SERVER,
  BINANCE_ACCOUNTS,
} from "@/platform/config";
import { encrypt, decrypt, sha256 } from "@/platform/crypto";
import { AppError } from "@/domain/errors";

type OAuthState = {
  _id: string;
  ownerId: string;
  verifier?: string;
  expiresAt: Date;
};
type Connection = {
  _id: string;
  encrypted: string;
  connectedAt: string;
  expiresAt: number | null;
};
export async function trustedFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const url = new URL(
    typeof input === "string" || input instanceof URL ? input : input.url,
  );
  if (![AUTH_SERVER, BINANCE_ACCOUNTS].includes(url.origin))
    throw new AppError("UNTRUSTED_ENDPOINT", "认证或 MCP 地址不受信任。", 502);
  const response = await fetch(input, {
    ...init,
    redirect: "manual",
    signal: init?.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(20000)])
      : AbortSignal.timeout(20000),
  });
  if (response.status >= 300 && response.status < 400)
    throw new AppError("UNTRUSTED_REDIRECT", "服务端返回了未允许的跳转。", 502);
  return response;
}
export function metadataUrl() {
  const c = config();
  const url =
    c.BINANCE_CLIENT_METADATA_URL ||
    `${c.APP_ORIGIN}/.well-known/oauth-client.json`;
  if (!url.startsWith("https://"))
    throw new AppError(
      "OAUTH_PUBLIC_URL_REQUIRED",
      "币安需要公开 HTTPS 客户端地址，请先部署或配置 BINANCE_CLIENT_METADATA_URL。",
      503,
    );
  return url;
}
export function clientMetadata(): OAuthClientMetadata & { client_id: string } {
  const c = config();
  return {
    client_id: metadataUrl(),
    client_name: "Binance Agent OS · Research Desk",
    client_uri: c.APP_ORIGIN,
    redirect_uris: [`${c.APP_ORIGIN}/api/auth/binance/callback`],
    grant_types: ["authorization_code"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  };
}
function provider(ownerId: string, state: string, verifier?: string) {
  let redirect: URL | undefined;
  const p: OAuthClientProvider = {
    redirectUrl: `${config().APP_ORIGIN}/api/auth/binance/callback`,
    clientMetadataUrl: metadataUrl(),
    clientMetadata: clientMetadata(),
    state: () => state,
    clientInformation: () => ({
      client_id: metadataUrl(),
      token_endpoint_auth_method: "none",
    }),
    tokens: () => undefined,
    async saveTokens(tokens: OAuthTokens) {
      await (await database()).collection<Connection>("connections").updateOne(
        { _id: ownerId },
        {
          $set: {
            encrypted: encrypt(tokens),
            connectedAt: new Date().toISOString(),
            expiresAt: tokens.expires_in
              ? Date.now() + tokens.expires_in * 1000
              : null,
          },
        },
        { upsert: true },
      );
    },
    redirectToAuthorization(url) {
      if (
        url.origin !== BINANCE_ACCOUNTS ||
        url.pathname !== "/agentic-oauth/authorize"
      )
        throw new AppError(
          "UNTRUSTED_AUTHORIZATION",
          "授权地址与官方地址不一致。",
          502,
        );
      redirect = url;
    },
    async saveCodeVerifier(value) {
      await (await database())
        .collection<OAuthState>("oauth_states")
        .updateOne(
          { _id: sha256(state), ownerId },
          { $set: { verifier: encrypt(value) } },
        );
    },
    codeVerifier() {
      if (!verifier)
        throw new AppError(
          "INVALID_OAUTH_STATE",
          "授权状态无效，请重新连接。",
          401,
        );
      return verifier;
    },
    async validateResourceURL(_url, resource) {
      if (resource && resource !== MCP_ENDPOINT)
        throw new AppError("INVALID_RESOURCE", "OAuth 资源不匹配。", 502);
      return new URL(MCP_ENDPOINT);
    },
  };
  return { p, redirect: () => redirect };
}
export async function beginAuthorization(ownerId: string) {
  const state = randomBytes(32).toString("base64url");
  await (await database()).collection<OAuthState>("oauth_states").insertOne({
    _id: sha256(state),
    ownerId,
    expiresAt: new Date(Date.now() + 600000),
  });
  const { p, redirect } = provider(ownerId, state);
  await auth(p, {
    serverUrl: MCP_ENDPOINT,
    resourceMetadataUrl: new URL(
      `${AUTH_SERVER}/.well-known/oauth-protected-resource/gateway-mcp`,
    ),
    fetchFn: trustedFetch,
  });
  const url = redirect();
  if (!url) throw new AppError("AUTH_FAILED", "无法启动币安授权。", 502);
  return url.toString();
}
export async function completeAuthorization(
  ownerId: string,
  state: string,
  code: string | null,
) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(state))
    throw new AppError("INVALID_OAUTH_STATE", "授权状态无效。", 401);
  const record = await (await database())
    .collection<OAuthState>("oauth_states")
    .findOneAndDelete({
      _id: sha256(state),
      ownerId,
      expiresAt: { $gt: new Date() },
    });
  if (!record?.verifier)
    throw new AppError(
      "INVALID_OAUTH_STATE",
      "授权状态过期或已使用，请重新连接。",
      401,
    );
  if (!code)
    throw new AppError(
      "AUTH_DENIED",
      "币安授权未完成，你可以稍后重新连接。",
      401,
    );
  const { p } = provider(ownerId, state, decrypt<string>(record.verifier));
  const result = await auth(p, {
    serverUrl: MCP_ENDPOINT,
    authorizationCode: code,
    resourceMetadataUrl: new URL(
      `${AUTH_SERVER}/.well-known/oauth-protected-resource/gateway-mcp`,
    ),
    fetchFn: trustedFetch,
  });
  if (result !== "AUTHORIZED")
    throw new AppError("AUTH_FAILED", "授权未成功，请重试。", 401);
}
export async function accessToken(ownerId: string) {
  const c = await (await database())
    .collection<Connection>("connections")
    .findOne({ _id: ownerId });
  if (!c || (c.expiresAt && c.expiresAt <= Date.now() + 5000))
    throw new AppError(
      "BINANCE_AUTH_REQUIRED",
      "请先连接币安，或重新完成已过期的授权。",
      401,
    );
  return decrypt<OAuthTokens>(c.encrypted).access_token;
}
export async function connectionStatus(ownerId: string) {
  const c = await (await database())
    .collection<Connection>("connections")
    .findOne({ _id: ownerId });
  return {
    connected: Boolean(c && (!c.expiresAt || c.expiresAt > Date.now())),
    connectedAt: c?.connectedAt ?? null,
    expiresAt: c?.expiresAt ?? null,
  };
}
export async function disconnect(ownerId: string) {
  const db = await database();
  await db.collection<Connection>("connections").deleteOne({ _id: ownerId });
  await db.collection<OAuthState>("oauth_states").deleteMany({ ownerId });
}

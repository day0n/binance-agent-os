import { getVercelOidcToken } from "@vercel/oidc";
import { AppError } from "@/domain/errors";
import { config } from "./config";

export async function executorIdToken(audience: string) {
  const c = config();
  if (!c.GCP_WIF_PROVIDER || !c.GCP_WIF_SERVICE_ACCOUNT)
    throw new AppError(
      "EXECUTOR_UNCONFIGURED",
      "未配置 Vercel OIDC 到 GCP WIF，不能调用执行器。",
      503,
    );
  try {
    const oidc = await getVercelOidcToken();
    const sts = await fetch("https://sts.googleapis.com/v1/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
        audience: c.GCP_WIF_PROVIDER,
        scope: "https://www.googleapis.com/auth/cloud-platform",
        requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
        subject_token: oidc,
        subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
      }),
    });
    if (!sts.ok)
      throw new AppError("EXECUTOR_AUTH_FAILED", "WIF 换票失败。", 503);
    const federated = (await sts.json()) as { access_token?: string };
    if (!federated.access_token)
      throw new AppError("EXECUTOR_AUTH_FAILED", "WIF 未返回访问令牌。", 503);
    const id = await fetch(
      `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${c.GCP_WIF_SERVICE_ACCOUNT}:generateIdToken`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${federated.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ audience, includeEmail: true }),
      },
    );
    if (!id.ok)
      throw new AppError("EXECUTOR_AUTH_FAILED", "无法签发执行器 ID token。", 503);
    const payload = (await id.json()) as { token?: string };
    if (!payload.token)
      throw new AppError("EXECUTOR_AUTH_FAILED", "执行器身份令牌缺失。", 503);
    return payload.token;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      "EXECUTOR_AUTH_FAILED",
      "无法获取访问执行器的短期身份。",
      503,
    );
  }
}

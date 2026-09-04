import { AppError } from "@/domain/errors";
import { config } from "@/platform/config";
import { executorIdToken } from "@/platform/gcp-auth";
import { getConnection } from "@/adapters/persistence/connection-store";
import { classifyExecutorHttp } from "@/application/actions/proposal";
import type { Capability } from "./mcp-policy";

export async function executorRequest<T>(
  path: string,
  body: Record<string, unknown>,
) {
  const c = config();
  if (!c.EXECUTOR_URL)
    throw new AppError(
      "EXECUTOR_UNCONFIGURED",
      "执行器尚未配置，不能读取账户或发送交易。",
      503,
    );
  const token = await executorIdToken(c.EXECUTOR_URL);
  let response: Response;
  try {
    response = await fetch(new URL(path, c.EXECUTOR_URL), {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new AppError(
      "EXECUTOR_UNAVAILABLE",
      "执行器暂时不可用，未使用模拟结果。",
      502,
      true,
    );
  }
  if (!response.ok)
    throw new AppError(
      "EXECUTOR_UNAVAILABLE",
      "执行器拒绝请求，未使用模拟结果。",
      response.status === 401 || response.status === 403 ? response.status : 502,
    );
  return (await response.json()) as T;
}

export async function executorExecute(input: {
  userId: string;
  actionId: string;
  proposalHash: string;
  kind: string;
  environment: "spot_testnet" | "production";
  connectionId: string;
  payload: Record<string, string>;
  clientOrderId?: string;
}) {
  const connection = await getConnection(input.connectionId, input.userId);
  if (connection.role !== "trade")
    throw new AppError("CONNECTION_ROLE", "执行需要交易角色连接。", 403);
  const c = config();
  if (!c.EXECUTOR_URL)
    throw new AppError(
      "EXECUTOR_UNCONFIGURED",
      "执行器尚未配置，不能读取账户或发送交易。",
      503,
    );
  const token = await executorIdToken(c.EXECUTOR_URL);
  let response: Response;
  try {
    response = await fetch(new URL("/v1/execute", c.EXECUTOR_URL), {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ...input,
        envelope: connection.envelope,
      }),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new AppError(
      "EXECUTOR_UNAVAILABLE",
      "执行器暂时不可用，未使用模拟结果。",
      502,
      true,
    );
  }
  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  const status = classifyExecutorHttp(response.status, data);
  if (status === "failed")
    throw new AppError(
      "EXECUTOR_UNAVAILABLE",
      "执行器拒绝请求，未使用模拟结果。",
      response.status === 401 || response.status === 403 ? response.status : 502,
    );
  return { status, data };
}

export async function executorRead(
  userId: string,
  capability: Capability,
  values: Record<string, string | number>,
) {
  const connection = await getConnectionForRead(userId);
  return executorRequest<unknown>("/v1/read", {
    userId,
    capability,
    values,
    connectionId: connection.id,
    envelope: connection.envelope,
    environment: connection.environment,
  });
}

async function getConnectionForRead(userId: string) {
  const { findConnection } = await import(
    "@/adapters/persistence/connection-store"
  );
  const production =
    (await findConnection(userId, "production", "read")) ??
    (await findConnection(userId, "production", "trade"));
  const testnet =
    (await findConnection(userId, "spot_testnet", "read")) ??
    (await findConnection(userId, "spot_testnet", "trade"));
  const connection = production ?? testnet;
  if (!connection)
    throw new AppError(
      "ACCOUNT_CONNECTION_REQUIRED",
      "尚未保存只读或交易 API Key 信封。",
      503,
    );
  return getConnection(connection.id, userId);
}

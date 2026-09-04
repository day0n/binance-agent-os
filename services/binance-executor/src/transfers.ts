import type {
  DecryptedCredential,
  ExecutorActionRequest,
} from "@binance-agent-os/executor-contracts";
import { assertActionLimits } from "./policy";
import { executorConfig } from "./config";
import { binanceRequest } from "./binance/client";

export async function internalTransfer(
  request: ExecutorActionRequest,
  credential: DecryptedCredential,
) {
  if (request.environment !== "production")
    throw new Error("TRANSFER_PRODUCTION_ONLY");
  if (request.payload.asset !== "USDT") throw new Error("TRANSFER_ASSET");
  if (
    request.payload.type !== "MAIN_FUNDING" &&
    request.payload.type !== "FUNDING_MAIN"
  )
    throw new Error("TRANSFER_TYPE");
  assertActionLimits(
    request.kind,
    request.payload.amount,
    executorConfig().HARD_ACTION_MAX_USDT,
  );
  try {
    return await binanceRequest({
      method: "POST",
      path: "/sapi/v1/asset/transfer",
      environment: request.environment,
      apiKey: credential.apiKey,
      apiSecret: credential.apiSecret,
      signed: true,
      params: {
        type: request.payload.type,
        asset: "USDT",
        amount: request.payload.amount,
      },
    });
  } catch (error) {
    const uncertain = new Error("TRANSFER_UNCERTAIN");
    uncertain.cause = error;
    throw uncertain;
  }
}

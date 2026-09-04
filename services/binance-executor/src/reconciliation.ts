import type {
  DecryptedCredential,
  ExecutorActionRequest,
} from "@binance-agent-os/executor-contracts";
import { binanceRequest } from "./binance/client";

export async function transferHistory(
  request: ExecutorActionRequest,
  credential: DecryptedCredential,
) {
  return binanceRequest({
    method: "GET",
    path: "/sapi/v1/asset/transfer",
    environment: request.environment,
    apiKey: credential.apiKey,
    apiSecret: credential.apiSecret,
    signed: true,
    params: {
      type: request.payload.type,
      size: 20,
    },
  });
}

export async function apiRestrictions(
  environment: "spot_testnet" | "production",
  credential: DecryptedCredential,
) {
  return binanceRequest({
    method: "GET",
    path: "/sapi/v1/account/apiRestrictions",
    environment,
    apiKey: credential.apiKey,
    apiSecret: credential.apiSecret,
    signed: true,
  });
}

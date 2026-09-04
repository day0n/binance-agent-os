import type { ExecutorActionRequest } from "@binance-agent-os/executor-contracts";
import { assertActionLimits } from "./policy";
import { executorConfig } from "./config";
import { binanceRequest } from "./binance/client";
import type { DecryptedCredential } from "@binance-agent-os/executor-contracts";

export async function queryOrder(
  request: ExecutorActionRequest,
  credential: DecryptedCredential,
) {
  return binanceRequest({
    method: "GET",
    path: "/api/v3/order",
    environment: request.environment,
    apiKey: credential.apiKey,
    apiSecret: credential.apiSecret,
    signed: true,
    params: {
      symbol: request.payload.symbol,
      origClientOrderId: request.clientOrderId,
    },
  });
}

export async function placeOrCancelOrder(
  request: ExecutorActionRequest,
  credential: DecryptedCredential,
) {
  const max = executorConfig().HARD_ACTION_MAX_USDT;
  if (request.kind === "spot.cancelOrder") {
    return binanceRequest({
      method: "DELETE",
      path: "/api/v3/order",
      environment: request.environment,
      apiKey: credential.apiKey,
      apiSecret: credential.apiSecret,
      signed: true,
      params: {
        symbol: request.payload.symbol,
        origClientOrderId: request.payload.origClientOrderId,
        orderId: request.payload.orderId,
      },
    });
  }
  assertActionLimits(
    request.kind,
    request.payload.quoteOrderQty ?? request.payload.notional ?? "0",
    max,
  );
  if (request.clientOrderId) {
    try {
      return await queryOrder(request, credential);
    } catch {
      /* not found, place once */
    }
  }
  return binanceRequest({
    method: "POST",
    path: "/api/v3/order",
    environment: request.environment,
    apiKey: credential.apiKey,
    apiSecret: credential.apiSecret,
    signed: true,
    params: {
      symbol: request.payload.symbol,
      side: request.payload.side,
      type: request.kind === "spot.limitOrder" ? "LIMIT" : "MARKET",
      timeInForce: request.kind === "spot.limitOrder" ? "GTC" : undefined,
      quantity: request.payload.quantity,
      quoteOrderQty: request.payload.quoteOrderQty,
      price: request.payload.price,
      newClientOrderId: request.clientOrderId,
    },
  });
}

import { createServer } from "node:http";
import { executorConfig } from "./config";
import { requireAudience } from "./auth";
import { unwrapCredential } from "./kms";
import { redact } from "./policy";
import { binanceRequest } from "./binance/client";
import { placeOrCancelOrder } from "./orders";
import { internalTransfer } from "./transfers";
import { apiRestrictions } from "./reconciliation";
import type { ExecutorActionRequest, ExecutorReadRequest } from "@binance-agent-os/executor-contracts";

const config = executorConfig();

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function handle(request: Request) {
  await requireAudience(request);
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/health")
    return json(200, { ok: true });
  if (request.method !== "POST") return json(405, { error: "METHOD" });
  const body = (await request.json()) as ExecutorActionRequest & ExecutorReadRequest;
  if (url.pathname === "/v1/read") {
    const credential = await unwrapCredential(body.envelope);
    try {
      if (body.capability === "balances")
        return json(
          200,
          await binanceRequest({
            method: "GET",
            path: "/api/v3/account",
            environment: body.environment,
            apiKey: credential.apiKey,
            apiSecret: credential.apiSecret,
            signed: true,
          }),
        );
      if (body.capability === "funding")
        return json(
          200,
          await binanceRequest({
            method: "GET",
            path: "/sapi/v1/asset/get-funding-asset",
            environment: body.environment,
            apiKey: credential.apiKey,
            apiSecret: credential.apiSecret,
            signed: true,
          }),
        );
      if (body.capability === "permissions")
        return json(200, await apiRestrictions(body.environment, credential));
      return json(400, { error: "CAPABILITY" });
    } finally {
      credential.apiSecret = "";
    }
  }
  if (url.pathname === "/v1/execute") {
    const action = body as ExecutorActionRequest;
    const credential = await unwrapCredential(action.envelope);
    try {
      if (action.kind === "wallet.internalTransfer")
        return json(200, await internalTransfer(action, credential));
      return json(200, await placeOrCancelOrder(action, credential));
    } catch (error) {
      const code = error instanceof Error ? error.message : "EXECUTE_FAILED";
      return json(code === "TRANSFER_UNCERTAIN" ? 202 : 502, {
        error: code === "TRANSFER_UNCERTAIN" ? "uncertain" : "failed",
      });
    } finally {
      credential.apiSecret = "";
    }
  }
  return json(404, { error: "NOT_FOUND" });
}

createServer(async (req, res) => {
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const request = new Request(new URL(req.url ?? "/", config.EXECUTOR_AUDIENCE), {
      method: req.method,
      headers: req.headers as HeadersInit,
      body: chunks.length ? Buffer.concat(chunks) : undefined,
    });
    const response = await handle(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    const message = error instanceof Error ? error.message : "INTERNAL";
    console.error(JSON.stringify({ level: "error", message: redact(message) }));
    res.writeHead(message === "UNAUTHENTICATED" ? 401 : 403, {
      "content-type": "application/json",
    });
    res.end(JSON.stringify({ error: "denied" }));
  }
}).listen(config.PORT);

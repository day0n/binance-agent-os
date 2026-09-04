import { describe, expect, it } from "vitest";
import { parseChatMessageBody } from "@/application/chat/service";
import { isBareConfirmText } from "@/domain/chat";
import { sha256 } from "@/platform/crypto";

describe("chat request idempotency", () => {
  it("accepts a UUID requestId and hashes the same content stably", () => {
    const requestId = "10000000-0000-4000-8000-000000000001";
    const body = parseChatMessageBody({
      content: "研究 BTCUSDT",
      requestId,
    });
    expect(body.requestId).toBe(requestId);
    expect(sha256({ content: body.content })).toBe(
      sha256({ content: "研究 BTCUSDT" }),
    );
  });
  it("does not treat a confirm phrase as a second execution request", () => {
    expect(isBareConfirmText("确认")).toBe(true);
    expect(isBareConfirmText("请帮我确认一下回测假设")).toBe(false);
  });
});

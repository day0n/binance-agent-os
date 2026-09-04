import { describe, expect, it } from "vitest";
import { chatModelContext } from "@/application/chat/context";
import {
  acceptFindingOrRepair,
  compactContext,
  type ResearchContext,
} from "@/application/research-context";
import { parseChatMessageBody } from "@/application/chat/service";
import { eventsAfterSeq } from "@/application/actions/proposal";
import { runInputSchema } from "@/domain/contracts";
import type { ChatMessage } from "@/domain/chat";

const message = (role: "user" | "assistant", content: string, i: number): ChatMessage => ({
  id: `m${i}`,
  sessionId: "s",
  userId: "u",
  role,
  content,
  artifactIds: [],
  createdAt: new Date(0),
});

describe("chat model context", () => {
  it("sends only recent messages and a summary, not the full thread", () => {
    const messages = Array.from({ length: 12 }, (_, i) =>
      message(i % 2 ? "assistant" : "user", `msg-${i}-${"x".repeat(80)}`, i),
    );
    const ctx = chatModelContext({
      messages,
      summary: "会话摘要：研究 BTCUSDT",
    });
    expect(ctx.recentMessages).toHaveLength(8);
    expect(ctx.sessionSummary).toBe("会话摘要：研究 BTCUSDT");
    expect(JSON.stringify(ctx)).not.toContain("msg-0");
  });
  it("compacts research artifacts without dumping raw candles", () => {
    const compact = compactContext({
      input: runInputSchema.parse({
        clientRequestId: "10000000-0000-4000-8000-000000000000",
        mode: "research",
        prompt: "研究 BTCUSDT",
      }),
      asOf: "2026-01-01T00:00:00.000Z",
      evidence: [
        {
          id: "e1",
          runId: "r1",
          label: "行情",
          source: "binance_public_rest",
          observedAt: "2026-01-01T00:00:00.000Z",
          asOf: "2026-01-01T00:00:00.000Z",
          sha256: "abc",
          parentIds: [],
          warnings: [],
        },
      ],
      risk: {
        allowed: true,
        policyConfigured: false,
        coverage: "spot_only",
        checks: [],
        evidenceIds: ["e1"],
      },
      findings: [],
      memory: [],
      recentMessages: [{ role: "user", content: "看下 BTC" }],
      sessionSummary: "摘要",
    } as ResearchContext);
    expect(compact.recentMessages?.[0].content).toBe("看下 BTC");
    expect(compact.sessionSummary).toBe("摘要");
    expect(compact.evidence[0].source).toBe("binance_public_rest");
    expect(compact).not.toHaveProperty("candles");
  });
  it("repairs a schema error once and then ends the run", () => {
    const first = acceptFindingOrRepair({ summary: "bad" }, new Set(), false);
    expect(first).toEqual({ repair: true });
    expect(() =>
      acceptFindingOrRepair({ summary: "bad" }, new Set(), true),
    ).toThrow(/连续两次/);
  });
  it("requires a requestId and replays events after a cursor", () => {
    expect(() =>
      parseChatMessageBody({ content: "hello" }),
    ).toThrow(/请求标识/);
    const events = eventsAfterSeq(
      [
        { seq: 1, type: "run.started" },
        { seq: 2, type: "agent.status" },
        { seq: 3, type: "run.completed" },
      ],
      1,
    );
    expect(events.map((event) => event.seq)).toEqual([2, 3]);
  });
});

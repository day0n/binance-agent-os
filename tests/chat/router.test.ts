import { describe, expect, it } from "vitest";
import {
  isBareConfirmText,
  sessionTitleFrom,
  assertSessionCanStart,
  assertUserRunBudget,
} from "@/domain/chat";
import {
  heuristicIntent,
  researchParamsFromChat,
  shouldSkipModelClassify,
} from "@/application/chat/router";
import {
  assertDraftLimits,
  missingActionFields,
  parseActionDraft,
} from "@/application/chat/action-planner";

describe("chat routing and safety", () => {
  it("titles from the first 28 characters without a model", () => {
    expect(
      sessionTitleFrom("  请帮我研究 BTCUSDT 过去九十天的趋势和回撤  "),
    ).toBe("请帮我研究 BTCUSDT 过去九十天的趋势和回撤".slice(0, 28));
  });
  it("does not treat chat confirm text as an execution intent", () => {
    expect(isBareConfirmText("确认")).toBe(true);
    expect(isBareConfirmText("confirm")).toBe(true);
    expect(heuristicIntent("确认").taskKind).toBe("general");
    expect(heuristicIntent("帮我回测 BTCUSDT").taskKind).toBe("backtest");
    expect(heuristicIntent("看一下现货账户").taskKind).toBe("portfolio");
    expect(heuristicIntent("市价买入").taskKind).toBe("action");
    expect(heuristicIntent("市价买入").needsClarification).toBe(true);
    expect(heuristicIntent("研究一下 BTCUSDT 近 24 小时行情").taskKind).toBe(
      "research",
    );
    expect(
      shouldSkipModelClassify(
        "研究一下 BTCUSDT 近 24 小时行情",
        heuristicIntent("研究一下 BTCUSDT 近 24 小时行情"),
      ),
    ).toBe(true);
    expect(
      researchParamsFromChat(
        "研究一下 BTCUSDT 近 24 小时行情",
        heuristicIntent("研究一下 BTCUSDT 近 24 小时行情"),
      ),
    ).toEqual({
      symbol: "BTCUSDT",
      interval: "1h",
      lookbackDays: 30,
      debateRounds: 0,
    });
  });
  it("enforces one active run per session and two per user", () => {
    expect(() => assertSessionCanStart(true)).toThrow(/进行中/);
    expect(() => assertUserRunBudget(2)).toThrow(/两个/);
    expect(() => assertSessionCanStart(false)).not.toThrow();
    expect(() => assertUserRunBudget(1)).not.toThrow();
  });
  it("refuses incomplete or oversized action drafts", () => {
    const draft = parseActionDraft({
      kind: "spot.marketOrder",
      symbol: "BTCUSDT",
      side: "BUY",
      quoteOrderQty: "5",
    });
    expect(missingActionFields(draft)).toEqual([]);
    expect(assertDraftLimits(draft, 5)).toBe("5.00000000");
    expect(() =>
      assertDraftLimits({ ...draft, quoteOrderQty: "5.01" }, 5),
    ).toThrow(/5 USDT/);
    expect(
      missingActionFields(
        parseActionDraft({ kind: "spot.limitOrder", symbol: "BTCUSDT" }),
      ),
    ).toContain("side");
  });
});

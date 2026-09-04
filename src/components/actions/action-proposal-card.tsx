"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/components/auth/auth-dialog";
import { PasswordConfirmDialog } from "./password-confirm-dialog";
import type { ActionRecord } from "@/domain/actions";

export function ActionProposalCard({ actionId }: { actionId: string }) {
  const { csrfToken } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["action", actionId],
    queryFn: () => api<{ action: ActionRecord }>(`/api/actions/${actionId}`),
  });
  const action = query.data?.action;
  const proposal = action?.proposal;
  if (!action || !proposal) return null;
  return (
    <article className="action-card">
      <h3>交易确认卡</h3>
      <dl>
        <div>
          <dt>环境</dt>
          <dd>{proposal.environment}</dd>
        </div>
        <div>
          <dt>Key 指纹</dt>
          <dd>{proposal.apiKeyFingerprint}</dd>
        </div>
        <div>
          <dt>动作</dt>
          <dd>
            {proposal.kind} {proposal.symbol} {proposal.side}
          </dd>
        </div>
        <div>
          <dt>订单类型</dt>
          <dd>
            {proposal.orderType ?? proposal.kind} {proposal.timeInForce ?? ""}
          </dd>
        </div>
        <div>
          <dt>数量 / 价格</dt>
          <dd>
            {proposal.quantity ?? proposal.quoteOrderQty} / {proposal.price ?? "市价"}
          </dd>
        </div>
        <div>
          <dt>预估成交额</dt>
          <dd>{proposal.estimatedNotionalUsdt} USDT</dd>
        </div>
        <div>
          <dt>当前行情</dt>
          <dd>
            {proposal.marketPrice ?? "—"}
            {proposal.marketPriceAt
              ? ` · ${new Date(proposal.marketPriceAt).toLocaleString("zh-CN")}`
              : ""}
          </dd>
        </div>
        <div>
          <dt>手续费 / 滑点假设</dt>
          <dd>{proposal.feeAssumption}</dd>
        </div>
        <div>
          <dt>可用余额</dt>
          <dd>{proposal.availableBalance ?? "—"}</dd>
        </div>
        <div>
          <dt>额度</dt>
          <dd>
            本笔 {proposal.actionQuotaUsdt} · 当日已用 {proposal.dailyUsedUsdt} /{" "}
            {proposal.dailyLimitUsdt}
            {proposal.dailyReservedUsdt
              ? ` · 预留 ${proposal.dailyReservedUsdt}`
              : ""}
          </dd>
        </div>
        <div>
          <dt>过期</dt>
          <dd>{new Date(proposal.expiresAt).toLocaleString("zh-CN")}</dd>
        </div>
      </dl>
      <p className="warning">{proposal.irreversibleWarning}</p>
      <p className="subtle">聊天里输入“确认”不会执行。</p>
      {action.status === "awaiting_confirmation" ? (
        <div className="action-card-actions">
          <button
            type="button"
            className="primary-button"
            onClick={() => setConfirming(true)}
          >
            密码确认
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              api(`/api/actions/${actionId}/reject`, {
                method: "POST",
                csrf: csrfToken,
              })
            }
          >
            拒绝
          </button>
        </div>
      ) : (
        <p>状态：{action.status}</p>
      )}
      {confirming ? (
        <PasswordConfirmDialog
          title="确认执行"
          warning={proposal.irreversibleWarning}
          error={error}
          onClose={() => setConfirming(false)}
          onConfirm={async (password) => {
            setError(null);
            try {
              await api(`/api/actions/${actionId}/confirm`, {
                method: "POST",
                csrf: csrfToken,
                body: JSON.stringify({
                  proposalHash: action.proposalHash,
                  password,
                }),
              });
              setConfirming(false);
              await query.refetch();
            } catch (e) {
              setError(e instanceof Error ? e.message : "确认失败");
            }
          }}
        />
      ) : null}
    </article>
  );
}

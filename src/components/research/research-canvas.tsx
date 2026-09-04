"use client";

import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import type { AnalysisReport } from "@/domain/contracts";
import type { ChatMessage, SessionEvent } from "@/domain/chat";
import { api } from "@/lib/api";
import { EvidencePanel } from "./evidence-panel";
import { ActivityPanel } from "./activity-panel";
import { ActionProposalCard } from "@/components/actions/action-proposal-card";

const Report = dynamic(
  () => import("@/components/report").then((module) => module.Report),
  {
    loading: () => <p className="subtle">正在加载报告与图表…</p>,
  },
);

export function ResearchCanvas({
  messages,
  events,
}: {
  messages: ChatMessage[];
  events: SessionEvent[];
}) {
  const artifactId = [...messages]
    .reverse()
    .find((message) => message.artifactIds[0])?.artifactIds[0];
  const actionId = events
    .slice()
    .reverse()
    .find((event) => event.type === "action.proposed")?.publicPayload as
    | { actionId?: string }
    | undefined;
  const report = useQuery({
    queryKey: ["artifact", artifactId],
    enabled: Boolean(artifactId),
    queryFn: () => api<{ data: AnalysisReport }>(`/api/artifacts/${artifactId}`),
  });
  return (
    <section className="research-column" aria-label="研究画布">
      {actionId?.actionId ? (
        <ActionProposalCard actionId={actionId.actionId} />
      ) : null}
      {report.data?.data ? (
        <Report
          report={report.data.data}
          onEvidence={() => undefined}
          onDownload={() => {
            const blob = new Blob([JSON.stringify(report.data?.data, null, 2)], {
              type: "application/json",
            });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "report.json";
            link.click();
            URL.revokeObjectURL(url);
          }}
        />
      ) : (
        <div className="research-empty">
          <h2>研究画布</h2>
          <p>报告、证据和动作预览会出现在这里，不会挡住输入框。</p>
        </div>
      )}
      <details>
        <summary>证据</summary>
        <EvidencePanel evidence={report.data?.data.evidence ?? []} />
      </details>
      <details>
        <summary>活动</summary>
        <ActivityPanel events={events} />
      </details>
    </section>
  );
}

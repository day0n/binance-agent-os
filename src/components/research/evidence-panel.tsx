"use client";

import type { EvidenceRef } from "@/domain/contracts";
import { date } from "@/components/format";

export function EvidencePanel({ evidence }: { evidence: EvidenceRef[] }) {
  if (!evidence.length)
    return <p className="subtle">还没有可核验证据。研究完成后会显示来源与时间。</p>;
  return (
    <ul className="evidence-list">
      {evidence.map((item) => (
        <li key={item.id}>
          <strong>{item.label}</strong>
          <small>
            {item.source} · {date(item.asOf)}
          </small>
          {item.warnings.map((warning) => (
            <p key={warning} className="warning">
              {warning}
            </p>
          ))}
        </li>
      ))}
    </ul>
  );
}

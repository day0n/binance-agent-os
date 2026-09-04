"use client";

import type { SessionEvent } from "@/domain/chat";

export function ActivityPanel({ events }: { events: SessionEvent[] }) {
  if (!events.length) return <p className="subtle">还没有运行状态。</p>;
  return (
    <ol className="activity-list">
      {events.map((event) => (
        <li key={`${event.sessionId}:${event.seq}`}>
          <strong>{event.type}</strong>
          <small>
            {event.publicPayload &&
            typeof event.publicPayload === "object" &&
            "message" in event.publicPayload
              ? String((event.publicPayload as { message?: string }).message ?? "")
              : ""}
          </small>
        </li>
      ))}
    </ol>
  );
}

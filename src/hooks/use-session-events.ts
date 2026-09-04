"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { SessionEvent } from "@/domain/chat";

export function useSessionEvents(sessionId?: string) {
  const client = useQueryClient();
  const [eventsBySession, setEventsBySession] = useState<
    Record<string, SessionEvent[]>
  >({});
  const [statusBySession, setStatusBySession] = useState<Record<string, string>>(
    {},
  );
  const pending = useRef<SessionEvent[]>([]);
  const frame = useRef<number>(0);

  useEffect(() => {
    if (!sessionId) return;
    const source = new EventSource(`/api/chat/sessions/${sessionId}/events`);
    source.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as SessionEvent;
        pending.current.push(event);
        if (frame.current) return;
        frame.current = requestAnimationFrame(() => {
          const batch = pending.current;
          pending.current = [];
          frame.current = 0;
          setEventsBySession((current) => ({
            ...current,
            [sessionId]: [...(current[sessionId] ?? []), ...batch],
          }));
          const last = batch.at(-1);
          if (
            last?.type === "agent.status" &&
            last.publicPayload &&
            typeof last.publicPayload === "object" &&
            "message" in last.publicPayload
          )
            setStatusBySession((current) => ({
              ...current,
              [sessionId]: String(
                (last.publicPayload as { message: string }).message,
              ),
            }));
          if (last?.type === "message.created" || last?.type === "run.completed") {
            void client.invalidateQueries({
              queryKey: ["chat-messages", sessionId],
            });
            void client.invalidateQueries({ queryKey: ["chat-sessions"] });
          }
        });
      } catch {
        /* ignore malformed frames */
      }
    };
    return () => {
      source.close();
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [sessionId, client]);

  return {
    events: sessionId ? (eventsBySession[sessionId] ?? []) : [],
    status: sessionId ? (statusBySession[sessionId] ?? "") : "",
  };
}

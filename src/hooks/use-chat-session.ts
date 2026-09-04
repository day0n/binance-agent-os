"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/components/auth/auth-dialog";
import type { ChatMessage, ChatSession } from "@/domain/chat";

export function useChatSessions() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["chat-sessions"],
    enabled: Boolean(user),
    queryFn: () => api<{ sessions: ChatSession[] }>("/api/chat/sessions"),
  });
}

export function useChatMessages(sessionId?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["chat-messages", sessionId],
    enabled: Boolean(user && sessionId),
    queryFn: () =>
      api<{ messages: ChatMessage[] }>(`/api/chat/sessions/${sessionId}/messages`),
  });
}

export function useSendMessage() {
  const { csrfToken } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      sessionId?: string;
      content: string;
      requestId: string;
    }) =>
      api<{ sessionId: string; runId: string; messageId: string }>(
        "/api/chat/messages",
        {
          method: "POST",
          csrf: csrfToken,
          body: JSON.stringify(body),
        },
      ),
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: ["chat-sessions"] });
      await client.invalidateQueries({
        queryKey: ["chat-messages", result.sessionId],
      });
    },
  });
}

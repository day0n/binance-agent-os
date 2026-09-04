import type { ChatMessage } from "@/domain/chat";
import { compactContext, type ResearchContext } from "@/application/research-context";

export function chatModelContext(input: {
  messages: ChatMessage[];
  summary?: string;
  research?: ResearchContext;
}) {
  return {
    recentMessages: input.messages.slice(-8).map((message) => ({
      role: message.role,
      content: message.content.slice(0, 2000),
    })),
    sessionSummary: input.summary,
    research: input.research ? compactContext(input.research) : undefined,
  };
}

"use client";

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "@/domain/chat";

export function ChatMessageView({ message }: { message: ChatMessage }) {
  return (
    <article className={`chat-bubble ${message.role}`}>
      <small>{message.role === "user" ? "你" : "Agent"}</small>
      {message.role === "assistant" ? (
        <Markdown
          remarkPlugins={[remarkGfm]}
          skipHtml
          components={{
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noreferrer noopener">
                {children}
              </a>
            ),
          }}
        >
          {message.content}
        </Markdown>
      ) : (
        <p>{message.content}</p>
      )}
    </article>
  );
}

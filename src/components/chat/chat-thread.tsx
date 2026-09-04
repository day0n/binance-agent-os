"use client";

import { useEffect, useRef } from "react";
import type { ChatMessage } from "@/domain/chat";
import { ChatMessageView } from "./chat-message";
import { AgentStatus } from "./agent-status";
import { ChatComposer } from "./chat-composer";

export function ChatThread({
  messages,
  status,
  loggedIn,
  onSend,
  onNeedAuth,
}: {
  messages: ChatMessage[];
  status?: string;
  loggedIn: boolean;
  onSend: (content: string) => void;
  onNeedAuth: () => void;
}) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length, status]);
  return (
    <section className="chat-column" aria-label="对话">
      <div className="chat-scroll">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <h2>Binance Agent OS</h2>
            <p>
              多轮研究、现货体检、策略回测，以及需密码确认的小额现货与 USDT
              划转。聊天里输入“确认”不会下单。
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <ChatMessageView key={message.id} message={message} />
          ))
        )}
        <AgentStatus status={status} />
        <div ref={end} />
      </div>
      <ChatComposer
        disabled={!loggedIn}
        onSend={onSend}
        onNeedAuth={onNeedAuth}
      />
    </section>
  );
}

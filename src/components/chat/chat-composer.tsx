"use client";

import { useState } from "react";
import { ArrowUp } from "lucide-react";

export function ChatComposer({
  disabled,
  onSend,
  onNeedAuth,
}: {
  disabled?: boolean;
  onSend: (content: string) => void;
  onNeedAuth: () => void;
}) {
  const [value, setValue] = useState("");
  return (
    <form
      className="chat-composer"
      onSubmit={(event) => {
        event.preventDefault();
        const content = value.trim();
        if (!content) return;
        if (disabled) {
          onNeedAuth();
          return;
        }
        onSend(content);
        setValue("");
      }}
    >
      <label className="sr-only" htmlFor="chat-input">
        发送消息
      </label>
      <textarea
        id="chat-input"
        value={value}
        rows={2}
        placeholder="问行情、账户、回测，或描述一笔不超过 5 USDT 的现货/划转…"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <button type="submit" className="primary-button" aria-label="发送">
        <ArrowUp size={16} />
        发送
      </button>
    </form>
  );
}

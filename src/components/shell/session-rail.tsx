"use client";

import { Plus, Trash2 } from "lucide-react";
import type { ChatSession } from "@/domain/chat";

export function SessionRail({
  sessions,
  activeId,
  onSelect,
  onCreate,
  onDelete,
}: {
  sessions: ChatSession[];
  activeId?: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <aside className="session-rail" aria-label="会话">
      <button type="button" className="primary-button" onClick={onCreate}>
        <Plus size={16} />
        新对话
      </button>
      <ul>
        {sessions.map((session) => (
          <li key={session.id}>
            <button
              type="button"
              className={session.id === activeId ? "active" : ""}
              onClick={() => onSelect(session.id)}
            >
              {session.title}
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={`删除 ${session.title}`}
              onClick={() => onDelete(session.id)}
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

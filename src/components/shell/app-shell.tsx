"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "./app-header";
import { SessionRail } from "./session-rail";
import dynamic from "next/dynamic";
import { ChatThread } from "@/components/chat/chat-thread";

const ResearchCanvas = dynamic(
  () =>
    import("@/components/research/research-canvas").then(
      (module) => module.ResearchCanvas,
    ),
  { ssr: false },
);
import { ConnectionDrawer } from "@/components/binance/connection-drawer";
import { Tabs } from "@/components/ui";
import { useAuth } from "@/components/auth/auth-dialog";
import {
  useChatMessages,
  useChatSessions,
  useSendMessage,
} from "@/hooks/use-chat-session";
import { useSessionEvents } from "@/hooks/use-session-events";
import { api } from "@/lib/api";

export function AppShell({ sessionId }: { sessionId?: string }) {
  const router = useRouter();
  const { user, csrfToken, openAuth } = useAuth();
  const sessions = useChatSessions();
  const messages = useChatMessages(sessionId);
  const send = useSendMessage();
  const { events, status } = useSessionEvents(sessionId);
  const [mobileTab, setMobileTab] = useState("chat");
  const [railOpen, setRailOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);

  useEffect(() => {
    if (sessionId || !sessions.data?.sessions[0]) return;
    router.replace(`/c/${sessions.data.sessions[0].id}`);
  }, [sessionId, sessions.data, router]);

  return (
    <div className="app-shell chat-app">
      <a className="skip-link" href="#chat-input">
        跳到输入框
      </a>
      <AppHeader
        onMenu={() => setRailOpen((value) => !value)}
        onConnect={() => (user ? setConnectOpen(true) : openAuth())}
      />
      <div className={`chat-layout ${railOpen ? "rail-open" : ""}`}>
        <SessionRail
          sessions={sessions.data?.sessions ?? []}
          activeId={sessionId}
          onSelect={(id) => {
            setRailOpen(false);
            router.push(`/c/${id}`);
          }}
          onCreate={async () => {
            if (!user) return openAuth("register");
            const created = await api<{ session: { id: string } }>(
              "/api/chat/sessions",
              {
                method: "POST",
                csrf: csrfToken,
                body: JSON.stringify({}),
              },
            );
            router.push(`/c/${created.session.id}`);
          }}
          onDelete={async (id) => {
            await api(`/api/chat/sessions/${id}`, {
              method: "DELETE",
              csrf: csrfToken,
            });
            await sessions.refetch();
            if (id === sessionId) router.push("/");
          }}
        />
        <div className="chat-main">
          <div className="mobile-tabs">
            <Tabs
              tabs={[
                { id: "chat", label: "对话" },
                { id: "research", label: "研究" },
              ]}
              value={mobileTab}
              onChange={setMobileTab}
            />
          </div>
          <div className={`workspace ${mobileTab}`}>
            <ChatThread
              messages={messages.data?.messages ?? []}
              status={status}
              loggedIn={Boolean(user)}
              onNeedAuth={() => openAuth("register")}
              onSend={(content) => {
                if (!user) return openAuth("register");
                send.mutate(
                  {
                    sessionId,
                    content,
                    requestId: crypto.randomUUID(),
                  },
                  {
                    onSuccess: (result) => {
                      if (result.sessionId !== sessionId)
                        router.push(`/c/${result.sessionId}`);
                    },
                  },
                );
              }}
            />
            <ResearchCanvas
              messages={messages.data?.messages ?? []}
              events={events}
            />
          </div>
        </div>
      </div>
      <ConnectionDrawer open={connectOpen} onClose={() => setConnectOpen(false)} />
    </div>
  );
}

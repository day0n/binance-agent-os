"use client";

export function AgentStatus({ status }: { status?: string }) {
  if (!status) return null;
  return (
    <p className="agent-status" role="status">
      {status}
    </p>
  );
}

import { AppShell } from "@/components/shell/app-shell";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <AppShell sessionId={sessionId} />;
}

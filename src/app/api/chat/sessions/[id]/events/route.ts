import { apiError, requireUser } from "@/adapters/http/session";
import { AppError } from "@/domain/errors";
import {
  getChatSession,
  listSessionEvents,
} from "@/adapters/persistence/chat-store";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireUser();
    const sessionId = (await params).id;
    await getChatSession(sessionId, userId);
    let cursor = Number(
      request.headers.get("last-event-id") ??
        new URL(request.url).searchParams.get("cursor") ??
        0,
    );
    if (!Number.isInteger(cursor) || cursor < 0)
      throw new AppError("INVALID_CURSOR", "事件游标无效。", 400);
    const encoder = new TextEncoder();
    let closed = false;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const end = Date.now() + 50000;
        try {
          while (!closed && !request.signal.aborted && Date.now() < end) {
            const events = await listSessionEvents(sessionId, userId, cursor);
            if (closed || request.signal.aborted) break;
            for (const event of events) {
              controller.enqueue(
                encoder.encode(
                  `id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`,
                ),
              );
              cursor = event.seq;
            }
            controller.enqueue(encoder.encode(": heartbeat\n\n"));
            await new Promise<void>((resolve) => {
              const done = () => {
                clearTimeout(timer);
                request.signal.removeEventListener("abort", done);
                resolve();
              };
              const timer = setTimeout(done, 1500);
              request.signal.addEventListener("abort", done, { once: true });
              if (request.signal.aborted) done();
            });
          }
        } catch {
          if (!closed && !request.signal.aborted)
            controller.enqueue(
              encoder.encode("event: unavailable\ndata: {}\n\n"),
            );
        } finally {
          if (!closed) {
            closed = true;
            controller.close();
          }
        }
      },
      cancel() {
        closed = true;
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

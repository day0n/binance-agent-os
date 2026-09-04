import { eventsAfter, getRun } from "@/adapters/persistence/store";
import { terminalStatuses } from "@/domain/contracts";
import { requireUser, apiError } from "@/adapters/http/session";
import { AppError } from "@/domain/errors";
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId: user } = await requireUser();
    const id = (await params).id;
    const first = await getRun(id, user);
    let cursor = Number(
      request.headers.get("last-event-id") ??
        new URL(request.url).searchParams.get("cursor") ??
        0,
    );
    if (!Number.isInteger(cursor) || cursor < 0 || cursor > first.events.length)
      throw new AppError("INVALID_CURSOR", "事件游标无效。", 400);
    const encoder = new TextEncoder();
    let closed = false;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const end = Date.now() + 50000;
        try {
          while (!closed && !request.signal.aborted && Date.now() < end) {
            const run = await getRun(id, user);
            if (closed || request.signal.aborted) break;
            for (const event of eventsAfter(run, cursor)) {
              controller.enqueue(
                encoder.encode(
                  `id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`,
                ),
              );
              cursor++;
            }
            if (terminalStatuses.includes(run.status)) {
              controller.enqueue(
                encoder.encode(
                  `event: done\ndata: ${JSON.stringify({ status: run.status })}\n\n`,
                ),
              );
              break;
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
  } catch (e) {
    return apiError(e);
  }
}

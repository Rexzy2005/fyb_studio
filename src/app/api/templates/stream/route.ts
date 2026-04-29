import { onTemplateChange, type TemplateChangeEvent } from "@/backend/events/templates.bus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

function format(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function GET() {
  let unsubscribe: (() => void) | null = null;
  let pingInterval: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(format("ready", { at: new Date().toISOString() }));

      unsubscribe = onTemplateChange((event: TemplateChangeEvent) => {
        if (closed) return;
        try {
          controller.enqueue(format("changed", event));
        } catch {
          // Stream closed by client.
        }
      });

      pingInterval = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: keepalive\n\n`));
        } catch {
          // Ignore.
        }
      }, 25_000);
    },

    cancel() {
      closed = true;
      if (unsubscribe) unsubscribe();
      if (pingInterval) clearInterval(pingInterval);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

import "server-only";

export type SendEvent = (event: string, data: unknown) => void;

/**
 * Server-Sent Events response. The handler gets `send` and an AbortSignal that
 * fires when the client disconnects (request.signal) so upstream AI calls stop.
 */
export function sseResponse(request: Request, handler: (send: SendEvent, signal: AbortSignal) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const controller = new AbortController();
  request.signal.addEventListener("abort", () => controller.abort(), { once: true });

  const stream = new ReadableStream<Uint8Array>({
    async start(c) {
      let closed = false;
      const send: SendEvent = (event, data) => {
        if (closed) return;
        try {
          c.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };
      try {
        await handler(send, controller.signal);
        send("done", {});
      } catch (err) {
        if (!controller.signal.aborted) {
          console.error("[jarvis-ai] stream error:", err instanceof Error ? err.message : err);
          send("error", { message: friendlyError(err) });
        }
      } finally {
        closed = true;
        try {
          c.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      controller.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

function friendlyError(err: unknown): string {
  const status = (err as { status?: number })?.status;
  if (status === 401 || status === 403) return "The AI provider rejected the API key. Check it in .env.local.";
  if (status === 429) return "The AI provider is rate limiting us. Try again in a moment.";
  if (status === 402) return "The AI account is out of credits.";
  return err instanceof Error && err.message.length < 200 ? err.message : "Jarvis hit an error. Try again.";
}

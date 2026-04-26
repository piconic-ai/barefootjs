/**
 * BarefootJS Dev Reloader for Cloudflare Workers / other edge runtimes.
 *
 * Unlike `./dev`'s `createDevReloader`, this variant does not watch the local
 * filesystem — it generates a fresh boot ID on every cold start and relies on
 * the standard SSE `Last-Event-ID` reconnection protocol to detect restarts:
 *
 *   1. First connect       → send `event: hello`, `id: <BOOT_ID>`.
 *   2. Worker restart      → SSE stream drops, client reconnects with
 *      `Last-Event-ID: <old BOOT_ID>`.
 *   3. Server sees mismatch → send `event: reload`, client refreshes.
 *
 * Pair with `BfDevReload` from `@barefootjs/hono/dev-reload`.
 */

import type { Context } from 'hono'

export interface CreateDevReloaderOptions {
  /** Override the dev gate. Defaults to `process.env.NODE_ENV !== 'production'`. */
  enabled?: boolean
}

const HEARTBEAT_MS = 5000

// Generated once per Worker isolate. A cold start or code change rotates this,
// which is exactly the signal we want to surface to the browser.
const BOOT_ID = generateBootId()

function generateBootId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  }
}

function isDevDefault(): boolean {
  return process.env.NODE_ENV !== 'production'
}

/**
 * Hono route handler that streams Server-Sent Events. Returns 404 in
 * production (`NODE_ENV=production`) unless `enabled` is set explicitly.
 */
export function createDevReloader(
  options: CreateDevReloaderOptions = {},
): (c: Context) => Response | Promise<Response> {
  const { enabled = isDevDefault() } = options

  return (c: Context) => {
    if (!enabled) return c.notFound()

    const lastEventId = (c.req.header('Last-Event-ID') ?? '').trim()
    const signal = c.req.raw.signal

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder()
        const send = (chunk: string) => {
          try {
            controller.enqueue(encoder.encode(chunk))
          } catch {
            // Stream already closed (client disconnected).
          }
        }

        send(`retry: 1000\n\n`)
        // On reconnect with a different boot id, the Worker restarted (or was
        // evicted from the isolate cache) while the client was disconnected —
        // signal a reload so the browser picks up any new code + assets.
        const event = lastEventId && lastEventId !== BOOT_ID ? 'reload' : 'hello'
        send(`event: ${event}\nid: ${BOOT_ID}\ndata: ${BOOT_ID}\n\n`)

        const heartbeat = setInterval(() => send(`: hb\n\n`), HEARTBEAT_MS)
        const onAbort = () => {
          clearInterval(heartbeat)
          try { controller.close() } catch { /* already closed */ }
        }
        if (signal.aborted) onAbort()
        else signal.addEventListener('abort', onAbort, { once: true })
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  }
}

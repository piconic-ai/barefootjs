/**
 * BarefootJS Dev Reloader (Hono)
 *
 * Dev-only helpers that turn `barefoot build --watch`'s sentinel file
 * (`<distDir>/.dev/build-id`) into a browser auto-reload.
 *
 * Pipeline:
 *   [barefoot build --watch] → writes `<distDir>/.dev/build-id` after each successful build
 *   [createDevReloader]      → watches that file, streams SSE `event: reload`
 *   [BfDevReload snippet]    → EventSource subscriber → `location.reload()`
 *
 * Usage:
 * ```tsx
 * // server.tsx
 * import { createDevReloader } from '@barefootjs/hono/dev'
 * app.get('/_bf/reload', createDevReloader({ distDir: './dist' }))
 *
 * // renderer.tsx
 * import { BfDevReload } from '@barefootjs/hono/dev'
 * <body>{children}<BfScripts /><BfDevReload /></body>
 * ```
 *
 * Both pieces are no-ops in production (`NODE_ENV === 'production'`) unless
 * explicitly enabled.
 */

import type { Context } from 'hono'
import { mkdir, readFile, watch } from 'node:fs/promises'
import { resolve } from 'node:path'

// Re-export BfDevReload from its dependency-free home so `import { BfDevReload }
// from '@barefootjs/hono/dev'` keeps working for existing callers. Runtimes that
// can't load node:fs (Workers, edge) should import it directly from
// '@barefootjs/hono/dev-reload' to avoid pulling this file's fs imports.
export { BfDevReload, type BfDevReloadProps } from './dev-reload'

export interface CreateDevReloaderOptions {
  /** Directory that `barefoot build` writes output into (contains `.dev/build-id`). */
  distDir: string
  /** Override the dev gate. Defaults to `process.env.NODE_ENV !== 'production'`. */
  enabled?: boolean
}

// Sentinel path contract with `@barefootjs/cli`. These values must match
// `DEV_SENTINEL_SUBDIR` / `DEV_SENTINEL_FILENAME` in `packages/cli/src/lib/build.ts`
// — duplicated intentionally to avoid a runtime dep on the CLI.
const DEV_SUBDIR = '.dev'
const BUILD_ID_FILE = 'build-id'
/**
 * Heartbeat interval for idle keepalive. Must stay comfortably under Bun's
 * default 10s idleTimeout — otherwise the server would close a quiet SSE
 * stream and the browser would EventSource-reconnect every cycle, which can
 * lose a rebuild event emitted in the gap between close and reconnect.
 */
const HEARTBEAT_MS = 5000

function isDevDefault(): boolean {
  return process.env.NODE_ENV !== 'production'
}

/**
 * Hono route handler that streams Server-Sent Events and emits `reload` every
 * time `<distDir>/.dev/build-id` is written. Disabled (404) in production.
 */
export function createDevReloader(
  options: CreateDevReloaderOptions,
): (c: Context) => Response | Promise<Response> {
  const { distDir, enabled = isDevDefault() } = options

  return async (c: Context) => {
    if (!enabled) return c.notFound()

    const devDir = resolve(distDir, DEV_SUBDIR)
    // Ensure the directory exists so fs.watch doesn't ENOENT before the first build.
    await mkdir(devDir, { recursive: true })

    const buildIdPath = resolve(devDir, BUILD_ID_FILE)
    const signal = c.req.raw.signal
    // If the client reconnects with Last-Event-ID (the build-id it last saw)
    // and the current build-id is newer, a rebuild happened while it was
    // disconnected — recover by firing `reload` immediately instead of `hello`.
    const lastEventId = (c.req.header('Last-Event-ID') ?? '').trim()

    const readBuildId = async (): Promise<string> => {
      try {
        return (await readFile(buildIdPath, 'utf8')).trim()
      } catch {
        return ''
      }
    }

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder()
        const send = (chunk: string) => {
          try {
            controller.enqueue(encoder.encode(chunk))
          } catch {
            // Stream already closed (client disconnected).
          }
        }

        send(`retry: 1000\n\n`)
        let lastSentId = ''
        const initialId = await readBuildId()
        if (initialId) {
          lastSentId = initialId
          const event = lastEventId && lastEventId !== initialId ? 'reload' : 'hello'
          send(`event: ${event}\nid: ${initialId}\ndata: ${initialId}\n\n`)
        }

        // Heartbeat keeps the connection under Bun's idleTimeout so that a
        // silent period between builds doesn't close the socket (which would
        // otherwise race with in-flight rebuilds and drop `reload` events).
        const heartbeat = setInterval(() => send(`: hb\n\n`), HEARTBEAT_MS)

        try {
          // Watch the parent directory: the build-id file may not exist yet,
          // and `fs.watch` on a missing path throws.
          const iter = watch(devDir, { signal })
          for await (const event of iter) {
            if (event.filename !== BUILD_ID_FILE) continue
            const id = await readBuildId()
            if (!id || id === lastSentId) continue
            lastSentId = id
            send(`event: reload\nid: ${id}\ndata: ${id}\n\n`)
          }
        } catch (err) {
          const name = (err as { name?: string } | undefined)?.name
          if (name !== 'AbortError') {
            const message = (err as Error).message ?? 'watch error'
            send(`event: error\ndata: ${JSON.stringify(message)}\n\n`)
          }
        } finally {
          clearInterval(heartbeat)
          try { controller.close() } catch { /* already closed */ }
        }
      },
      cancel() {
        // Client disconnected; fs.watch will unwind via `signal`.
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


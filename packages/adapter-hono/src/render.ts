/**
 * Framework-agnostic SSR render entry for the hono/jsx runtime.
 *
 * BarefootJS components compiled with the Hono adapter are plain
 * `hono/jsx` components: they render to an HTML string without needing a
 * Hono `app`, a router, or `hono/jsx-renderer`'s request context. This
 * module exposes that capability directly so any HTTP framework (h3,
 * Elysia, Express, …) can host BarefootJS by importing this package as a
 * render runtime — the same way the Go `Echo` integration imports the
 * framework-agnostic `bf` runtime shipped by the go-template adapter.
 *
 * Two entry points:
 *   - `renderToHtml`   — buffered: resolves the whole tree to one string.
 *   - `renderToStream` — streaming: returns a `ReadableStream` so
 *                        `<Suspense>` boundaries flush out-of-order.
 *
 * Both accept a `hono/jsx` node (typically a full page including the
 * layout shell, `<BfImportMap>`, and `<BfScripts>`).
 */

import { renderToReadableStream } from 'hono/jsx/streaming'

/**
 * Render a hono/jsx node to a complete HTML string.
 *
 * A `hono/jsx` node stringifies via `.toString()`, which returns either
 * a string (fully synchronous tree) or a `Promise<string>` (the tree
 * contains an `async` component). We normalise both to `Promise<string>`
 * so callers always `await` once. Streaming `<Suspense>` boundaries are
 * NOT resolved here — use `renderToStream` when the page streams.
 */
export async function renderToHtml(node: unknown): Promise<string> {
  const out = (node as { toString(): string | Promise<string> }).toString()
  return out instanceof Promise ? await out : out
}

/**
 * Render a hono/jsx node to a `ReadableStream` of UTF-8 HTML chunks.
 *
 * Use this when the page contains `<Suspense>` boundaries (e.g. async
 * data / streaming SSR): the shell flushes immediately and each boundary
 * streams in as it resolves. The returned stream is a Web-standard
 * `ReadableStream`, directly returnable from any WinterCG-compatible
 * handler (h3, Elysia, Hono, Workers, …).
 */
export function renderToStream(node: unknown): ReadableStream {
  return renderToReadableStream(node as Parameters<typeof renderToReadableStream>[0])
}

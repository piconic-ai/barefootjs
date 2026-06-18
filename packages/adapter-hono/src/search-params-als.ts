/**
 * Request-scoped `searchParams()` SSR for the framework-agnostic `renderToHtml`
 * path — the non-Hono JS hosts (h3 / Elysia / Express / any WinterCG handler)
 * that render BarefootJS components as plain `hono/jsx` without Hono's
 * `jsxRenderer`. spec/router.md v0.5 ("The wedge"), #1922.
 *
 * Hono resolves the per-request query through `useRequestContext()` inside its
 * `jsxRenderer` async context. `renderToHtml` has no such context, so without
 * this `searchParams()` resolves to the empty query regardless of the request —
 * query-dependent initial content flashes / mismatches on hydration (the client
 * then corrects it from `window.location.search`).
 *
 * A process-wide reader mutated per request would RACE across concurrent
 * requests (the spec explicitly forbids it), so the query is scoped with a Node
 * `AsyncLocalStorage`: each render runs inside `runWithSearchParams(search, …)`
 * and the reader returns the current async context's query — race-free.
 *
 * The reader is published on the shared `globalThis.__bf_serverSearchReader`
 * seam (the same one Hono's auto-wire uses, and which `@barefootjs/client`'s
 * `searchParams()` reads on the server) — never by importing `@barefootjs/client`,
 * so this module can't pull a second client instance. We install at most once
 * and capture whatever reader was already on the seam (e.g. Hono's
 * `useRequestContext` reader): when no render scope is active we delegate to it,
 * so a process mixing Hono and `renderToHtml` hosts keeps resolving both ways.
 *
 * Node-only (`node:async_hooks`). It lives behind its own subpath
 * (`@barefootjs/hono/search-params`) imported solely by Node/Bun hosts, so the
 * edge/Workers path through `renderToHtml` never loads `async_hooks`.
 */

import { AsyncLocalStorage } from 'node:async_hooks'

type SeamHolder = { __bf_serverSearchReader?: () => string }

const searchStore = new AsyncLocalStorage<string>()
let installed = false

function ensureReaderInstalled(): void {
  if (installed) return
  installed = true
  const holder = globalThis as unknown as SeamHolder
  // The reader already on the seam (e.g. Hono's useRequestContext-based one,
  // installed at startup by `@barefootjs/hono/app`). We delegate to it when no
  // render scope is active so a mixed Hono + renderToHtml process still works.
  const prior = holder.__bf_serverSearchReader
  holder.__bf_serverSearchReader = () => {
    const scoped = searchStore.getStore()
    if (scoped !== undefined) return scoped
    return typeof prior === 'function' ? prior() : ''
  }
}

/**
 * Run `fn` — typically a `renderToHtml(node)` call — with `searchParams()` bound
 * to `search` for the duration of this async context. `search` is the request's
 * query string with or without a leading `?` (e.g. `new URL(req.url).search` on
 * Elysia, `getRequestURL(event).search` on h3); `URLSearchParams` strips the `?`.
 *
 * The binding is scoped to this async context (it propagates across the awaits
 * inside `renderToHtml`, including `async` components), so concurrent renders
 * never observe each other's query.
 *
 * Usage:
 *
 *   const html = await runWithSearchParams(
 *     new URL(req.url).search,
 *     () => renderToHtml(<Layout …>…</Layout>),
 *   )
 */
export function runWithSearchParams<T>(search: string, fn: () => T): T {
  ensureReaderInstalled()
  return searchStore.run(search, fn)
}

/**
 * Auto-wire request-scoped `searchParams()` for Hono SSR (spec/router.md "The
 * wedge", v0.5).
 *
 * `@barefootjs/client`'s `searchParams()` is environment-neutral: on the server
 * it asks for the current request's query string through a reader seam. Hono
 * exposes the active request via `useRequestContext()` (async-context scoped),
 * so the reader resolves **per request** with no shared mutable state to race.
 *
 * We publish the reader on the keyed `globalThis.__bf_serverEnvReader` seam —
 * the server-side analogue of the client's `window.__bf_*` seams — rather than
 * importing `@barefootjs/client`. SSR templates resolve the `@barefootjs/client`
 * specifier through the adapter's shim, so this infrastructure module stays
 * decoupled from the client package while still wiring it. This module is
 * imported for its side effect by `app.ts`, so any Hono SSR app that renders
 * the BarefootJS scripts gets request-scoped `searchParams()` with no opt-in.
 *
 * The reader is keyed by env id, so one seam serves every env signal
 * (`searchParams()` via `'search'` today; cookies, … later). Unknown keys
 * return `undefined` to defer to the empty default.
 */

import { useRequestContext } from 'hono/jsx-renderer'

/** Extract the query string (including leading `?`, or `''`) from a request URL. */
export function searchFromRequestUrl(url: string): string {
  try {
    return new URL(url).search
  } catch {
    return ''
  }
}

;(
  globalThis as unknown as { __bf_serverEnvReader?: (key: string) => string | undefined }
).__bf_serverEnvReader = (key) => {
  if (key !== 'search') return undefined
  try {
    return searchFromRequestUrl(useRequestContext().req.url)
  } catch {
    // No active request context (e.g. a non-request render) — defer to default.
    return undefined
  }
}

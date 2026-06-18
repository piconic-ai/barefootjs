/**
 * Request-scoped environment values for the framework-agnostic `renderToHtml`
 * path — the non-Hono JS hosts (h3 / Elysia / any WinterCG handler) that render
 * BarefootJS components as plain `hono/jsx` without Hono's `jsxRenderer`.
 * spec/router.md v0.5 ("The wedge"), #1922.
 *
 * Hono resolves a request's environment through `useRequestContext()` inside its
 * `jsxRenderer` async context. `renderToHtml` has no such context, so without
 * this an env signal (`searchParams()`, …) resolves to its empty default
 * regardless of the request — query-dependent initial content flashes /
 * mismatches on hydration (the client then corrects it from the live browser
 * state).
 *
 * A process-wide reader mutated per request would RACE across concurrent
 * requests (the spec explicitly forbids it), so the values are scoped with a
 * Node `AsyncLocalStorage`: each render runs inside `runWithRequestEnv(env, …)`
 * and the reader returns the current async context's value — race-free.
 *
 * The reader is published on the shared, KEYED `globalThis.__bf_serverEnvReader`
 * seam (the same one Hono's auto-wire uses, and which `@barefootjs/client`'s env
 * signals read on the server) — never by importing `@barefootjs/client`, so this
 * module can't pull a second client instance. One seam serves every env signal,
 * so a new signal (cookies, …) is a new field on {@link BfRequestEnv}, not a new
 * wrapper function. We install at most once and capture whatever reader was
 * already on the seam (e.g. Hono's `useRequestContext` reader): when no render
 * scope is active — or this env doesn't carry the requested key — we delegate to
 * it, so a process mixing Hono and `renderToHtml` hosts keeps resolving both ways.
 *
 * Lives behind its own subpath (`@barefootjs/hono/request-env`), imported only
 * by the hosts that opt in, so the always-on `renderToHtml` path never loads
 * `node:async_hooks`.
 */

import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Per-request environment values, keyed to match the `@barefootjs/client` env
 * signals. A new env signal adds a field here; the host passes one more value —
 * no new wrapper function.
 */
export interface BfRequestEnv {
  /**
   * The request's query string, with or without a leading `?` (e.g.
   * `new URL(req.url).search` on Elysia, `getRequestURL(event).search` on h3).
   * Backs `searchParams()`; `URLSearchParams` strips the `?`.
   */
  search?: string
}

type SeamHolder = { __bf_serverEnvReader?: (key: string) => string | undefined }

const envStore = new AsyncLocalStorage<BfRequestEnv>()
let installed = false

function ensureReaderInstalled(): void {
  if (installed) return
  installed = true
  const holder = globalThis as unknown as SeamHolder
  // The keyed reader already on the seam (e.g. Hono's useRequestContext-based
  // one, installed at startup by `@barefootjs/hono/app`). We delegate to it when
  // no render scope is active — or this env lacks the key — so a mixed Hono +
  // renderToHtml process still resolves both ways.
  const prior = holder.__bf_serverEnvReader
  holder.__bf_serverEnvReader = (key) => {
    const env = envStore.getStore()
    if (env) {
      const value = env[key as keyof BfRequestEnv]
      if (value !== undefined) return value
    }
    return typeof prior === 'function' ? prior(key) : undefined
  }
}

/**
 * Run `fn` — typically `() => renderToHtml(node)` — with the given request
 * environment bound for the duration of its async context, so env signals
 * (`searchParams()`, …) resolve this request's values at SSR. The binding
 * propagates across the awaits inside `renderToHtml` (including `async`
 * components), and concurrent renders each see their own `env` — never a shared
 * per-request global (which the spec forbids because it races).
 *
 * Usage:
 *
 *   const html = await runWithRequestEnv(
 *     { search: new URL(req.url).search },
 *     () => renderToHtml(<Layout …>…</Layout>),
 *   )
 */
export function runWithRequestEnv<T>(env: BfRequestEnv, fn: () => T): T {
  ensureReaderInstalled()
  return envStore.run(env, fn)
}

/**
 * Derive the request environment from a WinterCG `Request` — the single place
 * that maps a request to env-signal values. A new env signal extends this (and
 * {@link BfRequestEnv}); hosts using {@link withRequestEnv} get it for free.
 */
function requestEnv(request: Request): BfRequestEnv {
  return { search: new URL(request.url).search }
  // When the cookie env signal lands:
  //   cookie: request.headers.get('cookie') ?? undefined
}

/**
 * Wrap a WinterCG `fetch` handler so the whole request runs with its env bound —
 * env signals (`searchParams()`, …) resolve this request's values at SSR with no
 * per-render plumbing. Bind ONCE at the entry point and every `renderToHtml`
 * inside (across routing, handlers, `async` components) inherits it via the
 * async context; concurrent requests never race.
 *
 *   export default { port, fetch: withRequestEnv(handler) }
 *
 * Extra args (the framework / Bun server, Workers `env` / `ctx`) pass through
 * unchanged. The env is derived from the `Request` by {@link requestEnv}, so the
 * host never names env keys — a future signal (cookies, …) needs no host change.
 */
export function withRequestEnv<A extends unknown[]>(
  handler: (request: Request, ...args: A) => Response | Promise<Response>,
): (request: Request, ...args: A) => Promise<Response> {
  return (request, ...args) =>
    runWithRequestEnv(requestEnv(request), async () => handler(request, ...args))
}

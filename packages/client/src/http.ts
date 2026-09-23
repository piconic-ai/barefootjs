/**
 * `http` — pure request descriptors for `createQuery` / `createMutation`
 * (spec/async.md §7.2). Every constructor is synchronous, performs no I/O, and
 * returns a frozen plain object: `{ kind: 'http', method, url, params?, body?,
 * init? }`. The generic `T` (the response type) is carried only in the type —
 * a phantom, never-set field — so `createQuery` can check `initial` against it
 * and type `value()`.
 *
 * `params` (safe methods `get` / `head`) and `body` (`query` and the unsafe
 * methods) are mutually exclusive per constructor; the shared `HttpDescriptor`
 * shape just has both fields optional so `requestKey` / `sendRequest` can stay
 * uniform.
 */

/**
 * One `http` param value. Unlike `queryHref`'s string-only `QueryParamValue`,
 * numbers and booleans are accepted and kept — including `0` and `false` —
 * because descriptors are never lowered to an SSR template (no string-only
 * parity requirement to preserve). `null`, `undefined` and `''` are omitted;
 * an array appends one entry per member.
 *
 * @since 0.38.0
 * @stability alpha
 */
export type HttpParamValue = string | number | boolean | (string | number)[] | null | undefined

/**
 * The params object `http.get` / `http.head` accept.
 *
 * @since 0.38.0
 * @stability alpha
 */
export type HttpParams = Record<string, HttpParamValue>

/**
 * The third argument any `http` constructor accepts. v0 is intentionally
 * narrow — headers and credentials only.
 *
 * @since 0.38.0
 * @stability alpha
 */
export interface HttpInit {
  readonly headers?: Record<string, string>
  readonly credentials?: RequestCredentials
}

/**
 * The HTTP methods `http` can build a descriptor for. `QUERY` is the safe,
 * read-with-a-body method (spec/async.md §7.2); it is not a method
 * `fetch`/`XMLHttpRequest` special-case, so it is sent like any other verb.
 *
 * @since 0.38.0
 * @stability alpha
 */
export type HttpMethod = 'GET' | 'QUERY' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

const SAFE_METHODS: ReadonlySet<HttpMethod> = new Set(['GET', 'QUERY', 'HEAD'])

/**
 * A pure request descriptor. Constructing one performs no I/O — see the
 * `http` namespace below. `T` is a phantom: it is never set on the runtime
 * object, only carried in the type so `createQuery`'s `initial` and `value()`
 * can be checked against it.
 *
 * @since 0.38.0
 * @stability alpha
 */
export type HttpDescriptor<T = unknown> = Readonly<{
  kind: 'http'
  method: HttpMethod
  url: string
  params?: HttpParams
  body?: unknown
  init?: HttpInit
  /** Phantom; never set at runtime. */
  readonly __responseType?: T
}>

/**
 * Is `descriptor` an `http` descriptor built by the `http` namespace below?
 * `createQuery` uses this to reject non-descriptor return values (spec/async.md
 * §7's "only descriptors in v0" rule for the runtime PR).
 *
 * @since 0.38.0
 * @stability alpha
 */
export function isHttpDescriptor(value: unknown): value is HttpDescriptor {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { kind?: unknown }).kind === 'http'
  )
}

/**
 * Is `method` one of the safe methods (`GET`, `QUERY`, `HEAD`)? Used by
 * `createMutation` (a later PR) to warn on a safe method passed to a mutation.
 *
 * @since 0.38.0
 * @stability alpha
 */
export function isSafeMethod(method: HttpMethod): boolean {
  return SAFE_METHODS.has(method)
}

/**
 * Recursively `Object.freeze` `value` and everything reachable from it.
 * Guards against cycles with `seen` (an object already visited is skipped,
 * not re-frozen) so a circular `body`/`params`/`init` freezes without
 * looping — mirrors `Object.freeze`'s own no-op-on-primitive semantics.
 */
function deepFreeze<T>(value: T, seen: Set<unknown> = new Set()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value
  seen.add(value)
  const values = Array.isArray(value) ? value : Object.values(value as Record<string, unknown>)
  for (const v of values) deepFreeze(v, seen)
  return Object.freeze(value)
}

function freeze<T>(descriptor: HttpDescriptor<T>): HttpDescriptor<T> {
  deepFreeze(descriptor.params)
  deepFreeze(descriptor.body)
  deepFreeze(descriptor.init)
  return Object.freeze(descriptor)
}

function withParams<T>(method: HttpMethod, url: string, params?: HttpParams, init?: HttpInit): HttpDescriptor<T> {
  return freeze({ kind: 'http', method, url, params, init })
}

function withBody<T>(method: HttpMethod, url: string, body?: unknown, init?: HttpInit): HttpDescriptor<T> {
  return freeze({ kind: 'http', method, url, body, init })
}

/**
 * Build `http` request descriptors — pure, synchronous, no I/O. See the
 * module doc comment and spec/async.md §7.2 for the constructor table and the
 * params/body serialisation rules.
 *
 * @since 0.38.0
 * @stability alpha
 */
export const http = {
  /** Safe. `params` (query string) is optional. */
  get<T>(url: string, params?: HttpParams, init?: HttpInit): HttpDescriptor<T> {
    return withParams<T>('GET', url, params, init)
  },
  /** Safe — HTTP QUERY: a read with a body. `body` is optional JSON. */
  query<T>(url: string, body?: unknown, init?: HttpInit): HttpDescriptor<T> {
    return withBody<T>('QUERY', url, body, init)
  },
  /** Safe. `params` (query string) is optional. Always resolves to `undefined`. */
  head<T>(url: string, params?: HttpParams, init?: HttpInit): HttpDescriptor<T> {
    return withParams<T>('HEAD', url, params, init)
  },
  /** Unsafe. `body` is optional JSON. */
  post<T>(url: string, body?: unknown, init?: HttpInit): HttpDescriptor<T> {
    return withBody<T>('POST', url, body, init)
  },
  /** Unsafe. `body` is optional JSON. */
  put<T>(url: string, body?: unknown, init?: HttpInit): HttpDescriptor<T> {
    return withBody<T>('PUT', url, body, init)
  },
  /** Unsafe. `body` is optional JSON. */
  patch<T>(url: string, body?: unknown, init?: HttpInit): HttpDescriptor<T> {
    return withBody<T>('PATCH', url, body, init)
  },
  /** Unsafe. `body` is optional JSON. */
  delete<T>(url: string, body?: unknown, init?: HttpInit): HttpDescriptor<T> {
    return withBody<T>('DELETE', url, body, init)
  },
}

/**
 * Append `params` onto `url` as a query string. Unlike `queryHref`, `0` and
 * `false` are kept (spec/async.md §7.2 / issue #3156): a value is omitted
 * only when it is `null`, `undefined`, or `''`. Numbers and booleans are
 * stringified; an array appends one entry per surviving member. Keys are
 * visited in sorted order (not insertion order) so `requestKey` — which
 * builds its cache/dedup key from this function's output — is stable
 * regardless of the order a caller happened to list `params` in, matching
 * `stableBodyKey`'s equivalent guarantee for `body`.
 */
function serializeParams(url: string, params?: HttpParams): string {
  if (!params) return url
  const usp = new URLSearchParams()
  for (const key of Object.keys(params).sort()) {
    const value = params[key]
    if (Array.isArray(value)) {
      for (const member of value) {
        if (member === null || member === undefined || member === '') continue
        usp.append(key, String(member))
      }
      continue
    }
    if (value === null || value === undefined || value === '') continue
    usp.append(key, String(value))
  }
  const qs = usp.toString()
  if (!qs) return url
  return url.includes('?') ? `${url}&${qs}` : `${url}?${qs}`
}

/**
 * Deterministically re-order an arbitrary JSON-serialisable value's object
 * keys (recursively), leaving array order untouched, so
 * `JSON.stringify(sortKeysDeep(v))` is stable regardless of the original key
 * insertion order.
 *
 * `ancestors` tracks the objects/arrays currently being recursed into (the
 * path from the root, not every node ever visited), so revisiting the same
 * object via two different sibling branches is fine but a true cycle throws
 * a `TypeError` here — the same failure `JSON.stringify` itself would
 * raise — instead of recursing until the call stack overflows.
 */
function sortKeysDeep(value: unknown, ancestors: Set<unknown> = new Set()): unknown {
  if (value === null || typeof value !== 'object') return value
  if (ancestors.has(value)) {
    throw new TypeError('Converting circular structure to JSON (http request body)')
  }
  ancestors.add(value)
  try {
    if (Array.isArray(value)) return value.map((v) => sortKeysDeep(v, ancestors))
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    const sorted: Record<string, unknown> = {}
    for (const [key, v] of entries) sorted[key] = sortKeysDeep(v, ancestors)
    return sorted
  } finally {
    ancestors.delete(value)
  }
}

/** Stable JSON serialisation of `body` — `''` when `body` is `undefined`. */
function stableBodyKey(body: unknown): string {
  if (body === undefined) return ''
  return JSON.stringify(sortKeysDeep(body))
}

/**
 * The cache / dedup key for a descriptor: `method + ' ' + url-with-serialised-
 * params + ' ' + stable JSON of body`. Stable under object-key reordering in
 * `body` (recursively sorted); array order in `body` is significant. Headers
 * and credentials are not part of the key.
 *
 * @since 0.38.0
 * @stability alpha
 */
export function requestKey(descriptor: HttpDescriptor<unknown>): string {
  const urlWithParams = serializeParams(descriptor.url, descriptor.params)
  return `${descriptor.method} ${urlWithParams} ${stableBodyKey(descriptor.body)}`
}

/**
 * A non-2xx HTTP response, thrown by `sendRequest`. `body` is the parsed JSON
 * body when the response could be parsed as JSON, else the raw text, else
 * `undefined`.
 *
 * @since 0.38.0
 * @stability alpha
 */
export class HttpError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(status: number, body: unknown) {
    super(`http ${status}`)
    this.name = 'HttpError'
    this.status = status
    this.body = body
  }
}

async function parseErrorBody(response: Response): Promise<unknown> {
  const clone = response.clone()
  try {
    return await response.json()
  } catch {
    try {
      return await clone.text()
    } catch {
      return undefined
    }
  }
}

/**
 * Send a descriptor built by `http` and resolve with its response. v0 is
 * JSON-only: a request with a body is sent with `Content-Type:
 * application/json` (unless `init.headers` overrides it), and a successful
 * response is parsed with `response.json()` — except `HEAD`, whose successful
 * response resolves to `undefined` (a `HEAD` response has no body). A non-2xx
 * response rejects with `HttpError`, `HEAD` included; a network failure rejects
 * with the underlying error unchanged.
 *
 * Internal to `@barefootjs/client` — `createQuery` (issue #3157) is the only
 * caller. Not exported from the package's public entry.
 *
 * @internal
 */
export async function sendRequest<T>(descriptor: HttpDescriptor<T>, signal?: AbortSignal): Promise<T> {
  const url = serializeParams(descriptor.url, descriptor.params)
  const hasBody = descriptor.body !== undefined
  const headers: Record<string, string> = {
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    ...(descriptor.init?.headers ?? {}),
  }

  const response = await fetch(url, {
    method: descriptor.method,
    headers,
    body: hasBody ? JSON.stringify(descriptor.body) : undefined,
    credentials: descriptor.init?.credentials,
    signal,
  })

  if (!response.ok) {
    throw new HttpError(response.status, await parseErrorBody(response))
  }

  if (descriptor.method === 'HEAD') return undefined as T

  return (await response.json()) as T
}

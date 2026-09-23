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
 *
 * A `body` is JSON by default; the other kinds are sent as fetch would send
 * them. `bodyKind` below is the one place that decides which is which, and
 * `snapshot`, `requestKey` and `sendRequest` all follow it.
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
 * How a `body` is sent, decided once from its runtime type:
 *
 * - `json` — plain objects, arrays, numbers, booleans, `null` (the default).
 *   Sent as `JSON.stringify(body)` with `application/json; charset=utf-8`.
 * - `text` — a string. Sent as-is with `text/plain;charset=UTF-8`.
 * - `form` / `urlencoded` / `blob` / `bytes` — `FormData`, `URLSearchParams`,
 *   `Blob` (and `File`), `ArrayBuffer` or an `ArrayBuffer` view. Handed to
 *   fetch unchanged with no `Content-Type` of ours, so fetch derives it
 *   (multipart with its boundary, form-urlencoded, the Blob's own type).
 *
 * A `Content-Type` in `init.headers` replaces the default for any kind.
 */
type BodyKind = 'json' | 'text' | 'form' | 'urlencoded' | 'blob' | 'bytes'

function bodyKind(body: unknown): BodyKind {
  if (typeof body === 'string') return 'text'
  if (typeof FormData !== 'undefined' && body instanceof FormData) return 'form'
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) return 'urlencoded'
  if (typeof Blob !== 'undefined' && body instanceof Blob) return 'blob'
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return 'bytes'
  return 'json'
}

/**
 * A descriptor can be sent more than once (a dependency change, `action()`),
 * and a stream can be read only once, so a stream body is refused where the
 * descriptor is built rather than failing on the second send.
 */
function assertResendable(method: HttpMethod, body: unknown): void {
  if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) {
    throw new TypeError(
      `http.${method.toLowerCase()}: a ReadableStream body is not supported. A descriptor can be sent ` +
        'more than once (a dependency change, action()), and a stream can be read only once. ' +
        'Read it into a Blob or an ArrayBuffer first.',
    )
  }
}

/**
 * Recursively `Object.freeze` `value` and everything reachable from it.
 * Guards against cycles with `seen` (an object already visited is skipped,
 * not re-frozen) so a circular `body`/`params`/`init` freezes without
 * looping — mirrors `Object.freeze`'s own no-op-on-primitive semantics.
 *
 * Only ever called on `snapshot`'s copy, never on a value the caller passed
 * in: freezing the caller's own object would make a later in-place write to
 * it (a signal's value object passed straight in as `body`) throw.
 */
function deepFreeze<T>(value: T, seen: Set<unknown> = new Set()): T {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value
  seen.add(value)
  const values = Array.isArray(value) ? value : Object.values(value as Record<string, unknown>)
  for (const v of values) deepFreeze(v, seen)
  return Object.freeze(value)
}

/**
 * A frozen deep copy of `value`. The descriptor holds this copy rather than
 * the caller's object, so the key computed from it and the request later sent
 * from it cannot drift if the caller mutates their object in between (the
 * send runs at the end of the tick), and the caller's object stays mutable.
 * `structuredClone` preserves cycles, so a circular `body` still reaches
 * `requestKey`'s `TypeError` rather than failing here.
 */
function snapshot<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value
  return deepFreeze(structuredClone(value))
}

/**
 * The descriptor's own copy of `body`, for the same reason as `snapshot`.
 * `FormData` and `URLSearchParams` are rebuilt from their entries (a `File`
 * entry is shared: a `Blob` cannot change), bytes are copied, a `Blob` is
 * kept as is, and a string needs no copy.
 */
function snapshotBody(body: unknown): unknown {
  switch (bodyKind(body)) {
    case 'json':
      return snapshot(body)
    case 'form': {
      const copy = new FormData()
      for (const [name, value] of body as FormData) copy.append(name, value)
      return copy
    }
    case 'urlencoded':
      return new URLSearchParams(body as URLSearchParams)
    case 'bytes': {
      const view = ArrayBuffer.isView(body) ? body : new Uint8Array(body as ArrayBuffer)
      return new Uint8Array(view.buffer, view.byteOffset, view.byteLength).slice()
    }
    default:
      return body
  }
}

function withParams<T>(method: HttpMethod, url: string, params?: HttpParams, init?: HttpInit): HttpDescriptor<T> {
  return Object.freeze({ kind: 'http', method, url, params: snapshot(params), init: snapshot(init) })
}

function withBody<T>(method: HttpMethod, url: string, body?: unknown, init?: HttpInit): HttpDescriptor<T> {
  assertResendable(method, body)
  return Object.freeze({ kind: 'http', method, url, body: snapshotBody(body), init: snapshot(init) })
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
  /** Safe — HTTP QUERY: a read with a body. `body` is optional; JSON unless it is a string, `FormData`, `URLSearchParams`, `Blob` or bytes. */
  query<T>(url: string, body?: unknown, init?: HttpInit): HttpDescriptor<T> {
    return withBody<T>('QUERY', url, body, init)
  },
  /** Safe. `params` (query string) is optional. A successful response resolves to `undefined` (no body); a non-2xx one rejects with `HttpError`. */
  head<T>(url: string, params?: HttpParams, init?: HttpInit): HttpDescriptor<T> {
    return withParams<T>('HEAD', url, params, init)
  },
  /** Unsafe. `body` is optional; JSON unless it is a string, `FormData`, `URLSearchParams`, `Blob` or bytes. */
  post<T>(url: string, body?: unknown, init?: HttpInit): HttpDescriptor<T> {
    return withBody<T>('POST', url, body, init)
  },
  /** Unsafe. `body` is optional; JSON unless it is a string, `FormData`, `URLSearchParams`, `Blob` or bytes. */
  put<T>(url: string, body?: unknown, init?: HttpInit): HttpDescriptor<T> {
    return withBody<T>('PUT', url, body, init)
  },
  /** Unsafe. `body` is optional; JSON unless it is a string, `FormData`, `URLSearchParams`, `Blob` or bytes. */
  patch<T>(url: string, body?: unknown, init?: HttpInit): HttpDescriptor<T> {
    return withBody<T>('PATCH', url, body, init)
  },
  /** Unsafe. `body` is optional; JSON unless it is a string, `FormData`, `URLSearchParams`, `Blob` or bytes. */
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

const objectIds = new WeakMap<object, number>()
let nextObjectId = 0

/** A process-unique id for `obj`, stable for as long as `obj` lives. */
function objectId(obj: object): number {
  let id = objectIds.get(obj)
  if (id === undefined) {
    id = ++nextObjectId
    objectIds.set(obj, id)
  }
  return id
}

/**
 * The body part of the request key — `''` when there is no body.
 *
 * A JSON body is its stable JSON, untagged (JSON text never starts with the
 * tags below, so the kinds cannot collide). The other kinds are tagged:
 * a string and `URLSearchParams` by their text; `FormData` of string fields by
 * its entries in order; a `Blob` by its identity, which is sound because a
 * `Blob` cannot change.
 *
 * Bytes, and `FormData` holding a file, are keyed by the identity of the
 * descriptor's own copy, so two such descriptors never share a cache or
 * in-flight entry. Their contents cannot be compared cheaply, and a file's
 * name, size and type do not identify its contents (two different uploads
 * sharing a key would be deduplicated into one). A file's identity does not
 * work either: `FormData` may hand back a new `File` for the same entry.
 */
function stableBodyKey(body: unknown): string {
  if (body === undefined) return ''
  switch (bodyKind(body)) {
    case 'text':
      return `text:${body as string}`
    case 'urlencoded':
      return `urlencoded:${(body as URLSearchParams).toString()}`
    case 'form': {
      const entries: [string, string][] = []
      for (const [name, value] of body as FormData) {
        if (typeof value !== 'string') return `form#${objectId(body as FormData)}`
        entries.push([name, value])
      }
      return `form:${JSON.stringify(entries)}`
    }
    case 'blob':
      return `blob#${objectId(body as Blob)}`
    case 'bytes':
      return `bytes#${objectId(body as object)}`
    default:
      return JSON.stringify(sortKeysDeep(body))
  }
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
 * A non-2xx HTTP response to a request sent from an `http` descriptor — what a
 * query's `error()` holds when the server answered with an error status (a
 * network failure is the underlying error instead). `status` is the response
 * status; `body` is the response body parsed as JSON when possible, else the
 * raw text, else `undefined`.
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
 * The default `Content-Type` for a JSON body and a string body. fetch encodes
 * both as UTF-8, and both types are set explicitly rather than left to fetch:
 * a string body goes out as `text/plain;charset=UTF-8` in browsers and Node,
 * but with no type at all in Bun. The charset on the JSON type states the
 * encoding for servers that don't assume UTF-8 for JSON. The other body kinds
 * get no default; fetch derives theirs from the body.
 */
const DEFAULT_CONTENT_TYPE: Partial<Record<BodyKind, string>> = {
  json: 'application/json; charset=utf-8',
  text: 'text/plain;charset=UTF-8',
}

/**
 * Send a descriptor built by `http` and resolve with its response. The body is
 * sent by its kind (see `bodyKind`): JSON with `Content-Type:
 * application/json; charset=utf-8`, a string as-is with `text/plain`, and
 * `FormData` / `URLSearchParams` / `Blob` / bytes unchanged with the type fetch
 * derives. A `Content-Type` in `init.headers`, in any casing, replaces the
 * default. The response side is JSON-only in v0: a successful
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
  const kind = hasBody ? bodyKind(descriptor.body) : undefined
  // `Headers` compares names case-insensitively, so an override spelled
  // `content-type` replaces the default instead of being sent alongside it
  // (a plain-object spread keeps both keys, and fetch joins them into
  // "application/json, <override>").
  const headers = new Headers(descriptor.init?.headers)
  const defaultType = kind && DEFAULT_CONTENT_TYPE[kind]
  if (defaultType && !headers.has('Content-Type')) headers.set('Content-Type', defaultType)

  const response = await fetch(url, {
    method: descriptor.method,
    headers,
    body: kind === 'json' ? JSON.stringify(descriptor.body) : (descriptor.body as BodyInit | undefined),
    credentials: descriptor.init?.credentials,
    signal,
  })

  if (!response.ok) {
    throw new HttpError(response.status, await parseErrorBody(response))
  }

  if (descriptor.method === 'HEAD') return undefined as T

  return (await response.json()) as T
}

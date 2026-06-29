/**
 * `queryHref` — build a URL from a base path plus query params, omitting falsy
 * values. The functional counterpart to `searchParams()` (the reactive *reader*):
 * instead of imperatively mutating a `URLSearchParams`, pass a params object.
 *
 * ```tsx
 * const href = queryHref(base, {
 *   sort: sort !== 'date' ? sort : undefined, // conditional include via the value
 *   tag,                                        // included only when truthy
 * })
 * ```
 *
 * Each entry is included iff its value is a **non-empty string** — `''` /
 * `undefined` / `null` are omitted — so a conditional include folds into the
 * value as `cond ? value : undefined`. Returns the bare `base` when no params
 * survive. Values are encoded with `URLSearchParams` (form-encoding, spaces →
 * `+`).
 *
 * Values are **strings** (`QueryParamValue`). Number / boolean aren't accepted:
 * JS truthiness would omit `0` / `false`, which the SSR adapters' string guard
 * can't model without per-value type info — so keeping values string-only
 * guarantees the server-rendered URL matches this client output byte-for-byte.
 * Stringify other types at the call site (`String(n)`), choosing the omit rule
 * explicitly (`n > 0 ? String(n) : undefined`).
 *
 * This is a pure function with no reactivity. The SSR adapters lower a
 * `queryHref(base, { … })` call to their query helper (go-template: `bf_query`),
 * which is why the params object must be a plain object literal at the call site.
 */
export type QueryParamValue = string | null | undefined
export type QueryParams = Record<string, QueryParamValue>

export function queryHref(base: string, params: QueryParams): string {
  const u = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value) u.set(key, value)
  }
  const qs = u.toString()
  return qs ? `${base}?${qs}` : base
}

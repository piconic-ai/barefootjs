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
 * Each entry is included iff its value is **truthy** — `undefined` / `null` /
 * `''` / `0` / `false` are omitted — so a conditional include folds into the
 * value as `cond ? value : undefined`. Returns the bare `base` when no params
 * survive. Values are encoded with `URLSearchParams` (form-encoding, spaces →
 * `+`).
 *
 * This is a pure function with no reactivity. The SSR adapters lower a
 * `queryHref(base, { … })` call to their query helper (go-template: `bf_query`),
 * so the server-rendered URL matches this client output byte-for-byte — which is
 * why the params object must be a plain object literal at the call site.
 */
export type QueryParamValue = string | number | boolean | null | undefined
export type QueryParams = Record<string, QueryParamValue>

export function queryHref(base: string, params: QueryParams): string {
  const u = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value) u.set(key, String(value))
  }
  const qs = u.toString()
  return qs ? `${base}?${qs}` : base
}

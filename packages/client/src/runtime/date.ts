/**
 * Client-side runtime for the catalogued `Date` lowering (#2274, #2292).
 *
 * The compiler lowers a Date-typed prop's zero-arg accessor call
 * (`createdAt.toISOString()`, matched by `datePlugin` /
 * `DATE_METHODS` in `packages/jsx/src/date-lowering.ts`) to
 * `date(recv, "op")` on every backend. Each backend's `date` runtime
 * helper must agree byte-for-byte on the dispatched value — the shared
 * oracle is the `date` reference function in
 * `packages/adapter-tests/vectors/cases.ts`.
 *
 * The CLIENT receiver shape differs from the SSR/oracle one: props are
 * JSON round-tripped with no type-aware revival
 * (`packages/client/src/runtime/hydrate.ts` `parseProps`), so a
 * `Date`-typed prop arrives at hydration as its `toJSON()` ISO string,
 * not a real `Date` instance. `recv` is therefore either:
 *   - a real `Date` (e.g. a value constructed client-side), or
 *   - an ISO-8601 string (the hydrated-prop case).
 * (No `{$date: ...}` envelope — that shape is test/oracle-only, never a
 * runtime value.) Both are coerced via `new Date(recv)`; a nil or
 * unparseable receiver degrades to the same zero value every backend
 * documents ('' for toISOString, 0 otherwise) instead of throwing.
 */
export function date(recv: unknown, op: string): string | number {
  const zero = op === 'toISOString' ? '' : 0
  if (recv === null || recv === undefined) return zero
  const d = recv instanceof Date ? recv : new Date(recv as string | number)
  if (Number.isNaN(d.getTime())) return zero
  return (d as unknown as Record<string, () => string | number>)[op]()
}

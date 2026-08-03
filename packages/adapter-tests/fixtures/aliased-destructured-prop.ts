import { createFixture } from '../src/types'

/**
 * Aliased (renaming) destructured prop on a plain stateless component:
 * `{ text, n: count }` — the caller supplies `n`, the body reads `count`.
 *
 * Originally filed as #2460, which was NOT Hono-only: every consumer that keys off
 * `ParamInfo.name` instead of `sourceName ?? name` drops the rename.
 * Verified per adapter: Hono used to emit `{ text, count }` (reading a
 * `count` property off a props object shaped `{ text, n }` → always
 * `undefined`, `s1` rendered empty) — FIXED, Hono now emits
 * `{ text, n: count }` and this fixture is no longer skipped for it. The
 * template-string adapters still key `ssrDefaults` / template vars as
 * `count` so props seeding misses; Go's Input struct field is `Count`
 * `json:"count"`, so the caller-side struct literal keyed by the real
 * prop name fails `go run` outright (unknown field N); the shared client
 * JS reads `_p.count` too. All silent except Go's exit 1.
 * `ParamInfo.sourceName` carries the original property name precisely
 * for this; its docstring rule is "consumers keying into
 * `propsType.properties` must use `sourceName ?? name`".
 *
 * `expectedHtml` below is the CORRECT output (the `s1` slot carries `7`)
 * and is now generated from Hono like any other fixture (Hono was the
 * broken party before, which is exactly why #2460 notes no aliased-prop
 * fixture could exist until it was fixed). #2460 itself is CLOSED (fixed
 * in b4f5075) — the shared layer (Hono, `extractSsrDefaults`) now keys
 * off `sourceName ?? name` correctly. The 7 template-string adapters
 * still drop the rename silently and are tracked by
 * https://github.com/piconic-ai/barefootjs/issues/2524; Go's `go run`
 * exit-1 failure is tracked by
 * https://github.com/piconic-ai/barefootjs/issues/2525. Adapters that
 * still drop the rename skip this fixture with a pointer to the
 * relevant tracker; graduating means fixing the emission and deleting
 * the skip entry.
 */
export const fixture = createFixture({
  id: 'aliased-destructured-prop',
  description: 'Aliased destructured prop ({ n: count }) keeps the rename (#2524)',
  source: `
export function Badge({ text, n: count }: { text: string; n: number }) {
  return <span>{text}:{count}</span>
}
`,
  props: { text: 'hello', n: 7 },
  expectedHtml: `
    <span bf-s="test" bf="s2"><!--bf:s0-->hello<!--/-->:<!--bf:s1-->7<!--/--></span>
  `,
})

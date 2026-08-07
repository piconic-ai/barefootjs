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
 * template-string adapters used to key `ssrDefaults` / template vars as
 * `count` so props seeding missed — FIXED (#2524). Go's Input struct
 * field used to be the local `Count`, so the caller-side struct literal
 * failed `go run` (unknown field N) — FIXED (#2525). The shared client JS
 * used to read `_p.count` too — FIXED (#2524). All of these were silent
 * except Go's exit 1.
 * `ParamInfo.sourceName` carries the original property name precisely
 * for this; its docstring rule is "consumers keying into
 * `propsType.properties` must use `sourceName ?? name`".
 *
 * `expectedHtml` below is the CORRECT output (the `s1` slot carries `7`)
 * and is now generated from Hono like any other fixture (Hono was the
 * broken party before, which is exactly why #2460 notes no aliased-prop
 * fixture could exist until it was fixed). #2460 itself is CLOSED (fixed
 * in b4f5075) — the shared layer (Hono, `extractSsrDefaults`) now keys
 * off `sourceName ?? name` correctly.
 *
 * Status (#2524 split into two halves, each fixed separately):
 *   - CSR half (the client JS reading `_p.count` off a `{ text, n }`
 *     props object) — FIXED (PR A, `claude/2524-csr-props-key`, this
 *     branch stacks on it).
 *   - SSR half (the 7 template-string adapters — blade, erb, jinja,
 *     mojolicious, twig, xslate, rust — silently dropping the rename in
 *     their `ssrDefaults` seeding) — FIXED here: each harness now derives
 *     its seeded vars through `deriveStashFromDefaults` (or the matching
 *     production runtime function) instead of hand-flattening
 *     `SsrDefault.value`, so a caller-facing `propName` resolves onto the
 *     local template var. `packages/jsx/src/ssr-defaults.ts`'s
 *     `deriveStashFromDefaults` is the shared TS twin of those runtime
 *     ports.
 *   - Go's `go run` exit-1 failure — FIXED (#2525): the Input struct
 *     field is caller-facing while the Props field stays LOCAL with a
 *     caller-facing json tag. Go's `render-divergences.ts` entry (and
 *     `skipJsx` pin) is deleted; the fixture renders on Go like every
 *     other adapter.
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

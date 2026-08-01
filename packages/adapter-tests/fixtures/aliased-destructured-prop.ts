import { createFixture } from '../src/types'

/**
 * Aliased (renaming) destructured prop on a plain stateless component:
 * `{ text, n: count }` — the caller supplies `n`, the body reads `count`.
 *
 * Pins #2460, which is NOT Hono-only: every consumer that keys off
 * `ParamInfo.name` instead of `sourceName ?? name` drops the rename.
 * Verified per adapter: Hono emits `{ text, count }` (reads a `count`
 * property off a props object shaped `{ text, n }` → always
 * `undefined`, `s1` renders empty); the template-string adapters key
 * `ssrDefaults` / template vars as `count` so props seeding misses;
 * Go's Input struct field is `Count` `json:"count"`, so the
 * caller-side struct literal keyed by the real prop name fails
 * `go run` outright (unknown field N); the shared client JS reads
 * `_p.count` too. All silent except Go's exit 1.
 * `ParamInfo.sourceName` carries the original property name precisely
 * for this; its docstring rule is "consumers keying into
 * `propsType.properties` must use `sourceName ?? name`".
 *
 * `expectedHtml` below is hand-authored to the CORRECT output (the `s1`
 * slot carries `7`) because Hono — the reference adapter that normally
 * generates `expectedHtml` — is itself the broken party here, which is
 * exactly why #2460 notes no aliased-prop fixture could exist before.
 * Adapters that still drop the rename skip this fixture with a pointer
 * to https://github.com/piconic-ai/barefootjs/issues/2460; graduating
 * means fixing the emission, regenerating `expectedHtml` from the fixed
 * reference, and deleting the skip entry.
 */
export const fixture = createFixture({
  id: 'aliased-destructured-prop',
  description: 'Aliased destructured prop ({ n: count }) keeps the rename (#2460)',
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

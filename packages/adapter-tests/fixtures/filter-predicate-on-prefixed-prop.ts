import { createFixture } from '../src/types'

/**
 * #3845: a destructured prop read only inside a loop's `.filter()`
 * predicate. Two separate defects met here:
 *
 *   - the client template (module scope, no destructured locals) emitted
 *     the predicate's `one` bare instead of `_p.one`, so a client-side
 *     mount threw `ReferenceError: one is not defined`;
 *   - the reference left `one` out of `bf-p` because its name starts with
 *     `on`, the test it used for an event handler (`on[A-Z]` is the rule).
 *
 * `bf-p` itself is checked by the hydration payload conformance suite
 * (`src/hydration-payload-conformance.ts`), since `expectedHtml` comparison
 * strips it. CSR conformance covers the first.
 */
export const fixture = createFixture({
  id: 'filter-predicate-on-prefixed-prop',
  description: 'a prop named `one` read only in a .filter() predicate (#3845)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

export function FilterPredicateOnPrefixedProp({ keys, one }: { keys: string[]; one: string }) {
  const [n, setN] = createSignal(0)
  return (
    <div>
      <ul>{keys.filter(k => k === one).map(k => <li key={k}>{k}</li>)}</ul>
      <button onClick={() => setN(n() + 1)}>{n()}</button>
    </div>
  )
}
`,
  props: { keys: ['a', 'b', 'c'], one: 'b' },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s1"><li data-key="b"><!--bf:s0-->b<!--/--></li></ul>
      <button bf="s3"><!--bf:s2-->0<!--/--></button>
    </div>
  `,
})

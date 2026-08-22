import { createFixture } from '../src/types'

// #2685 review: the NON-IDEMPOTENT sibling of `signal-prop-same-name-via-const`
// — mirrors how `signal-prop-same-name-derived` pins the direct-access
// non-idempotent shape. Restoring `propName` alone (Half 1 of the fix) is
// not enough here: with no in-template recompute, the emitted template
// would read the RAW seeded prop (`count: 5`) with no `* 2` applied at all
// — wrong in a different way than before the fix, not merely "still wrong".
// The derivation must actually run in-template, exactly once, over the
// caller-supplied prop:
//
//   const mid = props.count
//   const [count, setCount] = createSignal((mid ?? 1) * 2)
//
// `expectedHtml` is HAND-AUTHORED to the correct value (not auto-generated
// from the Hono reference adapter, even though Hono itself is unaffected by
// this template-stash-only bug — real JS naturally resolves the `const`
// chain) per CLAUDE.md's fixture rule, and this id is registered in
// `generate-expected-html.ts`'s `SKIP_AUTO_UPDATE` so a regeneration pass
// can't silently overwrite the intent.
export const fixture = createFixture({
  id: 'signal-prop-same-name-via-const-derived',
  description: 'Signal initialized from a NON-IDEMPOTENT derivation of a same-named prop through one component-scope const hop',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function SignalPropSameNameViaConstDerived(props: { count?: number }) {
  const mid = props.count
  const [count, setCount] = createSignal((mid ?? 1) * 2)
  return <span>{count()}</span>
}
`,
  props: { count: 5 },
  expectedHtml: `
    <span bf-s="test" bf="s1"><!--bf:s0-->10<!--/--></span>
  `,
})

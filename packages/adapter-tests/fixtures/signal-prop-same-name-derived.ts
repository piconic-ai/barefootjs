import { createFixture } from '../src/types'

// #2669 (shape B): `signal-prop-same-name` pins the IDEMPOTENT collision
// (`props.label ?? 'Default'`), which hid the bug — a stash re-seeded with
// the already-derived value only becomes visibly wrong once you try a
// caller-supplied prop, and even then only via the harness-bypassing
// production path, not this conformance suite. This fixture pins the
// NON-idempotent flavor: `(props.count ?? 1) * 2`. Seeding the
// template-stash variable `count` with the pre-fix EVALUATED signal value
// (10, for `count: 5`) makes the emitted template's own `{% set count =
// (count if count is defined else 1) * 2 %}` recompute apply the `* 2` a
// SECOND time — `10 * 2 = 20` — wrong even though the caller DID supply a
// prop. The correct seed is the RAW prop (5); the template's own
// derivation computes `5 * 2 = 10` exactly once.
//
// `expectedHtml` is HAND-AUTHORED to the correct value (not auto-generated
// from the Hono reference adapter, even though Hono itself is unaffected
// by this template-stash-only bug) per CLAUDE.md's fixture rule, and this
// id is registered in `generate-expected-html.ts`'s `SKIP_AUTO_UPDATE` so
// a regeneration pass can't silently overwrite the intent.
export const fixture = createFixture({
  id: 'signal-prop-same-name-derived',
  description: 'Signal initialized from a NON-IDEMPOTENT derivation of a prop with the identical name',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function SignalPropSameNameDerived(props: { count?: number }) {
  const [count, setCount] = createSignal((props.count ?? 1) * 2)
  return <span>{count()}</span>
}
`,
  props: { count: 5 },
  expectedHtml: `
    <span bf-s="test" bf="s1"><!--bf:s0-->10<!--/--></span>
  `,
})

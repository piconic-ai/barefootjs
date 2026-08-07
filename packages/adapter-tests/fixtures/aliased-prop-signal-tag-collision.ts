import { createFixture } from '../src/types'

/**
 * An aliased destructured prop whose CALLER-facing name collides with a
 * same-named signal getter: `{ count: initialCount }` +
 * `createSignal(initialCount)`. With prop json tags caller-facing (#2525),
 * the prop and the signal are different Go identifiers wanting the SAME
 * tag — and `encoding/json` drops every field under an ambiguous tag, so
 * without `claimJsonTag` the bf-p payload loses the key entirely. The prop
 * must win the collision: on hono only props occupy `_p`; a signal seeds
 * from the prop's key, never a key of its own.
 *
 * Normalization strips `bf-p`, so the Go struct-tag pin itself lives in
 * go-template-adapter.test.ts ("an aliased prop's caller-facing tag wins
 * over a same-named signal's"); this fixture holds the cross-adapter
 * render surface for the shape.
 */
export const fixture = createFixture({
  id: 'aliased-prop-signal-tag-collision',
  description: "Aliased prop's caller-facing key collides with a same-named signal getter (#2525)",
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function Counter({ count: initialCount }: { count: number }) {
  const [count, setCount] = createSignal(initialCount)
  return <button onClick={() => setCount(count() + 1)}>Count: {count()}</button>
}
`,
  props: { count: 5 },
  expectedHtml: `
    <button bf-s="test" bf="s1">Count: <!--bf:s0-->5<!--/--></button>
  `,
})

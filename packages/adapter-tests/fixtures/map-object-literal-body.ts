import { createFixture } from '../src/types'

/**
 * #2696 Step 1: a `.map()` callback body that returns a (spread-free) object
 * literal, used in rendering — `rows().map(t => ({ id: t.id, done: false
 * }))`. Before `checkSupport` gained its `pos` parameter, `object-literal`
 * was refused unconditionally, so this whole memo classified `opaque` (no
 * in-template recompute) regardless of the receiver. `isSupportedValue` now
 * admits an object literal at a VALUE position — the callback body of a
 * `.map()` is exactly such a position — so the memo classifies `derived`
 * with a NON-EMPTY free set (`rows`, a sibling signal), forcing every
 * template-stash adapter to genuinely lower the object-literal body through
 * its runtime evaluator (`map_eval` + the adapter's own `objectLiteral`
 * dict/hash/hashref emitter), not just fall back to a static default.
 *
 * The second `.map(r => r.id)` projects back to a scalar so the result is
 * renderable text — an object VALUE has no direct text rendering, only its
 * fields do. Companion to `callback-param-shadows-prop`'s `first` signal
 * (a CONSTANT array-of-objects receiver, frees `[]`); this fixture is the
 * non-constant sibling — see `spec/subset-conformance.md`'s change-time
 * coupling rule.
 */
export const fixture = createFixture({
  id: 'map-object-literal-body',
  description: '.map() callback body returns an object literal, projected back to text',
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'

export function MapObjectLiteralBody({ items }: { items: { id: string }[] }) {
  const [rows] = createSignal(items)
  const ids = createMemo(() => rows().map(t => ({ id: t.id, done: false })).map(r => r.id).join(','))
  return (
    <div>
      <span>{ids()}</span>
    </div>
  )
}
`,
  props: { items: [{ id: 'a' }, { id: 'b' }] },
  expectedHtml: `
    <div bf-s="test"><span bf="s1"><!--bf:s0-->a,b<!--/--></span></div>
  `,
})

import { createFixture } from '../src/types'

/**
 * #2696 Step 2: a signal initializer holding an object literal WITH a spread
 * directly in VALUE position — `createSignal({ ...base, done: true })` — not
 * nested inside a `.map()` callback body (that shape is `map-object-literal-
 * body.ts`'s sibling, routed through the runtime evaluator instead). `base`
 * is a plain prop reference (a free var), so `isSupportedValue` admits the
 * whole object literal (`checkSupport`'s `pos` parameter, #2696 Step 1) and
 * classifies the signal `derived` with a NON-EMPTY free set (`base`) —
 * forcing every template-stash adapter to genuinely LOWER the spread through
 * its own `objectLiteral()` emitter's merge idiom (`array_merge` / `.merge` /
 * `dict(…, **…)` / `bf_merge` / …, #2696 Step 2), not just a static default.
 * Overriding a field the spread source ALSO sets (`done`) exercises JS
 * object-spread's override direction: the trailing prop wins.
 */
export const fixture = createFixture({
  id: 'signal-object-spread-init',
  description: 'Signal initializer spreads a prop-derived object directly, in value position',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

type Item = { id: string; done: boolean }

export function SignalObjectSpreadInit({ base }: { base: Item }) {
  const [merged] = createSignal({ ...base, done: true })
  return (
    <div>
      <span>{merged().id}</span>
      <span>{merged().done ? 'yes' : 'no'}</span>
    </div>
  )
}
`,
  props: { base: { id: 'row-1', done: false } },
  expectedHtml: `
    <div bf-s="test">
      <span bf="s1"><!--bf:s0-->row-1<!--/--></span>
      <span bf="s3"><!--bf-cond-start:s2-->yes<!--bf-cond-end:s2--></span>
    </div>
  `,
})

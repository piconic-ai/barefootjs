import { createFixture } from '../src/types'

/**
 * Destructured twin of `nullish-coalescing-text` (#2259): the same `??`
 * signal seed and text fallback, consumed through destructured bindings
 * (`{ label, size }`) instead of a props object. Destructured optionals
 * used to lose their TypeInfo and optional flag in `propsParams`, so the
 * SSR seed lowerings keyed on `param.optional` (#2252's nillable flip and
 * the hoisted fallback var on Go) never fired — the Go constructor seeded
 * the signal with a literal `0` regardless of the caller's input.
 */
export const fixture = createFixture({
  id: 'nullish-coalescing-destructured',
  description: 'Nullish coalescing over destructured optional props seeds SSR correctly',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function NullishCoalescingDestructured({ label, size }: { label?: string; size?: number }) {
  const [count, setCount] = createSignal(size ?? 1)
  return <div><span>{label ?? 'Default'}</span><span>{count()}</span></div>
}
`,
  props: { label: 'Custom', size: 5 },
  // `''` and `0` are nullish-KEPT in JS; `absent` must take the fallback.
  // The zero/empty points are the ones a zero-valued struct field cannot
  // distinguish from "absent" — exactly what the nillable lowering exists
  // to express.
  dataPoints: [
    { name: 'both-absent', props: {} },
    { name: 'empty-label', props: { label: '' } },
    { name: 'zero-size', props: { size: 0 } },
  ],
  expectedHtml: `
    <div bf-s="test">
      <span bf="s1"><!--bf:s0-->Custom<!--/--></span>
      <span bf="s3"><!--bf:s2-->5<!--/--></span>
    </div>
  `,
})

import { createFixture } from '../src/types'

/**
 * Signals seeded by a call or a member read over optional props (#3540): a
 * string method, `.length` of a defaulted prop, `Math.max`, and `.length` of
 * an array literal. Go Template found the seeding prop by regex: it seeded
 * the first as the bare prop, dropping the fallback and the upper-casing,
 * and the rest as their type's zero value. They are now seeded by the
 * runtime evaluator; an absent prop reaches it as `nil` (#3532).
 */
export const fixture = createFixture({
  id: 'signal-computed-call-seed',
  description: 'a signal seeded by a call or member read over props starts at its value on every adapter (#3540)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

export function ComputedCallSeed(props: { label?: string; n?: number }) {
  const [upper] = createSignal((props.label ?? 'x').toUpperCase())
  const [len] = createSignal((props.label ?? '').length)
  const [atLeast] = createSignal(Math.max(props.n ?? 0, 1))
  const [count] = createSignal([props.n ?? 0].length)
  return <p title={upper()} data-len={len()} data-min={atLeast()} data-count={count()}>x</p>
}
`,
  props: { label: 'abc', n: 3 },
  expectedHtml: `
    <p bf-s="test" bf="s0" data-count="1" data-len="3" data-min="3" title="ABC">x</p>
  `,
  dataPoints: [
    { name: 'absent', props: {} },
    { name: 'zero', props: { label: '', n: 0 } },
  ],
})

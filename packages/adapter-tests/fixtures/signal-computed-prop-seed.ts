import { createFixture } from '../src/types'

/**
 * Signals seeded from a computed expression over props: arithmetic, string
 * concatenation over a `??` default, and a numeric `||` fallback. Go
 * Template baked such a seed as `nil`, or as the bare prop with the rest of
 * the expression dropped. It now seeds them through the runtime evaluator,
 * as it does a memo body (#3519).
 */
export const fixture = createFixture({
  id: 'signal-computed-prop-seed',
  description: 'a signal seeded by a computed expression over props starts at its value on every adapter (#3519)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

export function ComputedSeed(props: { label?: string; n?: number }) {
  const [doubled] = createSignal((props.n ?? 1) * 2)
  const [suffixed] = createSignal((props.label ?? 'a') + 'b')
  const [count] = createSignal(props.n || 5)
  return <p title={suffixed()} data-doubled={doubled()} data-count={count()}>x</p>
}
`,
  props: { n: 3, label: 'x' },
  expectedHtml: `
    <p bf-s="test" bf="s0" title="xb" data-doubled="6" data-count="3">x</p>
  `,
  dataPoints: [
    { name: 'zero', props: { n: 0, label: 'y' } },
  ],
})

import { createFixture } from '../src/types'

/**
 * Signals seeded from a computed expression over props: arithmetic, string
 * concatenation, and a numeric `||` fallback. The props are required; an
 * absent one under `??` is `signal-computed-prop-seed-absent`. Go
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

export function ComputedSeed(props: { label: string; n: number }) {
  const [doubled] = createSignal(props.n * 2)
  const [suffixed] = createSignal(props.label + 'b')
  const [count] = createSignal(props.n || 5)
  return <p title={suffixed()} data-doubled={doubled()} data-count={count()}>x</p>
}
`,
  props: { n: 3, label: 'x' },
  expectedHtml: `
    <p bf-s="test" bf="s0" data-count="3" data-doubled="6" title="xb">x</p>
  `,
  dataPoints: [
    { name: 'zero', props: { n: 0, label: 'y' } },
  ],
})

import { createFixture } from '../src/types'

/**
 * Two signals seeded from the same optional prop with different fallbacks
 * (#3540). Each seed applies its own fallback to the prop: the evaluated
 * `(props.label ?? 'b').toUpperCase()` must not read the value the sibling
 * `props.label ?? 'a'` seed hoisted.
 */
export const fixture = createFixture({
  id: 'signal-computed-seed-sibling-fallbacks',
  description: 'evaluated signal seeds over one prop each apply their own fallback (#3540)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

export function ComputedSeedSiblingFallbacks(props: { label?: string }) {
  const [a] = createSignal(props.label ?? 'a')
  const [b] = createSignal((props.label ?? 'b').toUpperCase())
  return <p data-a={a()} data-b={b()}>x</p>
}
`,
  props: { label: 'q' },
  expectedHtml: `
    <p bf-s="test" bf="s0" data-a="q" data-b="Q">x</p>
  `,
  dataPoints: [
    { name: 'absent', props: {} },
    { name: 'empty', props: { label: '' } },
  ],
})

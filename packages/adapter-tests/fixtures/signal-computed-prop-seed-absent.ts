import { createFixture } from '../src/types'

/**
 * `signal-computed-prop-seed` with the props absent: the `??` defaults are
 * taken. Go Template seeds these through the runtime evaluator, which gets
 * an absent optional prop as its Go zero value, so `??` keeps it (#3519).
 */
export const fixture = createFixture({
  id: 'signal-computed-prop-seed-absent',
  description: 'a signal seeded by a computed expression over absent props takes its `??` defaults (#3519)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

export function ComputedSeedAbsent(props: { label?: string; n?: number }) {
  const [doubled] = createSignal((props.n ?? 1) * 2)
  const [suffixed] = createSignal((props.label ?? 'a') + 'b')
  return <p title={suffixed()} data-doubled={doubled()}>x</p>
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s0" data-doubled="2" title="ab">x</p>
  `,
})

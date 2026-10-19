import { createFixture } from '../src/types'

/**
 * `signal-computed-call-seed` with destructured props (#3540): the seeds read
 * the bindings instead of `props.*`.
 */
export const fixture = createFixture({
  id: 'signal-computed-call-seed-destructured',
  description: 'a signal seeded by a call over destructured props starts at its value on every adapter (#3540)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

export function ComputedCallSeedDestructured({ label, n }: { label?: string; n?: number }) {
  const [upper] = createSignal((label ?? 'x').toUpperCase())
  const [len] = createSignal((label ?? '').length)
  const [atLeast] = createSignal(Math.max(n ?? 0, 1))
  return <p title={upper()} data-len={len()} data-min={atLeast()}>x</p>
}
`,
  props: { label: 'abc', n: 3 },
  expectedHtml: `
    <p bf-s="test" bf="s0" data-len="3" data-min="3" title="ABC">x</p>
  `,
  dataPoints: [
    { name: 'absent', props: {} },
  ],
})

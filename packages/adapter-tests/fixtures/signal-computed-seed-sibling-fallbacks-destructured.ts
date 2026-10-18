import { createFixture } from '../src/types'

/**
 * `signal-computed-seed-sibling-fallbacks` with destructured props (#3540).
 * The evaluated seeds read the binding itself: `label` without the sibling
 * seed's fallback, and `tag` with its destructure default.
 */
export const fixture = createFixture({
  id: 'signal-computed-seed-sibling-fallbacks-destructured',
  description: 'evaluated signal seeds over destructured props apply their own fallback and the destructure default (#3540)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

export function ComputedSeedSiblingFallbacksDestructured({ label, tag = 'z' }: { label?: string; tag?: string }) {
  const [a] = createSignal(label ?? 'a')
  const [b] = createSignal((label ?? 'b').toUpperCase())
  const [t] = createSignal((tag ?? 'y').toUpperCase())
  return <p data-a={a()} data-b={b()} data-t={t()}>x</p>
}
`,
  props: { label: 'q', tag: 'w' },
  expectedHtml: `
    <p bf-s="test" bf="s0" data-a="q" data-b="Q" data-t="W">x</p>
  `,
  dataPoints: [
    { name: 'absent', props: {} },
    { name: 'empty-label', props: { label: '' } },
  ],
})

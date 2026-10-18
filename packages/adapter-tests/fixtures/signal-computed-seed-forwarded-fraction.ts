import { createFixture } from '../src/types'

/**
 * Evaluated `Math.min` / `Math.max` seeds forwarded to a child's `number`
 * prop (#3540). The fractional seed types its field `float64`, so the
 * child's input field must take `float64` too, or the constructor assigns
 * a `float64` to an `int` field and the Go build fails. `whole` forwards an
 * integer seed into the same child prop.
 */
export const fixture = createFixture({
  id: 'signal-computed-seed-forwarded-fraction',
  description: 'an evaluated fractional signal seed forwarded to a child number prop keeps its fraction (#3540)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

function Value({ value }: { value: number }) {
  return <span data-value={value}>v</span>
}

export function ComputedSeedForwardedFraction(props: { n?: number }) {
  const [capped] = createSignal(Math.min(props.n ?? 0, 1.5))
  const [whole] = createSignal(Math.max(props.n ?? 0, 1))
  return <p><Value value={capped()} /><Value value={whole()} /></p>
}
`,
  props: { n: 3 },
  expectedHtml: `
    <p bf-s="test"><span bf-s="test_s0" bf="s0" data-value="1.5">v</span><span bf-s="test_s1" bf="s0" data-value="3">v</span></p>
  `,
  dataPoints: [
    { name: 'absent', props: {} },
    // `Math.min(1, 1.5)` is a whole number held in the `float64` field.
    { name: 'whole-in-float', props: { n: 1 } },
  ],
})

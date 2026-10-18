import { createFixture } from '../src/types'

/**
 * An evaluated seed over a renamed body destructure with a default
 * (`const { label: text = 'x' } = props`), beside a raw `props.label ?? …`
 * read that makes the shared `Label` input field nillable (#3540). The
 * evaluator's `text` must nil-check that field like the props struct does, or
 * the generated Go does not compile.
 */
export const fixture = createFixture({
  id: 'signal-computed-seed-defaulted-alias',
  description: 'an evaluated seed over a defaulted renamed destructure reads its default beside a nillable shared input (#3540)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

export function ComputedSeedDefaultedAlias(props: { label?: string }) {
  const { label: text = 'x' } = props
  const [v] = createSignal(text.toUpperCase())
  return <p data-v={v()} data-raw={props.label ?? 'a'}>x</p>
}
`,
  props: { label: 'q' },
  expectedHtml: `
    <p bf-s="test" bf="s0" data-raw="q" data-v="Q">x</p>
  `,
  dataPoints: [
    { name: 'absent', props: {} },
    { name: 'empty', props: { label: '' } },
  ],
})

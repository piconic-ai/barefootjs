import { createFixture } from '../src/types'

/**
 * A signal seed that reads a prop through a component-local helper call
 * (`isWide() ? props.label : 'narrow'`), the shape the Calendar UI uses
 * (`!isRangeMode() ? props.defaultSelected : undefined`, #3562). The seed
 * plan inlines a zero-param arrow `const` called with no arguments as its
 * body, so every SSR adapter seeds `props.mode === 'wide' ? … : …`. The CSR
 * template splices the helper itself, so the call reads
 * `(() => props.mode === 'wide')()`.
 *
 * `label` is required: an absent optional `label` would make the seed
 * `undefined`, and the DSL adapters do not yet treat a signal seeded from an
 * optional prop as nullable, so they render `data-shown=""` where Hono omits
 * the attribute. That gap is independent of the helper call (#3567).
 */
export const fixture = createFixture({
  id: 'signal-seed-local-helper-call',
  description: 'a signal seed reading a prop through a local helper call starts at its value (#3562)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

export function SignalSeedLocalHelperCall(props: { mode?: string; label: string }) {
  const isWide = () => props.mode === 'wide'
  const [shown] = createSignal(isWide() ? props.label : 'narrow')
  return <p data-shown={shown()}>x</p>
}
`,
  props: { mode: 'wide', label: 'L' },
  expectedHtml: `
    <p bf-s="test" bf="s0" data-shown="L">x</p>
  `,
  dataPoints: [
    { name: 'narrow', props: { mode: 'tall', label: 'L' } },
  ],
})

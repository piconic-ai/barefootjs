import { createFixture } from '../src/types'

/**
 * Signals seeded from an optional, no-default prop, bound to attributes
 * (#3567). When the prop is absent the seed is `undefined`, so Hono omits
 * the attribute; an explicit `''` still renders `name=""`. Covers a bare
 * read, a ternary branch and a `||` fallback between two optional props.
 */
export const fixture = createFixture({
  id: 'signal-seed-absent-optional-prop-attr',
  description: 'a signal seeded from an absent optional prop omits its attribute (#3567)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

export function SignalSeedAbsentOptionalPropAttr(props: { mode?: string; label?: string }) {
  const [bare] = createSignal(props.label)
  const [shown] = createSignal(props.mode === 'wide' ? props.label : 'narrow')
  const [fallback] = createSignal(props.label || props.mode)
  return <p data-bare={bare()} data-shown={shown()} data-fallback={fallback()}>x</p>
}
`,
  props: { mode: 'wide', label: 'L' },
  expectedHtml: `
    <p bf-s="test" bf="s0" data-bare="L" data-fallback="L" data-shown="L">x</p>
  `,
  dataPoints: [
    { name: 'label-absent', props: { mode: 'wide' } },
    { name: 'label-empty', props: { mode: 'wide', label: '' } },
    { name: 'narrow', props: { mode: 'tall' } },
    { name: 'all-absent', props: {} },
  ],
})

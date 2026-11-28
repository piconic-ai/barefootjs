import { createFixture } from '../src/types'

/**
 * `signal-seed-same-named-transform` with the child rendered per loop row:
 * each row's child seeds its signal by transforming the same-named prop
 * the row hands it, and renders the transformed value.
 */
export const fixture = createFixture({
  id: 'signal-seed-same-named-transform-loop-row',
  description: 'A loop-row child signal seeded by transforming its same-named prop keeps the transformation',
  source: `
'use client'
import { Kid } from './kid'
export function SignalSeedSameNamedTransformLoopRow(props: { items: string[] }) {
  return <ul>{props.items.map(item => <Kid key={item} seed={item} />)}</ul>
}
`,
  components: {
    './kid.tsx': `
'use client'
import { createSignal } from '@barefootjs/client'
export function Kid(props: { seed?: string }) {
  const [seed] = createSignal(String(props.seed ?? 'none') + '!')
  return <li>{seed()}</li>
}
`,
  },
  props: { items: ['a', 'b'] },
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li bf-s="Kid_*" bf="s1" data-key="a"><!--bf:s0-->a!<!--/--></li>
      <li bf-s="Kid_*" bf="s1" data-key="b"><!--bf:s0-->b!<!--/--></li>
    </ul>
  `,
})

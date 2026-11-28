import { createFixture } from '../src/types'

/**
 * The `/* @client *\/` escape of `signal-seed-reads-typeof-const`: the read happens on the client only,
 * so the server leaves its slot empty.
 */
export const fixture = createFixture({
  id: 'signal-seed-reads-typeof-const-client',
  description: 'The client-directive escape of signal-seed-reads-typeof-const',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function SignalSeedReadsTypeofConstClient(props: { x: string }) {
  const o = { n: typeof props.x }
  const [s] = createSignal({ n: o.n })
  return <p>{/* @client */ s().n}</p>
}
`,
  props: { x: 'q' },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0--><!--/--></p>
  `,
})

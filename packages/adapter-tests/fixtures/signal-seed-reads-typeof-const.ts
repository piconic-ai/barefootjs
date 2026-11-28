import { createFixture } from '../src/types'

/**
 * A signal seeded from an object literal that reads a const member applying
 * `typeof` (#3981): `createSignal({ n: o.n })`. The seed is
 * computed apart from any emitter, from the whole const, so it rendered empty (Go
 * failed on a nil pointer) where Hono renders `string`; every template adapter
 * refuses the const (BF101), and `/* @client *\/` defers the read
 * (`signal-seed-reads-typeof-const-client`).
 */
export const fixture = createFixture({
  id: 'signal-seed-reads-typeof-const',
  description: 'A signal seed reading a const member that applies typeof renders the type name (#3981)',
  escapes: [{ kind: 'client-directive', fixture: 'signal-seed-reads-typeof-const-client' }],
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function SignalSeedReadsTypeofConst(props: { x: string }) {
  const o = { n: typeof props.x }
  const [s] = createSignal({ n: o.n })
  return <p>{s().n}</p>
}
`,
  props: { x: 'q' },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->string<!--/--></p>
  `,
})

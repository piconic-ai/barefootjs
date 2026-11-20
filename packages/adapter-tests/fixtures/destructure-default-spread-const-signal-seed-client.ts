import { createFixture } from '../src/types'

/**
 * The `/* @client *\/` escape of `destructure-default-spread-const-signal-seed`:
 * the signal is read on the client only, so the server leaves its slot empty.
 */
export const fixture = createFixture({
  id: 'destructure-default-spread-const-signal-seed-client',
  description: 'The client-directive escape of a signal seeded from a const spreading a defaulted prop',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function DestructureDefaultSpreadConstSignalSeedClient(props: { b?: string[] }) {
  const { b = ['y'] } = props
  const local = [...b, 'z']
  const [n] = createSignal(local.length)
  return <p>{/* @client */ n()}</p>
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0--><!--/--></p>
  `,
})

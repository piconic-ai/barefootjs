import { createFixture } from '../src/types'

/**
 * A signal seeded from a const spreading a defaulted body-destructured prop
 * (#3954): `const local = [...b, 'z']; createSignal(local.length)`. The seed
 * rendered empty, or `0` on Go, where Hono renders `2`; every template adapter
 * refuses it (BF101), and `/* @client *\/` defers the read
 * (`destructure-default-spread-const-signal-seed-client`).
 */
export const fixture = createFixture({
  id: 'destructure-default-spread-const-signal-seed',
  description: 'A signal seeded from a const spreading a defaulted destructured array prop renders the length (#3954)',
  escapes: [{ kind: 'client-directive', fixture: 'destructure-default-spread-const-signal-seed-client' }],
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function DestructureDefaultSpreadConstSignalSeed(props: { b?: string[] }) {
  const { b = ['y'] } = props
  const local = [...b, 'z']
  const [n] = createSignal(local.length)
  return <p>{n()}</p>
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->2<!--/--></p>
  `,
})

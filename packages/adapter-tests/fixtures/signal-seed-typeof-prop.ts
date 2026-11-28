import { createFixture } from '../src/types'

/**
 * A signal seeded from `typeof` of a prop (#3981):
 * `createSignal(typeof props.x)`. No template lowers `typeof`, so it
 * rendered empty, or `0` on Go, where Hono renders the computed value; every
 * template adapter refuses it (BF101), and `/* @client *\/` defers the read
 * (`signal-seed-typeof-prop-client`).
 */
export const fixture = createFixture({
  id: 'signal-seed-typeof-prop',
  description: 'A signal seeded from typeof of a prop renders the type name (#3981)',
  escapes: [{ kind: 'client-directive', fixture: 'signal-seed-typeof-prop-client' }],
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function SignalSeedTypeofProp(props: { x: string }) {
  const [kind] = createSignal(typeof props.x)
  return <p>{kind()}</p>
}
`,
  props: { x: 'q' },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->string<!--/--></p>
  `,
})

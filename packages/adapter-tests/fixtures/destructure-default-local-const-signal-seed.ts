import { createFixture } from '../src/types'

/**
 * A body destructure default that reads a component-local const (#3725),
 * seeding a signal: a string one and a number one the client increments.
 */
export const fixture = createFixture({
  id: 'destructure-default-local-const-signal-seed',
  description: 'A default reading a component-local const seeds a signal with its value',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

export function DestructureDefaultLocalConstSignalSeed(props: { b?: string; n?: number }) {
  const DEF = 'z'
  const STEP = 2
  const { b = DEF.toUpperCase(), n = STEP + 1 } = props
  const [s] = createSignal(b)
  const [k, setK] = createSignal(n)
  return (
    <div>
      <p>{s()}|{k()}</p>
      <button onClick={() => setK(k() + 1)}>{k()}</button>
    </div>
  )
}
`,
  props: {},
  expectedHtml: `
    <div bf-s="test">
      <p bf="s2"><!--bf:s0-->Z<!--/-->|<!--bf:s1-->3<!--/--></p>
      <button bf="s4"><!--bf:s3-->3<!--/--></button>
    </div>
  `,
  dataPoints: [
    { name: 'all-passed', props: { b: 'B', n: 7 } },
    { name: 'falsy-passed', props: { b: '', n: 0 } },
  ],
})

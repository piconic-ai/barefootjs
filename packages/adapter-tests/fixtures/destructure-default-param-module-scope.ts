import { createFixture } from '../src/types'

/**
 * A parameter destructure default reads the module's consts: a string one
 * through a method call and bare, a number one through a const of a const
 * (`NEXT = START + 1`), which also seeds a signal (#3725, #3791). The same
 * default beside a body const of that name is
 * `destructure-default-param-body-const-same-name`.
 */
export const fixture = createFixture({
  id: 'destructure-default-param-module-scope',
  description: 'A parameter default reading module consts renders their value and seeds a signal',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

const DEF = 'm'
const START = 3
const NEXT = START + 1

export function DestructureDefaultParamModuleScope({ b = DEF.toUpperCase(), c = DEF, start = NEXT * 2 }: { b?: string; c?: string; start?: number }) {
  const [n, setN] = createSignal(start)
  return (
    <div title={c}>
      <p>{b}|{c}|{start}</p>
      <button onClick={() => setN(n() + 1)}>{n()}</button>
    </div>
  )
}
`,
  props: {},
  expectedHtml: `
    <div bf-s="test" bf="s6" title="m">
      <p bf="s3"><!--bf:s0-->M<!--/-->|<!--bf:s1-->m<!--/-->|<!--bf:s2-->8<!--/--></p>
      <button bf="s5"><!--bf:s4-->8<!--/--></button>
    </div>
  `,
  dataPoints: [
    { name: 'all-passed', props: { b: 'B', c: 'C', start: 0 } },
  ],
})

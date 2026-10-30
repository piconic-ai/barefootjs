import { createFixture } from '../src/types'

/**
 * Quoted literals that look like booleans or numbers, passed where the
 * child's field is not a plain `string`: an optional prop (read through
 * `??` and a ternary), a `number` prop, and the same calls inside a
 * conditional and a loop row. Each one is the string as written, so
 * `"false"` is truthy.
 */
export const fixture = createFixture({
  id: 'child-string-prop-literal-lookalike-positions',
  description: 'Boolean- and number-looking quoted literals to optional and number child props',
  source: `
import { Opt } from './Opt'
import { Num } from './Num'
export function ChildStringPropLiteralLookalikePositions(props: { show?: boolean }) {
  return (
    <div>
      <Opt v="false" />
      <Opt v="-1" />
      <Num n="5" />
      {props.show ? <Opt v="true" /> : <Opt v="1" />}
      {['p', 'q'].map(k => <Opt key={k} v="false" />)}
    </div>
  )
}
`,
  components: {
    './Opt': `
export function Opt(props: { v?: string }) {
  return <i data-v={props.v}>{props.v ?? 'none'}|{props.v ? 'y' : 'n'}</i>
}
`,
    './Num': `
export function Num(props: { n: number }) {
  return <u>{props.n}</u>
}
`,
  },
  expectedHtml: `
    <div bf-s="test" bf="s7">
      <i bf-s="test_s0" bf="s2" data-v="false"><!--bf:s0-->false<!--/-->|<!--bf-cond-start:s1-->y<!--bf-cond-end:s1--></i>
      <i bf-s="test_s1" bf="s2" data-v="-1"><!--bf:s0-->-1<!--/-->|<!--bf-cond-start:s1-->y<!--bf-cond-end:s1--></i>
      <u bf-s="test_s2" bf="s1"><!--bf:s0-->5<!--/--></u>
      <!--bf-cond-start:s3-->
      <i bf-s="test_s5" bf="s2" data-v="1"><!--bf:s0-->1<!--/-->|<!--bf-cond-start:s1-->y<!--bf-cond-end:s1--></i>
      <!--bf-cond-end:s3-->
      <i bf-s="Opt_*" bf="s2" data-key="p" data-v="false"><!--bf:s0-->false<!--/-->|<!--bf-cond-start:s1-->y<!--bf-cond-end:s1--></i>
      <i bf-s="Opt_*" bf="s2" data-key="q" data-v="false"><!--bf:s0-->false<!--/-->|<!--bf-cond-start:s1-->y<!--bf-cond-end:s1--></i>
    </div>
  `,
})

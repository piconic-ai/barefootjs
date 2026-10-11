import { createFixture } from '../src/types'

/**
 * An optional-chained method call on an absent optional prop is
 * `undefined` (#3435): `?.toFixed(2)` / `?.toUpperCase()` render empty when
 * the prop is omitted, alone and under a `??` fallback, while a present `0`,
 * a fraction and an empty string still call the method (and `''` survives
 * the `??`). A chained `?.a()?.b()` stays `undefined` through both guards,
 * and an absent result compares equal to `undefined`.
 */
export const fixture = createFixture({
  id: 'optional-chain-method-call',
  description: 'An optional-chained method call on an absent prop renders empty, and calls the method on a present value',
  source: `
'use client'
type Props = { noCount?: number; zero?: number; frac?: number; noText?: string; blank?: string; text?: string }
export function OptionalChainMethodCall(props: Props) {
  return (
    <ul>
      <li>{props.noCount?.toFixed(2)}|{props.noCount?.toFixed(2) ?? 'none'}</li>
      <li>{props.zero?.toFixed(2)}|{props.frac?.toFixed(1)}</li>
      <li>{props.noText?.toUpperCase()}|{props.noText?.toUpperCase() ?? 'none'}</li>
      <li>[{props.blank?.toUpperCase()}]|[{props.blank?.toUpperCase() ?? 'none'}]|{props.text?.toUpperCase()}</li>
      <li>{props.noText?.trim()?.toUpperCase() ?? 'none'}|[{props.blank?.trim()?.toUpperCase() ?? 'none'}]|{props.text?.trim()?.toUpperCase() ?? 'none'}</li>
      <li>{String(props.noText?.trim() === undefined)}|{String(props.blank?.trim() === undefined)}</li>
    </ul>
  )
}
`,
  props: { zero: 0, frac: 2.25, blank: '', text: 'ab' },
  expectedHtml: `
    <ul bf-s="test">
      <li bf="s2"><!--bf:s0--><!--/-->|<!--bf:s1-->none<!--/--></li>
      <li bf="s5"><!--bf:s3-->0.00<!--/-->|<!--bf:s4-->2.3<!--/--></li>
      <li bf="s8"><!--bf:s6--><!--/-->|<!--bf:s7-->none<!--/--></li>
      <li bf="s12">[<!--bf:s9--><!--/-->]|[<!--bf:s10--><!--/-->]|<!--bf:s11-->AB<!--/--></li>
      <li bf="s16"><!--bf:s13-->none<!--/-->|[<!--bf:s14--><!--/-->]|<!--bf:s15-->AB<!--/--></li>
      <li bf="s19"><!--bf:s17-->true<!--/-->|<!--bf:s18-->false<!--/--></li>
    </ul>
  `,
})

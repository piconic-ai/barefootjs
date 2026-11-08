import { createFixture } from '../src/types'

/**
 * `Number(x)`, unary `+`, arithmetic and `Math.max` / `Math.round` over a
 * value that may be `null` or `undefined` (`spec/js-undefined-value.md`
 * §1): `null` reads as `0`, `undefined` as `NaN`. Sources: a child
 * receiving an explicit `null` prop, an omitted prop forwarded, a literal
 * `null`, a literal `undefined` and an omitted prop at the call. The
 * child's prop is typed `v?: number | null`, so the type cannot say which
 * nil it holds and the runtime's helpers read the value, `null` or `UNDEF`
 * (as `omitted-optional-nullable-number-arithmetic`). The single-nil typing is
 * `undef-null-number-coercion-typed`; declaring only one nil is the rewrite.
 */
export const fixture = createFixture({
  id: 'undef-null-number-coercion',
  description: 'Number() / unary + / arithmetic / Math read null as 0 and undefined as NaN',
  source: `
import { Num } from './num'
export function UndefNullNumberCoercion(props: { n?: number | null; u?: number | null }) {
  return (
    <div>
      <Num v={props.n} />
      <Num v={props.u} />
      <Num v={null} />
      <Num v={undefined} />
      <Num />
    </div>
  )
}
`,
  components: {
    './num.tsx': `
export function Num(props: { v?: number | null }) {
  return <i data-v={Number(props.v)}>{Number(props.v)}|{+props.v}|{props.v + 1}|{props.v * 2}|{-props.v}|{Math.max(props.v, 1)}|{Math.round(props.v)}</i>
}
`,
  },
  props: { n: null },
  expectedHtml: `
    <div bf-s="test">
      <i bf-s="test_s0" bf="s7" data-v="0"><!--bf:s0-->0<!--/-->|<!--bf:s1-->0<!--/-->|<!--bf:s2-->1<!--/-->|<!--bf:s3-->0<!--/-->|<!--bf:s4-->0<!--/-->|<!--bf:s5-->1<!--/-->|<!--bf:s6-->0<!--/--></i>
      <i bf-s="test_s1" bf="s7" data-v="NaN"><!--bf:s0-->NaN<!--/-->|<!--bf:s1-->NaN<!--/-->|<!--bf:s2-->NaN<!--/-->|<!--bf:s3-->NaN<!--/-->|<!--bf:s4-->NaN<!--/-->|<!--bf:s5-->NaN<!--/-->|<!--bf:s6-->NaN<!--/--></i>
      <i bf-s="test_s2" bf="s7" data-v="0"><!--bf:s0-->0<!--/-->|<!--bf:s1-->0<!--/-->|<!--bf:s2-->1<!--/-->|<!--bf:s3-->0<!--/-->|<!--bf:s4-->0<!--/-->|<!--bf:s5-->1<!--/-->|<!--bf:s6-->0<!--/--></i>
      <i bf-s="test_s3" bf="s7" data-v="NaN"><!--bf:s0-->NaN<!--/-->|<!--bf:s1-->NaN<!--/-->|<!--bf:s2-->NaN<!--/-->|<!--bf:s3-->NaN<!--/-->|<!--bf:s4-->NaN<!--/-->|<!--bf:s5-->NaN<!--/-->|<!--bf:s6-->NaN<!--/--></i>
      <i bf-s="test_s4" bf="s7" data-v="NaN"><!--bf:s0-->NaN<!--/-->|<!--bf:s1-->NaN<!--/-->|<!--bf:s2-->NaN<!--/-->|<!--bf:s3-->NaN<!--/-->|<!--bf:s4-->NaN<!--/-->|<!--bf:s5-->NaN<!--/-->|<!--bf:s6-->NaN<!--/--></i>
    </div>
  `,
  escapes: [{ kind: 'rewrite', fixture: 'omitted-optional-number-arithmetic' }],
})

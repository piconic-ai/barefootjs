import { createFixture } from '../src/types'

/**
 * `Number(x)`, unary `+`, arithmetic, `Math.max` / `Math.round` and `<` /
 * `<=` over a number prop whose type admits one nil only
 * (`spec/js-undefined-value.md` §1): `v?: number` can only be `undefined`
 * (`NaN`, and a comparison is false) and `v: number | null` only `null`
 * (`0`). Sources: an omitted prop forwarded, a literal `undefined` and an
 * omitted prop at the call for the first; an explicit `null` prop
 * forwarded and a literal `null` for the second. The either-typed shape
 * (`v?: number | null`) is `undef-null-number-coercion`.
 */
export const fixture = createFixture({
  id: 'undef-null-number-coercion-typed',
  description: 'Number() / unary + / arithmetic / Math / < over a number typed with one nil read null as 0 and undefined as NaN',
  source: `
import { NumU } from './num-u'
import { NumN } from './num-n'
export function UndefNullNumberCoercionTyped(props: { n: number | null; u?: number }) {
  return (
    <div>
      <NumU v={props.u} />
      <NumU v={undefined} />
      <NumU />
      <NumN v={props.n} />
      <NumN v={null} />
    </div>
  )
}
`,
  components: {
    './num-u.tsx': `
export function NumU(props: { v?: number }) {
  return <i data-v={Number(props.v)}>{Number(props.v)}|{+props.v}|{props.v + 1}|{props.v * 2}|{-props.v}|{Math.max(props.v, 1)}|{Math.round(props.v)}|{props.v < 1 ? 'lt' : 'ge'}|{props.v <= 0 ? 'le' : 'gt'}</i>
}
`,
    './num-n.tsx': `
export function NumN(props: { v: number | null }) {
  return <b data-v={Number(props.v)}>{Number(props.v)}|{+props.v}|{props.v + 1}|{props.v * 2}|{-props.v}|{Math.max(props.v, 1)}|{Math.round(props.v)}|{props.v < 1 ? 'lt' : 'ge'}|{props.v <= 0 ? 'le' : 'gt'}</b>
}
`,
  },
  props: { n: null },
  expectedHtml: `
    <div bf-s="test">
      <i bf-s="test_s0" bf="s9" data-v="NaN"><!--bf:s0-->NaN<!--/-->|<!--bf:s1-->NaN<!--/-->|<!--bf:s2-->NaN<!--/-->|<!--bf:s3-->NaN<!--/-->|<!--bf:s4-->NaN<!--/-->|<!--bf:s5-->NaN<!--/-->|<!--bf:s6-->NaN<!--/-->|<!--bf-cond-start:s7-->ge<!--bf-cond-end:s7-->|<!--bf-cond-start:s8-->gt<!--bf-cond-end:s8--></i>
      <i bf-s="test_s1" bf="s9" data-v="NaN"><!--bf:s0-->NaN<!--/-->|<!--bf:s1-->NaN<!--/-->|<!--bf:s2-->NaN<!--/-->|<!--bf:s3-->NaN<!--/-->|<!--bf:s4-->NaN<!--/-->|<!--bf:s5-->NaN<!--/-->|<!--bf:s6-->NaN<!--/-->|<!--bf-cond-start:s7-->ge<!--bf-cond-end:s7-->|<!--bf-cond-start:s8-->gt<!--bf-cond-end:s8--></i>
      <i bf-s="test_s2" bf="s9" data-v="NaN"><!--bf:s0-->NaN<!--/-->|<!--bf:s1-->NaN<!--/-->|<!--bf:s2-->NaN<!--/-->|<!--bf:s3-->NaN<!--/-->|<!--bf:s4-->NaN<!--/-->|<!--bf:s5-->NaN<!--/-->|<!--bf:s6-->NaN<!--/-->|<!--bf-cond-start:s7-->ge<!--bf-cond-end:s7-->|<!--bf-cond-start:s8-->gt<!--bf-cond-end:s8--></i>
      <b bf-s="test_s3" bf="s9" data-v="0"><!--bf:s0-->0<!--/-->|<!--bf:s1-->0<!--/-->|<!--bf:s2-->1<!--/-->|<!--bf:s3-->0<!--/-->|<!--bf:s4-->0<!--/-->|<!--bf:s5-->1<!--/-->|<!--bf:s6-->0<!--/-->|<!--bf-cond-start:s7-->lt<!--bf-cond-end:s7-->|<!--bf-cond-start:s8-->le<!--bf-cond-end:s8--></b>
      <b bf-s="test_s4" bf="s9" data-v="0"><!--bf:s0-->0<!--/-->|<!--bf:s1-->0<!--/-->|<!--bf:s2-->1<!--/-->|<!--bf:s3-->0<!--/-->|<!--bf:s4-->0<!--/-->|<!--bf:s5-->1<!--/-->|<!--bf:s6-->0<!--/-->|<!--bf-cond-start:s7-->lt<!--bf-cond-end:s7-->|<!--bf-cond-start:s8-->le<!--bf-cond-end:s8--></b>
    </div>
  `,
})

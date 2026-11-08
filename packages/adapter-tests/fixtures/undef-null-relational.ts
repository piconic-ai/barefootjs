import { createFixture } from '../src/types'

/**
 * `<` / `<=` over a value that may be `null` or `undefined`
 * (`spec/js-undefined-value.md` §1): `null` compares as `0`, so `x < 1` and
 * `x <= 0` are true; `undefined` compares as `NaN`, so both are false.
 * Sources: a child receiving an explicit `null` prop, an omitted prop
 * forwarded, a literal `null`, a literal `undefined` and an omitted prop at
 * the call. As in `undef-null-number-coercion`, the `v?: number | null`
 * typing leaves the operand to the runtime's relational helper (as
 * `omitted-optional-nullable-number-relational`); the single-nil typing
 * reads it statically.
 */
export const fixture = createFixture({
  id: 'undef-null-relational',
  description: '< / <= compare null as 0 and undefined as NaN',
  source: `
import { Cmp } from './cmp'
export function UndefNullRelational(props: { n?: number | null; u?: number | null }) {
  return (
    <div>
      <Cmp v={props.n} />
      <Cmp v={props.u} />
      <Cmp v={null} />
      <Cmp v={undefined} />
      <Cmp />
    </div>
  )
}
`,
  components: {
    './cmp.tsx': `
export function Cmp(props: { v?: number | null }) {
  return <i data-lt={props.v < 1 ? 'y' : 'n'}>{props.v < 1 ? 'lt' : 'ge'}|{props.v <= 0 ? 'le' : 'gt'}</i>
}
`,
  },
  props: { n: null },
  expectedHtml: `
    <div bf-s="test">
      <i bf-s="test_s0" bf="s2" data-lt="y"><!--bf-cond-start:s0-->lt<!--bf-cond-end:s0-->|<!--bf-cond-start:s1-->le<!--bf-cond-end:s1--></i>
      <i bf-s="test_s1" bf="s2" data-lt="n"><!--bf-cond-start:s0-->ge<!--bf-cond-end:s0-->|<!--bf-cond-start:s1-->gt<!--bf-cond-end:s1--></i>
      <i bf-s="test_s2" bf="s2" data-lt="y"><!--bf-cond-start:s0-->lt<!--bf-cond-end:s0-->|<!--bf-cond-start:s1-->le<!--bf-cond-end:s1--></i>
      <i bf-s="test_s3" bf="s2" data-lt="n"><!--bf-cond-start:s0-->ge<!--bf-cond-end:s0-->|<!--bf-cond-start:s1-->gt<!--bf-cond-end:s1--></i>
      <i bf-s="test_s4" bf="s2" data-lt="n"><!--bf-cond-start:s0-->ge<!--bf-cond-end:s0-->|<!--bf-cond-start:s1-->gt<!--bf-cond-end:s1--></i>
    </div>
  `,
  escapes: [{ kind: 'rewrite', fixture: 'omitted-optional-number-relational' }],
})

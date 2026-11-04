import { createFixture } from '../src/types'

/**
 * Positions where `undefined` and `null` render the same
 * (`spec/js-undefined-value.md` §1, "Where they do not diverge"): a text
 * child renders nothing, an attribute is omitted, `??` and `||` take the
 * fallback, and both are falsy (a `style` object property is
 * `style-object-nil-property`). A guard for
 * the U steps: once a runtime holds the two apart, these must not change.
 * Sources: an explicit `null` prop, an omitted prop, and a child receiving
 * each of them forwarded, a literal `null`, a literal `undefined` and an
 * omitted prop at the call.
 */
export const fixture = createFixture({
  id: 'undef-null-non-diverging-positions',
  description: 'Text, attribute, ??, || and truthiness render null and undefined the same',
  source: `
import { Same } from './same'
export function UndefNullNonDivergingPositions(props: { n?: string | null; u?: string | null }) {
  return (
    <div title={props.n} data-u={props.u}>
      <p>[{props.n}]|[{props.u}]|{props.n ?? 'd'}|{props.u ?? 'd'}|{props.n || 'o'}|{props.u || 'o'}|{props.n ? 't' : 'f'}|{props.u ? 't' : 'f'}|{!props.n ? 'not' : 'is'}</p>
      <Same v={props.n} />
      <Same v={props.u} />
      <Same v={null} />
      <Same v={undefined} />
      <Same />
    </div>
  )
}
`,
  components: {
    './same.tsx': `
export function Same(props: { v?: string | null }) {
  return <i title={props.v}>[{props.v}]|{props.v ?? 'd'}|{props.v || 'o'}|{props.v && 'and'}|{props.v ? 't' : 'f'}</i>
}
`,
  },
  props: { n: null },
  expectedHtml: `
    <div bf-s="test" bf="s15">
      <p bf="s9">[<!--bf:s0--><!--/-->]|[<!--bf:s1--><!--/-->]|<!--bf:s2-->d<!--/-->|<!--bf:s3-->d<!--/-->|<!--bf:s4-->o<!--/-->|<!--bf:s5-->o<!--/-->|<!--bf-cond-start:s6-->f<!--bf-cond-end:s6-->|<!--bf-cond-start:s7-->f<!--bf-cond-end:s7-->|<!--bf-cond-start:s8-->not<!--bf-cond-end:s8--></p>
      <i bf-s="test_s10" bf="s5">[<!--bf:s0--><!--/-->]|<!--bf:s1-->d<!--/-->|<!--bf:s2-->o<!--/-->|<!--bf-cond-start:s3--><!--bf-cond-end:s3-->|<!--bf-cond-start:s4-->f<!--bf-cond-end:s4--></i>
      <i bf-s="test_s11" bf="s5">[<!--bf:s0--><!--/-->]|<!--bf:s1-->d<!--/-->|<!--bf:s2-->o<!--/-->|<!--bf-cond-start:s3--><!--bf-cond-end:s3-->|<!--bf-cond-start:s4-->f<!--bf-cond-end:s4--></i>
      <i bf-s="test_s12" bf="s5">[<!--bf:s0--><!--/-->]|<!--bf:s1-->d<!--/-->|<!--bf:s2-->o<!--/-->|<!--bf-cond-start:s3--><!--bf-cond-end:s3-->|<!--bf-cond-start:s4-->f<!--bf-cond-end:s4--></i>
      <i bf-s="test_s13" bf="s5">[<!--bf:s0--><!--/-->]|<!--bf:s1-->d<!--/-->|<!--bf:s2-->o<!--/-->|<!--bf-cond-start:s3--><!--bf-cond-end:s3-->|<!--bf-cond-start:s4-->f<!--bf-cond-end:s4--></i>
      <i bf-s="test_s14" bf="s5">[<!--bf:s0--><!--/-->]|<!--bf:s1-->d<!--/-->|<!--bf:s2-->o<!--/-->|<!--bf-cond-start:s3--><!--bf-cond-end:s3-->|<!--bf-cond-start:s4-->f<!--bf-cond-end:s4--></i>
    </div>
  `,
})

import { createFixture } from '../src/types'

/**
 * `=== undefined`, `=== null`, `!==` and the loose `== null` over a value
 * that may be `null` or `undefined` (`spec/js-undefined-value.md` §1,
 * decision 7): the strict tests tell the two apart, the loose one does not.
 * Sources: an explicit `null` prop, an omitted prop, and a child receiving
 * each of them forwarded, a literal `null`, a literal `undefined` and an
 * omitted prop at the call. Text and attribute positions.
 */
export const fixture = createFixture({
  id: 'undef-null-strict-equality',
  description: '=== undefined / === null tell null and undefined apart; == null does not',
  source: `
import { Eq } from './eq'
export function UndefNullStrictEquality(props: { n?: string | null; u?: string | null }) {
  return (
    <div data-n={props.n === null ? 'null' : 'other'} data-u={props.u === undefined ? 'undef' : 'other'}>
      <p>{props.n === undefined ? 'U' : 'n'}|{props.n === null ? 'N' : 'n'}|{props.u === undefined ? 'U' : 'n'}|{props.u === null ? 'N' : 'n'}|{props.n !== null ? 'x' : 'N'}|{props.u !== undefined ? 'x' : 'U'}|{props.n == null ? 'L' : 'x'}|{props.u == null ? 'L' : 'x'}</p>
      <Eq v={props.n} />
      <Eq v={props.u} />
      <Eq v={null} />
      <Eq v={undefined} />
      <Eq />
    </div>
  )
}
`,
  components: {
    './eq.tsx': `
export function Eq(props: { v?: string | null }) {
  return <i data-k={props.v === null ? 'null' : props.v === undefined ? 'undef' : 'value'}>{props.v === undefined ? 'U' : 'n'}|{props.v === null ? 'N' : 'n'}|{props.v != null ? 'x' : 'L'}</i>
}
`,
  },
  props: { n: null },
  expectedHtml: `
    <div bf-s="test" bf="s18" data-n="null" data-u="undef">
      <p bf="s12"><!--bf-cond-start:s0--><!--bf:s1-->n<!--/--><!--bf-cond-end:s0-->|<!--bf-cond-start:s2-->N<!--bf-cond-end:s2-->|<!--bf-cond-start:s4-->U<!--bf-cond-end:s4-->|<!--bf-cond-start:s6--><!--bf:s7-->n<!--/--><!--bf-cond-end:s6-->|<!--bf-cond-start:s8-->N<!--bf-cond-end:s8-->|<!--bf-cond-start:s9-->U<!--bf-cond-end:s9-->|<!--bf-cond-start:s10-->L<!--bf-cond-end:s10-->|<!--bf-cond-start:s11-->L<!--bf-cond-end:s11--></p>
      <i bf-s="test_s13" bf="s3" data-k="null"><!--bf-cond-start:s0-->n<!--bf-cond-end:s0-->|<!--bf-cond-start:s1-->N<!--bf-cond-end:s1-->|<!--bf-cond-start:s2-->L<!--bf-cond-end:s2--></i>
      <i bf-s="test_s14" bf="s3" data-k="undef"><!--bf-cond-start:s0-->U<!--bf-cond-end:s0-->|<!--bf-cond-start:s1-->n<!--bf-cond-end:s1-->|<!--bf-cond-start:s2-->L<!--bf-cond-end:s2--></i>
      <i bf-s="test_s15" bf="s3" data-k="null"><!--bf-cond-start:s0-->n<!--bf-cond-end:s0-->|<!--bf-cond-start:s1-->N<!--bf-cond-end:s1-->|<!--bf-cond-start:s2-->L<!--bf-cond-end:s2--></i>
      <i bf-s="test_s16" bf="s3" data-k="undef"><!--bf-cond-start:s0-->U<!--bf-cond-end:s0-->|<!--bf-cond-start:s1-->n<!--bf-cond-end:s1-->|<!--bf-cond-start:s2-->L<!--bf-cond-end:s2--></i>
      <i bf-s="test_s17" bf="s3" data-k="undef"><!--bf-cond-start:s0-->U<!--bf-cond-end:s0-->|<!--bf-cond-start:s1-->n<!--bf-cond-end:s1-->|<!--bf-cond-start:s2-->L<!--bf-cond-end:s2--></i>
    </div>
  `,
})

import { createFixture } from '../src/types'

/**
 * `JSON.stringify` over a value that may be `null` or `undefined`
 * (`spec/js-undefined-value.md` §1, decision 5): an `undefined` array
 * element becomes `null`, and a top-level `undefined` gives no string, so
 * the position renders nothing (and `'j=' + it` is `j=undefined`); `null`
 * is written `null` everywhere. An object member is
 * `undef-null-json-stringify-object-member`. Sources: an explicit `null`
 * prop, an omitted prop, and a child receiving each of them forwarded, a
 * literal `null`, a literal `undefined` and an omitted prop at the call.
 */
export const fixture = createFixture({
  id: 'undef-null-json-stringify',
  description: 'JSON.stringify writes an undefined array element as null and gives nothing for a top-level undefined',
  source: `
import { Json } from './json'
export function UndefNullJsonStringify(props: { n?: string | null; u?: string | null }) {
  return (
    <div data-n={JSON.stringify([props.n])} data-u={JSON.stringify([props.u])}>
      <p>{JSON.stringify([props.n, props.u])}|{JSON.stringify(props.n)}|{JSON.stringify(props.u)}|{'j=' + JSON.stringify(props.u)}</p>
      <Json v={props.n} />
      <Json v={props.u} />
      <Json v={null} />
      <Json v={undefined} />
      <Json />
    </div>
  )
}
`,
  components: {
    './json.tsx': `
export function Json(props: { v?: string | null }) {
  return <i data-j={JSON.stringify([props.v, 1])}>{JSON.stringify([props.v])}|{JSON.stringify(props.v)}</i>
}
`,
  },
  props: { n: null },
  expectedHtml: `
    <div bf-s="test" bf="s10" data-n="[null]" data-u="[null]">
      <p bf="s4"><!--bf:s0-->[null,null]<!--/-->|<!--bf:s1-->null<!--/-->|<!--bf:s2--><!--/-->|<!--bf:s3-->j=undefined<!--/--></p>
      <i bf-s="test_s5" bf="s2" data-j="[null,1]"><!--bf:s0-->[null]<!--/-->|<!--bf:s1-->null<!--/--></i>
      <i bf-s="test_s6" bf="s2" data-j="[null,1]"><!--bf:s0-->[null]<!--/-->|<!--bf:s1--><!--/--></i>
      <i bf-s="test_s7" bf="s2" data-j="[null,1]"><!--bf:s0-->[null]<!--/-->|<!--bf:s1-->null<!--/--></i>
      <i bf-s="test_s8" bf="s2" data-j="[null,1]"><!--bf:s0-->[null]<!--/-->|<!--bf:s1--><!--/--></i>
      <i bf-s="test_s9" bf="s2" data-j="[null,1]"><!--bf:s0-->[null]<!--/-->|<!--bf:s1--><!--/--></i>
    </div>
  `,
})

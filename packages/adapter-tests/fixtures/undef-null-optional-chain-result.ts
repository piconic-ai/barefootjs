import { createFixture } from '../src/types'

/**
 * `?.` over a nullish receiver yields `undefined`, never `null`
 * (`spec/js-undefined-value.md` §1), so the result renders as `undefined`
 * under `String` / a template literal, is `=== undefined`, and gives no
 * string under `JSON.stringify` (an array element is written `null`). Receivers: an explicit `null` prop, an omitted
 * prop, and an object missing the field; a present `null` field yields
 * `null`.
 */
export const fixture = createFixture({
  id: 'undef-null-optional-chain-result',
  description: '?. over a nullish receiver yields undefined, never null',
  source: `
type O = { k?: string | null }
export function UndefNullOptionalChainResult(props: { n?: O | null; u?: O | null; e: O; z: O }) {
  return (
    <div data-n={String(props.n?.k)}>
      <p>{String(props.n?.k)}|{String(props.u?.k)}|{String(props.e?.k)}|{String(props.z?.k)}</p>
      <p>{\`\${props.n?.k}\`}|{props.n?.k === undefined ? 'U' : 'x'}|{props.z?.k === undefined ? 'U' : 'x'}|{props.z?.k === null ? 'N' : 'x'}</p>
      <p>{JSON.stringify(props.n?.k)}|{JSON.stringify([props.u?.k, props.e?.k, props.z?.k])}</p>
    </div>
  )
}
`,
  props: { n: null, e: {}, z: { k: null } },
  expectedHtml: `
    <div bf-s="test" bf="s13" data-n="undefined">
      <p bf="s4"><!--bf:s0-->undefined<!--/-->|<!--bf:s1-->undefined<!--/-->|<!--bf:s2-->undefined<!--/-->|<!--bf:s3-->null<!--/--></p>
      <p bf="s9"><!--bf:s5-->undefined<!--/-->|<!--bf-cond-start:s6-->U<!--bf-cond-end:s6-->|<!--bf-cond-start:s7-->x<!--bf-cond-end:s7-->|<!--bf-cond-start:s8-->N<!--bf-cond-end:s8--></p>
      <p bf="s12"><!--bf:s10--><!--/-->|<!--bf:s11-->[null,null,null]<!--/--></p>
    </div>
  `,
})

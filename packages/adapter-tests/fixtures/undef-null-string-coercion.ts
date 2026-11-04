import { createFixture } from '../src/types'

/**
 * `String(x)`, a template literal and `+` over a value that may be `null`
 * or `undefined` (`spec/js-undefined-value.md` §1): JS spells the two
 * `"null"` and `"undefined"`. Sources: an explicit `null` prop, an omitted
 * prop, and a child receiving each of them forwarded, a literal `null`, a
 * literal `undefined` and an omitted prop at the call. Text and attribute
 * positions.
 */
export const fixture = createFixture({
  id: 'undef-null-string-coercion',
  description: 'String() / template literal / + render null and undefined as "null" and "undefined"',
  source: `
import { Show } from './show'
export function UndefNullStringCoercion(props: { n?: string | null; u?: string | null }) {
  return (
    <div data-s={String(props.n)} data-t={\`\${props.u}\`}>
      <p>{String(props.n)}|{String(props.u)}|{\`\${props.n}\`}|{\`\${props.u}\`}|{'a' + props.n}|{props.u + 'x'}</p>
      <Show v={props.n} />
      <Show v={props.u} />
      <Show v={null} />
      <Show v={undefined} />
      <Show />
    </div>
  )
}
`,
  components: {
    './show.tsx': `
export function Show(props: { v?: string | null }) {
  return <i data-v={String(props.v)}>{String(props.v)}|{\`\${props.v}\`}|{props.v + 'x'}</i>
}
`,
  },
  props: { n: null },
  expectedHtml: `
    <div bf-s="test" bf="s12" data-s="null" data-t="undefined">
      <p bf="s6"><!--bf:s0-->null<!--/-->|<!--bf:s1-->undefined<!--/-->|<!--bf:s2-->null<!--/-->|<!--bf:s3-->undefined<!--/-->|<!--bf:s4-->anull<!--/-->|<!--bf:s5-->undefinedx<!--/--></p>
      <i bf-s="test_s7" bf="s3" data-v="null"><!--bf:s0-->null<!--/-->|<!--bf:s1-->null<!--/-->|<!--bf:s2-->nullx<!--/--></i>
      <i bf-s="test_s8" bf="s3" data-v="undefined"><!--bf:s0-->undefined<!--/-->|<!--bf:s1-->undefined<!--/-->|<!--bf:s2-->undefinedx<!--/--></i>
      <i bf-s="test_s9" bf="s3" data-v="null"><!--bf:s0-->null<!--/-->|<!--bf:s1-->null<!--/-->|<!--bf:s2-->nullx<!--/--></i>
      <i bf-s="test_s10" bf="s3" data-v="undefined"><!--bf:s0-->undefined<!--/-->|<!--bf:s1-->undefined<!--/-->|<!--bf:s2-->undefinedx<!--/--></i>
      <i bf-s="test_s11" bf="s3" data-v="undefined"><!--bf:s0-->undefined<!--/-->|<!--bf:s1-->undefined<!--/-->|<!--bf:s2-->undefinedx<!--/--></i>
    </div>
  `,
})

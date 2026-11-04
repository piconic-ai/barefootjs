import { createFixture } from '../src/types'

/**
 * A loop row's optional nullable field (`v?: string | null`) read as
 * `String(r.v)`, in a template literal and under `JSON.stringify`
 * (`spec/js-undefined-value.md` §1): a row that omits the field reads
 * `undefined`, a row holding `null` reads `null`.
 */
export const fixture = createFixture({
  id: 'undef-null-row-field-coercion',
  description: 'An omitted row field reads undefined and a null one reads null under String / template literal / JSON',
  source: `
type Row = { id: string; v?: string | null }
export function UndefNullRowFieldCoercion(props: { rows: Row[] }) {
  return (
    <ul>
      {props.rows.map(r => (
        <li key={r.id} data-v={String(r.v)}>{String(r.v)}|{\`\${r.v}\`}|{JSON.stringify(r.v)}</li>
      ))}
    </ul>
  )
}
`,
  props: { rows: [{ id: 'a', v: null }, { id: 'b' }, { id: 'c', v: 'x' }] },
  expectedHtml: `
    <ul bf-s="test" bf="s4">
      <li bf="s3" data-key="a" data-v="null"><!--bf:s0-->null<!--/-->|<!--bf:s1-->null<!--/-->|<!--bf:s2-->null<!--/--></li>
      <li bf="s3" data-key="b" data-v="undefined"><!--bf:s0-->undefined<!--/-->|<!--bf:s1-->undefined<!--/-->|<!--bf:s2--><!--/--></li>
      <li bf="s3" data-key="c" data-v="x"><!--bf:s0-->x<!--/-->|<!--bf:s1-->x<!--/-->|<!--bf:s2-->&quot;x&quot;<!--/--></li>
    </ul>
  `,
})

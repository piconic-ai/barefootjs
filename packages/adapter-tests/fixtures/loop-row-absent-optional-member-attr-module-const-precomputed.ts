import { createFixture } from '../src/types'

/**
 * `prop-precompute` twin of `loop-row-absent-optional-member-attr-module-const`:
 * the caller passes the same rows in as props, so no adapter has to unroll a
 * module-const array at compile time. Every adapter renders the rows, with
 * the attribute omitted where a row lacks the member or holds `null`.
 */
export const fixture = createFixture({
  id: 'loop-row-absent-optional-member-attr-module-const-precomputed',
  description: 'prop-precompute twin of loop-row-absent-optional-member-attr-module-const — the rows come in as props',
  source: `
type Row = { id: number; tone?: string | null }
export function LoopRowAbsentOptionalMemberAttrModuleConstPrecomputed(props: { rows: Row[]; raw: Row[] }) {
  return (
    <div>
      <ul>{props.rows.map((r) => <li key={r.id} data-tone={r.tone}>{r.id}</li>)}</ul>
      <ol>{props.rows.map(({ id, tone }) => <li key={id} data-tone={tone}>{id}</li>)}</ol>
      <p>{props.raw.map((r) => <b key={r.id} data-tone={r.tone}>{r.id}</b>)}</p>
    </div>
  )
}
`,
  props: {
    rows: [{ id: 1, tone: 'k' }, { id: 2 }],
    raw: [{ id: 1, tone: 'k' }, { id: 2 }, { id: 3, tone: null }],
  },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s2">
        <li bf="s1" data-key="1" data-tone="k"><!--bf:s0-->1<!--/--></li>
        <li bf="s1" data-key="2"><!--bf:s0-->2<!--/--></li>
      </ul>
      <ol bf="s5">
        <li bf="s4" data-key="1" data-tone="k"><!--bf:s3-->1<!--/--></li>
        <li bf="s4" data-key="2"><!--bf:s3-->2<!--/--></li>
      </ol>
      <p bf="s8">
        <b bf="s7" data-key="1" data-tone="k"><!--bf:s6-->1<!--/--></b>
        <b bf="s7" data-key="2"><!--bf:s6-->2<!--/--></b>
        <b bf="s7" data-key="3"><!--bf:s6-->3<!--/--></b>
      </p>
    </div>
  `,
})

import { createFixture } from '../src/types'

/**
 * A loop over a module const whose rows omit a member: the attribute bound
 * to it is omitted on the rows that lack it or hold `null`. Covers a typed
 * const (`const ROWS: Row[] = […]`) read as a member (`r.tone`) and through
 * a destructured row param (`({ id, tone }) =>`), and an untyped array of
 * object literals, whose row shape the literal spells. The props-array form
 * is `loop-row-absent-optional-member-attr`.
 */
export const fixture = createFixture({
  id: 'loop-row-absent-optional-member-attr-module-const',
  description: 'An absent or null member of a module-const row omits the attribute bound to it',
  escapes: [
    { kind: 'prop-precompute', fixture: 'loop-row-absent-optional-member-attr-module-const-precomputed' },
    { kind: 'client-directive', fixture: 'loop-row-absent-optional-member-attr-module-const-client' },
  ],
  source: `
type Row = { id: number; tone?: string }
const ROWS: Row[] = [{ id: 1, tone: 'k' }, { id: 2 }]
const RAW = [{ id: 1, tone: 'k' }, { id: 2 }, { id: 3, tone: null }]
export function LoopRowAbsentOptionalMemberAttrModuleConst() {
  return (
    <div>
      <ul>{ROWS.map((r) => <li key={r.id} data-tone={r.tone}>{r.id}</li>)}</ul>
      <ol>{ROWS.map(({ id, tone }) => <li key={id} data-tone={tone}>{id}</li>)}</ol>
      <p>{RAW.map((r) => <b key={r.id} data-tone={r.tone}>{r.id}</b>)}</p>
    </div>
  )
}
`,
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

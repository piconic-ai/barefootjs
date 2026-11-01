import { createFixture } from '../src/types'

/**
 * Siblings of `rest-member-ternary`: an absent rest member reads as
 * absent, a numeric member compares as a number, a `&&` condition reads
 * the member, and a loop row named like the rest binding shadows it.
 */
export const fixture = createFixture({
  id: 'rest-member-ternary-shapes',
  description: 'Conditions on destructure-rest members: absent, numeric and `&&` reads, and a loop row that shadows the rest binding',
  source: `
export function RestMemberTernaryShapes({ rows, ...rest }: { rows: { tone?: string }[]; tone?: string; count?: number }) {
  return (
    <div className={rest.tone ? 'has' : 'none'} data-many={rest.count > 1 ? 'yes' : 'no'}>
      {rest.count && <b>{rest.count}</b>}
      {rest.tone && <i>tone</i>}
      <ul>{rows.map(rest => <li key={rest.tone ?? "none"}>{rest.tone === 'row' ? 'row' : 'other'}</li>)}</ul>
    </div>
  )
}
`,
  props: { rows: [{ tone: 'row' }, { tone: 'x' }], count: 2 },
  expectedHtml: `
    <div bf-s="test" bf="s6" class="none" data-many="yes">
      <b bf-c="s0" bf="s2"><!--bf:s1-->2<!--/--></b>
      <!--bf-cond-start:s3-->
      <!--bf-cond-end:s3-->
      <ul bf="s5">
        <li data-key="row"><!--bf-cond-start:s4-->row<!--bf-cond-end:s4--></li>
        <li data-key="x"><!--bf-cond-start:s4-->other<!--bf-cond-end:s4--></li>
      </ul>
    </div>
  `,
})

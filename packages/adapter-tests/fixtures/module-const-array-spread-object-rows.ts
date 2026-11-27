import { createFixture } from '../src/types'

/**
 * #3979: the corpus's data-table demo shape. A module-level array of object
 * rows spreads another literal array of rows; a loop renders each row's
 * fields, and markup reads its length.
 */
export const fixture = createFixture({
  id: 'module-const-array-spread-object-rows',
  description: 'A loop over a module-level array of objects built with a spread renders every row (#3979)',
  source: `
type Row = { id: string; n: number }
const ROWS: Row[] = [{ id: 'a', n: 1 }, { id: 'b', n: 2 }]
const MORE: Row[] = [...ROWS, { id: 'c', n: 3 }]
export function ModuleConstArraySpreadObjectRows() {
  return <ul>{MORE.map(r => <li key={r.id}>{r.id}:{r.n}</li>)}<li>{MORE.length}</li></ul>
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s2">
      <li data-key="a"><!--bf:s0-->a<!--/-->:<!--bf:s1-->1<!--/--></li>
      <li data-key="b"><!--bf:s0-->b<!--/-->:<!--bf:s1-->2<!--/--></li>
      <li data-key="c"><!--bf:s0-->c<!--/-->:<!--bf:s1-->3<!--/--></li>
      <li>3</li>
    </ul>
  `,
})

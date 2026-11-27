import { createFixture } from '../src/types'

/**
 * #3979: markup reads a module-level array const that spreads another
 * literal array const in place: its `length`, an element that comes from
 * the spread, one after it, and an index past the end.
 */
export const fixture = createFixture({
  id: 'module-const-array-spread-in-place',
  description: 'In-place reads of a module-level array const built with a spread render its length and elements (#3979)',
  source: `
const BASE = ['y']
const ALL = [...BASE, 'z']
export function ModuleConstArraySpreadInPlace() {
  return <p>{ALL.length}-{ALL[0]}-{ALL[1]}-{ALL[2]}</p>
}
`,
  expectedHtml: `
    <p bf-s="test">2-y-z-</p>
  `,
})

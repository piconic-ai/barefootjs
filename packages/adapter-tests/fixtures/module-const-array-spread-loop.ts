import { createFixture } from '../src/types'

/**
 * #3979: a `.map()` over a module-level array const built from a spread of
 * a literal array const that is itself built with a spread, an own element,
 * and a spread of an inline array literal.
 */
export const fixture = createFixture({
  id: 'module-const-array-spread-loop',
  description: 'A loop over a module-level array const built with spreads renders every row (#3979)',
  source: `
const A = ['a']
const B = [...A, 'b']
const ALL = [...B, 'c', ...['x']]
export function ModuleConstArraySpreadLoop() {
  return <ul>{ALL.map(x => <li key={x}>{x}</li>)}</ul>
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li data-key="a"><!--bf:s0-->a<!--/--></li>
      <li data-key="b"><!--bf:s0-->b<!--/--></li>
      <li data-key="c"><!--bf:s0-->c<!--/--></li>
      <li data-key="x"><!--bf:s0-->x<!--/--></li>
    </ul>
  `,
})

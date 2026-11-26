import { createFixture } from '../src/types'

/**
 * #3979: a child prop reads a module-level array const that spreads
 * another literal array const (`<Kid n={ALL.length} />`).
 */
export const fixture = createFixture({
  id: 'module-const-array-spread-child-prop',
  description: 'A child prop reading a module-level array const built with a spread renders the length (#3979)',
  source: `
const BASE = ['y']
const ALL = [...BASE, 'z']
function Kid(props: { n: number }) {
  return <i>{props.n}</i>
}
export function ModuleConstArraySpreadChildProp() {
  return <div><Kid n={ALL.length} /></div>
}
`,
  expectedHtml: `
    <div bf-s="test"><i bf-s="test_s0" bf="s1"><!--bf:s0-->2<!--/--></i></div>
  `,
})

import { createFixture } from '../src/types'

/**
 * The children prop renamed in the parameter destructure
 * (`{ children: kids }`) as a ternary's condition and inside its branch,
 * next to a data prop read as text. Present children render as markup in
 * the branch; absent children take the other branch. The data prop stays a
 * reactive text slot (#3572).
 */
export const fixture = createFixture({
  id: 'children-renamed-param-conditional',
  description: 'A renamed children prop guards a branch that renders the children markup',
  source: `
'use client'
import { Guarded } from './guarded'
import { Leaf } from './leaf'
export function Page() {
  return <main><Guarded label="a"><Leaf /></Guarded><Guarded label="b" /></main>
}
`,
  components: {
    './guarded.tsx': `
'use client'
export function Guarded({ children: kids, label }: { children?: unknown; label?: string }) {
  return <div className="guarded"><h3>{label}</h3>{kids ? <section>{kids}</section> : <i>none</i>}</div>
}
`,
    './leaf.tsx': `
'use client'
export function Leaf() {
  return <span className="leaf">leaf</span>
}
`,
  },
  expectedHtml: `
    <main bf-s="test">
      <div bf-s="test_s1" class="guarded">
        <h3 bf="s1"><!--bf:s0-->a<!--/--></h3>
        <section><span bf-s="test_s0" class="leaf">leaf</span></section>
      </div>
      <div bf-s="test_s2" class="guarded">
        <h3 bf="s1"><!--bf:s0-->b<!--/--></h3>
        <i>none</i>
      </div>
    </main>
  `,
})

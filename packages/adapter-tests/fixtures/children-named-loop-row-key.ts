import { createFixture } from '../src/types'

/**
 * A loop row parameter named `children`, in a component that also takes the
 * children prop, used as the row's `key` and read as text. The row's
 * `children` is the row value, so the key and the text are the escaped row
 * strings, and the passed children render as markup once outside the loop
 * (#3572).
 */
export const fixture = createFixture({
  id: 'children-named-loop-row-key',
  description: 'A loop row named children keys and renders the row value, not the children prop',
  source: `
'use client'
import { Rows } from './rows'
import { Leaf } from './leaf'
export function Page(props: { rows: string[] }) {
  return <main><Rows rows={props.rows}><Leaf /></Rows></main>
}
`,
  props: { rows: ['<b>r1</b>', '<b>r2</b>'] },
  components: {
    './rows.tsx': `
'use client'
export function Rows({ children, rows }: { children?: unknown; rows: string[] }) {
  return <ul className="rows">{children}{rows.map(children => <li key={children}>{children}</li>)}</ul>
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
    <main bf-s="test"><ul bf-s="test_s1" bf="s1" class="rows"><span bf-s="test_s0" class="leaf">leaf</span><li data-key="&lt;b&gt;r1&lt;/b&gt;"><!--bf:s0-->&lt;b&gt;r1&lt;/b&gt;<!--/--></li><li data-key="&lt;b&gt;r2&lt;/b&gt;"><!--bf:s0-->&lt;b&gt;r2&lt;/b&gt;<!--/--></li></ul></main>
  `,
})

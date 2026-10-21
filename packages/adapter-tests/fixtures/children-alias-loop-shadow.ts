import { createFixture } from '../src/types'

/**
 * A component-scope alias of the children prop read inside a loop row whose
 * parameter shadows a name the alias resolves through (#3572):
 *
 * - `Initializer`: `const { children: c } = props`, read in
 *   `props.rows.map(props => …)`. The row's `props` does not reach `c`'s
 *   initializer, which reads the component's props object.
 * - `RowNamedChildren`: a row parameter named `children` is the row value,
 *   not the prop, so it stays escaped text.
 *
 * The captured alias renders the passed children as markup; the
 * markup-looking row values render escaped. A loop row that shadows an
 * intermediate alias (`const a = children; const b = a` read as `{b}` in
 * `rows.map(a => …)`) is `children-alias-hop-shadowed-intermediate`.
 */
export const fixture = createFixture({
  id: 'children-alias-loop-shadow',
  description: 'A children alias read under a loop row that shadows its initializer keeps the children markup',
  source: `
'use client'
import { Initializer, RowNamedChildren } from './list'
import { Leaf } from './leaf'
export function Page(props: { rows: string[] }) {
  return (
    <main>
      <Initializer rows={props.rows}><Leaf /></Initializer>
      <RowNamedChildren rows={props.rows}><Leaf /></RowNamedChildren>
    </main>
  )
}
`,
  props: { rows: ['<b>r1</b>', '<b>r2</b>'] },
  components: {
    './list.tsx': `
'use client'
export function Initializer(props: { children?: unknown; rows: string[] }) {
  const { children: c } = props
  return <ul className="initializer">{props.rows.map((props, i) => <li key={i}>{c}</li>)}</ul>
}
export function RowNamedChildren({ children, rows }: { children?: unknown; rows: string[] }) {
  return <ul className="row-named">{children}{rows.map((children, i) => <li key={i}>{children}</li>)}</ul>
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
      <ul bf-s="test_s1" bf="s0" class="initializer">
        <li data-key="0"><span bf-s="test_s0" class="leaf">leaf</span></li>
        <li data-key="1"><span bf-s="test_s0" class="leaf">leaf</span></li>
      </ul>
      <ul bf-s="test_s3" bf="s1" class="row-named">
        <span bf-s="test_s2" class="leaf">leaf</span>
        <li data-key="0"><!--bf:s0-->&lt;b&gt;r1&lt;/b&gt;<!--/--></li>
        <li data-key="1"><!--bf:s0-->&lt;b&gt;r2&lt;/b&gt;<!--/--></li>
      </ul>
    </main>
  `,
})

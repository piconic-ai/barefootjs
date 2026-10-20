import { createFixture } from '../src/types'

/**
 * A const alias hop of the children prop read inside a loop row whose
 * parameter shadows a name the hop passes through: `const a = children;
 * const b = a` read as `{b}` in `rows.map(a => …)`, and `const c =
 * children` read as `{c}` in `rows.map((children, i) => …)`. The alias
 * still holds the children prop, so the passed children render as markup,
 * and the row value renders as escaped text (#3572).
 */
export const fixture = createFixture({
  id: 'children-alias-hop-shadowed-intermediate',
  description: 'A children alias hop read in a loop row that shadows an intermediate alias keeps the children markup',
  source: `
'use client'
import { Intermediate, ShadowedParam } from './list'
import { Leaf } from './leaf'
export function Page(props: { rows: string[] }) {
  return (
    <main>
      <Intermediate rows={props.rows}><Leaf /></Intermediate>
      <ShadowedParam rows={props.rows}><Leaf /></ShadowedParam>
    </main>
  )
}
`,
  props: { rows: ['<b>r1</b>', '<b>r2</b>'] },
  components: {
    './list.tsx': `
'use client'
export function Intermediate({ children, rows }: { children?: unknown; rows: string[] }) {
  const a = children
  const b = a
  return <ul className="intermediate">{rows.map(a => <li key={a}>{b}<i>{a}</i></li>)}</ul>
}
export function ShadowedParam({ children, rows }: { children?: unknown; rows: string[] }) {
  const c = children
  return <ul className="shadowed-param">{rows.map((children, i) => <li key={i}>{c}<i>{children}</i></li>)}</ul>
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
      <ul bf-s="test_s1" bf="s1" class="intermediate">
        <li data-key="&lt;b&gt;r1&lt;/b&gt;">
          <span bf-s="test_s0" class="leaf">leaf</span>
          <i><!--bf:s0-->&lt;b&gt;r1&lt;/b&gt;<!--/--></i>
        </li>
        <li data-key="&lt;b&gt;r2&lt;/b&gt;">
          <span bf-s="test_s0" class="leaf">leaf</span>
          <i><!--bf:s0-->&lt;b&gt;r2&lt;/b&gt;<!--/--></i>
        </li>
      </ul>
      <ul bf-s="test_s3" bf="s1" class="shadowed-param">
        <li data-key="0">
          <span bf-s="test_s2" class="leaf">leaf</span>
          <i><!--bf:s0-->&lt;b&gt;r1&lt;/b&gt;<!--/--></i>
        </li>
        <li data-key="1">
          <span bf-s="test_s2" class="leaf">leaf</span>
          <i><!--bf:s0-->&lt;b&gt;r2&lt;/b&gt;<!--/--></i>
        </li>
      </ul>
    </main>
  `,
})

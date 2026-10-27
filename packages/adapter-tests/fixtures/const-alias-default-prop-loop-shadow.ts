import { createFixture } from '../src/types'

/**
 * A const alias of a prop with a destructure default, read inside a loop
 * row that binds the prop's name: `const a = label` with `{ label = 'd' }`
 * (a signature destructure) or `const { label = 'e' } = props` (a body
 * destructure), read as `{a}` in `rows.map(label => …)`. The alias holds the
 * prop with its default applied, whether the prop is passed or omitted.
 * The undefaulted version is `const-alias-hop-loop-shadow`.
 */
export const fixture = createFixture({
  id: 'const-alias-default-prop-loop-shadow',
  description: 'A const alias of a defaulted prop read in a loop row that shadows the prop keeps the defaulted value',
  source: `
'use client'
import { Signature, Body } from './list'
export function Page(props: { label: string; rows: string[] }) {
  return (
    <main>
      <Signature rows={props.rows} />
      <Signature label={props.label} rows={props.rows} />
      <Body rows={props.rows} />
      <Body label={props.label} rows={props.rows} />
    </main>
  )
}
`,
  props: { label: 'L<x>', rows: ['r1', 'r2'] },
  components: {
    './list.tsx': `
'use client'
export function Signature({ label = 'd', rows }: { label?: string; rows: string[] }) {
  const a = label
  return <ul className="signature">{rows.map(label => <li key={label} title={a}>{a}/{label}</li>)}</ul>
}
export function Body(props: { label?: string; rows: string[] }) {
  const { label = 'e' } = props
  const a = label
  return <ul className="body">{props.rows.map(label => <li key={label} title={a}>{a}/{label}</li>)}</ul>
}
`,
  },
  expectedHtml: `
    <main bf-s="test">
      <ul bf-s="test_s0" bf="s3" class="signature">
        <li bf="s2" data-key="r1" title="d"><!--bf:s0-->d<!--/-->/<!--bf:s1-->r1<!--/--></li>
        <li bf="s2" data-key="r2" title="d"><!--bf:s0-->d<!--/-->/<!--bf:s1-->r2<!--/--></li>
      </ul>
      <ul bf-s="test_s1" bf="s3" class="signature">
        <li bf="s2" data-key="r1" title="L&lt;x&gt;"><!--bf:s0-->L&lt;x&gt;<!--/-->/<!--bf:s1-->r1<!--/--></li>
        <li bf="s2" data-key="r2" title="L&lt;x&gt;"><!--bf:s0-->L&lt;x&gt;<!--/-->/<!--bf:s1-->r2<!--/--></li>
      </ul>
      <ul bf-s="test_s2" bf="s3" class="body">
        <li bf="s2" data-key="r1" title="e"><!--bf:s0-->e<!--/-->/<!--bf:s1-->r1<!--/--></li>
        <li bf="s2" data-key="r2" title="e"><!--bf:s0-->e<!--/-->/<!--bf:s1-->r2<!--/--></li>
      </ul>
      <ul bf-s="test_s3" bf="s3" class="body">
        <li bf="s2" data-key="r1" title="L&lt;x&gt;"><!--bf:s0-->L&lt;x&gt;<!--/-->/<!--bf:s1-->r1<!--/--></li>
        <li bf="s2" data-key="r2" title="L&lt;x&gt;"><!--bf:s0-->L&lt;x&gt;<!--/-->/<!--bf:s1-->r2<!--/--></li>
      </ul>
    </main>
  `,
})

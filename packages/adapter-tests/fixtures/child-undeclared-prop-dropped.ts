import { createFixture } from '../src/types'

/**
 * A prop the child does not declare, on a child with no rest object: JS
 * hands it over and the child never reads it, so it renders nothing.
 * Covers a quoted literal, an expression, a boolean shorthand, a template
 * literal, a signal read in a conditional branch and a loop row's value,
 * on destructured props and `function C(props)`.
 */
export const fixture = createFixture({
  id: 'child-undeclared-prop-dropped',
  description: 'Props a child does not declare (no rest object) are ignored',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
import { Tag } from './Tag'
import { Note } from './Note'
export function ChildUndeclaredPropDropped() {
  const n = 3
  const [on, setOn] = createSignal(true)
  const [rows] = createSignal([{ id: 'r1', t: 'x' }, { id: 'r2', t: 'y' }])
  return (
    <div>
      <Tag label="a" extra="x" count={n} flag tone={\`t-\${n}\`} />
      <Note text="b" extra="y" size={2} />
      {on() ? <Tag label="c" extra={on()} /> : null}
      {rows().map(r => <Note key={r.id} text={r.t} extra={r.id} />)}
      {['p', 'q'].map(k => <Tag key={k} label={k} extra={k} flag />)}
      <button onClick={() => setOn(!on())}>t</button>
    </div>
  )
}
`,
  components: {
    './Tag': `
export function Tag({ label }: { label: string }) {
  return <span>{label}</span>
}
`,
    './Note': `
export function Note(props: { text: string }) {
  return <em>{props.text}</em>
}
`,
  },
  expectedHtml: `
    <div bf-s="test" bf="s7">
      <span bf-s="test_s0" bf="s1"><!--bf:s0-->a<!--/--></span>
      <em bf-s="test_s1" bf="s1"><!--bf:s0-->b<!--/--></em>
      <!--bf-cond-start:s2-->
      <span bf-s="test_s3" bf="s1"><!--bf:s0-->c<!--/--></span>
      <!--bf-cond-end:s2-->
      <em bf-s="Note_*" bf="s1" data-key="r1"><!--bf:s0-->x<!--/--></em>
      <em bf-s="Note_*" bf="s1" data-key="r2"><!--bf:s0-->y<!--/--></em>
      <span bf-s="Tag_*" bf="s1" data-key="p"><!--bf:s0-->p<!--/--></span>
      <span bf-s="Tag_*" bf="s1" data-key="q"><!--bf:s0-->q<!--/--></span>
      <button bf="s6">t</button>
    </div>
  `,
})

import { createFixture } from '../src/types'

/**
 * A component nested in an element loop row whose param is destructured,
 * forwarding children that read a destructured name
 * (`rows().map(({ id, label }) => <section key={id}><Chip><b>{label}</b></Chip></section>)`).
 */
export const fixture = createFixture({
  id: 'loop-element-row-child-children-destructured-row',
  description: "A component in an element loop row with a destructured param forwards children that read a destructured name",
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

function Chip(props: { children?: any }) {
  return <em>{props.children}</em>
}

type Row = { id: string; label: string }

export function LoopElementRowChildChildrenDestructuredRow() {
  const [rows] = createSignal<Row[]>([{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }])
  return (
    <div>
      {rows().map(({ id, label }) => (
        <section key={id}><Chip><b>{label}</b></Chip></section>
      ))}
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s2">
      <section data-key="a"><em bf-s="test_s1"><b><!--bf:^s0-->A<!--/--></b></em></section>
      <section data-key="b"><em bf-s="test_s1"><b><!--bf:^s0-->B<!--/--></b></em></section>
    </div>
  `,
})

import { createFixture } from '../src/types'

/**
 * Two components nested in one another inside an element loop row, the
 * inner one forwarding children that read the row
 * (`<section key={o.id}><Chip><Chip><button …>{o.label}</button></Chip></Chip></section>`).
 */
export const fixture = createFixture({
  id: 'loop-element-row-child-children-nested-component',
  description: "A component in an element loop row forwards another component whose own forwarded children read the row",
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

function Chip(props: { children?: any }) {
  return <em>{props.children}</em>
}

type Row = { id: string; label: string }

export function LoopElementRowChildChildrenNestedComponent() {
  const [rows] = createSignal<Row[]>([{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }])
  const [picked, setPicked] = createSignal('')
  return (
    <div data-picked={picked()}>
      {rows().map(o => (
        <section key={o.id}><Chip><Chip><button onClick={() => setPicked(o.id)}>{o.label}</button></Chip></Chip></section>
      ))}
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s4" data-picked="">
      <section data-key="a"><em bf-s="test_s3"><em bf-s="test_s2"><button bf="^s1"><!--bf:^s0-->A<!--/--></button></em></em></section>
      <section data-key="b"><em bf-s="test_s3"><em bf-s="test_s2"><button bf="^s1"><!--bf:^s0-->B<!--/--></button></em></em></section>
    </div>
  `,
})

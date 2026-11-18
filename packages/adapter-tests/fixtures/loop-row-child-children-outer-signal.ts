import { createFixture } from '../src/types'

/**
 * Sibling of `loop-row-child-children-outer-prop` over a signal array:
 * the forwarded children read a signal and a memo of the enclosing
 * component, in text and in an attribute.
 */
export const fixture = createFixture({
  id: 'loop-row-child-children-outer-signal',
  description: "A component loop row over a signal array forwards children that read a signal and a memo of the enclosing component",
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'

function Chip(props: { children?: any }) {
  return <em>{props.children}</em>
}

type Row = { id: string; label: string }

export function LoopRowChildChildrenOuterSignal() {
  const [rows] = createSignal<Row[]>([{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }])
  const [count] = createSignal(3)
  const doubled = createMemo(() => count() * 2)
  return (
    <ul>
      {rows().map(o => (
        <Chip key={o.id}>{count()}<i data-n={doubled()}>{o.label}</i></Chip>
      ))}
    </ul>
  )
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s4">
      <em bf-s="Chip_*" data-key="a"><!--bf:^s0-->3<!--/--><i bf="^s2" data-n="6"><!--bf:^s1-->A<!--/--></i></em>
      <em bf-s="Chip_*" data-key="b"><!--bf:^s0-->3<!--/--><i bf="^s2" data-n="6"><!--bf:^s1-->B<!--/--></i></em>
    </ul>
  `,
})

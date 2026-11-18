import { createFixture } from '../src/types'

/**
 * Sibling of `nested-loop-child-component-forwarded-children` over a
 * signal array: the forwarded child-component loop is filtered
 * (`g.tags.filter(t => t !== 'b').map(t => <Badge … />)`).
 */
export const fixture = createFixture({
  id: 'nested-loop-child-component-children-filter',
  description: "A component loop row over a signal array renders a filtered child-component loop forwarded as its children",
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

function Badge(props: { label: string }) {
  return <em>{props.label}</em>
}

function Group(props: { name: string; children?: any }) {
  return <section data-name={props.name}>{props.children}</section>
}

type Row = { name: string; tags: string[] }

export function NestedLoopChildComponentChildrenFilter() {
  const [data] = createSignal<Row[]>([{ name: 'x', tags: ['a', 'b'] }, { name: 'y', tags: ['c'] }])
  return (
    <div>
      {data().map(g => (
        <Group key={g.name} name={g.name}>
          {g.tags.filter(t => t !== 'b').map(t => <Badge key={t} label={t} />)}
        </Group>
      ))}
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s2">
      <section bf-s="Group_*" bf="s0" data-key="x" data-name="x"><em bf-s="Badge_*" bf="s1" data-key="a"><!--bf:s0-->a<!--/--></em></section>
      <section bf-s="Group_*" bf="s0" data-key="y" data-name="y"><em bf-s="Badge_*" bf="s1" data-key="c"><!--bf:s0-->c<!--/--></em></section>
    </div>
  `,
})

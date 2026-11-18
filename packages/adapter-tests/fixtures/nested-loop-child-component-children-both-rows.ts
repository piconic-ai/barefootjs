import { createFixture } from '../src/types'

/**
 * Sibling of `nested-loop-child-component-forwarded-children`: the inner
 * row component forwards children too, and they read the outer row as well
 * as the inner one (`<Badge key={t}>{g.name}:{t}</Badge>`).
 */
export const fixture = createFixture({
  id: 'nested-loop-child-component-children-both-rows',
  description: "A child-component loop forwarded as a component row's children forwards children that read both rows",
  source: `
'use client'

function Badge(props: { children?: any }) {
  return <em>{props.children}</em>
}

function Group(props: { name: string; children?: any }) {
  return <section data-name={props.name}>{props.children}</section>
}

export function NestedLoopChildComponentChildrenBothRows({ groups }: { groups: { name: string; tags: string[] }[] }) {
  return (
    <div>
      {groups.map(g => (
        <Group key={g.name} name={g.name}>
          {g.tags.map(t => <Badge key={t}>{g.name}:{t}</Badge>)}
        </Group>
      ))}
    </div>
  )
}
`,
  props: { groups: [{ name: 'x', tags: ['a', 'b'] }, { name: 'y', tags: ['c'] }] },
  expectedHtml: `
    <div bf-s="test" bf="s4">
      <section bf-s="Group_*" bf="s0" data-key="x" data-name="x">
        <em bf-s="Badge_*" data-key="a"><!--bf:^s0-->x<!--/-->:<!--bf:^s1-->a<!--/--></em>
        <em bf-s="Badge_*" data-key="b"><!--bf:^s0-->x<!--/-->:<!--bf:^s1-->b<!--/--></em>
      </section>
      <section bf-s="Group_*" bf="s0" data-key="y" data-name="y"><em bf-s="Badge_*" data-key="c"><!--bf:^s0-->y<!--/-->:<!--bf:^s1-->c<!--/--></em></section>
    </div>
  `,
})

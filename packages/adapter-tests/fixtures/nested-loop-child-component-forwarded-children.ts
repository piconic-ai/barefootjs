import { createFixture } from '../src/types'

/**
 * A component loop row over a module-scope array whose forwarded children
 * are another child-component loop over the row's own array
 * (`groups.map(g => <Group …>{g.tags.map(t => <Badge … />)}</Group>)`).
 */
export const fixture = createFixture({
  id: 'nested-loop-child-component-forwarded-children',
  description: "A component loop row over a module-scope array renders a child-component loop forwarded as its children",
  source: `
'use client'

function Badge(props: { label: string }) {
  return <em>{props.label}</em>
}

function Group(props: { name: string; children?: any }) {
  return <section data-name={props.name}>{props.children}</section>
}

const groups = [{ name: 'x', tags: ['a', 'b'] }, { name: 'y', tags: ['c'] }]

export function NestedLoopChildComponentForwardedChildren() {
  return (
    <div>
      {groups.map(g => (
        <Group key={g.name} name={g.name}>
          {g.tags.map(t => <Badge key={t} label={t} />)}
        </Group>
      ))}
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s2">
      <section bf-s="Group_*" bf="s0" data-key="x" data-name="x">
        <em bf-s="Badge_*" bf="s1" data-key="a"><!--bf:s0-->a<!--/--></em>
        <em bf-s="Badge_*" bf="s1" data-key="b"><!--bf:s0-->b<!--/--></em>
      </section>
      <section bf-s="Group_*" bf="s0" data-key="y" data-name="y"><em bf-s="Badge_*" bf="s1" data-key="c"><!--bf:s0-->c<!--/--></em></section>
    </div>
  `,
})

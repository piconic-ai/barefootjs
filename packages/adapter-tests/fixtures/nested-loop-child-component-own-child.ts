import { createFixture } from '../src/types'

/**
 * Sibling of `nested-loop-child-component-row-array`: the inner row
 * component renders a child component of its own, whose scope nests under
 * its row's scope (`Badge_*_s0` under `Badge_*`) on every row.
 */
export const fixture = createFixture({
  id: 'nested-loop-child-component-own-child',
  description: "A child-component loop inside another loop's row nests the row component's own child under each row's scope",
  source: `
'use client'

function Dot(props: { tone: string }) {
  return <i data-tone={props.tone} />
}

function Badge(props: { label: string }) {
  return <em><Dot tone={props.label} />{props.label}</em>
}

export function NestedLoopChildComponentOwnChild({ groups }: { groups: { name: string; tags: string[] }[] }) {
  return (
    <div>
      {groups.map(g => (
        <section key={g.name}>
          {g.tags.map(t => <Badge key={t} label={t} />)}
        </section>
      ))}
    </div>
  )
}
`,
  props: { groups: [{ name: 'x', tags: ['a', 'b'] }, { name: 'y', tags: ['c'] }] },
  expectedHtml: `
    <div bf-s="test" bf="s2">
      <section bf="s1" data-key="x">
        <em bf-s="Badge_*" bf="s2" data-key="a"><i bf-s="Badge_*_s0" bf="s0" data-tone="a"></i><!--bf:s1-->a<!--/--></em>
        <em bf-s="Badge_*" bf="s2" data-key="b"><i bf-s="Badge_*_s0" bf="s0" data-tone="b"></i><!--bf:s1-->b<!--/--></em>
      </section>
      <section bf="s1" data-key="y"><em bf-s="Badge_*" bf="s2" data-key="c"><i bf-s="Badge_*_s0" bf="s0" data-tone="c"></i><!--bf:s1-->c<!--/--></em></section>
    </div>
  `,
})

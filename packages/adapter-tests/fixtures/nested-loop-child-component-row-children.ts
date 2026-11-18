import { createFixture } from '../src/types'

/**
 * Sibling of `nested-loop-child-component-row-array`: the inner row
 * component forwards JSX children that read the inner row.
 */
export const fixture = createFixture({
  id: 'nested-loop-child-component-row-children',
  description: "A child-component loop inside another loop's row renders each inner row's forwarded children",
  source: `
'use client'

function Badge(props: { children?: any }) {
  return <em>{props.children}</em>
}

type Tag = { id: string; label: string }

export function NestedLoopChildComponentRowChildren({ groups }: { groups: { name: string; tags: Tag[] }[] }) {
  return (
    <div>
      {groups.map(g => (
        <section key={g.name}>
          {g.tags.map(t => <Badge key={t.id}><b>{t.label}</b></Badge>)}
        </section>
      ))}
    </div>
  )
}
`,
  props: { groups: [{ name: 'x', tags: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] }, { name: 'y', tags: [{ id: 'c', label: 'C' }] }] },
  expectedHtml: `
    <div bf-s="test" bf="s3">
      <section bf="s2" data-key="x">
        <em bf-s="Badge_*" data-key="a"><b><!--bf:^s0-->A<!--/--></b></em>
        <em bf-s="Badge_*" data-key="b"><b><!--bf:^s0-->B<!--/--></b></em>
      </section>
      <section bf="s2" data-key="y"><em bf-s="Badge_*" data-key="c"><b><!--bf:^s0-->C<!--/--></b></em></section>
    </div>
  `,
})

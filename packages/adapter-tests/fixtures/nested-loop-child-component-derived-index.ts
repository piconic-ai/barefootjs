import { createFixture } from '../src/types'

/**
 * Sibling of `nested-loop-child-component-row-array`: the inner row is
 * keyed by its index, a prop reads the outer and the inner row together
 * (`label={g.name + t}`), a number prop takes the index (`0` included), and
 * the child derives a memo from a prop, so each row recomputes it.
 */
export const fixture = createFixture({
  id: 'nested-loop-child-component-derived-index',
  description: "A child-component loop inside another loop's row recomputes the child's prop-derived memo and index props per row",
  source: `
'use client'
import { createMemo } from '@barefootjs/client'

function Badge(props: { label: string; n: number }) {
  const shout = createMemo(() => props.label + '!')
  return <em data-n={props.n}>{shout()}</em>
}

export function NestedLoopChildComponentDerivedIndex({ groups }: { groups: { name: string; tags: string[] }[] }) {
  return (
    <div>
      {groups.map(g => (
        <section key={g.name}>
          {g.tags.map((t, i) => <Badge key={i} label={g.name + t} n={i} />)}
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
        <em bf-s="Badge_*" bf="s1" data-key="0" data-n="0"><!--bf:s0-->xa!<!--/--></em>
        <em bf-s="Badge_*" bf="s1" data-key="1" data-n="1"><!--bf:s0-->xb!<!--/--></em>
      </section>
      <section bf="s1" data-key="y"><em bf-s="Badge_*" bf="s1" data-key="0" data-n="0"><!--bf:s0-->yc!<!--/--></em></section>
    </div>
  `,
})

import { createFixture } from '../src/types'

/**
 * A child-component loop over an array field of the enclosing row
 * (`groups.map(g => <section>{g.tags.map(t => <Badge key={t} label={t} />)}</section>)`).
 * The inner rows differ per outer row, an outer row may have none, and each
 * row's key and prop read the inner (scalar) row.
 */
export const fixture = createFixture({
  id: 'nested-loop-child-component-row-array',
  description: "A child-component loop over an array field of the enclosing row renders each outer row's own rows",
  source: `
'use client'

function Badge(props: { label: string }) {
  return <em>{props.label}</em>
}

export function NestedLoopChildComponentRowArray({ groups }: { groups: { name: string; tags: string[] }[] }) {
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
  props: { groups: [{ name: 'x', tags: ['a', 'b'] }, { name: 'y', tags: [] }, { name: 'z', tags: ['c'] }] },
  expectedHtml: `
    <div bf-s="test" bf="s2">
      <section bf="s1" data-key="x">
        <em bf-s="Badge_*" bf="s1" data-key="a"><!--bf:s0-->a<!--/--></em>
        <em bf-s="Badge_*" bf="s1" data-key="b"><!--bf:s0-->b<!--/--></em>
      </section>
      <section bf="s1" data-key="y"></section>
      <section bf="s1" data-key="z"><em bf-s="Badge_*" bf="s1" data-key="c"><!--bf:s0-->c<!--/--></em></section>
    </div>
  `,
})

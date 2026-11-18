import { createFixture } from '../src/types'

/**
 * Sibling of `nested-loop-child-component-row-array`: the inner row's
 * key is a template literal over both rows, a concatenation with the inner
 * index, the id of a row of a sorted inner array, and a string literal.
 */
export const fixture = createFixture({
  id: 'nested-loop-child-component-key-shapes',
  description: "A child-component loop inside another loop's row carries a template-literal key, a computed key, a sorted row's key and a literal key",
  source: `
'use client'

function Badge(props: { label: string }) {
  return <em>{props.label}</em>
}

type Tag = { id: string; n: number }

export function NestedLoopChildComponentKeyShapes({ groups }: { groups: { name: string; tags: Tag[] }[] }) {
  return (
    <div>
      {groups.map(g => (
        <section key={g.name}>
          {g.tags.map(t => <Badge key={\`\${g.name}-\${t.id}\`} label={t.id} />)}
          {g.tags.map((t, i) => <Badge key={g.name + i} label={t.id} />)}
          {g.tags.toSorted((a, b) => a.n - b.n).map(t => <Badge key={t.id} label={t.id} />)}
          {g.tags.map(t => <Badge key="same" label={t.id} />)}
        </section>
      ))}
    </div>
  )
}
`,
  props: { groups: [{ name: 'x', tags: [{ id: 'a', n: 2 }, { id: 'b', n: 1 }] }, { name: 'y', tags: [{ id: 'c', n: 0 }] }] },
  expectedHtml: `
    <div bf-s="test" bf="s5">
      <section bf="s4" data-key="x">
        <em bf-s="Badge_*" bf="s1" data-key="x-a"><!--bf:s0-->a<!--/--></em>
        <em bf-s="Badge_*" bf="s1" data-key="x-b"><!--bf:s0-->b<!--/--></em>
        <em bf-s="Badge_*" bf="s1" data-key="x0"><!--bf:s0-->a<!--/--></em>
        <em bf-s="Badge_*" bf="s1" data-key="x1"><!--bf:s0-->b<!--/--></em>
        <em bf-s="Badge_*" bf="s1" data-key="b"><!--bf:s0-->b<!--/--></em>
        <em bf-s="Badge_*" bf="s1" data-key="a"><!--bf:s0-->a<!--/--></em>
        <em bf-s="Badge_*" bf="s1" data-key="same"><!--bf:s0-->a<!--/--></em>
        <em bf-s="Badge_*" bf="s1" data-key="same"><!--bf:s0-->b<!--/--></em>
      </section>
      <section bf="s4" data-key="y">
        <em bf-s="Badge_*" bf="s1" data-key="y-c"><!--bf:s0-->c<!--/--></em>
        <em bf-s="Badge_*" bf="s1" data-key="y0"><!--bf:s0-->c<!--/--></em>
        <em bf-s="Badge_*" bf="s1" data-key="c"><!--bf:s0-->c<!--/--></em>
        <em bf-s="Badge_*" bf="s1" data-key="same"><!--bf:s0-->c<!--/--></em>
      </section>
    </div>
  `,
})

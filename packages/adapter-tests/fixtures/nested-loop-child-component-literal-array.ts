import { createFixture } from '../src/types'

/**
 * A child-component loop over an inline array literal inside another
 * loop's row (`groups.map(g => <section>{[1, 2, 3].map(n => <Star key={n} n={n} />)}</section>)`).
 */
export const fixture = createFixture({
  id: 'nested-loop-child-component-literal-array',
  description: "A child-component loop over an inline array literal inside another loop's row renders its rows in every outer row",
  source: `
'use client'

function Star(props: { n: number }) {
  return <em>{props.n}</em>
}

export function NestedLoopChildComponentLiteralArray({ groups }: { groups: { id: string }[] }) {
  return (
    <div>
      {groups.map(g => (
        <section key={g.id}>
          {[1, 2, 3].map(n => <Star key={n} n={n} />)}
        </section>
      ))}
    </div>
  )
}
`,
  props: { groups: [{ id: 'x' }, { id: 'y' }] },
  expectedHtml: `
    <div bf-s="test" bf="s2">
      <section bf="s1" data-key="x">
        <em bf-s="Star_*" bf="s1" data-key="1"><!--bf:s0-->1<!--/--></em>
        <em bf-s="Star_*" bf="s1" data-key="2"><!--bf:s0-->2<!--/--></em>
        <em bf-s="Star_*" bf="s1" data-key="3"><!--bf:s0-->3<!--/--></em>
      </section>
      <section bf="s1" data-key="y">
        <em bf-s="Star_*" bf="s1" data-key="1"><!--bf:s0-->1<!--/--></em>
        <em bf-s="Star_*" bf="s1" data-key="2"><!--bf:s0-->2<!--/--></em>
        <em bf-s="Star_*" bf="s1" data-key="3"><!--bf:s0-->3<!--/--></em>
      </section>
    </div>
  `,
})

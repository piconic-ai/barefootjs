import { createFixture } from '../src/types'

/**
 * A child-component loop two loops deep
 * (`a.map(x => <section>{x.b.map(y => <p>{y.c.map(z => <Badge … />)}</p>)}</section>)`),
 * with a middle row whose innermost array is empty.
 */
export const fixture = createFixture({
  id: 'nested-loop-child-component-three-levels',
  description: "A child-component loop two loops deep renders the rows of every middle row",
  source: `
'use client'

function Badge(props: { label: string }) {
  return <em>{props.label}</em>
}

type Mid = { id: string; c: string[] }

export function NestedLoopChildComponentThreeLevels({ a }: { a: { id: string; b: Mid[] }[] }) {
  return (
    <div>
      {a.map(x => (
        <section key={x.id}>
          {x.b.map(y => (
            <p key={y.id}>
              {y.c.map(z => <Badge key={z} label={z} />)}
            </p>
          ))}
        </section>
      ))}
    </div>
  )
}
`,
  props: { a: [{ id: 'x', b: [{ id: 'y', c: ['p', 'q'] }, { id: 'z', c: [] }] }, { id: 'w', b: [{ id: 'v', c: ['r'] }] }] },
  expectedHtml: `
    <div bf-s="test" bf="s3">
      <section bf="s2" data-key="x">
        <p bf="s1" data-key-1="y">
          <em bf-s="Badge_*" bf="s1" data-key="p"><!--bf:s0-->p<!--/--></em>
          <em bf-s="Badge_*" bf="s1" data-key="q"><!--bf:s0-->q<!--/--></em>
        </p>
        <p bf="s1" data-key-1="z"></p>
      </section>
      <section bf="s2" data-key="w"><p bf="s1" data-key-1="v"><em bf-s="Badge_*" bf="s1" data-key="r"><!--bf:s0-->r<!--/--></em></p></section>
    </div>
  `,
})

import { createFixture } from '../src/types'

/**
 * A child-component loop inside another loop's row, both over signal
 * arrays (`groups().map(g => <section>{rows().map(o => <Chip … />)}</section>)`).
 * The inner rows do not depend on the outer row, and every outer row still
 * renders its own keyed set of them.
 */
export const fixture = createFixture({
  id: 'nested-loop-child-component-signal-rows',
  description: "A child-component loop over a signal array inside another loop's element row renders its rows in every outer row",
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

function Chip(props: { label: string }) {
  return <em className="chip">{props.label}</em>
}

type Group = { id: string }
type Opt = { id: string; label: string }

export function NestedLoopChildComponentSignalRows() {
  const [groups] = createSignal<Group[]>([{ id: 'g1' }, { id: 'g2' }])
  const [rows] = createSignal<Opt[]>([{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }])
  return (
    <div>
      {groups().map(g => (
        <section key={g.id}>
          {rows().map(o => <Chip key={o.id} label={o.label} />)}
        </section>
      ))}
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s2">
      <section bf="s1" data-key="g1">
        <em bf-s="Chip_*" bf="s1" class="chip" data-key="a"><!--bf:s0-->A<!--/--></em>
        <em bf-s="Chip_*" bf="s1" class="chip" data-key="b"><!--bf:s0-->B<!--/--></em>
      </section>
      <section bf="s1" data-key="g2">
        <em bf-s="Chip_*" bf="s1" class="chip" data-key="a"><!--bf:s0-->A<!--/--></em>
        <em bf-s="Chip_*" bf="s1" class="chip" data-key="b"><!--bf:s0-->B<!--/--></em>
      </section>
    </div>
  `,
})

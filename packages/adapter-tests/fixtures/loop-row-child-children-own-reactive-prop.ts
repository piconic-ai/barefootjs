import { createFixture } from '../src/types'

/**
 * A `.map()` loop row calling a child component with forwarded JSX
 * `children`, where the loop-body component ITSELF receives a prop that
 * reads an outer signal (`<Chip on={highlight()}>`) — row-independent, so
 * every row renders the signal's initial value at SSR. The companion of
 * `loop-row-child-children-nested-reactive-prop`, one level up. The rows
 * come from a filtering memo over a module-scope array (all rows at SSR), so
 * a backend that bakes the rows ahead of time does so from the memo's
 * initial value.
 */
export const fixture = createFixture({
  id: 'loop-row-child-children-own-reactive-prop',
  description:
    "A loop-row child component with forwarded children receives an outer signal's value as its own prop at SSR",
  source: `
'use client'
import { createMemo, createSignal } from '@barefootjs/client'

function Chip({ on, children }: { on?: boolean; children?: any }) {
  return <span class="chip" data-hl={on ? '' : undefined}>{children}</span>
}

type Opt = { id: string; label: string }
const opts: Opt[] = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]

export function LoopRowChildChildrenOwnReactiveProp() {
  const [highlight] = createSignal(true)
  const [only] = createSignal<string | null>(null)
  const shown = createMemo(() => {
    const id = only()
    if (!id) return opts
    return opts.filter(o => o.id === id)
  })
  return (
    <div>
      {shown().map(o => (
        <Chip key={o.id} on={highlight()}>
          <b>{o.label}</b>
        </Chip>
      ))}
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s2">
      <span bf-s="Chip_*" bf="s0" class="chip" data-hl="" data-key="a"><b><!--bf:^s0-->A<!--/--></b></span>
      <span bf-s="Chip_*" bf="s0" class="chip" data-hl="" data-key="b"><b><!--bf:^s0-->B<!--/--></b></span>
    </div>
  `,
})

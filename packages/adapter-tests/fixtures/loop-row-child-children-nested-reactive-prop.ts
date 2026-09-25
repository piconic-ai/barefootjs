import { createFixture } from '../src/types'

/**
 * A `.map()` loop row calling a child component with forwarded JSX
 * `children` that nest another component whose prop reads an OUTER
 * signal (`<Mark on={highlight()}>`), with a non-default initial value so
 * a dropped prop is visible in the SSR output.
 */
export const fixture = createFixture({
  id: 'loop-row-child-children-nested-reactive-prop',
  description:
    "A nested component inside a loop-row child's forwarded children receives an outer signal's value as a prop at SSR",
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

function Chip({ children }: { children?: any }) {
  return <span class="chip">{children}</span>
}

function Mark({ on, children }: { on?: boolean; children?: any }) {
  return <em data-hl={on ? '' : undefined}>{children}</em>
}

type Opt = { id: string; label: string }
const opts: Opt[] = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]

export function LoopRowChildChildrenNestedReactiveProp() {
  const [highlight] = createSignal(true)
  return (
    <div>
      {opts.map(o => (
        <Chip key={o.id}>
          <Mark on={highlight()}>{o.label}</Mark>
        </Chip>
      ))}
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s3">
      <span bf-s="Chip_*" class="chip" data-key="a"><em bf-s="test_s1" bf="s0" data-hl=""><!--bf:^s0-->A<!--/--></em></span>
      <span bf-s="Chip_*" class="chip" data-key="b"><em bf-s="test_s1" bf="s0" data-hl=""><!--bf:^s0-->B<!--/--></em></span>
    </div>
  `,
})

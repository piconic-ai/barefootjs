import { createFixture } from '../src/types'

/**
 * A component nested in a loop-row child's forwarded children receives a
 * signal seeded from a prop fallback (`createSignal(props.hl ?? true)`). A
 * backend that builds the nested component once, ahead of the rows, must do
 * so after the fallback's value is known — the signal's initial value is
 * the fallback, not the prop's zero value.
 */
export const fixture = createFixture({
  id: 'loop-row-child-children-nested-prop-fallback',
  description:
    "A nested component inside a loop-row child's forwarded children receives a prop-fallback-seeded signal's value at SSR",
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

export function LoopRowChildChildrenNestedPropFallback(props: { hl?: boolean }) {
  const [hl] = createSignal(props.hl ?? true)
  return (
    <div>
      {opts.map(o => (
        <Chip key={o.id}>
          <Mark on={hl()}>{o.label}</Mark>
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

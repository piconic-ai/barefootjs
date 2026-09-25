import { createFixture } from '../src/types'

/**
 * One level deeper than `loop-row-child-children-nested-row-prop`: the
 * component reading the row (`<Icon tone={o.tone}>`) sits in the children of
 * a component (`<Mark>`) that is itself nested in the loop-row child's
 * forwarded children. Every row must still render its own value.
 */
export const fixture = createFixture({
  id: 'loop-row-child-children-nested-deep-row-prop',
  description:
    "A component two levels deep in a loop-row child's forwarded children receives a per-row prop at SSR",
  source: `
'use client'
function Chip({ children }: { children?: any }) {
  return <span class="chip">{children}</span>
}

function Mark({ children }: { children?: any }) {
  return <em>{children}</em>
}

function Icon({ tone }: { tone?: string }) {
  return <i data-tone={tone}></i>
}

type Opt = { id: string; label: string; tone: string }
const opts: Opt[] = [{ id: 'a', label: 'A', tone: 'warm' }, { id: 'b', label: 'B', tone: 'cool' }]

export function LoopRowChildChildrenNestedDeepRowProp() {
  return (
    <div>
      {opts.map(o => (
        <Chip key={o.id}>
          <Mark><Icon tone={o.tone} />{o.label}</Mark>
        </Chip>
      ))}
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s4">
      <span bf-s="Chip_*" class="chip" data-key="a"><em bf-s="test_s2"><i bf-s="test_s0" bf="s0" data-tone="warm"></i><!--bf:^s1-->A<!--/--></em></span>
      <span bf-s="Chip_*" class="chip" data-key="b"><em bf-s="test_s2"><i bf-s="test_s0" bf="s0" data-tone="cool"></i><!--bf:^s1-->B<!--/--></em></span>
    </div>
  `,
})

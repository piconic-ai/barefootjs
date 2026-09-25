import { createFixture } from '../src/types'

/**
 * The callback-local twin of `loop-row-child-children-nested-row-prop`: a
 * component nested in a loop-row child's forwarded children receives a
 * value the callback body derived from the row (`const t = o.tone` →
 * `<Mark tone={t}>`), which differs between rows.
 */
export const fixture = createFixture({
  id: 'loop-row-child-children-nested-preamble-prop',
  description:
    "A nested component inside a loop-row child's forwarded children receives a callback-local derived from the row as a prop at SSR",
  source: `
'use client'
function Chip({ children }: { children?: any }) {
  return <span class="chip">{children}</span>
}

function Mark({ tone, children }: { tone?: string; children?: any }) {
  return <em data-tone={tone}>{children}</em>
}

type Opt = { id: string; label: string; tone: string }
const opts: Opt[] = [{ id: 'a', label: 'A', tone: 'warm' }, { id: 'b', label: 'B', tone: 'cool' }]

export function LoopRowChildChildrenNestedPreambleProp() {
  return (
    <div>
      {opts.map(o => {
        const t = o.tone
        return (
          <Chip key={o.id}>
            <Mark tone={t}>{o.label}</Mark>
          </Chip>
        )
      })}
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s3">
      <span bf-s="Chip_*" class="chip" data-key="a"><em bf-s="test_s1" bf="s0" data-tone="warm"><!--bf:^s0-->A<!--/--></em></span>
      <span bf-s="Chip_*" class="chip" data-key="b"><em bf-s="test_s1" bf="s0" data-tone="cool"><!--bf:^s0-->B<!--/--></em></span>
    </div>
  `,
})

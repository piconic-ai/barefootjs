import { createFixture } from '../src/types'

/**
 * The per-row twin of `loop-row-child-children-nested-reactive-prop`: a
 * component nested in a loop-row child's forwarded children receives a prop
 * read from the row itself (`<Mark tone={o.tone}>`), which differs between
 * rows. A backend that builds the nested component once per loop must still
 * deliver this value row by row.
 */
export const fixture = createFixture({
  id: 'loop-row-child-children-nested-row-prop',
  description:
    "A nested component inside a loop-row child's forwarded children receives a per-row prop at SSR",
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

export function LoopRowChildChildrenNestedRowProp() {
  return (
    <div>
      {opts.map(o => (
        <Chip key={o.id}>
          <Mark tone={o.tone}>{o.label}</Mark>
        </Chip>
      ))}
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

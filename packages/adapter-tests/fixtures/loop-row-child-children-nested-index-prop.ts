import { createFixture } from '../src/types'

/**
 * The index twin of `loop-row-child-children-nested-row-prop`: a component
 * nested in a loop-row child's forwarded children receives the row's INDEX
 * as a prop (`<Mark pos={i}>`), which differs between rows.
 */
export const fixture = createFixture({
  id: 'loop-row-child-children-nested-index-prop',
  description:
    "A nested component inside a loop-row child's forwarded children receives the row index as a prop at SSR",
  source: `
'use client'
function Chip({ children }: { children?: any }) {
  return <span class="chip">{children}</span>
}

function Mark({ pos, children }: { pos?: number; children?: any }) {
  return <em data-pos={pos}>{children}</em>
}

type Opt = { id: string; label: string }
const opts: Opt[] = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]

export function LoopRowChildChildrenNestedIndexProp() {
  return (
    <div>
      {opts.map((o, i) => (
        <Chip key={o.id}>
          <Mark pos={i}>{o.label}</Mark>
        </Chip>
      ))}
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s3">
      <span bf-s="Chip_*" class="chip" data-key="a"><em bf-s="test_s1" bf="s0" data-pos="0"><!--bf:^s0-->A<!--/--></em></span>
      <span bf-s="Chip_*" class="chip" data-key="b"><em bf-s="test_s1" bf="s0" data-pos="1"><!--bf:^s0-->B<!--/--></em></span>
    </div>
  `,
})

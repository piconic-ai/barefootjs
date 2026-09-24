import { createFixture } from '../src/types'

/**
 * A `.map()` loop row calling a child component with forwarded JSX
 * `children` that contain a nested component and a conditional on the
 * row's own item — no outer signal/memo.
 *
 * On go-template, `emitStaticBodyWrappers` skips baking a loop whose
 * forwarded children read outer reactive state
 * (`bodyChildrenReferenceOuterReactiveState`). That guard must look
 * through nested components and conditionals rather than treating them as
 * unsafe wholesale, or this loop (which bakes and renders correctly)
 * silently renders empty.
 */
export const fixture = createFixture({
  id: 'loop-row-child-children-nested-shapes',
  description:
    "A loop-row child component's forwarded children render at SSR when they nest a component and an item conditional",
  source: `
'use client'
function Chip({ children }: { children?: any }) {
  return <span class="chip">{children}</span>
}

function Badge({ children }: { children?: any }) {
  return <em>{children}</em>
}

type Opt = { id: string; label: string }
const opts: Opt[] = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]

export function LoopRowChildChildrenNestedShapes() {
  return (
    <div>
      {opts.map(o => (
        <Chip key={o.id}>
          <Badge>{o.label}</Badge>
          {o.id === 'a' ? <b>first</b> : <i>other</i>}
        </Chip>
      ))}
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s4">
      <span bf-s="Chip_*" class="chip" data-key="a">
        <em bf-s="test_s1"><!--bf:^s0-->A<!--/--></em>
        <b bf-c="^s2">first</b>
      </span>
      <span bf-s="Chip_*" class="chip" data-key="b">
        <em bf-s="test_s1"><!--bf:^s0-->B<!--/--></em>
        <i bf-c="^s2">other</i>
      </span>
    </div>
  `,
})

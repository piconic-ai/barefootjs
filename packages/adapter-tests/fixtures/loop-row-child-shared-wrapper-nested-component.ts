import { createFixture } from '../src/types'

/**
 * Sibling of `loop-row-child-shared-wrapper` (#3599): the second loop
 * sharing the wrapper component forwards children that nest another
 * component reading the row. Each loop renders its own rows, and the
 * nested component renders inside the second loop's wrappers only.
 */
export const fixture = createFixture({
  id: 'loop-row-child-shared-wrapper-nested-component',
  description:
    "Two loops sharing a wrapper component, the second nesting a component in its forwarded children, each render their own rows",
  source: `
'use client'
function Badge(props: { label: string }) {
  return <em>{props.label}</em>
}

function Chip({ children }: { children?: any }) {
  return <span class="chip">{children}</span>
}

type Opt = { id: string; label: string }

export function LoopRowChildSharedWrapperNestedComponent(props: { a: Opt[]; b: Opt[] }) {
  return (
    <div>
      {props.a.map(o => <Chip key={o.id}><b>{o.label}</b></Chip>)}
      {props.b.map(o => <Chip key={o.id}><Badge label={o.label} /></Chip>)}
    </div>
  )
}
`,
  props: {
    a: [{ id: 'a1', label: 'A1' }, { id: 'a2', label: 'A2' }],
    b: [{ id: 'b1', label: 'B1' }],
  },
  expectedHtml: `
    <div bf-s="test" bf="s4">
      <span bf-s="Chip_*" class="chip" data-key="a1"><b><!--bf:^s0-->A1<!--/--></b></span>
      <span bf-s="Chip_*" class="chip" data-key="a2"><b><!--bf:^s0-->A2<!--/--></b></span>
      <span bf-s="Chip_*" class="chip" data-key="b1"><em bf-s="test_s2" bf="s1"><!--bf:s0-->B1<!--/--></em></span>
    </div>
  `,
})

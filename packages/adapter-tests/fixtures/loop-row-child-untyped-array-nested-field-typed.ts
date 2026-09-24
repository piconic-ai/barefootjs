import { createFixture } from '../src/types'

/**
 * Rewrite escape for `loop-row-child-untyped-array-nested-field`: the same
 * rows, with the const annotated by an explicit element type.
 */
export const fixture = createFixture({
  id: 'loop-row-child-untyped-array-nested-field-typed',
  description:
    'An explicit element type lets a loop row calling a child component render over rows with a nested-object field',
  source: `
'use client'
function Chip({ label }: { label?: string }) {
  return <span class="chip">{label}</span>
}

type Opt = { id: string; meta: { x: number } }
const opts: Opt[] = [
  { id: 'a', meta: { x: 1 } },
  { id: 'b', meta: { x: 2 } },
]

export function LoopRowChildUntypedArrayNestedFieldTyped() {
  return <div>{opts.map(o => <Chip key={o.id} label={o.id} />)}</div>
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s1">
      <span bf-s="Chip_*" bf="s1" class="chip" data-key="a"><!--bf:s0-->a<!--/--></span>
      <span bf-s="Chip_*" bf="s1" class="chip" data-key="b"><!--bf:s0-->b<!--/--></span>
    </div>
  `,
})

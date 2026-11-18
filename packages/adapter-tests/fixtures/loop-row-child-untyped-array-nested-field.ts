import { createFixture } from '../src/types'

/**
 * A `.map()` row calling a child component, over an unannotated module-scope
 * object-literal array whose rows share their keys but carry a nested-object
 * field (`meta: { x }`). Every row renders: a backend that types the rows
 * gives `meta` a row type of its own. The same rows under an explicit
 * element type are `...-typed`.
 */
export const fixture = createFixture({
  id: 'loop-row-child-untyped-array-nested-field',
  description:
    'A loop row calling a child component over an untyped object-literal array const whose rows carry a nested-object field',
  source: `
'use client'
function Chip({ label }: { label?: string }) {
  return <span class="chip">{label}</span>
}

const opts = [
  { id: 'a', meta: { x: 1 } },
  { id: 'b', meta: { x: 2 } },
]

export function LoopRowChildUntypedArrayNestedField() {
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

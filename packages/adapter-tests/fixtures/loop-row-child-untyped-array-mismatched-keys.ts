import { createFixture } from '../src/types'

/**
 * A `.map()` row calling a child component, over an unannotated module-scope
 * object-literal array whose rows have different keys (the second row has no
 * `label`). Hono renders both rows; go-template can't infer one element
 * struct and refuses with BF101 (see `untyped-loop-array-no-row-struct`).
 * The escape is an explicit element type with an optional field
 * (`...-typed`).
 */
export const fixture = createFixture({
  id: 'loop-row-child-untyped-array-mismatched-keys',
  description:
    'A loop row calling a child component over an untyped object-literal array const whose rows have different keys',
  escapes: [{ kind: 'rewrite', fixture: 'loop-row-child-untyped-array-mismatched-keys-typed' }],
  source: `
'use client'
function Chip({ label }: { label?: string }) {
  return <span class="chip">{label}</span>
}

const opts = [{ id: 'a', label: 'A' }, { id: 'b' }]

export function LoopRowChildUntypedArrayMismatchedKeys() {
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

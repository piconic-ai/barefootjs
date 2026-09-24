import { createFixture } from '../src/types'

/**
 * Rewrite escape for `loop-row-child-untyped-array-mismatched-keys`: the
 * same rows, with the const annotated by an explicit element type whose
 * missing field is optional.
 */
export const fixture = createFixture({
  id: 'loop-row-child-untyped-array-mismatched-keys-typed',
  description:
    'An explicit element type with an optional field lets a loop row calling a child component render over rows with different keys',
  source: `
'use client'
function Chip({ label }: { label?: string }) {
  return <span class="chip">{label}</span>
}

type Opt = { id: string; label?: string }
const opts: Opt[] = [{ id: 'a', label: 'A' }, { id: 'b' }]

export function LoopRowChildUntypedArrayMismatchedKeysTyped() {
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

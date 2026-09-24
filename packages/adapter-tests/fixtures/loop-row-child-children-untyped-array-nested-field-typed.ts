import { createFixture } from '../src/types'

/**
 * Rewrite escape for `loop-row-child-children-untyped-array-nested-field`:
 * the same rows, with the const annotated by an explicit element type
 * (`const opts: Opt[] = [...]`). The declared type gives go-template a Go
 * struct for the nested `meta` field, so the loop renders at SSR.
 */
export const fixture = createFixture({
  id: 'loop-row-child-children-untyped-array-nested-field-typed',
  description:
    "An explicit element type on the const lets a loop-row child's forwarded children render over rows with a nested-object field",
  source: `
'use client'
function Chip({ children }: { children?: any }) {
  return <span class="chip">{children}</span>
}

type Opt = { id: string; label: string; meta: { x: number } }
const opts: Opt[] = [
  { id: 'a', label: 'A', meta: { x: 1 } },
  { id: 'b', label: 'B', meta: { x: 2 } },
]

export function LoopRowChildChildrenUntypedArrayNestedFieldTyped() {
  return (
    <div>
      {opts.map(o => (
        <Chip key={o.id}>
          <a href={'/x/' + o.id}>{o.label}</a>
        </Chip>
      ))}
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s3">
      <span bf-s="Chip_*" class="chip" data-key="a"><a bf="^s1" href="/x/a"><!--bf:^s0-->A<!--/--></a></span>
      <span bf-s="Chip_*" class="chip" data-key="b"><a bf="^s1" href="/x/b"><!--bf:^s0-->B<!--/--></a></span>
    </div>
  `,
})

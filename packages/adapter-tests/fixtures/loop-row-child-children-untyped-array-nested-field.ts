import { createFixture } from '../src/types'

/**
 * The untypeable-field twin of `loop-row-child-children-untyped-array`: the
 * same untyped module-scope object-literal array `const` looped over with a
 * child component and forwarded JSX `children`, but every row also carries
 * a nested-object field (`meta: { x: 1 }`). The rows share their keys, so
 * the rows have one shape, yet a nested object has no plain Go field type
 * to synthesize. Hono renders both rows; go-template refuses with BF101
 * (see `untyped-loop-array-untypeable-field`). Annotating the const with an
 * explicit element type is the escape (`...-typed`).
 */
export const fixture = createFixture({
  id: 'loop-row-child-children-untyped-array-nested-field',
  description:
    "A loop-row child component's forwarded JSX children over an untyped object-literal array const whose rows carry a nested-object field",
  escapes: [{ kind: 'rewrite', fixture: 'loop-row-child-children-untyped-array-nested-field-typed' }],
  source: `
'use client'
function Chip({ children }: { children?: any }) {
  return <span class="chip">{children}</span>
}

const opts = [
  { id: 'a', label: 'A', meta: { x: 1 } },
  { id: 'b', label: 'B', meta: { x: 2 } },
]

export function LoopRowChildChildrenUntypedArrayNestedField() {
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

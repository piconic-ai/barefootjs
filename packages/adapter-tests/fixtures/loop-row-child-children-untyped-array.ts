import { createFixture } from '../src/types'

/**
 * The UNTYPED twin of `loop-row-child-children-nested-shapes` (#3178): a
 * `.map()` loop row calling a child component with forwarded JSX
 * `children`, over a module-scope object-literal array `const` with NO
 * type annotation (`const opts = [{ id: 'a', label: 'A' }, ...]`, not
 * `const opts: Opt[] = [...]`).
 *
 * On go-template, `emitStaticBodyWrappers` bakes the array-source const's
 * data into the loop-body wrapper struct's constructor, but the analyzer's
 * text-shaped type inference for an unannotated declaration
 * (`inferTypeFromValue`) only ever produces the bare `{kind:'array', raw:
 * 'unknown[]'}` — never a per-row element type. Without an element type,
 * `parsedLiteralToGo`'s object-literal branch has no Go struct to bake each
 * row's object literal against, defers the WHOLE array to `nil`, and the
 * whole loop silently drops from SSR — with no diagnostic. The typed
 * sibling fixture renders correctly because its declared `Opt[]` element
 * type gives the baker a real struct to target.
 */
export const fixture = createFixture({
  id: 'loop-row-child-children-untyped-array',
  description:
    "A loop-row child component's forwarded JSX children render at SSR over an untyped module-scope object-literal array const (#3178)",
  source: `
'use client'
function Chip({ children }: { children?: any }) {
  return <span class="chip">{children}</span>
}

const opts = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]

export function LoopRowChildChildrenUntypedArray() {
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

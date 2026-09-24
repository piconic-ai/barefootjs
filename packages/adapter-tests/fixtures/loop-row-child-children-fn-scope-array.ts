import { createFixture } from '../src/types'

/**
 * A `.map()` loop row calling a child component with forwarded JSX
 * `children`, where the loop's source array is a `const` local to the
 * component FUNCTION BODY (not module scope) and the forwarded children
 * reference only the row's own item — no outer signal/memo (#3164).
 *
 * On go-template, `NewXxxProps`'s constructor used to bake this array's
 * data into the wrapper slice only when the same array was declared at
 * module scope (`emitStaticBodyWrappers`'s array-source lookup accepted
 * `origin.scope === 'module'` only); for a function-body-local array it
 * baked nothing and the whole loop silently dropped from SSR, with no
 * diagnostic. `resolveLoopArraySourceConst`/`scalarLiteralLoopGoType` now
 * resolve either scope the same way.
 */
export const fixture = createFixture({
  id: 'loop-row-child-children-fn-scope-array',
  description:
    "A loop-row child component's forwarded JSX children render at SSR when the loop's source array is a function-body-local const (#3164)",
  source: `
'use client'
function Chip({ children }: { children?: any }) {
  return <span class="chip">{children}</span>
}

export function LoopRowChildChildrenFnScopeArray() {
  const opts = ['a', 'b']
  return (
    <div>
      {opts.map(opt => (
        <Chip key={opt}>
          <a href={\`/item/\${opt}\`}>{opt}</a>
        </Chip>
      ))}
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s3">
      <span bf-s="Chip_*" class="chip" data-key="a"><a bf="^s1" href="/item/a"><!--bf:^s0-->a<!--/--></a></span>
      <span bf-s="Chip_*" class="chip" data-key="b"><a bf="^s1" href="/item/b"><!--bf:^s0-->b<!--/--></a></span>
    </div>
  `,
})

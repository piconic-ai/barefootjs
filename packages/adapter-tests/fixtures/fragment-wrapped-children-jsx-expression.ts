import { createFixture } from '../src/types'

/**
 * Compiler stress (#1335 follow-up to #1320): a `children` prop whose JSX
 * value is wrapped in a fragment (`<><span/></>`) must render the same
 * shape as the bare-element form pinned in `children-jsx-expression`.
 * IR collection unwraps the single-element hoisted fragment so the
 * inner element inherits `needsScope`; the existing #1320 placeholder
 * path then injects `bf-s="__BF_PARENT_SCOPE__"` and `renderChild`
 * substitutes the outer scope.
 */
export const fixture = createFixture({
  id: 'fragment-wrapped-children-jsx-expression',
  description: 'fragment-wrapped children JSX-expression renders the same shape as the element form',
  source: `
function Box({ children }: { children: any }) { return <div>{children}</div> }
export function FragmentWrappedChildrenJsxExpression() {
  return <Box children={<><span>x</span></>} />
}
`,
  expectedHtml: `
    <div bf-s="test_s0"><span bf-s="test">x</span></div>
  `,
})

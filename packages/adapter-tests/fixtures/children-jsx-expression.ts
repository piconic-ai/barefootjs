import { createFixture } from '../src/types'

/**
 * Compiler stress (#1244): `children` passed as an explicit attribute
 * value (not nested between the opening / closing tags). Functionally
 * identical to nested children but parsed via a different path. SSR
 * renders the right shape; CSR currently emits duplicate `bf-s`
 * attributes (`bf-s="test_s0" bf-s="test"`) and drops the inner scope
 * marker. Surfaced limitation, skipped in CSR conformance. Sub-issue
 * of #1244.
 */
export const fixture = createFixture({
  id: 'children-jsx-expression',
  description: 'children passed as a JSX-expression attribute renders the same as nested children',
  source: `
function Box({ children }: { children: any }) { return <div>{children}</div> }
export function ChildrenJsxExpression() {
  return <Box children={<span>x</span>} />
}
`,
  expectedHtml: `
    <div bf-s="test_s0"><span bf-s="test">x</span></div>
  `,
})

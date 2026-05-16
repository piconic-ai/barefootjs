import { createFixture } from '../src/types'

/**
 * Compiler stress (#1244): `<Pkg.Comp />` — member-expression JSX tag.
 * Compound-component pattern (Dialog.Trigger, Tabs.Panel). SSR resolves
 * the member expression correctly; CSR currently renders the tag as
 * literal text `[Pkg.Comp]` instead of invoking the component. Surfaced
 * limitation, skipped in CSR conformance. Sub-issue of #1244.
 */
export const fixture = createFixture({
  id: 'member-expression-tag',
  description: 'Member-expression JSX tag <Pkg.Comp /> resolves and renders',
  source: `
function Comp() { return <span>x</span> }
const Pkg = { Comp }
export function MemberExpressionTag() {
  return <div><Pkg.Comp /></div>
}
`,
  expectedHtml: `
    <div bf-s="test"><span bf-s="test_s0">x</span></div>
  `,
})

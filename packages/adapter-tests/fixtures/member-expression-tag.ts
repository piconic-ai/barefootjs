import { createFixture } from '../src/types'

/**
 * Compiler stress (#1244): `<Pkg.Comp />` — member-expression JSX tag.
 * Compound-component pattern (Dialog.Trigger, Tabs.Panel). The IR
 * collector resolves `Pkg.Comp` to its underlying component
 * identifier via the source-level object-literal initializer of `Pkg`
 * (#1319), so both SSR and CSR render the inner component instead of
 * the literal tag text.
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

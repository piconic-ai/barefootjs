import { createFixture } from '../src/types'

/**
 * Sibling of `props-object-non-props-name`: a child whose props object
 * parameter is named `scopeID` spreads it whole onto its root and reads a
 * member of it as text, and a child named `bfParent` does the same.
 */
export const fixture = createFixture({
  id: 'props-object-non-props-name-spread',
  description: 'A props object parameter named scopeID or bfParent spreads onto an element and reads its members',
  source: `
function Kid(scopeID: { label: string }) {
  return <i {...scopeID}>{scopeID.label}</i>
}
function Pill(bfParent: { title: string }) {
  return <u {...bfParent}>{bfParent.title}</u>
}
export function PropsObjectNonPropsNameSpread(p: { label: string }) {
  return (
    <div>
      <Kid label={p.label} />
      <Pill title={p.label} />
    </div>
  )
}
`,
  props: {
    label: 'L',
  },
  expectedHtml: `
    <div bf-s="test">
      <i bf-s="test_s0" bf="s1" label="L"><!--bf:s0-->L<!--/--></i>
      <u bf-s="test_s1" bf="s1" title="L"><!--bf:s0-->L<!--/--></u>
    </div>
  `,
})

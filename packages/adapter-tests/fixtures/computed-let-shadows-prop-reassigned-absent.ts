import { createFixture } from '../src/types'

/**
 * `computed-let-shadows-prop-reassigned` with the prop omitted: the text is
 * the initializer's default. A template cannot run the reassigning
 * statement, so the template adapters and the CSR template read the bare
 * prop and render empty text (`reassigned-let-shadows-prop-default`).
 */
export const fixture = createFixture({
  id: 'computed-let-shadows-prop-reassigned-absent',
  description: 'a reassigned let shadowing a prop with a default renders the default when the prop is omitted',
  source: `
'use client'

export function ReassignedLabel(props: { label?: string }) {
  let label = props.label ?? 'Default'
  if (!label) label = 'Fallback'
  return <p>{label}</p>
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->Default<!--/--></p>
  `,
})

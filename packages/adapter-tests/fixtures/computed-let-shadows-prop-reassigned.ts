import { createFixture } from '../src/types'

/**
 * A `let` that shadows a prop of the same name with a default and is
 * reassigned later (`let label = props.label ?? 'Default'; if (!label) label
 * = 'Fallback'`), with the prop passed. The reassignment is not taken, so
 * the text is the prop. Such a binding has no single value the CSR template
 * could inline, so the template reads the prop it starts from, as it did
 * before #3501 made an unreassigned shadow read its own default.
 *
 * The prop is typed required so no omitted-prop data point is generated:
 * that shape is `computed-let-shadows-prop-reassigned-absent`, pinned as
 * `reassigned-let-shadows-prop-default`.
 */
export const fixture = createFixture({
  id: 'computed-let-shadows-prop-reassigned',
  description: 'a reassigned let shadowing a prop with a default renders the passed prop on CSR (#3501)',
  source: `
'use client'

export function ReassignedLabel(props: { label: string }) {
  let label = props.label ?? 'Default'
  if (!label) label = 'Fallback'
  return <p>{label}</p>
}
`,
  props: { label: 'Hello' },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->Hello<!--/--></p>
  `,
})

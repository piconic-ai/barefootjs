import { createFixture } from '../src/types'

/**
 * A `let` that shadows a prop of the same name with a default and is
 * reassigned under a condition (`let label = props.label ?? 'Default'; if
 * (!label) label = 'Fallback'`), with the prop passed. A template cannot run
 * the reassigning statement, so the reassignment is folded into the
 * initializer before analysis (`fold-render-reassignments.ts`, #3501): every
 * adapter and the CSR template read the one value the binding holds at
 * render. The generated data points cover the omitted prop (`Default`) and
 * the empty one (`Fallback`).
 */
export const fixture = createFixture({
  id: 'computed-let-shadows-prop-reassigned',
  description: 'a let reassigned under a condition renders its render-time value on every adapter and on CSR (#3501)',
  source: `
'use client'

export function ReassignedLabel(props: { label?: string }) {
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

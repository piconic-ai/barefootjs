import { createFixture } from '../src/types'

/**
 * Consts that shadow a prop of the same name with a default
 * (`const label = props.label ?? 'Default'`, `const count = props.count ?? 3`),
 * with the props omitted, read in an attribute, a condition and a loop row.
 *
 * The CSR template read each name as the prop (`_p.label`), so the default
 * never applied there (#3501). A body destructure with a default
 * (`const { label = 'Default' } = props`) records that default on the prop
 * and reads the prop; a source-written const keeps its own initializer.
 */
export const fixture = createFixture({
  id: 'computed-const-shadows-prop-positions',
  description: 'consts shadowing same-named props with defaults render the defaults in attribute, condition and loop-row positions (#3501)',
  source: `
'use client'

export function ShadowedProps(props: { label?: string; count?: number; tags: string[] }) {
  const label = props.label ?? 'Default'
  const count = props.count ?? 3
  return (
    <div data-count={count}>
      {count > 2 ? <span>many</span> : <span>few</span>}
      <ul>{props.tags.map((tag) => <li key={tag}>{label}:{tag}</li>)}</ul>
    </div>
  )
}
`,
  props: { tags: ['a', 'b'] },
  expectedHtml: `
    <div bf-s="test" bf="s5" data-count="3">
      <span bf-c="s0">many</span>
      <ul bf="s4">
        <li bf="s3" data-key="a"><!--bf:s1-->Default<!--/-->:<!--bf:s2-->a<!--/--></li>
        <li bf="s3" data-key="b"><!--bf:s1-->Default<!--/-->:<!--bf:s2-->b<!--/--></li>
      </ul>
    </div>
  `,
})

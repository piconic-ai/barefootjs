import { createFixture } from '../src/types'

/**
 * A component-scope const that shadows a prop of the same name with a
 * default (`const label = props.label ?? 'Default'`), read in text and in an
 * attribute, with the prop omitted.
 *
 * The template adapters read `label` as the template variable the prop
 * fills, so the default never applied and the server rendered nothing. Each
 * now reads the const as its initializer (#3494).
 */
export const fixture = createFixture({
  id: 'computed-const-shadows-prop',
  description: 'a const shadowing a prop with a default renders the default when the prop is omitted (#3494)',
  source: `
'use client'

export function ShadowedLabel(props: { label?: string }) {
  const label = props.label ?? 'Default'
  return <p title={label}>{label}</p>
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s1" title="Default"><!--bf:s0-->Default<!--/--></p>
  `,
})

import { createFixture } from '../src/types'

/**
 * Boolean values in a closed rest (its keys come from the props type, so
 * the compiler expands the spread into one attribute per key). The
 * reference writes a key in its boolean attribute set (`disabled`) as a
 * bare attribute for `true`, and any other key with the value's text
 * (`readOnly="true"`, `title="false"`).
 */
export const fixture = createFixture({
  id: 'spread-closed-rest-boolean-values',
  description: 'Boolean values in a closed rest render as the reference renders them',
  source: `
type P = { readOnly?: boolean; title?: boolean; disabled?: boolean }
export function SpreadClosedRestBooleanValues({ ...rest }: P) {
  return <input {...rest} />
}
`,
  props: { readOnly: true, title: false, disabled: true },
  expectedHtml: `
    <input bf-s="test" disabled readOnly="true" title="false">
  `,
})

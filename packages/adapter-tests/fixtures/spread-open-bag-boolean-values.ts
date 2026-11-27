import { createFixture } from '../src/types'

/**
 * Boolean values in an open spread bag. The reference writes a key in its
 * boolean attribute set (`disabled`, `hidden`) as a bare attribute for
 * `true` and drops it for `false`, and writes any other key with the
 * value's text (`readOnly="true"`, `data-x="true"`, `data-y="false"`).
 */
export const fixture = createFixture({
  id: 'spread-open-bag-boolean-values',
  description: 'Boolean values in an open spread bag render as the reference renders them',
  source: `
type P = { [key: string]: unknown }
export function SpreadOpenBagBooleanValues({ ...rest }: P) {
  return <input {...rest} />
}
`,
  props: { readOnly: true, 'data-x': true, 'data-y': false, disabled: true, hidden: false },
  expectedHtml: `
    <input bf-s="test" bf="s0" data-x="true" data-y="false" disabled readOnly="true">
  `,
})

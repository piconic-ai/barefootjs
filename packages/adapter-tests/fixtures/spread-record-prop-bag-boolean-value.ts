import { createFixture } from '../src/types'

/**
 * Sibling of `spread-record-prop-bag` whose `Record<string, unknown>` prop
 * carries boolean values for keys outside the boolean attribute set
 * (`aria-hidden: true`, `data-off: false`) beside one inside it (`hidden:
 * true`). The reference writes the value's text for the former
 * (`aria-hidden="true"`, `data-off="false"`) and renders `hidden` bare.
 */
export const fixture = createFixture({
  id: 'spread-record-prop-bag-boolean-value',
  description: 'A record prop spread with a boolean value outside the boolean attribute set renders its text',
  source: `
type P = { rec: Record<string, unknown> }
export function SpreadRecordPropBagBooleanValue({ rec }: P) {
  return <p {...rec}>a</p>
}
`,
  props: { rec: { 'aria-hidden': true, 'data-off': false, hidden: true, id: 'i' } },
  expectedHtml: `
    <p aria-hidden="true" bf-s="test" bf="s0" data-off="false" hidden id="i">a</p>
  `,
})

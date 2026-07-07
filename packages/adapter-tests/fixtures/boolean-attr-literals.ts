import { createFixture } from '../src/types'

/**
 * The three static spellings of an HTML boolean attribute: bare
 * (`disabled`), explicit true (`disabled={true}`), and explicit false
 * (`disabled={false}`). The first two must render the attribute
 * present; the third must OMIT it entirely — `disabled="false"` is
 * still disabled in HTML semantics.
 */
export const fixture = createFixture({
  id: 'boolean-attr-literals',
  description: 'Static boolean attributes: bare, ={true}, and ={false} omission',
  source: `
export function BooleanAttrLiterals() {
  return (
    <div>
      <button disabled>bare</button>
      <button disabled={true}>true</button>
      <button disabled={false}>false</button>
      <input type="checkbox" checked readOnly />
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <button disabled>bare</button>
      <button disabled>true</button>
      <button>false</button>
      <input checked readOnly="true" type="checkbox">
    </div>
  `,
})

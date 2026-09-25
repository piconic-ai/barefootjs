import { createFixture } from '../src/types'

/**
 * Module-scope twin of `const-boolean-conditional-test`: the boolean-literal
 * `const` read as a ternary test lives outside the component. The server
 * HTML carries the branch it selects (`data-x="a"`).
 */
export const fixture = createFixture({
  id: 'module-const-boolean-conditional-test',
  description: 'A module-scope boolean-literal const read as a ternary test renders the branch it selects',
  source: `
const on = true
export function ModuleConstBooleanConditionalTest() {
  return <div data-x={on ? 'a' : 'b'}>x</div>
}
`,
  expectedHtml: `
    <div bf-s="test" data-x="a">x</div>
  `,
})

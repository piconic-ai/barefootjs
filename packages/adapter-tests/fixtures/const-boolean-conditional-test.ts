import { createFixture } from '../src/types'

/**
 * A function-scope `const` initialized with a boolean literal, read as the
 * test of a ternary. The const is known at compile time, so the server HTML
 * carries the branch it selects (`data-x="a"`). `true` rather than `false`
 * on purpose: a template that reads the const as an unset variable picks
 * the falsy branch, which `false` would hide. Attribute position keeps the
 * fixture clear of the text-position conditional whitespace question.
 * `module-const-boolean-conditional-test` is the module-scope twin;
 * `const-string-conditional-test` the string-literal variant.
 */
export const fixture = createFixture({
  id: 'const-boolean-conditional-test',
  description: 'A function-scope boolean-literal const read as a ternary test renders the branch it selects',
  source: `
export function ConstBooleanConditionalTest() {
  const on = true
  return <div data-x={on ? 'a' : 'b'}>x</div>
}
`,
  expectedHtml: `
    <div bf-s="test" data-x="a">x</div>
  `,
})

import { createFixture } from '../src/types'

/**
 * String-literal variant of `const-boolean-conditional-test`: a
 * function-scope `const mode = 'on'` compared in a ternary test. The server
 * HTML carries the branch the comparison selects (`data-x="a"`). The same
 * const at module scope renders correctly everywhere, so only the
 * function-scope shape is a reproduction.
 */
export const fixture = createFixture({
  id: 'const-string-conditional-test',
  description: 'A function-scope string-literal const compared in a ternary test renders the branch it selects',
  source: `
export function ConstStringConditionalTest() {
  const mode = 'on'
  return <div data-x={mode === 'on' ? 'a' : 'b'}>x</div>
}
`,
  expectedHtml: `
    <div bf-s="test" data-x="a">x</div>
  `,
})

import { createFixture } from '../src/types'

/**
 * Compiler stress (#1244): `export const Demo = () => …` arrow-function
 * component shape (vs the function-declaration shape the rest of the
 * suite mostly uses). Pins parity with the FunctionDeclaration shape.
 */
export const fixture = createFixture({
  id: 'arrow-component',
  description: 'Arrow-function component renders identically to function-declaration form',
  source: `
export const ArrowComponent = () => <span>arrow</span>
`,
  expectedHtml: `
    <span bf-s="test">arrow</span>
  `,
})

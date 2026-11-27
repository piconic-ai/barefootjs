import { createFixture } from '../src/types'

/**
 * Sibling shapes of `module-const-iife-reads-module-const` (#4022): a module
 * const initialized by an immediately invoked zero-param arrow that reads no
 * other module const holds what the arrow returns, as `const B = body` would.
 * Results: an object read in text and in an attribute, a string, a number,
 * an array read by index, an arrow nested in the arrow, and a call under a
 * type assertion.
 */
export const fixture = createFixture({
  id: 'module-const-iife-values',
  description: 'a module const initialized by an immediately invoked arrow that reads no module const renders what the arrow returns',
  source: `
'use client'
const OBJ = (() => ({ k: 'v' }))()
const STR = (() => 's')()
const NUM = (() => 1 + 2)()
const ARR = (() => ['a', 'b'])()
const NESTED = (() => (() => ({ k: 'n' }))())()
const TYPED = ((() => ({ k: 't' }))() as { k: string })
export function ModuleConstIifeValues() {
  return (
    <p title={OBJ.k}>
      {OBJ.k}|{STR}|{NUM}|{ARR[1]}|{NESTED.k}|{TYPED.k}
    </p>
  )
}
`,
  expectedHtml: `
    <p bf-s="test" title="v">v|s|3|b|n|t</p>
  `,
})

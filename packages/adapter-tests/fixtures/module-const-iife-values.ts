import { createFixture } from '../src/types'

/**
 * Sibling shapes of `module-const-iife-reads-module-const` (#4022): a module
 * const initialized by an immediately invoked zero-param arrow that reads no
 * other module const holds what the arrow returns, as `const B = body` would.
 * Results: an object read in text and in an attribute, a string, a number,
 * an array read by index, an arrow nested in the arrow, and the
 * value-transparent TS wrappers at the result and at the callee (`as`,
 * `!`), and keys and member names spelled `arguments` / `this`, which read
 * no binding.
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
const CALLEE = ((() => ({ k: 'c' })) as () => { k: string })()
const NONNULL = (() => ({ k: 'x' }))()!
const O = { arguments: 'm' }
const KEYS = (() => ({ arguments: 'a', this: 't' }))()
const MEMBER = (() => O.arguments)()
export function ModuleConstIifeValues() {
  return (
    <p title={OBJ.k}>
      {OBJ.k}|{STR}|{NUM}|{ARR[1]}|{NESTED.k}|{TYPED.k}|{CALLEE.k}|{NONNULL.k}|{KEYS.arguments}|{KEYS.this}|{MEMBER}
    </p>
  )
}
`,
  expectedHtml: `
    <p bf-s="test" title="v">v|s|3|b|n|t|c|x|a|t|m</p>
  `,
})

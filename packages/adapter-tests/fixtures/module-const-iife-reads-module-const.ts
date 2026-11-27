import { createFixture } from '../src/types'

/**
 * #3975, the literal sibling of `module-helper-reads-module-const`: the module
 * const is an immediately invoked arrow (`(() => ({ k: V }))()`). Its body
 * repeats, so the analyzer records the const as initialized by the body
 * (#4022): a template folds `B.k` as it does for `const B = { k: V }`, and
 * the CSR template reads it the same way.
 */
export const fixture = createFixture({
  id: 'module-const-iife-reads-module-const',
  description: 'a module const initialized by an immediately invoked arrow that reads another module const renders what the arrow returns',
  source: `
'use client'
const V = 'v'
const B = (() => ({ k: V }))()
export function ModuleConstIifeReadsModuleConst() {
  return <p>{B.k}</p>
}
`,
  expectedHtml: `
    <p bf-s="test">v</p>
  `,
})

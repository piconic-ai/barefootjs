import { createFixture } from '../src/types'

/**
 * #3975, the literal sibling of `module-helper-reads-module-const`: the module
 * const is an immediately invoked arrow (`(() => ({ k: V }))()`). The CSR
 * template has no form for a const whose value holds an arrow, so it renders
 * `B.k` as `''` on a client mount (registered under
 * `csr-template-module-declaration-reads-module-const`). The template
 * adapters render it.
 */
export const fixture = createFixture({
  id: 'module-const-iife-reads-module-const',
  description: 'a module const initialized by an immediately invoked arrow that reads another module const renders client-side',
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

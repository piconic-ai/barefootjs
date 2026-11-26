import { createFixture } from '../src/types'

/**
 * #3975, the `function` sibling of `module-helper-reads-module-const`: `mk`
 * is a `function` declaration, which the CSR template cannot splice, so it
 * renders `B.k` as `''` on a client mount (CSR-skipped: the server-side
 * refusal entry lists this fixture). A template adapter refuses the read
 * (BF101).
 */
export const fixture = createFixture({
  id: 'module-function-reads-module-const',
  description: 'a const built by a module function declaration that reads another module const renders client-side',
  escapes: [{ kind: 'client-directive', fixture: 'module-const-helper-call-client' }],
  source: `
'use client'
const V = 'v'
function mk() {
  return { k: V }
}
const B = mk()
export function ModuleFunctionReadsModuleConst() {
  return <p>{B.k}</p>
}
`,
  expectedHtml: `
    <p bf-s="test">v</p>
  `,
})

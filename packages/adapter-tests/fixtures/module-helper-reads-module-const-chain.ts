import { createFixture } from '../src/types'

/**
 * #3975: the transitive sibling of `module-helper-reads-module-const`. `V`
 * aliases another module const and `mk` reaches it through a second
 * zero-param helper, so the CSR template splices one applied arrow inside
 * another. A template adapter refuses the read (BF101).
 */
export const fixture = createFixture({
  id: 'module-helper-reads-module-const-chain',
  description: 'a zero-param module helper calling another one that reads a module const alias renders on a client mount (#3975)',
  escapes: [{ kind: 'client-directive', fixture: 'module-const-helper-call-client' }],
  source: `
'use client'
const A = 'v'
const V = A
const inner = () => V
const mk = () => ({ k: inner() })
const B = mk()
export function ModuleHelperReadsModuleConstChain() {
  return <p>{B.k}</p>
}
`,
  expectedHtml: `
    <p bf-s="test">v</p>
  `,
})

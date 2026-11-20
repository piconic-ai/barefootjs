import { createFixture } from '../src/types'

/**
 * #3952: a module const whose initializer calls a module helper
 * (`const B = mk()`), read in a stateless client component. The CSR
 * template inlines the initializer (`(mk()).k`), so the client module must
 * declare `mk` as the init path does; it used to reference `mk` undeclared
 * and a client mount threw a ReferenceError. A template adapter refuses the
 * read (BF101): it cannot run `mk` at render time.
 */
export const fixture = createFixture({
  id: 'module-const-helper-call-inlined',
  description: 'a module const initialized by a module helper call (`const B = mk()`) renders on a client mount (#3952)',
  escapes: [{ kind: 'client-directive', fixture: 'module-const-helper-call-client' }],
  source: `
'use client'
const mk = () => ({ k: 'v' })
const B = mk()
export function ModuleConstHelperCallInlined() {
  return <p>{B.k}</p>
}
`,
  expectedHtml: `
    <p bf-s="test">v</p>
  `,
})

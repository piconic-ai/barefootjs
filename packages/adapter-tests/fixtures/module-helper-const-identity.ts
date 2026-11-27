import { createFixture } from '../src/types'

/**
 * #3975: a const built by a zero-param module helper that reads a module
 * const, compared with itself (`B === B`). The server evaluates `mk()` once,
 * so the comparison is true. The CSR template binds the const once per
 * template evaluation (#4021), so every read is the one object and the
 * comparison renders `true` on a client mount too, as it does for an object
 * literal const (`module-const-literal-identity`). The template adapters
 * refuse the read (BF101).
 */
export const fixture = createFixture({
  id: 'module-helper-const-identity',
  description: 'a const built by a module helper reading a module const is the same object at two reads',
  escapes: [{ kind: 'client-directive', fixture: 'module-const-helper-call-client' }],
  source: `
'use client'
const V = 'v'
const mk = () => ({ k: V })
const B = mk()
export function ModuleHelperConstIdentity() {
  return <p data-same={String(B === B)}>x</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s0" data-same="true">x</p>
  `,
})

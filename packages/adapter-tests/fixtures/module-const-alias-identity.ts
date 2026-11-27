import { createFixture } from '../src/types'

/**
 * A const that aliases an object literal const (`const C = B`), compared
 * with it and with itself. The server evaluates the literal once, so both
 * comparisons are true. The CSR template binds only a const whose own
 * initializer evaluates a fresh value; the alias is spliced with the
 * literal it resolves to, so each read of `C` is a new object and both
 * comparisons render `false` on a client mount. The template adapters
 * refuse the comparison (BF101), so this fixture is CSR-skipped.
 */
export const fixture = createFixture({
  id: 'module-const-alias-identity',
  description: 'a const aliasing an object literal const is the same object as it',
  escapes: [
    { kind: 'rewrite', fixture: 'strict-equality-reference-rewrite' },
    { kind: 'client-directive', fixture: 'strict-equality-reference-client' },
  ],
  source: `
'use client'
const B = { k: 'v' }
const C = B
export function ModuleConstAliasIdentity() {
  return <p data-same={String(C === B)} data-self={String(C === C)}>x</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s0" data-same="true" data-self="true">x</p>
  `,
})

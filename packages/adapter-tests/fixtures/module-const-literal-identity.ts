import { createFixture } from '../src/types'

/**
 * An object literal module const compared with itself (`B === B`). The
 * server evaluates the literal once, so the comparison is true. The CSR
 * template binds the const once per template evaluation (#4021), so both
 * reads are the one object and a client mount renders `true` too. The
 * template adapters refuse the comparison (BF101).
 */
export const fixture = createFixture({
  id: 'module-const-literal-identity',
  description: 'an object literal module const is the same object at two reads',
  escapes: [
    { kind: 'rewrite', fixture: 'strict-equality-reference-rewrite' },
    { kind: 'client-directive', fixture: 'strict-equality-reference-client' },
  ],
  source: `
'use client'
const B = { k: 'v' }
export function ModuleConstLiteralIdentity() {
  return <p data-same={String(B === B)}>x</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s0" data-same="true">x</p>
  `,
})

import { createFixture } from '../src/types'

/**
 * An object literal module const compared with itself (`B === B`). The
 * server evaluates the literal once, so the comparison is true. The CSR
 * template splices the literal at each read, so each read is a separate
 * object and the comparison renders `false` on a client mount. The template adapters refuse the
 * comparison (BF101), so this fixture is CSR-skipped.
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

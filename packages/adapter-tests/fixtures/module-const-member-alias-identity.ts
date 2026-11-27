import { createFixture } from '../src/types'

/**
 * A const that holds an object literal const in a member
 * (`const B = { a: A }`), compared with it (`B.a === A`) and with itself.
 * The server evaluates each literal once, so every comparison is true. The
 * CSR template binds `A` once per template evaluation, but leaves `B` to the
 * splice, because its substituted value inlines `A`'s literal and binding it
 * would still build a second `A`. So `B.a === A` and `B === B` render `false`
 * on a client mount while `A === A` renders `true`. The template adapters
 * refuse the comparisons (BF101), so this fixture is CSR-skipped.
 */
export const fixture = createFixture({
  id: 'module-const-member-alias-identity',
  description: 'a const holding an object literal const in a member holds the same object',
  escapes: [
    { kind: 'rewrite', fixture: 'strict-equality-reference-rewrite' },
    { kind: 'client-directive', fixture: 'strict-equality-reference-client' },
  ],
  source: `
'use client'
const A = { k: 'v' }
const B = { a: A }
export function ModuleConstMemberAliasIdentity() {
  return <p data-member={String(B.a === A)} data-whole={String(B === B)} data-self={String(A === A)}>x</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s0" data-member="true" data-self="true" data-whole="true">x</p>
  `,
})

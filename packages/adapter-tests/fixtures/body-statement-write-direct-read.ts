import { createFixture } from '../src/types'

/**
 * A binding a body statement writes after its declaration (`local.push('z')`),
 * read by the markup in a text and an attribute position. In JS both read
 * the pushed element (`2`). A template renders the binding from its
 * declaration and runs no body statement, so the read is refused (BF101,
 * `checkStatementWrites`) in the shared compile, ahead of any adapter, and
 * pinned on every adapter including the reference: the limitation
 * `body-statement-write-read-as-declared`.
 *
 * Two ways out: the rewrite twin `body-statement-write-rewrite` (the binding
 * gets its final value where it is declared), and the `/* @client *\/` twin
 * `body-statement-write-direct-read-client` (the client evaluates the
 * position after its init ran the statement).
 */
export const fixture = createFixture({
  id: 'body-statement-write-direct-read',
  description: 'A binding a body statement writes, read by the markup, is refused',
  source: `
'use client'
export function BodyStatementWriteDirectRead() {
  const local = ['y']
  local.push('z')
  return <p data-n={local.length}>{local.length}</p>
}
`,
  escapes: [
    { kind: 'rewrite', fixture: 'body-statement-write-rewrite' },
    { kind: 'client-directive', fixture: 'body-statement-write-direct-read-client' },
  ],
})

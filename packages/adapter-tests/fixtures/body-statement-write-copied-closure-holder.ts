import { createFixture } from '../src/types'

/**
 * A constant declared after a body statement writes `local` calls a closure
 * over `local` that a COPY of an object declared before the statement keeps:
 *
 *   const box = { read: () => local.length }
 *   const copy = { ...box }
 *   local.push('z')
 *   const n = copy.read()
 *
 * The spread copies the closure, not what the closure reads: `copy.read()`
 * reads `local` when it is called, `2` in JS. The client's init creates `n`
 * before it runs the statement, which would make it `1`. A copy taken before
 * the write is its own data, but a closure it keeps observes every write, so
 * the initializer is refused (BF101, `checkStatementWrites`) in the shared
 * compile, ahead of any adapter, and pinned on every adapter including the
 * reference: the limitation `body-statement-write-read-as-declared`.
 * `expectedHtml` is the server HTML of the component as JS runs it (the
 * markup does not read `n`).
 *
 * The way out is the rewrite (`body-statement-write-rewrite`): give `local`
 * its final value where it is declared.
 */
export const fixture = createFixture({
  id: 'body-statement-write-copied-closure-holder',
  description: 'A call of a closure a copy of an earlier constant keeps, after a body statement writes what it reads, is refused',
  source: `
'use client'
export function BodyStatementWriteCopiedClosureHolder() {
  const local = ['y']
  const box = { read: () => local.length }
  const copy = { ...box }
  local.push('z')
  const n = copy.read()
  return <button onClick={() => console.log(n)}>n</button>
}
`,
  expectedHtml: `
    <button bf-s="test" bf="s0">n</button>
  `,
  escapes: [{ kind: 'rewrite', fixture: 'body-statement-write-rewrite' }],
})

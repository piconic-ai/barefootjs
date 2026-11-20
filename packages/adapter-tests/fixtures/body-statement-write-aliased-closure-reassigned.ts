import { createFixture } from '../src/types'

/**
 * A `let` a body statement reassigns, read by a closure that an ALIAS of an
 * object declared before the statement keeps, called by a constant declared
 * after it:
 *
 *   let local = ['y']
 *   const box = { read: () => local.length }
 *   const alias = box
 *   local = ['y', 'z']
 *   const n = alias.read()
 *
 * `alias` is `box`, and its closure reads the binding `local` when it is
 * called: `2` in JS. The client's init creates `n` before it runs the
 * statement, which would make it `1`. What a declaration took before a
 * reassignment keeps the old object, but a closure it keeps reads the new
 * one, so the initializer is refused (BF101, `checkStatementWrites`) in the
 * shared compile, ahead of any adapter, and pinned on every adapter including
 * the reference: the limitation `body-statement-write-read-as-declared`.
 * `expectedHtml` is the server HTML of the component as JS runs it (the
 * markup does not read `n`).
 *
 * The way out is the rewrite (`body-statement-write-rewrite`): give `local`
 * its final value where it is declared.
 */
export const fixture = createFixture({
  id: 'body-statement-write-aliased-closure-reassigned',
  description: 'A call of a closure an alias of an earlier constant keeps, after a body statement reassigns what it reads, is refused',
  source: `
'use client'
export function BodyStatementWriteAliasedClosureReassigned() {
  let local = ['y']
  const box = { read: () => local.length }
  const alias = box
  local = ['y', 'z']
  const n = alias.read()
  return <button onClick={() => console.log(n)}>n</button>
}
`,
  expectedHtml: `
    <button bf-s="test" bf="s0">n</button>
  `,
  escapes: [{ kind: 'rewrite', fixture: 'body-statement-write-rewrite' }],
})

import { createFixture } from '../src/types'

/**
 * A constant declared after a body statement writes `local` calls a closure
 * over `local` that an object declared BEFORE the statement holds:
 *
 *   const box = { read: () => local.length }
 *   local.push('z')
 *   const n = box.read()
 *
 * `box` itself only stores the closure, but `n` runs it where it stands: `2`
 * in JS. The client's init creates `n` before it runs the statement, which
 * would make it `1`. A declaration uses what another one holds when it uses
 * that one, so the initializer is refused (BF101, `checkStatementWrites`) in
 * the shared compile, ahead of any adapter, and pinned on every adapter
 * including the reference: the limitation
 * `body-statement-write-read-as-declared`. `expectedHtml` is the server HTML
 * of the component as JS runs it (the markup does not read `n`).
 *
 * The way out is the rewrite (`body-statement-write-rewrite`): give `local`
 * its final value where it is declared.
 */
export const fixture = createFixture({
  id: 'body-statement-write-through-holder',
  description: 'A call of a closure another constant holds, after a body statement writes what it reads, is refused',
  source: `
'use client'
export function BodyStatementWriteThroughHolder() {
  const local = ['y']
  const box = { read: () => local.length }
  local.push('z')
  const n = box.read()
  return <button onClick={() => console.log(n)}>n</button>
}
`,
  expectedHtml: `
    <button bf-s="test" bf="s0">n</button>
  `,
  escapes: [{ kind: 'rewrite', fixture: 'body-statement-write-rewrite' }],
})

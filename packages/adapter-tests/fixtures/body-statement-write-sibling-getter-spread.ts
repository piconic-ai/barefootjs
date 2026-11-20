import { createFixture } from '../src/types'

/**
 * A constant declared after a body statement writes `local`, whose
 * initializer spreads an object literal that holds a closure over `local`
 * AND a getter calling it through `this`:
 *
 *   local.push('z')
 *   const box = { ...{ read: () => local.length, get n() { return this.read() } } }
 *
 * The spread runs the getter, which runs the closure, so `box.n` is computed
 * when `box` is created: `2` in JS. The client's init creates `box` before
 * it runs the statement, which would make it `1`. Spreading (or reading a
 * member of) a literal that has an accessor is therefore an evaluation of
 * everything its members hold, not a copy of stored functions, and the
 * initializer is refused (BF101, `checkStatementWrites`) in the shared
 * compile, ahead of any adapter, and pinned on every adapter including the
 * reference: the limitation `body-statement-write-read-as-declared`.
 * `expectedHtml` is the server HTML of the component as JS runs it (the
 * markup does not read `box`).
 *
 * The way out is the rewrite (`body-statement-write-rewrite`): give `local`
 * its final value where it is declared.
 */
export const fixture = createFixture({
  id: 'body-statement-write-sibling-getter-spread',
  description: 'A spread of a literal whose getter calls a closure over a written binding is refused',
  source: `
'use client'
export function BodyStatementWriteSiblingGetterSpread() {
  const local = ['y']
  local.push('z')
  const box = { ...{ read: () => local.length, get n() { return this.read() } } }
  return <button onClick={() => console.log(box.n)}>n</button>
}
`,
  expectedHtml: `
    <button bf-s="test" bf="s0">n</button>
  `,
  escapes: [{ kind: 'rewrite', fixture: 'body-statement-write-rewrite' }],
})

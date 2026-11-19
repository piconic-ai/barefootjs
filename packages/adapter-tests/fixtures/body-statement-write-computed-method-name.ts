import { createFixture } from '../src/types'

/**
 * A constant declared after a body statement writes `local`, whose
 * initializer reads `local` in a COMPUTED METHOD NAME:
 *
 *   local.push('z')
 *   const box = { [local.join(',')]() { return 1 } }
 *
 * A computed member name is evaluated when the object is created, in the
 * surrounding scope; only the method's body waits for a call. In JS the key
 * is `y,z`. The client's init creates `box` before it runs the statement,
 * so the key would be `y`, and the click handler would list that. The
 * initializer is refused (BF101, `checkStatementWrites`) in the shared
 * compile, ahead of any adapter, and pinned on every adapter including the
 * reference: the limitation `body-statement-write-read-as-declared`.
 * `expectedHtml` is the server HTML of the component as JS runs it (the
 * markup does not read `box`), the contract a lowering that runs the body in
 * source order must meet.
 *
 * The way out is the rewrite (`body-statement-write-rewrite`): give `local`
 * its final value where it is declared. `/* @client *\/` is not one, since
 * the constant is computed too early wherever it is read.
 */
export const fixture = createFixture({
  id: 'body-statement-write-computed-method-name',
  description: 'A computed method name that reads a binding after a body statement writes it is refused',
  source: `
'use client'
export function BodyStatementWriteComputedMethodName() {
  const local = ['y']
  local.push('z')
  const box = { [local.join(',')]() { return 1 } }
  return <button onClick={() => console.log(Object.keys(box))}>keys</button>
}
`,
  expectedHtml: `
    <button bf-s="test" bf="s0">keys</button>
  `,
  escapes: [{ kind: 'rewrite', fixture: 'body-statement-write-rewrite' }],
})

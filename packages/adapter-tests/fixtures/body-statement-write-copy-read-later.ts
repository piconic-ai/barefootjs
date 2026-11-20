import { createFixture } from '../src/types'

/**
 * A shallow copy taken BEFORE the body statement that writes the binding
 * (`const copy = [...local]`, then `local.push('z')`), read by a constant
 * declared after the statement (`const n = copy.length`). The copy is its own
 * array: the push does not change it, so JS computes `1` wherever `n` is
 * declared. The server render and the client's init compute it from the
 * declarations too, so every side agrees and `checkStatementWrites` accepts
 * it: reading a declaration that took a copy before the write is not a read
 * of the written binding, unless the write changes an object the copy shares
 * (`rows[0].done = true`). The handler reads `n`; the markup does not (a
 * template position reading an init-scope copy is BF061's to refuse).
 */
export const fixture = createFixture({
  id: 'body-statement-write-copy-read-later',
  description: 'A copy taken before a body statement writes the binding, read after it, keeps its own value',
  source: `
'use client'
export function BodyStatementWriteCopyReadLater() {
  const local = ['y']
  const copy = [...local]
  local.push('z')
  const n = copy.length
  return <button onClick={() => console.log(n, local)}>n</button>
}
`,
  expectedHtml: `
    <button bf-s="test" bf="s0">n</button>
  `,
})

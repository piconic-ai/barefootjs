import { createFixture } from '../src/types'

/**
 * Module consts initialized by an immediately invoked arrow whose body
 * writes (`delete o.k`, an assignment, `++`). JS runs the write once; read
 * as the body, it would run again or not at all, so the consts keep the call
 * and the template adapters refuse the reads (BF101, `const-iife-unlowered`).
 */
export const fixture = createFixture({
  id: 'module-const-iife-write-body',
  description: 'module consts initialized by an immediately invoked arrow whose body writes render what the call returned',
  escapes: [{ kind: 'client-directive', fixture: 'module-const-iife-write-body-client' }],
  source: `
'use client'
const o: { k?: string } = { k: 'v' }
const p = { n: 1 }
const D = (() => delete o.k)()
const A = (() => (p.n = 5))()
const I = (() => p.n++)()
export function ModuleConstIifeWriteBody() {
  return <p>{D ? 'yes' : 'no'}|{A}|{I}</p>
}
`,
  expectedHtml: `
    <p bf-s="test">yes|5|5</p>
  `,
})

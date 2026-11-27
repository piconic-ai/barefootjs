import { createFixture } from '../src/types'

/**
 * The `/* @client *\/` escape of `module-const-iife-write-body`: the reads of
 * the consts are deferred to the browser, so the server renders the text
 * slots empty.
 */
export const fixture = createFixture({
  id: 'module-const-iife-write-body-client',
  description: 'The client-directive escape of module-const-iife-write-body',
  source: `
'use client'
const o: { k?: string } = { k: 'v' }
const p = { n: 1 }
const D = (() => delete o.k)()
const A = (() => (p.n = 5))()
const I = (() => p.n++)()
export function ModuleConstIifeWriteBodyClient() {
  return <p>{/* @client */ D ? 'yes' : 'no'}|{/* @client */ A}|{/* @client */ I}</p>
}
`,
  expectedHtml: `
    <p bf-s="test"><!--bf-cond-start:s0--><!--bf-cond-end:s0-->|<!--bf:s1--><!--/-->|<!--bf:s2--><!--/--></p>
  `,
})

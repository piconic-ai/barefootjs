import { createFixture } from '../src/types'

/**
 * The `/* @client *\/` escape of `module-const-iife-block-body`: the reads of
 * the const are deferred to the browser, so the server renders the text
 * slots empty.
 */
export const fixture = createFixture({
  id: 'module-const-iife-block-body-client',
  description: 'The client-directive escape of module-const-iife-block-body',
  source: `
'use client'
const A = (() => { return { k: 'a' } })()
const F = (function () { return { k: 'f' } })()
export function ModuleConstIifeBlockBodyClient() {
  return <p>{/* @client */ A.k}|{/* @client */ F.k}</p>
}
`,
  expectedHtml: `
    <p bf-s="test"><!--bf:s0--><!--/-->|<!--bf:s1--><!--/--></p>
  `,
})

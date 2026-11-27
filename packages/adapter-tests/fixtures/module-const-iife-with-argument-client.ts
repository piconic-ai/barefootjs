import { createFixture } from '../src/types'

/**
 * The `/* @client *\/` escape of `module-const-iife-with-argument`: the reads of
 * the const are deferred to the browser, so the server renders the text
 * slots empty.
 */
export const fixture = createFixture({
  id: 'module-const-iife-with-argument-client',
  description: 'The client-directive escape of module-const-iife-with-argument',
  source: `
'use client'
const B = ((x: string) => ({ k: x }))('v')
export function ModuleConstIifeWithArgumentClient() {
  return <p>{/* @client */ B.k}</p>
}
`,
  expectedHtml: `
    <p bf-s="test"><!--bf:s0--><!--/--></p>
  `,
})

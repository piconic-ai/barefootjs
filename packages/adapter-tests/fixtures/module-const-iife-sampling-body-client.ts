import { createFixture } from '../src/types'

/**
 * The `/* @client *\/` escape of `module-const-iife-sampling-body`: the reads of
 * the const are deferred to the browser, so the server renders the text
 * slots empty.
 */
export const fixture = createFixture({
  id: 'module-const-iife-sampling-body-client',
  description: 'The client-directive escape of module-const-iife-sampling-body',
  source: `
'use client'
const B = (() => ({ k: new Date(0).toISOString() }))()
export function ModuleConstIifeSamplingBodyClient() {
  return <p>{/* @client */ B.k}</p>
}
`,
  expectedHtml: `
    <p bf-s="test"><!--bf:s0--><!--/--></p>
  `,
})

import { createFixture } from '../src/types'

/**
 * The `/* @client *\/` escape of `component-const-iife-returns-function`: the reads of
 * the consts are deferred to the browser, so the server renders the text
 * slots empty.
 */
export const fixture = createFixture({
  id: 'component-const-iife-returns-function-client',
  description: 'The client-directive escape of component-const-iife-returns-function',
  source: `
'use client'
export function ComponentConstIifeReturnsFunctionClient() {
  const B = (() => () => 1)()
  return <p>{/* @client */ B.name || 'anonymous'}</p>
}
`,
  expectedHtml: `
    <p bf-s="test"><!--bf:s0--><!--/--></p>
  `,
})

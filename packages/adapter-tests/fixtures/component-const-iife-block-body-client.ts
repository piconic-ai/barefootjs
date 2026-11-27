import { createFixture } from '../src/types'

/**
 * The `/* @client *\/` escape of `component-const-iife-block-body`: the reads of
 * the const are deferred to the browser, so the server renders the text
 * slots empty.
 */
export const fixture = createFixture({
  id: 'component-const-iife-block-body-client',
  description: 'The client-directive escape of component-const-iife-block-body',
  source: `
'use client'
export function ComponentConstIifeBlockBodyClient({ label }: { label: string }) {
  const B = (() => { return { k: 'v', l: label } })()
  return <p>{/* @client */ B.k}|{/* @client */ B.l}</p>
}
`,
  props: { label: 'hi' },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0--><!--/-->|<!--bf:s1--><!--/--></p>
  `,
})

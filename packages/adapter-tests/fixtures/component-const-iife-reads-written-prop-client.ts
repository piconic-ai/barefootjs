import { createFixture } from '../src/types'

/**
 * The `/* @client *\/` escape of `component-const-iife-reads-written-prop`: the reads of
 * the const are deferred to the browser, so the server renders the text
 * slots empty.
 */
export const fixture = createFixture({
  id: 'component-const-iife-reads-written-prop-client',
  description: 'The client-directive escape of component-const-iife-reads-written-prop',
  source: `
'use client'
function unrelated() {
  let label = 1
  return label
}
export function ComponentConstIifeReadsWrittenPropClient({ label, n }: { label: string; n: number }) {
  const B = (() => ({ label, n }))()
  label = 'updated'
  ;[n] = [9]
  return <p>{/* @client */ B.label}|{/* @client */ B.n}</p>
}
`,
  props: { label: 'hi', n: 1 },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0--><!--/-->|<!--bf:s1--><!--/--></p>
  `,
})

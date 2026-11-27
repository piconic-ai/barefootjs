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
export function ComponentConstIifeReadsWrittenPropClient({ label, n, m }: { label: string; n: number; m: string }) {
  const B = (() => ({ label, n, m }))()
  label = 'updated'
  ;[n] = [9]
  const obj = { [(m = 'updated')](m: string) { return m } }
  return <p>{/* @client */ B.label}|{/* @client */ B.n}|{/* @client */ B.m}</p>
}
`,
  props: { label: 'hi', n: 1, m: 'mm' },
  expectedHtml: `
    <p bf-s="test" bf="s3"><!--bf:s0--><!--/-->|<!--bf:s1--><!--/-->|<!--bf:s2--><!--/--></p>
  `,
})

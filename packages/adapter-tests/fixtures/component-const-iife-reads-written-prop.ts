import { createFixture } from '../src/types'

/**
 * A component const initialized by an immediately invoked arrow that reads
 * props the component body then writes (`label = 'updated'`, a
 * destructuring `[n] = [9]`, a write in a computed method key, `[(m =
 * 'updated')](m) {}`, which no parameter scope of the method holds). A parameter is reassignable without `let`, so
 * the body is not read as the const's value: the prop at the call is not the
 * prop as passed once written. The const keeps the call and the template
 * adapters refuse the read (BF101, `const-iife-unlowered`). An unrelated
 * function's `let label` is beside the point either way.
 */
export const fixture = createFixture({
  id: 'component-const-iife-reads-written-prop',
  description: 'a component IIFE const reading props the body later writes renders the values at the call',
  escapes: [{ kind: 'client-directive', fixture: 'component-const-iife-reads-written-prop-client' }],
  source: `
'use client'
function unrelated() {
  let label = 1
  return label
}
export function ComponentConstIifeReadsWrittenProp({ label, n, m }: { label: string; n: number; m: string }) {
  const B = (() => ({ label, n, m }))()
  label = 'updated'
  ;[n] = [9]
  const obj = { [(m = 'updated')](m: string) { return m } }
  return <p>{B.label}|{B.n}|{B.m}</p>
}
`,
  props: { label: 'hi', n: 1, m: 'mm' },
  expectedHtml: `
    <p bf-s="test" bf="s3"><!--bf:s0-->hi<!--/-->|<!--bf:s1-->1<!--/-->|<!--bf:s2-->mm<!--/--></p>
  `,
})

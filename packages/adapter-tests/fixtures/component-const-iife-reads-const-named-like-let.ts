import { createFixture } from '../src/types'

/**
 * A component const initialized by an immediately invoked arrow whose body
 * reads a module const and a prop that share their names with `let`s of an
 * unrelated function. Each read resolves to the declaration it sees, so the
 * body is lowered as `{ n, l: label }` would be (#4022).
 */
export const fixture = createFixture({
  id: 'component-const-iife-reads-const-named-like-let',
  description: 'a component IIFE const reading a const and a prop named like an unrelated let renders what the arrow returns',
  source: `
'use client'
const n = 1
function other() {
  let n = 2
  let label = 'x'
  return n + label
}
export function ComponentConstIifeReadsConstNamedLikeLet({ label }: { label: string }) {
  const B = (() => ({ n, l: label }))()
  return <p>{B.n}|{B.l}</p>
}
`,
  props: { label: 'hi' },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->1<!--/-->|<!--bf:s1-->hi<!--/--></p>
  `,
})

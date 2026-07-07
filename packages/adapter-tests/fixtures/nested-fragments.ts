import { createFixture } from '../src/types'

/**
 * A fragment nested INSIDE another fragment, with a dynamic slot in
 * the inner one. Fragment flattening must recurse — an adapter that
 * only unwraps one level leaves a phantom grouping node (or drops the
 * inner children).
 */
export const fixture = createFixture({
  id: 'nested-fragments',
  description: 'Fragment inside fragment flattens recursively',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function NestedFragments() {
  const [n, setN] = createSignal(5)
  return (
    <>
      <span>first</span>
      <>
        <span>inner</span>
        <span>{n()}</span>
      </>
      <span>last</span>
    </>
  )
}
`,
  expectedHtml: `
    <span>first</span>
    <span>inner</span>
    <span bf="s1"><!--bf:s0-->5<!--/--></span>
    <span>last</span>
  `,
})

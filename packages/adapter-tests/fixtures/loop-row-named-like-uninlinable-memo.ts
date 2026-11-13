import { createFixture } from '../src/types'

/**
 * A loop row is named like a component memo whose body calls a local function
 * a template cannot inline. The row's `n` is the loop's, so nothing on the
 * server reads the memo: the component compiles on every adapter and renders
 * the row.
 */
export const fixture = createFixture({
  id: 'loop-row-named-like-uninlinable-memo',
  description: 'A loop row named like a memo calling a local function a template cannot inline reads the row, not the memo',
  source: `
'use client'
import { createMemo, createSignal } from '@barefootjs/client'
export function LoopRowNamedLikeUninlinableMemo() {
  function value() {
    const one = 1
    return one
  }
  const n = createMemo(() => value())
  return <ul>{['row'].map(n => <li key={n}>{n}</li>)}</ul>
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s1"><li data-key="row"><!--bf:s0-->row<!--/--></li></ul>
  `,
})

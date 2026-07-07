import { createFixture } from '../src/types'

/**
 * The canonical empty-state shape: `items().length === 0` ternary
 * choosing between an empty-state element and a `.map()` list. Both a
 * conditional and a loop hang off the same signal; the initial value
 * is non-empty so the loop branch renders at SSR.
 */
export const fixture = createFixture({
  id: 'empty-list-branch',
  description: 'length === 0 ternary between empty-state and .map() list',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function EmptyListBranch() {
  const [items, setItems] = createSignal(['alpha', 'beta'])
  return (
    <div>
      {items().length === 0 ? (
        <p>No items</p>
      ) : (
        <ul>{items().map(item => <li key={item}>{item}</li>)}</ul>
      )}
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s3"><ul bf-c="s0" bf="s2"><li data-key="alpha"><!--bf:s1-->alpha<!--/--></li><li data-key="beta"><!--bf:s1-->beta<!--/--></li></ul></div>
  `,
})

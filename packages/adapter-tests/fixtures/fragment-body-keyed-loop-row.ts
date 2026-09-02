import { createFixture } from '../src/types'

/**
 * A `.map()` whose CALLBACK BODY is a fragment with `key={}` on its first
 * element (`<>` `<li key={item.id}>...</li>` `<li>x</li>` `</>`) — #2763.
 * Different shape from `fragment-root-keyed-loop-row.ts` (#2732/#2733,
 * mechanism 2: key on a fragment-rooted CHILD COMPONENT, relayed through
 * `IRElement.keyAttr` with no local `value`): this fixture pins mechanism 1
 * — a LOCAL key expression read directly off the loop body, same file, no
 * component boundary.
 *
 * Before the #2763 fix, `extractLoopKey` (`jsx-to-ir.ts`) had no `fragment`
 * case, so the key resolved to `null` for this shape: no SSR adapter emitted
 * a row-key attribute and `mapArray` reconciled positionally (no `keyFn`),
 * while `html-template.ts`'s client row builder baked `data-key` anyway by
 * reading the raw `key` JSX attribute independently of that decision. This
 * fixture's SSR-shape half (this file) pins the fix: `data-key` now lands on
 * the first ELEMENT among the fragment's own top-level children (the `<li>`
 * carrying `key`), matching the "first element, not first node" rule
 * (`IRElement.keyAttr`'s docstring) — the second `<li>` in each row carries
 * no key attribute at all.
 */
export const fixture = createFixture({
  id: 'fragment-body-keyed-loop-row',
  description: 'Fragment-bodied `.map()` row with a local `key={}` on its first element (#2763)',
  componentName: 'FragmentBodyKeyedLoopRow',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Item = { id: number; label: string }
export function FragmentBodyKeyedLoopRow(props: { items: Item[] }) {
  const [items] = createSignal<Item[]>(props.items)
  return (
    <ul>
      {items().map(item => (
        <>
          <li key={item.id}>{item.label}</li>
          <li>x</li>
        </>
      ))}
    </ul>
  )
}
`,
  props: {
    items: [
      { id: 1, label: 'a' },
      { id: 2, label: 'b' },
    ],
  },
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li data-key="1"><!--bf:s0-->a<!--/--></li>
      <li>x</li>
      <li data-key="2"><!--bf:s0-->b<!--/--></li>
      <li>x</li>
    </ul>
  `,
})

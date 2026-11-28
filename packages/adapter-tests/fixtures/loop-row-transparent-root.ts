import { createFixture } from '../src/types'

/**
 * A keyed `.map()` row whose component renders only its children
 * (`<T key={x}><li>{x}</li></T>`, `T` returning `<>{props.children}</>`).
 * The row's first element is the caller's `<li>`, which SSR renders
 * without the row's `data-key`: `T` has no element of its own to carry it.
 */
export const fixture = createFixture({
  id: 'loop-row-transparent-root',
  description: 'A keyed loop row whose component renders only its children renders no key on the caller\'s element',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
function T(props: { children?: unknown }) {
  return <>{props.children}</>
}
export function Host(props: { items: string[] }) {
  const [items] = createSignal(props.items)
  return (
    <div>
      <ul>{items().map((x) => <T key={x}><li>{x}</li></T>)}</ul>
      <ol>{props.items.map((x) => <T key={x}><li>{x}</li></T>)}</ol>
    </div>
  )
}
`,
  props: { items: ['a', 'b'] },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s2">
        <li><!--bf:^s0-->a<!--/--></li>
        <li><!--bf:^s0-->b<!--/--></li>
      </ul>
      <ol bf="s5">
        <li><!--bf:^s3-->a<!--/--></li>
        <li><!--bf:^s3-->b<!--/--></li>
      </ol>
    </div>
  `,
})

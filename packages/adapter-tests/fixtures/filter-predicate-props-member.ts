import { createFixture } from '../src/types'

/**
 * #2879: a `.filter()` predicate that reads a bare-props-form prop DIRECTLY
 * as a member access (`props.hiddenId`, no destructure) rather than through
 * a local alias (the #2857 family).
 *
 * `renderFilterExprNode`'s `member` arm had no `propsObjectName` branch
 * (unlike its sibling `renderConditionExpr`), so `props.hiddenId` fell
 * through to the generic "nested member access" recursion: the `object`
 * (`props`) rendered via the `identifier` arm's root-scope fallback with
 * the literal name `props`, emitting `$.Props.HiddenId` — a field the
 * flattened Props struct never has (the real field is `$.HiddenId`) — so
 * `html/template` panicked at execute time.
 */
export const fixture = createFixture({
  id: 'filter-predicate-props-member',
  description: '.filter() predicate reading props.x directly on a bare-props-form component (#2879)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

type Item = { id: number; label: string }

export function FilterPredicatePropsMember(props: { items: Item[]; hiddenId: number }) {
  const [items] = createSignal<Item[]>(props.items)
  return (
    <ul>
      {items().filter(it => it.id !== props.hiddenId).map(it => (
        <li key={it.id}>{it.label}</li>
      ))}
    </ul>
  )
}
`,
  props: {
    items: [
      { id: 1, label: 'Alpha' },
      { id: 2, label: 'Beta' },
    ],
    hiddenId: 1,
  },
  expectedHtml: `
    <ul bf-s="test" bf="s1"><li data-key="2"><!--bf:s0-->Beta<!--/--></li></ul>
  `,
})

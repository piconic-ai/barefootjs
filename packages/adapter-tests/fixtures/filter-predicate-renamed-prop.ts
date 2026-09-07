import { createFixture } from '../src/types'

/**
 * #2857: a `.filter()` predicate that references a bare-props-form
 * body-destructured, RENAMED prop directly (`const { fallbackLabel:
 * skipLabel } = props`, the #2788 alias family) as a plain identifier.
 *
 * `renderFilterExprNode`'s `identifier` arm called `rootFieldRef` on the
 * raw local name only for its BF101 registration side effect, then
 * re-derived the emitted Go struct field from that same raw local name
 * (`.SkipLabel`) instead of the field the prop itself is seeded under
 * (`.FallbackLabel`). The phantom `.SkipLabel` field was never populated,
 * so it defaulted to Go's `""` zero value — a predicate comparing against
 * it (`t.label !== skipLabel`) then always matched, keeping every row
 * instead of filtering the one row equal to the real prop value.
 */
export const fixture = createFixture({
  id: 'filter-predicate-renamed-prop',
  description: '.filter() predicate referencing a renamed prop destructure (#2857)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

type Todo = { id: number; label: string }

export function FilterPredicateRenamedProp(props: { fallbackLabel: string }) {
  const { fallbackLabel: skipLabel } = props
  const [todos] = createSignal<Todo[]>([
    { id: 1, label: 'Alpha' },
    { id: 2, label: 'Beta' },
  ])
  return (
    <ul>
      {todos().filter(t => t.label !== skipLabel).map(t => (
        <li key={t.id}>{t.label}</li>
      ))}
    </ul>
  )
}
`,
  props: {
    fallbackLabel: 'Alpha',
  },
  expectedHtml: `
    <ul bf-s="test" bf="s1"><li data-key="2"><!--bf:s0-->Beta<!--/--></li></ul>
  `,
})

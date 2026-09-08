import { createFixture } from '../src/types'

/**
 * #2857: a `.filter()` predicate that CALLS a signal-getter alias
 * (`const showDone__alias = showDone`) as a zero-arg identifier call.
 *
 * `renderFilterExprNode`'s `call` arm called `rootFieldRef` on the raw
 * alias name only for its BF101 registration side effect, then re-derived
 * the emitted Go struct field from that same raw alias name (`.ShowDoneAlias`)
 * instead of the field the ALIASED signal itself seeds (`.ShowDone`). The
 * phantom `.ShowDoneAlias` field was never populated by `New*Props`, so it
 * defaulted to Go's `false` zero value regardless of the signal's real
 * (`true`) initial value — seeding `showDone` to `true` (not `false`) makes
 * that phantom-field divergence observable: the correct render keeps only
 * the `done: true` row, the buggy one keeps only the `done: false` row.
 */
export const fixture = createFixture({
  id: 'filter-predicate-signal-alias',
  description: '.filter() predicate calling a signal-getter alias (#2857)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

type Todo = { id: number; label: string; done: boolean }

export function FilterPredicateSignalAlias() {
  const [todos] = createSignal<Todo[]>([
    { id: 1, label: 'Alpha', done: false },
    { id: 2, label: 'Beta', done: true },
  ])
  const [showDone] = createSignal(true)
  const showDone__alias = showDone
  return (
    <ul>
      {todos().filter(t => t.done === showDone__alias()).map(t => (
        <li key={t.id}>{t.label}</li>
      ))}
    </ul>
  )
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s1"><li data-key="2"><!--bf:s0-->Beta<!--/--></li></ul>
  `,
})

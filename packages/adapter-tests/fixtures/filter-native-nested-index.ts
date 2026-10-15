import { createFixture } from '../src/types'

/**
 * A `.filter()` predicate the evaluator cannot serialize (`startsWith`) whose
 * nested `.filter()` reads its index. The evaluator would bind the nested
 * index, but the predicate cannot reach it, and the Xslate / ERB /
 * Mojolicious native forms bind only the element: before #3477's fix ERB
 * read `v[:i]` (and crashed on `nil > 0`), Mojolicious an unbound `$i`.
 * Every DSL adapter now refuses it alike.
 * Hono / CSR run the callback as JS; a DSL adapter that cannot lower it
 * declares the diagnostic in its `conformancePins`.
 */
export const fixture = createFixture({
  id: 'filter-native-nested-index',
  description: 'A native-only `.filter()` predicate whose nested `.filter()` reads its index — DSL diagnostic on every adapter',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function FilterNativeNestedIndex() {
  const [rows, setRows] = createSignal<string[][]>([['a', 'b'], ['c']])
  return <p>{rows().filter(row => row.join(',').startsWith('a') && row.filter((x, i) => i > 0).length > 0).length}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->1<!--/--></p>
  `,
  escapes: [{ kind: 'client-directive', fixture: 'filter-native-nested-index-client' }],
})

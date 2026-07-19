import { createFixture } from '../src/types'

/**
 * Filter predicate whose body is a nested `.find(...)` truthiness check
 * (#2038). Unlike the nested `.some` of `filter-nested-callback-predicate`,
 * `find*` returns an ELEMENT, not a boolean — so even Mojo (which lowers
 * nested filter / every / some to real inline `grep` forms) has no faithful
 * scalar lowering and used to degrade the call to its receiver.
 *
 * Pinned behavior:
 *   - Hono / CSR evaluate JS natively and render the chain faithfully.
 *   - Go template / Mojo / Xslate surface a loud BF101 (declared via each
 *     adapter's `expectedDiagnostics`) instead of a silent lossy rewrite.
 * Faithful SSR lowering for the nested callback is tracked in #2320.
 */
export const fixture = createFixture({
  id: 'filter-nested-find-predicate',
  description: 'Filter predicate containing a nested .find() callback (#2038)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Item = { id: number }
export function NestedFindPredicate() {
  const [items, setItems] = createSignal<Item[]>([])
  const [picked, setPicked] = createSignal<Item[]>([])
  return <ul>{items().filter(t => picked().find(p => p.id === t.id)).map((t, i) => <li key={i}>{t.id}</li>)}</ul>
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s1"></ul>
  `,
})

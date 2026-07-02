import { createFixture } from '../src/types'

/**
 * Filter predicate whose body contains a NESTED higher-order callback call
 * (`items().filter(t => !picked().some(p => …))`) — the #2038 repro shape
 * (thread-demo's "unreacted emojis" chain).
 *
 * The runtime evaluator refuses nested arrows (`serializeParsedExpr` → null),
 * so SSR adapters that lack a faithful nested lowering used to fall back to a
 * lambda form that silently DEGRADED the inner `.some(...)` to its receiver,
 * changing predicate semantics. This fixture pins the corrected behavior:
 *
 *   - Hono / CSR evaluate JS natively and render the chain faithfully.
 *   - Mojo lowers the nested `.some` to a real inline Perl `grep` and must
 *     match the Hono reference HTML.
 *   - Go template / Xslate have no faithful nested form and now surface a
 *     loud BF101 (declared via those adapters' `expectedDiagnostics`)
 *     instead of the silent lossy lambda.
 */
export const fixture = createFixture({
  id: 'filter-nested-callback-predicate',
  description: 'Filter predicate containing a nested .some() callback (#2038)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Item = { id: number }
export function NestedCallbackPredicate() {
  const [items, setItems] = createSignal<Item[]>([])
  const [picked, setPicked] = createSignal<Item[]>([])
  return <ul>{items().filter(t => !picked().some(p => p.id === t.id)).map((t, i) => <li key={i}>{t.id}</li>)}</ul>
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s1"></ul>
  `,
})

import { createFixture } from '../src/types'

/**
 * `/* @client *​/` twin of `filter-nested-find-predicate` (#2038, #2613).
 * The marker defers the whole chain to client evaluation, so the loop is
 * client-only: SSR renders the empty `<ul>` on EVERY adapter and no BF101
 * may fire — the SSR render helpers throw on any compile error, so this
 * fixture pins the suppression contract across the corpus without any
 * per-adapter `expectedDiagnostics` entry, same pattern as
 * `filter-nested-callback-predicate-client` (the sibling `.some()` shape).
 */
export const fixture = createFixture({
  id: 'filter-nested-find-predicate-client',
  description: 'Nested-callback (.find()) filter predicate + /* @client */ suppresses BF101 (#2038)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Item = { id: number }
export function NestedFindPredicateClient() {
  const [items, setItems] = createSignal<Item[]>([])
  const [picked, setPicked] = createSignal<Item[]>([])
  return <ul>{/* @client */ items().filter(t => picked().find(p => p.id === t.id)).map((t, i) => <li key={i}>{t.id}</li>)}</ul>
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s1"></ul>
  `,
})

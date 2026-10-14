import { createFixture } from '../src/types'

/**
 * A `.filter()` predicate calling a method no template lowers (`localeCompare`).
 * Before #3477 the Xslate / ERB / Mojolicious native predicate forms lowered
 * the call to a read of `x.localeCompare`, silently; every DSL adapter now
 * refuses it alike.
 * Hono / CSR run the callback as JS; a DSL adapter that cannot lower it
 * declares the diagnostic in its `conformancePins`.
 */
export const fixture = createFixture({
  id: 'filter-opaque-predicate',
  description: 'A `.filter()` predicate calling an unlowered method — DSL diagnostic on every adapter',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function FilterOpaquePredicate() {
  const [items, setItems] = createSignal<string[]>(['a', 'z'])
  return <p>{items().filter(x => x.localeCompare('m') > 0).join(',')}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->z<!--/--></p>
  `,
  escapes: [{ kind: 'client-directive', fixture: 'filter-opaque-predicate-client' }],
})

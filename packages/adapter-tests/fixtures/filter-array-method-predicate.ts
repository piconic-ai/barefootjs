import { createFixture } from '../src/types'

/**
 * A `.filter()` predicate built on an array / string method (`startsWith`).
 * The evaluator has no array-method surface; Xslate, ERB and Mojolicious
 * lower it through their native predicate form (a Kolon lambda, a Ruby
 * block, a Perl `grep`), the other DSL adapters refuse it.
 * Hono / CSR run the callback as JS; a DSL adapter that cannot lower it
 * declares the diagnostic in its `conformancePins`.
 */
export const fixture = createFixture({
  id: 'filter-array-method-predicate',
  description: 'A `.filter()` predicate on a string method — native on Xslate / ERB / Mojolicious, refused elsewhere',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function FilterArrayMethodPredicate() {
  const [items, setItems] = createSignal<string[]>(['ab', 'b', 'ac'])
  return <p>{items().filter(x => x.startsWith('a')).join(',')}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->ab,ac<!--/--></p>
  `,
  escapes: [{ kind: 'client-directive', fixture: 'filter-array-method-predicate-client' }],
})

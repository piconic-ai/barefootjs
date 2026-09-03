import { createFixture } from '../src/types'

/**
 * A `.map()` loop whose source is a local `const` alias of a signal
 * getter (`const items__alias = items`), not the getter called directly.
 * The only difference from an ordinary keyed loop over `items()` is the
 * alias hop.
 *
 * Regression pin for #2778: the CSR template builder resolved the alias
 * to the literal `undefined` instead of following it to the signal's
 * initializer, emitting `(undefined)().map(...)` — a guaranteed
 * `TypeError` on pure CSR mount (SSR and hydration were unaffected, since
 * only the module-scope `template:` lambda takes this path).
 */
export const fixture = createFixture({
  id: 'aliased-loop-source',
  description: 'Keyed .map() whose source is a local const alias of a signal getter',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function AliasedLoopSource() {
  const [items] = createSignal([{ id: 1, label: 'a' }, { id: 2, label: 'b' }])
  const items__alias = items
  return (
    <ul>
      {items__alias().map(it => (
        <li key={it.id}>{it.label}</li>
      ))}
    </ul>
  )
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li data-key="1"><!--bf:s0-->a<!--/--></li>
      <li data-key="2"><!--bf:s0-->b<!--/--></li>
    </ul>
  `,
})

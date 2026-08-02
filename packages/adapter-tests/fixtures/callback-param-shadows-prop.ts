import { createFixture } from '../src/types'

/**
 * A nested callback parameter (`.map((title) => …)`) sharing a
 * destructured PROP's name, inside a signal initializer and a memo
 * computation.
 *
 * `rewriteBarePropRefs` (the `_p.`-prefixing pass that makes signal /
 * memo expressions scope-sound in the module-level CSR template lambda)
 * used to collect prop references with no notion of binding scope and
 * apply them via a global word-boundary regex — so the callback's own
 * parameter got rewritten too, emitting the syntactically INVALID
 * `.map((_p.title) => _p.title.a)` into the client bundle: a parse
 * error that killed hydration for every component in the file. Fixed by
 * making both the discovery walk and the rewrite application carry a
 * binding stack (nested function-like params, block declarations, catch
 * variables), so only genuine prop references are prefixed — a mixed
 * expression like `title + items().map((title) => …)` rewrites exactly
 * the outer occurrence.
 */
export const fixture = createFixture({
  id: 'callback-param-shadows-prop',
  description: 'Nested callback param sharing a prop name stays a param in the CSR template (no invalid `_p.` rewrite)',
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'

export function CallbackParamShadowsProp({ title }: { title: string }) {
  const [items, setItems] = createSignal([{ a: 'x' }, { a: 'y' }])
  const [first] = createSignal([{ a: 'p' }].map((title) => title.a).join(','))
  const joined = createMemo(() => title + ':' + items().map((title) => title.a).join(','))
  return (
    <div>
      <span>{first()}</span>
      <output>{joined()}</output>
      <button onClick={() => setItems([...items(), { a: 'z' }])}>add</button>
    </div>
  )
}
`,
  props: { title: 'T' },
  expectedHtml: `
    <div bf-s="test">
      <span bf="s1"><!--bf:s0-->p<!--/--></span>
      <output bf="s3"><!--bf:s2-->T:x,y<!--/--></output>
      <button bf="s4">add</button>
    </div>
  `,
})

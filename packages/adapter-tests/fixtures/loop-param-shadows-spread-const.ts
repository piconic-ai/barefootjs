import { createFixture } from '../src/types'

/**
 * A `.map()` callback param shadowing a component-scope object const,
 * SPREAD onto a row element (`{items.map((attrs) => <p {...attrs}/>)}`
 * with an outer `const attrs = big ? {…} : {}`).
 *
 * The template adapters' `emitSpread` resolves a spread identifier
 * against `localConstants` before falling back to the runtime value.
 * That lookup checks the const's INITIALIZER shape but never checks
 * whether the name is loop-bound at the emission site (the same class
 * of hole #2221/#2237 closed for literal/record consts — `emitSpread`
 * was not covered). Every row therefore spreads the OUTER conditional
 * object instead of the row's own fields. The scope-precise ERB/Mojo
 * `loopBoundNames` map exists in those adapters but is not consulted
 * here either. See the audit trail in #2482.
 */
export const fixture = createFixture({
  id: 'loop-param-shadows-spread-const',
  description: '.map() param shadowing an object const spreads the row value, not the outer const',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

export function SpreadConstShadow({ items, big }: { items: { id: number; title: string }[]; big: boolean }) {
  const attrs = big ? { role: 'note' } : {}
  const [n, setN] = createSignal(0)
  return (
    <div {...attrs} data-n={n()} onClick={() => setN(n() + 1)}>
      {items.map((attrs) => (
        <p key={attrs.id} {...attrs}>x</p>
      ))}
    </div>
  )
}
`,
  props: { items: [{ id: 1, title: 'first' }, { id: 2, title: 'second' }], big: true },
  expectedHtml: `
    <div bf-s="test" bf="s1" data-n="0" role="note">
      <p bf="s0" data-key="1" id="1" title="first">x</p>
      <p bf="s0" data-key="2" id="2" title="second">x</p>
    </div>
  `,
})

import { createFixture } from '../src/types'

/**
 * Object rest destructure in a `.map()` callback with the rest spread
 * back onto the root element (`{ id, title, ...rest }` + `{...rest}`
 * on `<li>`).
 *
 * Catalog entry from #1244 (compiler-stress): "Destructured loop param —
 * `tasks.map(({ id, title, ...rest }) => …)` with rest spread back onto
 * the root". Companion to `rest-destructure-object-in-map`, which only
 * reads from `rest` as a text node — neither existing fixture exercises
 * the spread-back-to-root shape that #1244 specifically called out.
 *
 * Why a dedicated fixture: spreading the residual back onto the root
 * touches both the IIFE residual accessor (`(({ id: __bfR0, ... }) =>
 * __bfRest)(__bfItem())`) and `spreadAttrs` / `applyRestAttrs` in one
 * emit path — so a regression in either lowering shows up here. The
 * non-identifier key (`'data-priority'`) also pins the
 * `RestExcludeKey.isIdent=false` branch of the IIFE emit (the explicitly-
 * destructured `title` sibling key is identifier-named; the rest
 * residual carries `data-priority` through to the spread).
 *
 * Since #2087 the template adapters lower this shape natively: the rest
 * local binds a TRUE residual bag (an `omit`-style runtime helper / Ruby
 * `Hash#except`, subtracting the `RestExcludeKey` siblings) and the
 * existing spread-attrs pipeline emits it, so the non-identifier
 * `data-priority` key flows through each engine's quoted/attribute
 * access form. Previously refused with BF104 and pinned per adapter.
 *
 * SSR / CSR attribute-order divergence (surfaced limitation):
 * Hono SSR serializes the residual-object attributes BEFORE the
 * explicit `data-key` (`data-priority="high" tag="urgent"
 * data-key="t1"`), while the CSR template literal emits the explicit
 * attribute first followed by `${spreadAttrs(...)}` (`data-key="t1"
 * data-priority="high" tag="urgent"`). Both forms carry the same
 * attributes and produce structurally identical DOM — only the
 * serialization order differs. Same shape as the
 * `style-object-static` / `top-level-ternary` skips; the fixture is
 * therefore listed in `csr-conformance.test.ts` `skipFixtures` until
 * the two emit paths converge on JSX source order (`explicit
 * {...rest}` → explicit attrs first, then spread).
 */
export const fixture = createFixture({
  id: 'rest-destructure-object-spread-in-map',
  description: 'Object rest destructure in .map() with {...rest} on the root (#1244)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

type Task = { id: string; title: string; 'data-priority': string; tag: string }
export function RestSpread() {
  const [tasks, setTasks] = createSignal<Task[]>([
    { id: 't1', title: 'one', 'data-priority': 'high', tag: 'urgent' },
    { id: 't2', title: 'two', 'data-priority': 'low', tag: 'normal' },
  ])
  return (
    <ul onClick={() => setTasks(t => t)}>
      {tasks().map(({ id, title, ...rest }) => (
        <li key={id} {...rest}>{title}</li>
      ))}
    </ul>
  )
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s2">
      <li bf="s1" data-key="t1" data-priority="high" tag="urgent"><!--bf:s0-->one<!--/--></li>
      <li bf="s1" data-key="t2" data-priority="low" tag="normal"><!--bf:s0-->two<!--/--></li>
    </ul>
  `,
})

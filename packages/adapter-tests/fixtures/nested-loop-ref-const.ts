import { createFixture } from '../src/types'

/**
 * #2750 — a component-scope `const` referenced by a `ref` callback INSIDE a
 * nested (depth-2) `.map()` row never reaches the emitted module's preamble.
 * `computeDeclarationScopes` (compute-scope.ts) drops it as dead code because
 * `build-references.ts`'s reference graph never records `ref` edges for
 * elements reached only through `elem.innerLoops` — Phase 1's dedicated ref
 * traces (top-level elements, top-level loop bindings, conditional branches)
 * never descend that far, and the Phase 3 IR-walk safety net traced `attrs`/
 * `events` on every element but not `ref`. The emitter still emits the call
 * site regardless, so the compiled module throws `ReferenceError` the moment
 * the first inner row constructs.
 *
 * `ref` is deliberately DOM-serialization-neutral here (pushes to an array,
 * no `setAttribute`) so this fixture stays clear of #2714 (a `ref` callback's
 * DOM mutation can never run during SSR, a separate and still-open gap) —
 * this fixture's only concern is that the referenced const is DECLARED and
 * CALLABLE, not what it does once called.
 *
 * `expectedHtml` is unaffected by the fix (the bug is client-JS-emission-only
 * — SSR never runs the ref at all). The regression pin is
 * `client-js-scope.test.ts`'s automatic TS scope check over the whole fixture
 * corpus: pre-fix this fixture's emitted client JS fails to typecheck
 * (`Cannot find name 'trackMount'`); post-fix it passes with no changes
 * needed to that test file.
 */
export const fixture = createFixture({
  id: 'nested-loop-ref-const',
  description: 'a ref callback referenced inside a nested (depth-2) loop row has its declaration emitted',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function NestedRefConst() {
  const [mounted, setMounted] = createSignal<number[]>([])
  const items = [
    { id: 1, label: 'Alpha', children: [{ id: 10, label: 'Alpha-child' }] },
    { id: 2, label: 'Beta', children: [{ id: 20, label: 'Beta-child' }] },
  ]
  const trackMount = (el: Element) => {
    setMounted(prev => [...prev, Number(el.getAttribute('data-child-id'))])
  }
  return (
    <ul>
      {items.map(row => (
        <li key={row.id}>
          {row.children.map(child => (
            <span key={child.id} ref={trackMount} data-child-id={child.id}>{child.label}</span>
          ))}
        </li>
      ))}
    </ul>
  )
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s3">
      <li bf="s2" data-key="1"><span bf="s1" data-child-id="10" data-key-1="10"><!--bf:s0-->Alpha-child<!--/--></span></li>
      <li bf="s2" data-key="2"><span bf="s1" data-child-id="20" data-key-1="20"><!--bf:s0-->Beta-child<!--/--></span></li>
    </ul>
  `,
})

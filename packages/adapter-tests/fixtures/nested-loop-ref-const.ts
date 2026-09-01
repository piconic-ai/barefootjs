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
 * `items` MUST be signal-backed, not a plain literal array: a literal array
 * routes through the hoisted static-array fast path, which never splices in
 * a ref call site at ANY depth (a separate, pre-existing gap — see #2798) —
 * that path would make this fixture pass regardless of whether #2750's fix
 * is present, defeating the whole point. Only the dynamic `mapArray`/
 * row-construction path (taken for a signal-backed array) emits the ref call
 * site this fixture exists to pin.
 *
 * `ref` is a no-op here — this fixture's only concern is that the referenced
 * const is DECLARED and CALLABLE, not what it does once called, so no body
 * content (a DOM mutation, a signal write) does anything for the pin. A
 * `setAttribute`-mutating body would also entangle this with #2714 (a `ref`
 * callback's DOM mutation can never run during SSR, a separate and
 * still-open gap) for no benefit.
 *
 * `expectedHtml` is unaffected by the fix (the bug is client-JS-emission-only
 * — SSR never runs the ref at all). The regression pin is
 * `client-js-scope.test.ts`'s automatic TS scope check over the whole fixture
 * corpus: pre-fix this fixture's emitted client JS fails to typecheck
 * (`Cannot find name 'trackMount'`); post-fix it passes with no changes
 * needed to that test file. Verified both directions directly (reverting the
 * one-line `build-references.ts` fix reproduces the pre-fix failure here).
 *
 * Skipped on the Go template adapter (`render-divergences.ts`'s
 * `nested-loop-ref-const` entry) for an UNRELATED, pre-existing reason: this
 * shape's `items` signal has a nested array-of-objects field (`children`),
 * which the Go adapter's struct synthesis can't bake at all (every property
 * must be a scalar literal) — the whole `Items` field seeds `nil` and the
 * loop body renders empty regardless of this fixture's own fix. Tracked at
 * https://github.com/piconic-ai/barefootjs/issues/2800.
 */
export const fixture = createFixture({
  id: 'nested-loop-ref-const',
  description: 'a ref callback referenced inside a nested (depth-2) loop row has its declaration emitted',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function NestedRefConst() {
  const [items] = createSignal([
    { id: 1, label: 'Alpha', children: [{ id: 10, label: 'Alpha-child' }] },
    { id: 2, label: 'Beta', children: [{ id: 20, label: 'Beta-child' }] },
  ])
  const trackMount = (_el: Element) => {}
  return (
    <ul>
      {items().map(row => (
        <li key={row.id}>
          {row.children.map(child => (
            <span key={child.id} ref={trackMount}>{child.label}</span>
          ))}
        </li>
      ))}
    </ul>
  )
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s3">
      <li bf="s2" data-key="1"><span bf="s1" data-key-1="10"><!--bf:s0-->Alpha-child<!--/--></span></li>
      <li bf="s2" data-key="2"><span bf="s1" data-key-1="20"><!--bf:s0-->Beta-child<!--/--></span></li>
    </ul>
  `,
})

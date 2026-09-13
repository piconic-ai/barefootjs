import { createFixture } from '../src/types'

/**
 * A signal SETTER passed DIRECTLY (unwrapped) to a component prop
 * (`<Display update={setCount} />`) — the setter-symmetric case of
 * `component-prop-bare-getter.ts`'s #2924 bug.
 *
 * A bare (uncalled) reference to a local signal getter passed as a prop
 * compiles clean but throws a `ReferenceError` on CSR-fresh-mount: the
 * module-scope `template` lambda has no closure over the getter's
 * declaring `initXxx` function. A bare reference to the SETTER hits the
 * identical gap for a different reproduction shape — `csrSubstitute`
 * (`packages/jsx/src/ir-to-client-js/csr-substitute.ts`) had no
 * substitution entry for a signal's setter name at all, so `setCount`
 * leaked into the template the same way `count` did before the #2924 fix.
 *
 * The prop name (`update`) is deliberately NOT `on*`-prefixed — an event-
 * handler-shaped prop name (`onClick`, `onChange`, …) is filtered out of
 * the CSR template's `renderChild(...)` props literal entirely (a function
 * prop can't run during module-scope string rendering), which would dodge
 * this bug by construction rather than exercise it. `update` is an
 * ordinary data-shaped prop name that happens to carry a function value —
 * matching the reference (Hono) adapter's own SSR shim for a bare setter
 * reference (`const setCount: (...) => void = () => {}`), which is what
 * the CSR fix mirrors: `csrSubstitute` now substitutes the same noop for a
 * bare setter reference reaching template scope.
 */
export const fixture = createFixture({
  id: 'component-prop-bare-setter',
  description: 'A signal setter passed directly (unwrapped) to a non-event-shaped component prop compiles and evaluates correctly on CSR-fresh-mount (#2924)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

function Display(props: { update: () => void }) {
  return <button class="trigger" onClick={() => props.update()}>go</button>
}

export function Counter() {
  const [count, setCount] = createSignal(5)
  return (
    <div class="root">
      <span class="value">{count()}</span>
      <Display update={setCount} />
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test" class="root">
      <span bf="s1" class="value"><!--bf:s0-->5<!--/--></span>
      <button bf-s="test_s2" bf="s0" class="trigger">go</button>
    </div>
  `,
})

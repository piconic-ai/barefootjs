import { createFixture } from '../src/types'

/**
 * A signal getter passed DIRECTLY to a component prop, uncalled
 * (`<Display value={count} />`) — #2760.
 *
 * `checkBareSignalOrMemoIdentifier` (BF044, jsx-to-ir.ts) used to refuse this
 * unconditionally at its top-level check, while the structurally identical
 * `<Display value={{ v: count }} />` (see
 * `context-provider-nullish-object-fallback.ts`) passed silently — the walk
 * only ever tested `expr`'s own top-level node, so wrapping the exact same
 * accessor in an object literal was enough to dodge the gate. Both forms are
 * this codebase's deliberate Context-Provider idiom: the child owns *when*
 * to call the accessor, so it can subscribe reactively at its own read site
 * instead of the value being frozen at the parent's render time. #2760
 * settled the asymmetry by gating BF044's entire check — top level included —
 * on whether the position is genuinely RENDERED (a DOM attribute, a JSX text
 * child), which a component prop never is.
 *
 * `Display` reads `props.value()` inside its own JSX text child — a rendered
 * position from `Display`'s point of view — proving the accessor reaches the
 * child uncalled and the child's own call site is what makes it reactive
 * (the client JS wraps that read in `createEffect`, matching how the
 * Context-Provider idiom's consumers already read their accessor props).
 */
export const fixture = createFixture({
  id: 'component-prop-bare-getter',
  description: 'A signal getter passed directly (unwrapped) to a component prop compiles, matching the already-legal object-literal-wrapped form (#2760)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

function Display(props: { value: () => number }) {
  return <span class="value">{props.value()}</span>
}

export function Counter() {
  const [count, setCount] = createSignal(5)
  return (
    <div class="root">
      <Display value={count} />
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test" class="root"><span bf-s="test_s0" bf="s1" class="value"><!--bf:s0-->5<!--/--></span></div>
  `,
})

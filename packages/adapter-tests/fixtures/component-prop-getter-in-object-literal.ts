import { createFixture } from '../src/types'

/**
 * A signal getter wrapped in an object literal passed to a component prop
 * (`<Display value={{ v: count }} />`) — the already-legal object-literal-
 * wrapped shape of the Context-Provider idiom (see
 * `context-provider-nullish-object-fallback.ts`), exercised directly on an
 * ordinary component prop rather than through `Context.Provider`.
 *
 * Companion to `component-prop-bare-getter.ts` (the DIRECT, unwrapped
 * shape): both reproduced the same #2924 `ReferenceError` on CSR-fresh-
 * mount before the fix — `csrSubstitute`'s object-literal-value branch
 * inherited the bare-identifier gap since it had no `identifier`-kind
 * substitution registered for a signal getter's name. Kept as its own
 * fixture (not folded into `component-prop-bare-getter.ts`) because
 * #2924's own reproduction notes the wrapped and unwrapped forms are
 * independent emission paths in `html-template.ts`'s `component` case (an
 * object-literal prop value vs. a bare-identifier prop value) that happened
 * to share the same underlying `csrSubstitute` gap — a fixture per emission
 * path, per this repo's fixture-per-defect convention.
 *
 * Deliberately does NOT also exercise the shorthand form
 * (`<Display value={{ count }} />`): that hits a separate, pre-existing,
 * getter-unrelated limitation — the Mojolicious (EP) adapter's expression
 * lowering refuses ANY shorthand object-literal property outright
 * ("Expression not supported: { count }"), reproducible with a plain
 * string prop and no signal involved at all. Out of scope for #2924; the
 * shorthand REWRITE itself (the part #2924 actually touches) is pinned at
 * the compiler-unit level in `csr-substitute-bare-getter.test.ts` instead
 * ("a bare reference in shorthand-property position substitutes to a
 * thunk, keyed correctly"), which doesn't require cross-adapter SSR
 * conformance.
 */
export const fixture = createFixture({
  id: 'component-prop-getter-in-object-literal',
  description: 'A signal getter wrapped in an object literal passed to a component prop compiles and evaluates correctly on CSR-fresh-mount (#2924)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

function Display(props: { value: { v: () => number } }) {
  return <span class="wrapped">{props.value.v()}</span>
}

export function Counter() {
  const [count, setCount] = createSignal(5)
  return (
    <div class="root">
      <Display value={{ v: count }} />
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test" class="root"><span bf-s="test_s0" bf="s1" class="wrapped"><!--bf:s0-->5<!--/--></span></div>
  `,
})

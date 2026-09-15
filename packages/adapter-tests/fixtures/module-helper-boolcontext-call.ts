import { createFixture } from '../src/types'

/**
 * #3012: a module-scope helper called from inside a boolean-TEST position
 * (here, a ternary's `test`) — not `isValidElement`, and not a plain text
 * position (`module-const-arrow-helper` / `module-function-helper-chain`
 * already pin that shape).
 *
 * #3011 taught each non-JS adapter's `call()` fallback to refuse a
 * bare-name call to an unresolvable identifier with BF101 (#2994) —
 * except when the call's return value is only ever consumed for
 * truthiness (`_boolContext`), an exemption carved out so `ui/components/
 * ui/slot`'s `isValidElement(children)` guard kept compiling on six
 * adapters (ERB, Jinja, minijinja/Rust, Twig, Blade, Text::Xslate) with no
 * dedicated shape-check primitive at the time. That exemption was scoped
 * by STRUCTURAL POSITION (any call inside a condition/ternary-test/
 * unary-`!` operand), not by CALLEE IDENTITY — so a call to any OTHER
 * helper from a boolean-test position silently kept the pre-#3011 broken
 * fallback (undefined-variable semantics, typically falsy) instead of the
 * BF101 refusal a same-position `isValidElement` call is exempted from
 * for a documented reason.
 *
 * #3012 closed this gap for all six adapters (Text::Xslate first, then
 * ERB / Jinja / minijinja(Rust) / Twig / Blade): each now resolves
 * `isValidElement` as an identity-scoped `templatePrimitive` ahead of
 * `call()`'s generic fallback, and the `_boolContext` structural
 * exemption is removed entirely — every OTHER bare-name call refuses with
 * BF101 regardless of position, same as this fixture pins.
 *
 * Seeds are chosen so the correct result (Hono, real JS execution) and
 * the broken fallback's result diverge visibly: `isLong('hello')` is
 * true, so the correct render picks the ternary's CONSEQUENT ('long').
 * The broken fallback resolves the unrecognised `isLong` name to
 * nil/undef (falsy) and would silently pick the ALTERNATE ('short')
 * instead — same technique `condition-position-ternary` uses.
 */
export const fixture = createFixture({
  id: 'module-helper-boolcontext-call',
  description: 'A module-scope helper called from a ternary boolean-test position (#3012)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

function isLong(s: string) { return s.length > 3 }

export function Widget({ label }: { label: string }) {
  const [count, setCount] = createSignal(0)
  return (
    <div>
      <span title={isLong(label) ? 'long' : 'short'}>{label}</span>
      <button onClick={() => setCount(count() + 1)}>{count()}</button>
    </div>
  )
}
`,
  props: { label: 'hello' },
  expectedHtml: `
    <div bf-s="test">
      <span bf="s1" title="long"><!--bf:s0-->hello<!--/--></span>
      <button bf="s3"><!--bf:s2-->0<!--/--></button>
    </div>
  `,
})

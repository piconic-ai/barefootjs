import { createFixture } from '../src/types'

/**
 * A body-destructured prop whose default is an arrow function (`const {
 * fmt = (v) => 'v' + v } = props`) — #2940.
 *
 * `collectConstant`'s body-destructure branch (`analyzer.ts`) used to build
 * the local's `value` as a bare `props.fmt ?? (v) => 'v' + v`, unlike the
 * PARAMETER-destructured sibling form (`function Foo({ fmt = (v) => ... })`),
 * which already parenthesized the default via `ParamInfo.defaultContainsArrow`
 * (`propReadFallback`, `props-binding.ts`). `??`'s right operand may not be a
 * bare arrow function without parens, so this was a genuine `SyntaxError` in
 * every output that splices `ConstantInfo.value` verbatim — the client-JS
 * init body AND the Hono SSR component, since the reference adapter reuses
 * the same string. `renderCsrComponent` (`csr-render.ts`) `import()`s the
 * whole compiled client module, so pre-fix this fixture's CSR leg failed
 * with a `SyntaxError` at import time; post-fix it imports and renders
 * cleanly. Hono is correct by construction here, so `expectedHtml` is
 * generated from it unmodified.
 *
 * `fmt` is read from an event handler (not a top-level reactive position) so
 * the fixture also pins that the bug isn't limited to the "gets inlined into
 * a `createEffect`" shape — a handler-scoped read needs the SAME declaration
 * fixed.
 *
 * Named `ArrowDefaultFmt`, not `Child` — the compiled `init<Name>` function
 * for a component literally named `Child` collides with the CSR conformance
 * harness's own `initChild` shim (`csr-render.ts`), the same class of
 * reserved-identifier collision `body-destructured-prop-default-renamed`
 * avoids the same way.
 */
export const fixture = createFixture({
  id: 'body-destructured-prop-default-arrow',
  description: 'A body-destructured prop default that is an arrow function compiles to valid JS (#2940)',
  source: `
"use client"
import { createSignal } from "@barefootjs/client"
function ArrowDefaultFmt(props: { fmt?: (v: number) => string }) {
  const { fmt = (v) => 'v' + v } = props
  const [label, setLabel] = createSignal('none')
  return <button class="fmt" onClick={() => setLabel(fmt(1))}>{label()}</button>
}
export { ArrowDefaultFmt }
`,
  props: {},
  expectedHtml: `
    <button bf-s="test" bf="s1" class="fmt"><!--bf:s0-->none<!--/--></button>
  `,
})

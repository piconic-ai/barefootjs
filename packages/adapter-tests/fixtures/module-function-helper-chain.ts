import { createFixture } from '../src/types'

/**
 * #3000: the function-declaration analog of `module-const-arrow-helper`'s
 * #2988 fix. A module-top-level `function` helper that calls ANOTHER
 * module-top-level `function` helper (not itself, not any component-scope
 * name) is safe to reference from the CSR template lambda by bare name —
 * `compute-scope.ts`'s forward-reachability fixpoint places both `inner`
 * and `fmt` at module scope, since neither transitively references
 * anything actually `init`-scoped (props, signals, component locals).
 *
 * Before the fix, `compute-inlinability.ts` classified a module-scope
 * function unsafe if it referenced ANY name in `graph.declaredNames` —
 * every local const/function/signal/prop — not just names that are
 * themselves unsafe. `fmt` referencing `inner` (itself a safe
 * module-scope helper) tripped that check, so the CSR-emitted template
 * lambda substituted `${''}` for the `fmt(label)` slot instead of
 * referencing `fmt` by name. SSR (the reference Hono adapter, real JS
 * execution) was never affected — only the CSR template-lambda string
 * this fixture's CSR-conformance counterpart exercises.
 */
export const fixture = createFixture({
  id: 'module-function-helper-chain',
  description: 'Module-level function helper calling another module-level function helper is referenced by name from the CSR template lambda (#3000)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

function inner(s: string) { return s.toUpperCase() }
function fmt(s: string) { return inner(s) }

export function Widget({ label }: { label: string }) {
  const [count, setCount] = createSignal(0)
  return (
    <div>
      <span>{fmt(label)}</span>
      <button onClick={() => setCount(count() + 1)}>{count()}</button>
    </div>
  )
}
`,
  props: { label: 'hi' },
  expectedHtml: `
    <div bf-s="test">
      <span bf="s1"><!--bf:s0-->HI<!--/--></span>
      <button bf="s3"><!--bf:s2-->0<!--/--></button>
    </div>
  `,
})

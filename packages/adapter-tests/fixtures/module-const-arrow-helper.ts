import { createFixture } from '../src/types'

/**
 * #2988: a module-top-level helper declared as `const name = (params) =>
 * expr` (arrow form) that closes over nothing but its own parameters is
 * safe to reference from the CSR template lambda by bare name — same as
 * the equivalent `function name(params) { ... }` declaration form
 * (`module-helper-async.ts` exercises that sibling shape for the async
 * case). Before the fix, `compute-inlinability.ts` classified EVERY
 * arrow-valued constant `arrow-literal` unconditionally, regardless of
 * `isModule` — so the CSR-emitted template lambda substituted `${''}`
 * for the `fmt(label)` slot instead of referencing `fmt` by name. SSR
 * (the reference Hono adapter, real JS execution) was never affected —
 * only the CSR template-lambda string this fixture's CSR-conformance
 * counterpart exercises.
 */
export const fixture = createFixture({
  id: 'module-const-arrow-helper',
  description: 'Module-level arrow-valued const helper applied to a prop is referenced by name from the CSR template lambda (#2988)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

const fmt = (s: string) => s.toUpperCase()

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

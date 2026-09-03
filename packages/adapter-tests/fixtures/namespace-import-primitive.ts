import { createFixture } from '../src/types'

/**
 * #2771 — a reactive primitive invoked through a namespace import
 * (`import * as bf from '@barefootjs/client'`, `bf.createSignal(...)`)
 * compiled with ZERO diagnostics before this fixture's fix landed:
 * `resolvePrimitiveKind`'s fast path only matches a bare identifier
 * callee, and its checker-based slow path (which DOES resolve this
 * shape) only runs when a shared `ts.Program` is supplied
 * (`CompileOptions.program`) — this compile has none. The declaration
 * was silently dropped from `ctx.signals`, so the compiled client JS
 * never declared `n`/`setN` while every reference to them survived,
 * throwing `ReferenceError` at hydrate.
 *
 * Refused loudly instead (BF013), fired in the shared analyzer pass
 * ahead of any adapter's `adapter.generate()` — mirrors
 * `jsx-element-prop-ternary`'s reasoning, so all nine adapters
 * (including Hono) pin this identically in their own
 * `conformance-pins.ts`.
 *
 * IMPORTANT for anyone editing this fixture: it must stay free of
 * `.map(`, `createSelector`, and `@barefootjs/form` — any of those makes
 * the compiler's `needsTypeBasedDetection` build a per-file `ts.Program`
 * for OTHER reasons, which would make the checker's slow path resolve
 * this shape correctly and the pinned BF013 refusal would stop firing.
 *
 * `escapes` twin: `namespace-import-primitive-named-escape` — the SAME
 * component with the primitive imported by name instead of through the
 * namespace, which resolves via the ordinary fast path.
 */
export const fixture = createFixture({
  id: 'namespace-import-primitive',
  description: 'A reactive primitive called through a namespace import refuses with BF013',
  source: `
'use client'
import * as bf from '@barefootjs/client'
export function NamespaceImportPrimitive() {
  const [count, setCount] = bf.createSignal(0)
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>
}
`,
  escapes: [{ kind: 'rewrite', fixture: 'namespace-import-primitive-named-escape' }],
})

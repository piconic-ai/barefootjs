import { createFixture } from '../src/types'

/**
 * Branch-local higher-order chain at an attribute position
 * (#1421 / #1443).
 *
 * Mirrors the scaffold `Slot` shape: `const merged = [a, b].filter(Boolean)
 * .join(' ')` declared inside an `if (...)` branch, then referenced at a
 * JSX attribute. Branch-local inlining (#1415) substitutes the chain's
 * RHS into the attribute position, so the adapter receives the full
 * higher-order expression to translate.
 *
 * Lowering strategy per adapter (#1443):
 *
 *   - Hono / CSR: inline verbatim — the JS runtime evaluates it.
 *   - Mojo: array literal → Perl array ref, `.filter(Boolean)` →
 *     `grep { $_ }`, `.join(' ')` → `join(' ', @{...})`.
 *   - Go templates: array literal → `bf_arr`, `.filter(Boolean)` →
 *     `bf_filter_truthy`, `.join(' ')` → `bf_join`.
 *
 * All three adapters render the registry `<Slot>` / `<Button>`
 * server-side without the `@client` escape hatch.
 *
 * Pre-#1421 regression that the in-flight guard locks in: the Mojo
 * `convertHigherOrderExpr` ↔ unsupported-emitter loop had no
 * terminator and crashed `bf build` with a Node stack overflow before
 * this fixture's compile finished. With #1443 the chain succeeds
 * cleanly so the guard isn't exercised here anymore — the guard
 * still protects against other unsupported shapes.
 */
export const fixture = createFixture({
  id: 'branch-local-filter-join',
  description: 'Branch-local .filter(Boolean).join() chain inlined at an attribute',
  source: `
function BranchLocalFilterJoin({ on, label }: { on?: boolean; label?: string }) {
  if (on) {
    const merged = [label, 'extra'].filter(Boolean).join(' ')
    return <div className={merged}>x</div>
  }
  return <div>fallback</div>
}
export { BranchLocalFilterJoin }
`,
  expectedHtml: `
    <div bf-s="test">fallback</div>
  `,
})

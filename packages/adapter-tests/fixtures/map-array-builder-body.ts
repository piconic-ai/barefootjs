import { createFixture } from '../src/types'

/**
 * An imperative array-builder `.map()` body — `{ const out = []; for (const c
 * of r.cells) out.push(<td>{c}</td>); return <tr key={r.id}>{out}</tr> }`.
 * Stage 3 / D4 of `spec/callback-fidelity.md`: a JS-runtime adapter runs the
 * callback body verbatim — each JSX leaf lowers to a template-literal HTML
 * string, the imperative control flow runs as-is, and the `{out}` element-array
 * child is joined into the row — so SSR, hydration, and CSR all render the cells
 * faithfully. The loop key is hoisted (D5): `key={r.id}` is derived from the raw
 * item, evaluated before the body runs.
 *
 * Adapter-gated, like the const-preamble branch body and the off-subset
 * filter/sort predicates:
 *   - Hono / CSR run it; the reference `expectedHtml` renders the cells.
 *   - DSL adapters (Go, Perl, Ruby, PHP, Rust, Python) surface BF021; marking
 *     the map client-only (`/* @client *\/`) defers the whole loop to the
 *     browser, which runs the same verbatim body. Verified, not merely
 *     asserted (#2613): `map-array-builder-body-client` is declared below as
 *     the `escapes` twin and passes real execution — `csr-conformance.test.ts`
 *     (CSR template renders the empty host) and every DSL adapter's own
 *     conformance suite (compiles clean, zero diagnostics) — so all 8 DSL
 *     adapters' `unescapable` pins for this fixture have been removed.
 */
export const fixture = createFixture({
  id: 'map-array-builder-body',
  description: 'imperative array-builder .map() body — JS-runtime verbatim, DSL refuses (BF021)',
  source: `
function TableBuilder({ rows }: { rows: { id: string; cells: string[] }[] }) {
  return (
    <table>
      <tbody>
        {rows.map((r) => {
          const out = []
          for (const c of r.cells) out.push(<td>{c}</td>)
          return <tr key={r.id}>{out}</tr>
        })}
      </tbody>
    </table>
  )
}
export { TableBuilder }
`,
  props: { rows: [{ id: '1', cells: ['a', 'b'] }, { id: '2', cells: ['c', 'd'] }] },
  expectedHtml: `
    <table bf-s="test"><tbody bf="s1"><tr data-key="1"><!--bf:s0--><td>a</td><td>b</td><!--/--></tr><tr data-key="2"><!--bf:s0--><td>c</td><td>d</td><!--/--></tr></tbody></table>
  `,
  escapes: [{ kind: 'client-directive', fixture: 'map-array-builder-body-client' }],
})

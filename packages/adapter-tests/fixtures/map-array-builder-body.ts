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
 *   - DSL adapters (Go, Perl, Ruby, PHP, Rust, Python) surface BF021 with the
 *     `/* @client *\/` escape (declared via each adapter's `conformancePins`);
 *     marking the map client-only defers the whole loop to the browser, which
 *     runs the same verbatim body.
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
    <table bf-s="test"><tbody bf="s0"><tr data-key="1"><td>a</td><td>b</td></tr><tr data-key="2"><td>c</td><td>d</td></tr></tbody></table>
  `,
})

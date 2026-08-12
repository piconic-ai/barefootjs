import { createFixture } from '../src/types'

/**
 * SSR/CSR escaping parity for array-builder leaves (Stage 3 root cure,
 * `spec/callback-fidelity.md`). A JSX-runtime SSR adapter auto-escapes the
 * leaf's text interpolation (`{c}`); the client's HTML-string lowering must
 * escape the same positions (`escapeText`, applied once inside
 * `renderPreamble`'s leaf door) or special characters in cell data would parse
 * as markup on the client while rendering as text at SSR — a hydration-visible
 * divergence. Cells here carry `<`, `&`, and quotes to pin byte parity.
 *
 * DSL adapters refuse the array-builder shape itself (BF021, pinned via
 * `map-array-builder-body`); this fixture rides the same gate, so it
 * declares `map-array-builder-body`'s own `escapes` twin
 * (`map-array-builder-body-client`) rather than a dedicated one — the
 * gate being suppressed is the only claim either fixture's `escapes`
 * needs to verify; the escaping props (special characters in cell text)
 * are an SSR-only concern this client-only twin never reaches (SSR
 * renders nothing once deferred). Verified against real suites, not
 * merely asserted (#2613): see `map-array-builder-body`'s docstring.
 */
export const fixture = createFixture({
  id: 'map-array-builder-escaping',
  description: 'special characters in array-builder leaf text escape identically at SSR and CSR',
  source: `
function EscapeTable({ rows }: { rows: { id: string; cells: string[] }[] }) {
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
export { EscapeTable }
`,
  props: {
    rows: [
      { id: '1', cells: ['<b>bold</b>', 'a & b'] },
      { id: '2', cells: ['"quoted"', "it's"] },
    ],
  },
  expectedHtml: `
    <table bf-s="test"><tbody bf="s1"><tr data-key="1"><!--bf:s0--><td>&lt;b&gt;bold&lt;/b&gt;</td><td>a &amp; b</td><!--/--></tr><tr data-key="2"><!--bf:s0--><td>&quot;quoted&quot;</td><td>it&#39;s</td><!--/--></tr></tbody></table>
  `,
  escapes: [{ kind: 'client-directive', fixture: 'map-array-builder-body-client' }],
})

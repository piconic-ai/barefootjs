import { createFixture } from '../src/types'

/**
 * `/* @client *​/` twin of `map-array-builder-body` (#2613). Marking the
 * `.map()` call client-only defers the WHOLE loop — the imperative
 * `const out = []; for (...) out.push(<td>{c}</td>); return <tr>{out}</tr>`
 * preamble included — to the browser, where a JS runtime (always present
 * client-side) runs the exact same verbatim body. SSR renders the loop
 * host empty on every backend (Hono included — `isClientOnly` short-
 * circuits the same way a signal-gated `/* @client *\/` would), so this
 * pins the suppression contract across the DSL corpus without a
 * per-adapter `expectedDiagnostics` entry, the same pattern as
 * `filter-nested-find-predicate-client`.
 *
 * `map-array-builder-escaping` declares this same fixture as ITS
 * `escapes` twin rather than getting a dedicated one — its own docstring:
 * "DSL adapters refuse the array-builder shape itself (BF021, pinned via
 * `map-array-builder-body`); this fixture rides the same gate." Both
 * fixtures are refused by the identical BF021 site (the array-builder
 * preamble check in `jsx-to-ir.ts`); the escaping fixture only varies the
 * PROPS (special characters in cell text) exercised at SSR, which this
 * client-only twin never reaches (SSR renders nothing — escaping is a
 * browser-side concern once deferred). A second near-duplicate twin would
 * assert nothing about escaping that this one doesn't already cover: the
 * gate being suppressed is the only claim either fixture's `escapes`
 * needs to verify.
 */
export const fixture = createFixture({
  id: 'map-array-builder-body-client',
  description: 'Array-builder .map() body deferred to the client via /* @client */ — DSL BF021 suppressed',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function TableBuilderClient() {
  const [rows, setRows] = createSignal<{ id: string; cells: string[] }[]>([])
  return (
    <table>
      <tbody>
        {/* @client */ rows().map((r) => {
          const out = []
          for (const c of r.cells) out.push(<td>{c}</td>)
          return <tr key={r.id}>{out}</tr>
        })}
      </tbody>
    </table>
  )
}
export { TableBuilderClient }
`,
  expectedHtml: `
    <table bf-s="test"><tbody bf="s1"></tbody></table>
  `,
})

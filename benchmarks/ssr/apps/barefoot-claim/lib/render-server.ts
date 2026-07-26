/**
 * Server render entry for the barefoot-claim Stage 0 spike.
 *
 * Reuses the REAL barefoot SSR pipeline (../../barefoot/lib/render-server.ts
 * — compileJSX + HonoAdapter + renderToHtml, see that file's docstring) to
 * produce byte-identical row HTML for the given rows, then applies the
 * marker-elision transform (./strip-markers.ts) that a claim-once hydrator
 * would let the compiler skip emitting in the first place. This is an
 * honest per-call render + strip, not a cached/static read, so the n=20
 * server-render timing bench-ssr.ts runs is a real (if slightly inflated
 * by the extra regex pass) measurement — see the spike report's caveats.
 */
import { renderPage as renderBarefootPage, type RowData } from '../../barefoot/lib/render-server.ts'
import { stripMarkers } from './strip-markers.ts'

export type { RowData }

export async function renderPage(rows: RowData[]): Promise<string> {
  const html = await renderBarefootPage(rows)
  return stripMarkers(html)
}

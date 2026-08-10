/**
 * SSR render-gap investigation, Part A hypothesis 1 (is solid rendering
 * the same document?) — NOT part of the product.
 *
 * Renders all three frameworks' real renderPage(rows) and compares more
 * than the harness's existing `<tr ` count sanity check (bench-ssr.ts
 * ~line 373): row count, per-row [id, label] content in order (comments/
 * hydration markers stripped so barefoot's extra markup doesn't break
 * extraction), and total visible id+label character count.
 *
 * Usage: bun benchmarks/ssr/measure-structural-parity.ts
 *
 * Finding: 1000/1000 rows match exactly across all three frameworks (zero
 * content mismatches, identical total char count: 20953). The three HTML
 * documents differ only in per-row markup overhead (attributes, hydration
 * markers, the bf-p payload) — never in the actual data rendered. See
 * measure-props-cost.ts for where that markup overhead comes from.
 */
import { join } from 'node:path'
import rows from './data.json'

const appsRoot = join(import.meta.dirname, 'apps')
const RENDER_SERVER_MODULE: Record<string, string> = {
  react: join(appsRoot, 'react', 'src', 'render-server.tsx'),
  solid: join(appsRoot, 'solid', 'src', 'render-server.ts'),
  barefoot: join(appsRoot, 'barefoot', 'lib', 'render-server.ts'),
}

async function getHtml(fw: string): Promise<string> {
  const mod = (await import(RENDER_SERVER_MODULE[fw])) as { renderPage: (rows: unknown) => Promise<string> }
  return mod.renderPage(rows)
}

function extractRows(html: string): Array<[string, string]> {
  const out: Array<[string, string]> = []
  const trChunks = html.split('<tr').slice(1)
  for (const rawChunk of trChunks) {
    const chunk = rawChunk.replace(/<!--.*?-->/g, '')
    const idMatch = chunk.match(/<td class="col-md-1"[^>]*>(\d+)/)
    const labelMatch = chunk.match(/<a class="lbl"[^>]*>([^<]*)<\/a>/)
    if (idMatch && labelMatch) out.push([idMatch[1], labelMatch[1]])
  }
  return out
}

const results: Record<string, Array<[string, string]>> = {}
for (const fw of ['react', 'solid', 'barefoot']) {
  const html = await getHtml(fw)
  results[fw] = extractRows(html)
  console.log(`${fw}: ${results[fw].length} rows extracted, ${html.length} chars total`)
}

const [r, s, b] = [results.react, results.solid, results.barefoot]
console.log('row counts match:', r.length === s.length && s.length === b.length, r.length, s.length, b.length)

let mismatches = 0
for (let i = 0; i < r.length; i++) {
  if (r[i][0] !== s[i][0] || r[i][0] !== b[i][0] || r[i][1] !== s[i][1] || r[i][1] !== b[i][1]) {
    mismatches++
    if (mismatches <= 5) console.log(`MISMATCH at row ${i}:`, r[i], s[i], b[i])
  }
}
console.log('total content mismatches:', mismatches, 'of', r.length)

const totalText = (arr: Array<[string, string]>) => arr.reduce((sum, [id, label]) => sum + id.length + label.length, 0)
console.log('total id+label char count — react:', totalText(r), 'solid:', totalText(s), 'barefoot:', totalText(b))

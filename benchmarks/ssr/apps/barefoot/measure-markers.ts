/**
 * Part 4 measurement script (issue #2483 investigation) — NOT part of the
 * product. Compiles benchmarks/ssr/apps/barefoot/components/BenchSsr.tsx
 * with the real compiler + Hono adapter (same path as
 * benchmarks/ssr/apps/barefoot/lib/render-server.ts), renders the
 * 1,000-row SSR HTML with the same shape/data profile as the SSR+hydration
 * bench, and counts marker bytes to quantify how much of the HTML-size gap
 * general-case elision could close.
 */
import { compileJSX } from '@barefootjs/jsx'
import { HonoAdapter } from '@barefootjs/hono/adapter'
import { renderToHtml } from '@barefootjs/hono/render'
import { readFileSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Requires the same workspace node_modules symlinks
// benchmarks/ssr/apps/barefoot/build.ts's `ensureWorkspaceLinks()` sets up
// (this app is intentionally not a workspace member) — run that first, or
// `bun run build` in this directory, if `@barefootjs/*` fails to resolve.
const APP_DIR = dirname(fileURLToPath(import.meta.url))
const COMPONENT_SRC = join(APP_DIR, 'components', 'BenchSsr.tsx')

interface RowData {
  id: number
  label: string
}

const adjectives = [
  'pretty', 'large', 'big', 'small', 'tall', 'short', 'long', 'handsome',
  'plain', 'quaint', 'clean', 'elegant', 'easy', 'angry', 'crazy', 'helpful',
  'mushy', 'odd', 'unsightly', 'adorable', 'important', 'inexpensive',
  'cheap', 'expensive', 'fancy',
]
const colours = [
  'red', 'yellow', 'blue', 'green', 'pink', 'brown', 'purple', 'brown',
  'white', 'black', 'orange',
]
const nouns = [
  'table', 'chair', 'house', 'bbq', 'desk', 'car', 'pony', 'cookie',
  'sandwich', 'burger', 'pizza', 'mouse', 'keyboard',
]
let nextId = 1
function random(max: number): number {
  return Math.round(Math.random() * 1000) % max
}
function buildData(count: number): RowData[] {
  const data: RowData[] = new Array(count)
  for (let i = 0; i < count; i++) {
    data[i] = {
      id: nextId++,
      label: `${adjectives[random(adjectives.length)]} ${colours[random(colours.length)]} ${nouns[random(nouns.length)]}`,
    }
  }
  return data
}

async function main() {
  const source = readFileSync(COMPONENT_SRC, 'utf8')
  const result = compileJSX(source, 'BenchSsr.tsx', { adapter: new HonoAdapter() })
  const errors = result.errors.filter((e: any) => e.severity === 'error')
  if (errors.length > 0) {
    console.error('Compile errors:', errors)
    process.exit(1)
  }
  const markedTemplate = result.files.find((f) => f.type === 'markedTemplate')
  if (!markedTemplate) throw new Error('no markedTemplate')

  const tempFile = join('/tmp', `bf-measure-${Date.now()}.tsx`)
  const code = `/** @jsxImportSource hono/jsx */\n${markedTemplate.content}`
  await Bun.write(tempFile, code)
  let component: any
  try {
    const mod = await import(tempFile)
    component = mod.BenchSsr
  } finally {
    unlinkSync(tempFile)
  }

  const rows = buildData(1000)
  const node = component({ initialRows: rows, __instanceId: 'BenchSsr_bench', __bfChild: false })
  const html = await renderToHtml(node)

  console.log('=== Total HTML size ===')
  console.log('raw bytes:', Buffer.byteLength(html, 'utf8'))

  // Marker accounting -------------------------------------------------
  const markerRe = /<!--bf:([a-zA-Z0-9_-]+)-->|<!--\/-->/g
  let markerBytes = 0
  let markerCount = 0
  let m: RegExpExecArray | null
  while ((m = markerRe.exec(html))) {
    markerBytes += m[0].length
    markerCount++
  }
  console.log('marker comment count:', markerCount, '(expect ~4000 for 1000 rows x 2 slots x begin/end)')
  console.log('marker comment bytes:', markerBytes)

  // bf="sN" attribute accounting (element-identity slots, NOT comment
  // markers — separate axis, not eligible for THIS elision mechanism)
  const bfAttrRe = /\sbf="[a-zA-Z0-9_-]+"/g
  let bfAttrBytes = 0
  let bfAttrCount = 0
  while ((m = bfAttrRe.exec(html))) {
    bfAttrBytes += m[0].length
    bfAttrCount++
  }
  console.log('bf="sN" attr count:', bfAttrCount, 'bytes:', bfAttrBytes)

  // bf-p prop-carrier attribute accounting (separate known cost, not
  // marker-related — for context only)
  const bfPRe = /\sbf-p="[^"]*"/g
  let bfPBytes = 0
  while ((m = bfPRe.exec(html))) {
    bfPBytes += m[0].length
  }
  console.log('bf-p attr bytes (props payload):', bfPBytes)

  // Per-row marker cost, and the freeze-after-first eligible subset.
  // Row shape: <tr bf="sN" className=...><td>{row.id}</td><td><a>{row.label}</a></td><td>x</td><td></td></tr>
  // Each of {row.id} and {row.label} is the SOLE child of its containing
  // static element -> both are structurally the FIRST (and only)
  // reactive/opaque-width child at their level -> both would be eligible
  // under the generalized freeze-after-first rule (own marker dropped, no
  // later sibling in the same scope to lose a path over).
  const perRowMarkerBytes = markerBytes / 1000
  console.log('\n=== Per-row accounting ===')
  console.log('marker bytes per row (avg):', perRowMarkerBytes.toFixed(2))
  console.log('naive fully-eligible marker bytes (both slots elided):', markerBytes, `(${(markerBytes/1024).toFixed(1)}KB)`)

  console.log('\n=== Sample row HTML ===')
  const tbodyIdx = html.indexOf('<tbody')
  console.log(html.slice(tbodyIdx, tbodyIdx + 400))
}

main()

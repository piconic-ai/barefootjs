/**
 * Part 4 follow-up (issue #2483 investigation) — NOT part of the product.
 * Empirically checks whether removing marker comment bytes from the
 * 1,000-row SSR HTML actually reduces GZIP size proportionally, or whether
 * (per spec/slot-unification.md §3(b)'s Stage 0 precedent — raw -54.7KB but
 * only -0.6KB gzip) the highly repetitive comment pattern mostly disappears
 * under compression already.
 */
import { compileJSX } from '@barefootjs/jsx'
import { HonoAdapter } from '@barefootjs/hono/adapter'
import { renderToHtml } from '@barefootjs/hono/render'
import { readFileSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

// See measure-markers.ts's docstring re: workspace symlinks.
const APP_DIR = dirname(fileURLToPath(import.meta.url))
const COMPONENT_SRC = join(APP_DIR, 'components', 'BenchSsr.tsx')

interface RowData { id: number; label: string }
const adjectives = ['pretty','large','big','small','tall','short','long','handsome','plain','quaint','clean','elegant','easy','angry','crazy','helpful','mushy','odd','unsightly','adorable','important','inexpensive','cheap','expensive','fancy']
const colours = ['red','yellow','blue','green','pink','brown','purple','brown','white','black','orange']
const nouns = ['table','chair','house','bbq','desk','car','pony','cookie','sandwich','burger','pizza','mouse','keyboard']
let nextId = 1
function random(max: number) { return Math.round(Math.random() * 1000) % max }
function buildData(count: number): RowData[] {
  const data: RowData[] = new Array(count)
  for (let i = 0; i < count; i++) {
    data[i] = { id: nextId++, label: `${adjectives[random(adjectives.length)]} ${colours[random(colours.length)]} ${nouns[random(nouns.length)]}` }
  }
  return data
}

async function main() {
  const source = readFileSync(COMPONENT_SRC, 'utf8')
  const result = compileJSX(source, 'BenchSsr.tsx', { adapter: new HonoAdapter() })
  const markedTemplate = result.files.find((f) => f.type === 'markedTemplate')!
  const tempFile = join('/tmp', `bf-measure-gzip-${Date.now()}.tsx`)
  await Bun.write(tempFile, `/** @jsxImportSource hono/jsx */\n${markedTemplate.content}`)
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

  // Simulate full elision of the two per-row text slots: strip
  // <!--bf:sN--> and <!--/--> comment pairs (the only markers this row
  // shape emits, per measure-markers.ts). This is a POST-HOC string strip
  // for measurement purposes only — NOT how a real implementation would
  // produce markerless output (it would never emit them), but byte-for-byte
  // equivalent to what real elision output would look like for this shape.
  const stripped = html.replace(/<!--bf:s\d+-->/g, '').replace(/<!--\/-->/g, '')

  const rawFull = Buffer.byteLength(html, 'utf8')
  const rawStripped = Buffer.byteLength(stripped, 'utf8')
  const gzipFull = gzipSync(Buffer.from(html, 'utf8'), { level: 9 }).byteLength
  const gzipStripped = gzipSync(Buffer.from(stripped, 'utf8'), { level: 9 }).byteLength

  console.log('raw bytes: full =', rawFull, ' stripped =', rawStripped, ' delta =', rawFull - rawStripped)
  console.log('gzip bytes (level 9): full =', gzipFull, ' stripped =', gzipStripped, ' delta =', gzipFull - gzipStripped)
  console.log('raw KB: full =', (rawFull/1024).toFixed(1), ' stripped =', (rawStripped/1024).toFixed(1))
  console.log('gzip KB: full =', (gzipFull/1024).toFixed(1), ' stripped =', (gzipStripped/1024).toFixed(1))
}
main()

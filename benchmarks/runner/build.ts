/**
 * Builds every benchmark app under `benchmarks/apps/*` (except `shared`,
 * which holds only shared source, not an app) and prints a "shipped JS"
 * size table (raw + gzip bytes of all `.js` files in each app's dist/).
 *
 * Usage:
 *   bun benchmarks/runner/build.ts             # build every app
 *   bun benchmarks/runner/build.ts --app=react  # build a single app
 */
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

const appsRoot = join(import.meta.dirname, '../apps')

export interface ShippedJsSize {
  raw: number
  gzip: number
}

/** Sum of raw and gzip bytes across every `.js` file in `distDir`. */
export async function computeShippedJsSize(distDir: string): Promise<ShippedJsSize> {
  let raw = 0
  let gzip = 0
  let entries: string[]
  try {
    // Recursive: some pipelines (e.g. the BarefootJS CLI) emit their JS in
    // subdirectories of dist/.
    entries = (await readdir(distDir, { recursive: true })) as string[]
  } catch {
    return { raw: 0, gzip: 0 }
  }
  for (const name of entries) {
    if (!name.endsWith('.js')) continue
    const bytes = new Uint8Array(await Bun.file(join(distDir, name)).arrayBuffer())
    raw += bytes.byteLength
    gzip += Bun.gzipSync(bytes).byteLength
  }
  return { raw, gzip }
}

async function discoverAppNames(): Promise<string[]> {
  let entries: Awaited<ReturnType<typeof readdir>>
  try {
    entries = await readdir(appsRoot, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((e) => e.isDirectory() && e.name !== 'shared')
    .map((e) => e.name)
    .sort()
}

function fmtBytes(n: number): string {
  return `${(n / 1024).toFixed(1)} KB`
}

async function main() {
  const args = process.argv.slice(2)
  const appFilter = args.find((a) => a.startsWith('--app='))?.split('=')[1]

  const appNames = (await discoverAppNames()).filter((a) => !appFilter || a === appFilter)
  if (appNames.length === 0) {
    console.log('No apps found to build.')
    return
  }

  const built: string[] = []
  for (const name of appNames) {
    const buildFile = join(appsRoot, name, 'build.ts')
    const exists = await Bun.file(buildFile).exists()
    if (!exists) {
      console.log(`[skip] ${name}: no build.ts yet`)
      continue
    }
    try {
      console.log(`Building ${name}...`)
      const mod = await import(buildFile)
      if (typeof mod.build !== 'function') {
        console.error(`[fail] ${name}: build.ts does not export build()`)
        continue
      }
      await mod.build()
      built.push(name)
    } catch (err) {
      console.error(`[fail] ${name}:`, err instanceof Error ? err.message : err)
    }
  }

  console.log('\nShipped JS (dist/*.js):\n')
  const rows: { name: string; raw: number; gzip: number }[] = []
  for (const name of built) {
    const { raw, gzip } = await computeShippedJsSize(join(appsRoot, name, 'dist'))
    rows.push({ name, raw, gzip })
  }

  const nameW = Math.max(8, ...rows.map((r) => r.name.length)) + 2
  const colW = 12
  console.log('App'.padEnd(nameW) + 'Raw'.padStart(colW) + 'Gzip'.padStart(colW))
  console.log('-'.repeat(nameW + colW * 2))
  for (const r of rows) {
    console.log(r.name.padEnd(nameW) + fmtBytes(r.raw).padStart(colW) + fmtBytes(r.gzip).padStart(colW))
  }
}

if (import.meta.main) {
  await main()
}

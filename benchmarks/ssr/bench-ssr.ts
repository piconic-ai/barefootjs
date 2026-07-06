/**
 * SSR + hydration benchmark — benchmarks/PLAN.md's "SSR + hydration bench
 * design" section is the spec this file implements.
 *
 * Scenario: a fixed 1,000-row table (benchmarks/ssr/data.json — generated
 * once via `buildData(1000)`, see gen-data.ts, so every framework renders
 * byte-equivalent input) is server-rendered, then hydrated in a real
 * headless-Chromium page, then proven interactive by clicking row 2's
 * label and asserting the `danger` class lands on exactly one row.
 *
 * Four metrics, each framework (react / solid / barefoot):
 *   1. Server render time — pure Bun, no browser. Median of 20 iterations
 *      (5 warmup) calling each framework's real SSR render function
 *      directly (react-dom/server's renderToString, solid-js/web's
 *      renderToString over a `generate: 'ssr'` compile, BarefootJS's
 *      compileJSX + HonoAdapter + renderToHtml — see each app's
 *      lib/render-server.ts or src/render-server.ts).
 *   2. Hydration time — browser. 10 fresh-page iterations; each app's
 *      client bundle marks `hydrate-start` at the top of its script,
 *      hydrates via the framework's real API, fences on a double-rAF,
 *      then sets `document.body.dataset.hydrated = '1'` and records a
 *      `performance.measure('hydrate', ...)` entry the runner reads back.
 *   3. Interactivity proof — correctness gate, not a timing. After
 *      hydration, click row 2's `a.lbl` and assert exactly one
 *      `tr.danger`. A framework failing this is reported FAILED (its
 *      hydration timing is still reported, so a curious reader can see
 *      whether the failure was fast-but-wrong vs slow-but-wrong).
 *   4. Hydration payload — total client JS bytes (raw + gzip) the SSR
 *      page loads, plus the HTML document itself (raw + gzip).
 *
 * No vanilla column: there is no meaningful "vanilla hydration" story
 * (there's nothing to hydrate without a component model), so this bench
 * only compares the three frameworks with a real SSR + hydration story.
 *
 * Usage:
 *   bun benchmarks/ssr/bench-ssr.ts [--md] [--framework=a,b]
 */
import { join } from 'node:path'
import { chromium, type Browser, type Page } from '@playwright/test'
import { chromiumLaunchOptions } from '../runner/chromium.ts'
import { median, computeStats, type Stats } from '../runner/stats.ts'
import { computeShippedJsSize } from '../runner/build.ts'
import { startServer } from './serve.ts'
import rows from './data.json'

const ssrDir = import.meta.dirname
const appsRoot = join(ssrDir, 'apps')
const repoRoot = join(ssrDir, '..', '..')
const resultsDir = join(ssrDir, '..', 'results')

const ALL_FRAMEWORKS = ['react', 'solid', 'barefoot'] as const
type Framework = (typeof ALL_FRAMEWORKS)[number]

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
const mdMode = args.includes('--md')
const frameworkFilter = args.find((a) => a.startsWith('--framework='))?.split('=')[1]?.split(',') as
  | Framework[]
  | undefined

const log = (...items: unknown[]) => {
  if (!mdMode) console.log(...items)
}

// ---------------------------------------------------------------------------
// Metric 1: server render time (pure Bun, no browser)
// ---------------------------------------------------------------------------

const RENDER_SERVER_MODULE: Record<Framework, string> = {
  react: join(appsRoot, 'react', 'src', 'render-server.tsx'),
  solid: join(appsRoot, 'solid', 'src', 'render-server.ts'),
  barefoot: join(appsRoot, 'barefoot', 'lib', 'render-server.ts'),
}

async function measureServerRender(framework: Framework): Promise<{ iterations: number[]; stats: Stats; html: string }> {
  const mod = (await import(RENDER_SERVER_MODULE[framework])) as {
    renderPage: (rows: unknown) => Promise<string>
  }

  const WARMUP = 5
  const MEASURE = 20

  let html = ''
  for (let i = 0; i < WARMUP; i++) {
    html = await mod.renderPage(rows)
  }

  const iterations: number[] = []
  for (let i = 0; i < MEASURE; i++) {
    const t0 = performance.now()
    html = await mod.renderPage(rows)
    iterations.push(performance.now() - t0)
  }

  return { iterations, stats: computeStats(iterations), html }
}

// ---------------------------------------------------------------------------
// Metric 2 + 3: hydration time + interactivity proof (browser)
// ---------------------------------------------------------------------------

async function waitHydrated(page: Page): Promise<void> {
  await page.waitForFunction(() => document.body.dataset.hydrated === '1', undefined, { timeout: 10_000 })
}

async function measureHydrationOnce(browser: Browser, appUrl: string): Promise<number> {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(appUrl)
  await waitHydrated(page)
  const ms = await page.evaluate(() => {
    const entries = performance.getEntriesByName('hydrate', 'measure')
    const last = entries[entries.length - 1]
    return last ? last.duration : Number.NaN
  })
  await context.close()
  return ms
}

interface InteractivityResult {
  ok: boolean
  reason?: string
}

async function checkInteractivity(browser: Browser, appUrl: string): Promise<InteractivityResult> {
  const context = await browser.newContext()
  const page = await context.newPage()
  try {
    await page.goto(appUrl)
    await waitHydrated(page)

    const before = await page.evaluate(
      () => document.querySelectorAll('#tbody tr.danger').length,
    )
    if (before !== 0) return { ok: false, reason: `expected 0 tr.danger before click, got ${before}` }

    await page.click('#tbody tr:nth-child(2) a.lbl')

    // Same double-rAF fence used by the DOM update suite (see
    // benchmarks/runner/bench-dom.ts) — waits for the click's effects to
    // have actually painted, not just returned from a synchronous handler.
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    )

    const info = await page.evaluate(() => {
      const dangerRows = document.querySelectorAll('#tbody tr.danger')
      const secondRow = document.querySelectorAll('#tbody tr')[1]
      return { count: dangerRows.length, secondIsDanger: secondRow?.classList.contains('danger') ?? false }
    })
    if (info.count !== 1) return { ok: false, reason: `expected exactly 1 tr.danger after click, got ${info.count}` }
    if (!info.secondIsDanger) return { ok: false, reason: 'selected row is not row index 1 (row 2)' }
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) }
  } finally {
    await context.close()
  }
}

// ---------------------------------------------------------------------------
// Metric 4: hydration payload (client JS + HTML document bytes)
// ---------------------------------------------------------------------------

interface PayloadSize {
  clientJsRaw: number
  clientJsGzip: number
  htmlRaw: number
  htmlGzip: number
}

async function measurePayload(framework: Framework): Promise<PayloadSize> {
  const distDir = join(appsRoot, framework, 'dist')
  const { raw: clientJsRaw, gzip: clientJsGzip } = await computeShippedJsSize(distDir)
  const htmlBytes = new Uint8Array(await Bun.file(join(distDir, 'index.html')).arrayBuffer())
  return {
    clientJsRaw,
    clientJsGzip,
    htmlRaw: htmlBytes.byteLength,
    htmlGzip: Bun.gzipSync(htmlBytes).byteLength,
  }
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

interface Environment {
  date: string
  bunVersion: string
  chromiumVersion: string
  reactVersion: string | null
  reactDomVersion: string | null
  solidVersion: string | null
  cpuModel: string
  rowCount: number
}

async function readVersion(pkgPath: string): Promise<string | null> {
  try {
    const text = await Bun.file(pkgPath).text()
    return JSON.parse(text).version ?? null
  } catch {
    return null
  }
}

async function readCpuModel(): Promise<string> {
  try {
    const cpuinfo = await Bun.file('/proc/cpuinfo').text()
    const match = cpuinfo.match(/model name\s*:\s*(.+)/)
    return match ? match[1].trim() : 'unknown'
  } catch {
    return 'unknown'
  }
}

async function getEnvironment(browser: Browser): Promise<Environment> {
  return {
    date: new Date().toISOString(),
    bunVersion: Bun.version,
    chromiumVersion: browser.version(),
    reactVersion: await readVersion(join(repoRoot, 'node_modules/react/package.json')),
    reactDomVersion: await readVersion(join(repoRoot, 'node_modules/react-dom/package.json')),
    solidVersion: await readVersion(join(repoRoot, 'node_modules/solid-js/package.json')),
    cpuModel: await readCpuModel(),
    rowCount: rows.length,
  }
}

// ---------------------------------------------------------------------------
// Result types + report
// ---------------------------------------------------------------------------

interface FrameworkResult {
  framework: Framework
  serverRender: { iterations: number[]; stats: Stats }
  hydration: { iterations: number[]; stats: Stats }
  interactivity: InteractivityResult
  payload: PayloadSize
  ssrRowCount: number
}

interface FullResults {
  environment: Environment
  results: FrameworkResult[]
}

function fmtMs(ms: number): string {
  if (Number.isNaN(ms)) return 'n/a'
  if (ms < 0.01) return '<0.01'
  return ms.toFixed(2)
}

function fmtBytes(n: number): string {
  return `${(n / 1024).toFixed(1)}KB`
}

function printReport(results: FrameworkResult[], opts: { md: boolean }): void {
  const frameworks = results.map((r) => r.framework)

  const rowsOut: Array<{ label: string; cells: string[] }> = [
    {
      label: 'Server render (median, n=20)',
      cells: results.map((r) => `${fmtMs(r.serverRender.stats.median)} ms`),
    },
    {
      label: 'Hydration time (median, n=10)',
      cells: results.map((r) => `${fmtMs(r.hydration.stats.median)} ms`),
    },
    {
      label: 'Interactivity gate',
      cells: results.map((r) => (r.interactivity.ok ? 'PASS' : `FAILED: ${r.interactivity.reason ?? ''}`)),
    },
    {
      label: 'Client JS (raw / gzip)',
      cells: results.map((r) => `${fmtBytes(r.payload.clientJsRaw)} / ${fmtBytes(r.payload.clientJsGzip)}`),
    },
    {
      label: 'HTML document (raw / gzip)',
      cells: results.map((r) => `${fmtBytes(r.payload.htmlRaw)} / ${fmtBytes(r.payload.htmlGzip)}`),
    },
  ]

  if (!opts.md) {
    console.log('\nSSR + hydration bench — no vanilla column: there is no meaningful')
    console.log('"vanilla hydration" story without a component model to hydrate.\n')
  }

  if (opts.md) {
    console.log(
      '> No vanilla column: there is no meaningful "vanilla hydration" story without a component model to hydrate.\n',
    )
    console.log(`| Metric | ${frameworks.join(' | ')} |`)
    console.log(`|---|${frameworks.map(() => '---').join('|')}|`)
    for (const row of rowsOut) {
      console.log(`| ${row.label} | ${row.cells.join(' | ')} |`)
    }
    return
  }

  const labelW = 30
  // Widen each column to fit its longest cell (a FAILED reason can run
  // well past a fixed width) so columns never visually run together.
  const colW = Math.max(18, ...rowsOut.flatMap((r) => r.cells.map((c) => c.length + 2)))
  console.log('Metric'.padEnd(labelW) + frameworks.map((f) => f.padStart(colW)).join(''))
  console.log('-'.repeat(labelW + colW * frameworks.length))
  for (const row of rowsOut) {
    console.log(row.label.padEnd(labelW) + row.cells.map((c) => c.padStart(colW)).join(''))
  }
  console.log('')
}

async function writeResultsJson(data: FullResults): Promise<void> {
  const path = join(resultsDir, 'ssr-latest.json')
  await Bun.write(path, `${JSON.stringify(data, null, 2)}\n`)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const frameworks = (frameworkFilter ?? [...ALL_FRAMEWORKS]).filter((f) => ALL_FRAMEWORKS.includes(f))
  if (frameworks.length === 0) {
    console.error('No valid frameworks selected.')
    process.exit(1)
  }

  for (const framework of frameworks) {
    const distExists = await Bun.file(join(appsRoot, framework, 'dist', 'index.html')).exists()
    if (!distExists) {
      console.error(`Missing dist/ for "${framework}". Run its build.ts first:`)
      console.error(`  bun benchmarks/ssr/apps/${framework}/build.ts`)
      process.exit(1)
    }
  }

  log(`Frameworks: ${frameworks.join(', ')}`)
  log(`Rows: ${rows.length}`)

  const server = startServer(0)
  const browser = await chromium.launch(chromiumLaunchOptions())

  try {
    const environment = await getEnvironment(browser)
    const results: FrameworkResult[] = []

    for (const framework of frameworks) {
      log(`\n[${framework}] server render...`)
      const serverRender = await measureServerRender(framework)
      const ssrRowCount = (serverRender.html.match(/<tr /g) ?? []).length
      log(`  median ${fmtMs(serverRender.stats.median)}ms, ${ssrRowCount} rows in rendered HTML`)

      const appUrl = `http://localhost:${server.port}/${framework}/index.html`

      log(`[${framework}] hydration (10 fresh pages)...`)
      const hydrationIterations: number[] = []
      for (let i = 0; i < 10; i++) {
        hydrationIterations.push(await measureHydrationOnce(browser, appUrl))
      }
      log(`  median ${fmtMs(median(hydrationIterations))}ms`)

      log(`[${framework}] interactivity gate...`)
      const interactivity = await checkInteractivity(browser, appUrl)
      log(`  ${interactivity.ok ? 'PASS' : `FAILED: ${interactivity.reason}`}`)

      log(`[${framework}] hydration payload...`)
      const payload = await measurePayload(framework)

      results.push({
        framework,
        serverRender: { iterations: serverRender.iterations, stats: serverRender.stats },
        hydration: { iterations: hydrationIterations, stats: computeStats(hydrationIterations) },
        interactivity,
        payload,
        ssrRowCount,
      })
    }

    printReport(results, { md: mdMode })
    await writeResultsJson({ environment, results })
    log(`\nWrote ${join(resultsDir, 'ssr-latest.json')}`)

    const anyFailed = results.some((r) => !r.interactivity.ok || r.ssrRowCount < rows.length)
    if (anyFailed) process.exitCode = 1
  } finally {
    await browser.close()
    server.stop()
  }
}

await main()

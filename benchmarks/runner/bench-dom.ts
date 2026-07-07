/**
 * DOM update benchmark — krausest keyed-benchmark semantics.
 *
 * Launches headless Chromium via Playwright, drives each framework's app
 * through the standard operation set via real button clicks, and measures
 * click-dispatch -> after-next-paint (double-rAF fence) timing. See
 * benchmarks/CONTRACT.md for the page contract and op semantics, and
 * benchmarks/PLAN.md for methodology.
 *
 * Usage:
 *   bun benchmarks/runner/bench-dom.ts [--md] [--quick] [--framework=a,b] [--op=x,y]
 */
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium, type Browser, type CDPSession, type Page } from '@playwright/test'
import {
  type Environment,
  type ExtraMetricResult,
  type FullResults,
  type OpTimingResult,
  OP_ORDER,
  printReport,
  type ShippedJsResult,
  writeResultsJson,
} from './report.ts'
import { chromiumLaunchOptions } from './chromium.ts'
import { startServer } from './serve.ts'
import { computeStats } from './stats.ts'
import { computeShippedJsSize } from './build.ts'

const runnerDir = import.meta.dirname
const appsRoot = join(runnerDir, '../apps')
const repoRoot = join(runnerDir, '../..')
const resultsDir = join(runnerDir, '../results')

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
const mdMode = args.includes('--md')
const quickMode = args.includes('--quick')
const frameworkFilter = args.find((a) => a.startsWith('--framework='))?.split('=')[1]?.split(',')
const opFilter = args.find((a) => a.startsWith('--op='))?.split('=')[1]?.split(',')

const log = (...items: unknown[]) => {
  if (!mdMode) console.log(...items)
}

// ---------------------------------------------------------------------------
// In-page timing fence (injected via addInitScript on every page)
// ---------------------------------------------------------------------------

function installBenchFence() {
  ;(window as unknown as { __bench: unknown }).__bench = {
    fence: () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      }),
    measure: (sel: string) =>
      new Promise<number>((resolve) => {
        const el = document.querySelector(sel) as HTMLElement | null
        if (!el) throw new Error(`__bench.measure: no element for selector "${sel}"`)
        const t0 = performance.now()
        el.click()
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - t0)))
      }),
  }
}

async function clickAndSettle(page: Page, selector: string): Promise<void> {
  await page.evaluate(async (sel) => {
    const el = document.querySelector(sel) as HTMLElement | null
    if (!el) throw new Error(`clickAndSettle: no element for selector "${sel}"`)
    el.click()
    await (window as unknown as { __bench: { fence: () => Promise<void> } }).__bench.fence()
  }, selector)
}

async function measureClick(page: Page, selector: string): Promise<number> {
  return page.evaluate(
    (sel) => (window as unknown as { __bench: { measure: (s: string) => Promise<number> } }).__bench.measure(sel),
    selector,
  )
}

async function forceGC(session: CDPSession): Promise<void> {
  await session.send('HeapProfiler.collectGarbage')
}

async function rowCount(page: Page): Promise<number> {
  return page.evaluate(() => document.querySelectorAll('#tbody tr').length)
}

async function idAt(page: Page, index: number): Promise<string | null> {
  return page.evaluate((idx) => {
    const tr = document.querySelectorAll('#tbody tr')[idx]
    return tr ? (tr.querySelector('.col-md-1')?.textContent ?? null) : null
  }, index)
}

// ---------------------------------------------------------------------------
// Operation definitions
// ---------------------------------------------------------------------------

interface AssertResult {
  ok: boolean
  reason?: string
}

interface OpDef {
  name: (typeof OP_ORDER)[number]
  setup: string[]
  stress: boolean
  before?: (page: Page) => Promise<Record<string, unknown>>
  selector: string
  assert: (page: Page, ctx: Record<string, unknown>) => Promise<AssertResult>
}

const OPS: OpDef[] = [
  {
    name: 'create1k',
    setup: [],
    stress: false,
    selector: '#run',
    assert: async (page) => {
      const count = await rowCount(page)
      return count === 1000 ? { ok: true } : { ok: false, reason: `expected 1000 rows, got ${count}` }
    },
  },
  {
    name: 'replace1k',
    setup: ['#run'],
    stress: false,
    before: async (page) => ({ prevFirstId: await idAt(page, 0) }),
    selector: '#run',
    assert: async (page, ctx) => {
      const count = await rowCount(page)
      if (count !== 1000) return { ok: false, reason: `expected 1000 rows, got ${count}` }
      const firstId = await idAt(page, 0)
      if (firstId === ctx.prevFirstId) return { ok: false, reason: 'first row id did not change after replace' }
      return { ok: true }
    },
  },
  {
    name: 'update10th',
    setup: ['#run'],
    stress: false,
    selector: '#update',
    assert: async (page) => {
      const labels = await page.evaluate(() => {
        const trs = document.querySelectorAll('#tbody tr')
        return [0, 1, 10, 20].map((i) => trs[i]?.querySelector('a.lbl')?.textContent ?? '')
      })
      const [l0, l1, l10, l20] = labels
      if (!l0.endsWith(' !!!')) return { ok: false, reason: 'row 0 label not updated' }
      if (!l10.endsWith(' !!!')) return { ok: false, reason: 'row 10 label not updated' }
      if (!l20.endsWith(' !!!')) return { ok: false, reason: 'row 20 label not updated' }
      if (l1.endsWith(' !!!')) return { ok: false, reason: 'row 1 label unexpectedly updated' }
      return { ok: true }
    },
  },
  {
    name: 'select',
    setup: ['#run'],
    stress: false,
    selector: 'tbody tr:nth-child(2) a.lbl',
    assert: async (page) => {
      const info = await page.evaluate(() => {
        const dangers = document.querySelectorAll('#tbody tr.danger')
        const secondRow = document.querySelectorAll('#tbody tr')[1]
        return { count: dangers.length, secondIsDanger: secondRow?.classList.contains('danger') ?? false }
      })
      if (info.count !== 1) return { ok: false, reason: `expected exactly 1 tr.danger, got ${info.count}` }
      if (!info.secondIsDanger) return { ok: false, reason: 'selected row is not row index 1' }
      return { ok: true }
    },
  },
  {
    name: 'swap',
    setup: ['#run'],
    stress: false,
    before: async (page) => ({ id1: await idAt(page, 1), id998: await idAt(page, 998) }),
    selector: '#swaprows',
    assert: async (page, ctx) => {
      const count = await rowCount(page)
      if (count !== 1000) return { ok: false, reason: `expected 1000 rows, got ${count}` }
      const newId1 = await idAt(page, 1)
      const newId998 = await idAt(page, 998)
      if (newId1 !== ctx.id998 || newId998 !== ctx.id1) {
        return { ok: false, reason: 'rows at index 1 and 998 did not swap' }
      }
      return { ok: true }
    },
  },
  {
    name: 'remove',
    setup: ['#run'],
    stress: false,
    before: async (page) => ({ id4: await idAt(page, 4) }),
    selector: 'tbody tr:nth-child(5) a.remove',
    assert: async (page, ctx) => {
      const count = await rowCount(page)
      if (count !== 999) return { ok: false, reason: `expected 999 rows, got ${count}` }
      const stillPresent = await page.evaluate(
        (id) => Array.from(document.querySelectorAll('#tbody tr .col-md-1')).some((td) => td.textContent === id),
        ctx.id4 as string,
      )
      if (stillPresent) return { ok: false, reason: 'removed row id still present' }
      return { ok: true }
    },
  },
  {
    name: 'create10k',
    setup: [],
    stress: true,
    selector: '#runlots',
    assert: async (page) => {
      const count = await rowCount(page)
      return count === 10000 ? { ok: true } : { ok: false, reason: `expected 10000 rows, got ${count}` }
    },
  },
  {
    name: 'append1k',
    setup: ['#runlots'],
    stress: true,
    selector: '#add',
    assert: async (page) => {
      const count = await rowCount(page)
      return count === 11000 ? { ok: true } : { ok: false, reason: `expected 11000 rows, got ${count}` }
    },
  },
  {
    name: 'clear10k',
    setup: ['#runlots'],
    stress: true,
    selector: '#clear',
    assert: async (page) => {
      const count = await rowCount(page)
      return count === 0 ? { ok: true } : { ok: false, reason: `expected 0 rows, got ${count}` }
    },
  },
]

// ---------------------------------------------------------------------------
// Iteration counts
// ---------------------------------------------------------------------------

function iterationCounts(stress: boolean): { warmup: number; measure: number } {
  if (quickMode) return { warmup: 1, measure: 3 }
  return stress ? { warmup: 2, measure: 5 } : { warmup: 5, measure: 10 }
}

// ---------------------------------------------------------------------------
// Per-op measurement
// ---------------------------------------------------------------------------

async function waitReady(page: Page): Promise<void> {
  await page.waitForFunction(() => document.body.dataset.ready === '1')
}

async function runOp(browser: Browser, appUrl: string, op: OpDef): Promise<OpTimingResult> {
  const { warmup, measure } = iterationCounts(op.stress)
  const total = warmup + measure

  const context = await browser.newContext()
  const page = await context.newPage()
  await page.addInitScript(installBenchFence)
  await page.goto(appUrl)
  await waitReady(page)

  const session = await context.newCDPSession(page)
  await session.send('HeapProfiler.enable')

  for (const sel of op.setup) await clickAndSettle(page, sel)

  const iterations: number[] = []
  let failed: string | undefined

  for (let i = 0; i < total && !failed; i++) {
    if (i > 0) {
      await clickAndSettle(page, '#clear')
      for (const sel of op.setup) await clickAndSettle(page, sel)
    }

    const ctx = op.before ? await op.before(page) : {}
    await forceGC(session)
    const ms = await measureClick(page, op.selector)

    if (i === 0) {
      const result = await op.assert(page, ctx)
      if (!result.ok) failed = result.reason ?? 'assertion failed'
    }

    if (!failed && i >= warmup) iterations.push(ms)
  }

  await context.close()

  if (failed) {
    return { op: op.name, framework: '', ok: false, reason: failed, iterations: [], stats: null }
  }
  return { op: op.name, framework: '', ok: true, iterations, stats: computeStats(iterations) }
}

// ---------------------------------------------------------------------------
// Startup + memory
// ---------------------------------------------------------------------------

function installReadyObserver() {
  const attach = () => {
    if (document.body) {
      if (document.body.dataset.ready === '1') {
        ;(window as unknown as { __readyAt: number }).__readyAt = performance.now()
        return
      }
      const obs = new MutationObserver(() => {
        if (document.body.dataset.ready === '1') {
          ;(window as unknown as { __readyAt: number }).__readyAt = performance.now()
          obs.disconnect()
        }
      })
      obs.observe(document.body, { attributes: true, attributeFilter: ['data-ready'] })
    } else {
      document.addEventListener('DOMContentLoaded', attach, { once: true })
    }
  }
  attach()
}

async function measureStartupOnce(browser: Browser, appUrl: string): Promise<number> {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.addInitScript(installReadyObserver)
  await page.goto(appUrl)
  await page.waitForFunction(() => (window as unknown as { __readyAt?: number }).__readyAt !== undefined)
  const readyAt = await page.evaluate(() => (window as unknown as { __readyAt: number }).__readyAt)
  await context.close()
  return readyAt
}

async function getJsHeapUsed(session: CDPSession): Promise<number> {
  const { metrics } = await session.send('Performance.getMetrics')
  const m = metrics.find((x) => x.name === 'JSHeapUsedSize')
  return m ? m.value : Number.NaN
}

async function measureMemoryOnce(browser: Browser, appUrl: string): Promise<number> {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.addInitScript(installBenchFence)
  await page.goto(appUrl)
  await waitReady(page)

  const session = await context.newCDPSession(page)
  await session.send('Performance.enable')

  await forceGC(session)
  const baseline = await getJsHeapUsed(session)

  await clickAndSettle(page, '#run')
  await forceGC(session)
  const after = await getJsHeapUsed(session)

  await context.close()
  return after - baseline
}

async function measureExtras(browser: Browser, appUrl: string, framework: string): Promise<ExtraMetricResult> {
  const startupIters = quickMode ? 2 : 5
  const memoryIters = quickMode ? 1 : 3

  const startupIterations: number[] = []
  for (let i = 0; i < startupIters; i++) startupIterations.push(await measureStartupOnce(browser, appUrl))

  const memoryIterations: number[] = []
  for (let i = 0; i < memoryIters; i++) memoryIterations.push(await measureMemoryOnce(browser, appUrl))

  return {
    framework,
    startupIterations,
    startupStats: computeStats(startupIterations),
    memoryIterations,
    memoryStats: computeStats(memoryIterations),
  }
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

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
    solidVersion: await readVersion(join(repoRoot, 'node_modules/solid-js/package.json')),
    cpuModel: await readCpuModel(),
  }
}

// ---------------------------------------------------------------------------
// Framework discovery
// ---------------------------------------------------------------------------

async function discoverFrameworks(): Promise<string[]> {
  let entries: Awaited<ReturnType<typeof readdir>>
  try {
    entries = await readdir(appsRoot, { withFileTypes: true })
  } catch {
    return []
  }
  const names = entries.filter((e) => e.isDirectory() && e.name !== 'shared').map((e) => e.name)
  const withDist: string[] = []
  for (const name of names) {
    if (await Bun.file(join(appsRoot, name, 'dist/index.html')).exists()) withDist.push(name)
  }
  withDist.sort((a, b) => (a === 'vanilla' ? -1 : b === 'vanilla' ? 1 : a.localeCompare(b)))
  return withDist
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  let frameworks = await discoverFrameworks()
  if (frameworkFilter) frameworks = frameworks.filter((f) => frameworkFilter.includes(f))
  if (frameworks.length === 0) {
    console.error('No framework apps with a built dist/ found. Run `bun benchmarks/runner/build.ts` first.')
    process.exit(1)
  }

  let ops = OPS
  if (opFilter) ops = ops.filter((o) => opFilter.includes(o.name))

  log(`Frameworks: ${frameworks.join(', ')}`)
  log(`Operations: ${ops.map((o) => o.name).join(', ')}`)
  log(quickMode ? 'Mode: quick' : 'Mode: full')

  const server = startServer(0)
  // Launch the preinstalled Chromium binary directly: the pinned
  // @playwright/test version's default revision-matching (and its headless
  // "shell" binary preference) doesn't line up with what's pre-provisioned
  // at PLAYWRIGHT_BROWSERS_PATH in this environment, and `playwright install`
  // is off-limits here. The `chromium` symlink at the browsers-path root
  // points at the provisioned build regardless of revision number.
  const browser = await chromium.launch(chromiumLaunchOptions())

  try {
    const environment = await getEnvironment(browser)

    const opResults: OpTimingResult[] = []
    const extras: ExtraMetricResult[] = []
    const shippedJs: ShippedJsResult[] = []

    for (const framework of frameworks) {
      const appUrl = `http://localhost:${server.port}/${framework}/index.html`

      for (const op of ops) {
        log(`  [${framework}] ${op.name}...`)
        const result = await runOp(browser, appUrl, op)
        result.framework = framework
        if (!result.ok) log(`    FAILED: ${result.reason}`)
        opResults.push(result)
      }

      log(`  [${framework}] startup + memory...`)
      extras.push(await measureExtras(browser, appUrl, framework))

      const { raw, gzip } = await computeShippedJsSize(join(appsRoot, framework, 'dist'))
      shippedJs.push({ framework, raw, gzip })
    }

    const results: FullResults = { environment, frameworks, ops: opResults, extras, shippedJs }

    printReport(results, { md: mdMode })
    await writeResultsJson(results, resultsDir)
    log(`\nWrote ${join(resultsDir, 'latest.json')}`)

    const anyFailed = opResults.some((r) => !r.ok)
    if (anyFailed) process.exitCode = 1
  } finally {
    await browser.close()
    server.stop()
  }
}

await main()

/**
 * Stage 0 spike addendum (spec/slot-unification.md) — post-hydration JS
 * heap size for the SSR bench's four apps, n=3, forced GC, borrowing
 * benchmarks/runner/bench-dom.ts's memory methodology (CDP
 * `HeapProfiler.collectGarbage` + `Performance.getMetrics` /
 * `JSHeapUsedSize`).
 *
 * NOT the same measurement as the "1755KB / 1480KB" figures quoted in
 * spec/slot-unification.md — those come from bench-dom.ts's DOM-update
 * suite (benchmarks/apps/, a different app harness), which measures the
 * heap DELTA of a `#run` button click that CREATES 1,000 rows client-side.
 * This script's apps are SSR'd (rows already exist as parsed HTML before
 * any JS runs) and there's no equivalent "create" action to delta against
 * — so this instead reports the ABSOLUTE post-hydration JS heap per app,
 * which isolates each framework's/prototype's JS-side hydration bookkeeping
 * (signals, effects, closures, listener maps) for the same 1,000-row DOM,
 * not the DOM node memory itself (that part should be near-identical
 * across apps modulo marker byte/node-count differences). Treat this as a
 * DIRECTIONAL number for this spike, not as comparable to the DOM-suite
 * figures — see the spike report's caveats.
 *
 * Usage:
 *   PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium \
 *     bun benchmarks/ssr/bench-ssr-memory.ts
 */
import { join } from 'node:path'
import { chromium, type Browser, type CDPSession, type Page } from '@playwright/test'
import { chromiumLaunchOptions } from '../runner/chromium.ts'
import { median, computeStats } from '../runner/stats.ts'
import { startServer } from './serve.ts'

const FRAMEWORKS = ['react', 'solid', 'barefoot', 'barefoot-claim'] as const
const ITERS = 3

async function waitHydrated(page: Page): Promise<void> {
  await page.waitForFunction(() => document.body.dataset.hydrated === '1', undefined, { timeout: 10_000 })
}

async function forceGC(session: CDPSession): Promise<void> {
  await session.send('HeapProfiler.collectGarbage')
}

async function getJsHeapUsed(session: CDPSession): Promise<number> {
  const { metrics } = await session.send('Performance.getMetrics')
  const m = metrics.find((x) => x.name === 'JSHeapUsedSize')
  return m ? m.value : Number.NaN
}

async function measureHeapOnce(browser: Browser, appUrl: string): Promise<number> {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(appUrl)
  await waitHydrated(page)

  const session = await context.newCDPSession(page)
  await session.send('Performance.enable')
  await forceGC(session)
  const heap = await getJsHeapUsed(session)

  await context.close()
  return heap
}

function fmtBytes(n: number): string {
  return `${(n / 1024).toFixed(1)}KB`
}

async function main() {
  const server = startServer(0)
  const browser = await chromium.launch(chromiumLaunchOptions())
  try {
    console.log(`Post-hydration JS heap (forced GC), n=${ITERS}, 1000 rows\n`)
    for (const framework of FRAMEWORKS) {
      const appUrl = `http://localhost:${server.port}/${framework}/index.html`
      const iterations: number[] = []
      for (let i = 0; i < ITERS; i++) iterations.push(await measureHeapOnce(browser, appUrl))
      const stats = computeStats(iterations)
      console.log(
        `${framework.padEnd(16)} median ${fmtBytes(median(iterations)).padStart(10)}  (n=${ITERS}: ${iterations
          .map(fmtBytes)
          .join(', ')})  stdev ${fmtBytes(stats.stddev)}`,
      )
    }
  } finally {
    await browser.close()
    server.stop()
  }
}

await main()

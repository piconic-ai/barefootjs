/**
 * Stress harness for `@barefootjs/router`.
 *
 * Not exhaustive QA — a directional smoke test. It pushes the router
 * through the scenarios that probe its design (outlet swap + shell
 * preservation, re-hydration, disposal/leaks, the rapid-fire race,
 * back/forward, query-string nav, throughput) and prints a report so we
 * can see what holds and where the design has edges.
 *
 * Run against a running server (`bun run serve`) on :8787.
 * Set CHROME_PATH to a Chromium executable Playwright can launch.
 */
import { chromium, type Page } from '@playwright/test'

const BASE = process.env.BASE_URL ?? 'http://localhost:8787'

interface Row {
  scenario: string
  result: 'PASS' | 'FAIL' | 'INFO'
  detail: string
}
const rows: Row[] = []
let hardFailures = 0
function record(scenario: string, ok: boolean | 'info', detail: string) {
  const result = ok === 'info' ? 'INFO' : ok ? 'PASS' : 'FAIL'
  if (result === 'FAIL') hardFailures++
  rows.push({ scenario, result, detail })
  console.log(`${result === 'PASS' ? '✓' : result === 'FAIL' ? '✗' : 'ℹ'} ${scenario} — ${detail}`)
}

const title = (p: Page) => p.locator('.page-title').first().textContent()
const bf = (p: Page) => p.evaluate(() => window.__bf)
const nav = (p: Page, url: string) =>
  p.evaluate((u) => window.__bfNavigate!(u), url)
const settle = (p: Page) => p.waitForTimeout(120)

async function main() {
  const browser = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : undefined,
  )
  const page = await browser.newPage({ viewport: { width: 1000, height: 760 } })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    // Count only real JS console errors, not resource-load noise (favicon etc.).
    if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errors.push(m.text())
  })

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })

  // ── 1. Sequential walk through every post ────────────────────────────
  {
    await nav(page, '/posts/partial-navigation')
    await settle(page)
    let ok = true
    let liveSeen = new Set<number>()
    const slugs = [
      'any-backend', 'islands-stay-alive', 'reuses-the-runtime', 'disposal-is-the-hard-part',
      'history-back-forward', 'rapid-fire', 'query-string-nav', 'no-fragment-negotiation', 'where-this-goes',
    ]
    for (const slug of slugs) {
      await nav(page, `/posts/${slug}`)
      await settle(page)
      const onPage = await page.locator(`.post[data-slug="${slug}"]`).count()
      if (onPage !== 1) ok = false
      liveSeen.add((await bf(page)).live)
    }
    const state = await bf(page)
    // Every post page has exactly 2 islands; with disposal on, live should
    // never drift above 2 no matter how far we walk.
    record(
      'sequential walk (10 posts)',
      ok && [...liveSeen].every((n) => n === 2),
      `each post rendered=${ok}; live-island set across walk={${[...liveSeen].join(',')}} (want {2}); cumulative hydrated=${state.hydrated}, disposed=${state.disposed}`,
    )
  }

  // ── 2. Rapid-fire: latest target wins despite a slow earlier response ─
  {
    await nav(page, '/posts/partial-navigation')
    await settle(page)
    // Fire a slow nav, then immediately supersede it with a fast one.
    await page.evaluate(() => {
      window.__bfNavigate!('/posts/any-backend?delay=400') // slow
      window.__bfNavigate!('/posts/where-this-goes') // fast, wins
    })
    await page.waitForTimeout(700) // outlast the slow response
    const t = (await title(page)) ?? ''
    const stale = await page.locator('.post[data-slug="any-backend"]').count()
    record(
      'rapid-fire race (slow superseded by fast)',
      /Where this goes next/.test(t) && stale === 0,
      `final title="${t}", stale slow-page present=${stale > 0 ? 'yes' : 'no'}`,
    )
  }

  // ── 3. Back/forward storm ────────────────────────────────────────────
  {
    const order = ['/posts/partial-navigation', '/posts/any-backend', '/posts/islands-stay-alive', '/posts/reuses-the-runtime']
    const expectTitles: string[] = []
    for (const u of order) {
      await nav(page, u)
      await settle(page)
      expectTitles.push((await title(page)) ?? '')
    }
    let ok = true
    // Walk back to the first post, asserting content matches each URL.
    for (let i = expectTitles.length - 2; i >= 0; i--) {
      await page.goBack()
      await page.waitForTimeout(200)
      const t = (await title(page)) ?? ''
      if (t !== expectTitles[i]) ok = false
    }
    // Then forward once.
    await page.goForward()
    await page.waitForTimeout(200)
    const fwd = (await title(page)) ?? ''
    record(
      'back/forward storm',
      ok && fwd === expectTitles[1],
      `back steps matched URLs=${ok}; forward landed on="${fwd}"`,
    )
  }

  // ── 4. Query-string nav (?tag=) — reactive filter, NO outlet swap ─────
  {
    await nav(page, '/')
    await settle(page)
    const navsBefore = await page.locator('#shell-navs').textContent()
    const updBefore = Number(await page.locator('#shell-updates').textContent())
    await nav(page, '/?tag=design')
    await settle(page)
    const url = new URL(page.url())
    const navsAfter = await page.locator('#shell-navs').textContent()
    const updAfter = Number(await page.locator('#shell-updates').textContent())
    const shown = await page.locator('.sortable-list li:not([hidden])').count()
    // Every visible item is tagged design, the URL updated, the outlet was NOT
    // swapped (partial-nav counter unchanged), and the island re-ran.
    const allDesign = await page.evaluate(() =>
      [...document.querySelectorAll('.sortable-list li:not([hidden])')].every((li) =>
        ((li as HTMLElement).dataset.tags ?? '').split(' ').includes('design'),
      ),
    )
    record(
      'query-string nav (?tag=design) — reactive, no swap',
      url.search === '?tag=design' && navsBefore === navsAfter && updAfter > updBefore && allDesign,
      `${shown} items, all #design=${allDesign}; partial navs ${navsBefore}→${navsAfter} (no swap); list updates ${updBefore}→${updAfter}`,
    )
  }

  // ── 5a. Leak probe — disposal ON (default) ───────────────────────────
  {
    await page.evaluate(() => { window.__bf.disposeEnabled = true })
    await nav(page, '/posts/disposal-is-the-hard-part')
    await settle(page)
    await page.waitForTimeout(300) // let its timer tick
    const id = 'disposal-is-the-hard-part:timer'
    const before = (await bf(page)).ticks[id] ?? 0
    await nav(page, '/posts/where-this-goes') // leave it
    await page.waitForTimeout(400)
    const after = (await bf(page)).ticks[id] ?? 0
    const live = (await bf(page)).live
    record(
      'leak probe — disposal ON',
      after === before && live === 2,
      `left-page timer fired ${before}→${after} (no growth = torn down); live islands=${live}`,
    )
  }

  // ── 6. Guard: hash-only link is left to the browser ──────────────────
  {
    await nav(page, '/posts/partial-navigation')
    await settle(page)
    const titleBefore = await title(page)
    // Append OUTSIDE the outlet so the partial-nav MutationObserver isn't
    // tripped by the insertion itself — we only want to observe the click.
    await page.evaluate(() => {
      const a = document.createElement('a')
      a.href = '#somewhere'
      a.id = 'hash-link'
      a.textContent = 'hash'
      document.body.appendChild(a)
      a.click()
    })
    await page.waitForTimeout(150)
    const titleAfter = await title(page)
    const hashApplied = new URL(page.url()).hash === '#somewhere'
    record(
      'guard: hash-only link not intercepted',
      titleBefore === titleAfter && hashApplied,
      `outlet content unchanged ("${titleAfter}"), browser applied the hash (${hashApplied})`,
    )
  }

  // ── 7. Throughput (clean baseline: disposal on) ──────────────────────
  {
    const order = ['/posts/partial-navigation', '/posts/any-backend', '/posts/islands-stay-alive', '/posts/reuses-the-runtime', '/posts/disposal-is-the-hard-part']
    const liveBefore = (await bf(page)).live
    const N = 30
    const t0 = Date.now()
    for (let i = 0; i < N; i++) {
      await nav(page, order[i % order.length])
      await page.waitForTimeout(20)
    }
    const ms = Date.now() - t0
    const liveAfter = (await bf(page)).live
    record(
      `throughput (${N} navigations)`,
      liveAfter === liveBefore,
      `${ms}ms total, ~${(ms / N).toFixed(1)}ms/nav; live islands ${liveBefore}→${liveAfter} (no drift across 30 navs)`,
    )
  }

  // ── 8. Leak probe — disposal OFF (documents the gap; run last because
  //      it intentionally leaks and would pollute the live-island gauge) ─
  {
    await page.evaluate(() => { window.__bf.disposeEnabled = false })
    await nav(page, '/posts/rapid-fire')
    await settle(page)
    await page.waitForTimeout(300)
    const id = 'rapid-fire:timer'
    const before = (await bf(page)).ticks[id] ?? 0
    const liveBefore = (await bf(page)).live
    await nav(page, '/posts/query-string-nav')
    await page.waitForTimeout(400)
    const after = (await bf(page)).ticks[id] ?? 0
    const liveAfter = (await bf(page)).live
    record(
      'leak probe — disposal OFF',
      'info',
      `without a dispose hook the left-page timer KEEPS firing ${before}→${after}, and live islands climbed ${liveBefore}→${liveAfter} (leak). The router's default dispose avoids this via the client runtime's precise per-scope disposal (now in @barefootjs/client, #1893).`,
    )
    await page.evaluate(() => { window.__bf.disposeEnabled = true })
  }

  record('no uncaught page errors', errors.length === 0, errors.length ? errors.slice(0, 3).join(' | ') : 'clean console')

  await browser.close()

  console.log(`\n${'='.repeat(64)}\nSTRESS SUMMARY — ${rows.filter((r) => r.result === 'PASS').length} pass, ${hardFailures} fail, ${rows.filter((r) => r.result === 'INFO').length} info`)
  console.log('='.repeat(64))
  if (hardFailures > 0) process.exit(1)
}

main()

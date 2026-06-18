/**
 * Browser verification for the blog example. Drives a real Chromium through the
 * router's behaviors and asserts each one, exiting non-zero on drift.
 *
 *   PORT=8788 bun run server.tsx &
 *   bun run scripts/verify.ts
 *
 * Region swaps are detected by **node identity** — tag a live element with a
 * marker, act, then check whether the marker survived (region kept) or is gone
 * (region swapped) — and by the real, user-visible content that appears. No
 * debug instrumentation is needed on the page itself.
 */
import { chromium } from '@playwright/test'

const BASE = process.env.BASE ?? 'http://localhost:8788'
const results: { name: string; ok: boolean; info: string }[] = []
const check = (name: string, ok: boolean, info = '') => {
  results.push({ name, ok, info })
  console.log(`${ok ? '✅' : '❌'} ${name}${info ? ` — ${info}` : ''}`)
}

// Use Playwright's managed browser discovery (honours PLAYWRIGHT_BROWSERS_PATH
// / the default cache, so `bunx playwright install chromium` just works). Set
// PW_EXECUTABLE_PATH to override for a non-standard browser location.
const browser = await chromium.launch(
  process.env.PW_EXECUTABLE_PATH ? { executablePath: process.env.PW_EXECUTABLE_PATH } : {},
)
const page = await browser.newPage()
const errors: string[] = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

const text = (sel: string) => page.locator(sel).first().innerText()
/** Tag the first match with an identity marker (an expando survives a DOM move, not a re-render). */
const mark = (sel: string) =>
  page.$eval(sel, (el) => {
    ;(el as unknown as { __mark?: string }).__mark = 'KEEP'
  })
/** Read the marker back; `null` if the element is gone, `undefined` if it's a fresh node. */
const marker = (sel: string) =>
  page.$eval(sel, (el) => (el as unknown as { __mark?: string }).__mark).catch(() => null)

try {
  // ── 1. First load + hydration ───────────────────────────────────────────
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  const items = await page.locator('.sortable-list li').count()
  check('index hydrates with 10 posts', items === 10, `${items} items`)

  // ── 2. searchParams: sort reorders the list with NO region swap ──────────
  await mark('.content') // the PostList root — a region swap would replace it
  await page.click('.controls a.sort:has-text("title")')
  await page.waitForTimeout(200)
  const firstTitle = await text('.sortable-list li:first-child .item-link')
  check(
    'sort=title reorders list reactively',
    firstTitle.startsWith('A') || firstTitle.startsWith('B'),
    `first now "${firstTitle}"`,
  )
  check('sort is a query-only update with NO region swap', (await marker('.content')) === 'KEEP')
  check('URL reflects sort', page.url().includes('sort=title'), page.url())

  // ── 3. Pin survives a re-sort (keyed island state) ──────────────────────
  await page.click('.sortable-list li:first-child .pin')
  const pinnedSlug = await page.locator('.sortable-list li.pinned .item-link').first().innerText()
  await page.click('.controls a.sort:has-text("date")')
  await page.waitForTimeout(200)
  const stillPinned = await page.locator('.sortable-list li.pinned .item-link').first().innerText()
  check('pinned item state survives re-sort', pinnedSlug === stillPinned, `"${pinnedSlug}"`)

  // ── 4. Tag filter (query-only, still no swap) ───────────────────────────
  await page.click('.tags a.tag:has-text("#perf")')
  await page.waitForTimeout(200)
  const filtered = await page.locator('.sortable-list li:visible').count()
  check('tag=perf filters to 3 posts', filtered === 3, `${filtered} visible`)
  check('tag filter does NOT swap the region', (await marker('.content')) === 'KEEP')

  // ── 5. Navigate to a post: content region SWAPS, shell persists ─────────
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(200)
  await page.click('.toggle') // flip theme, then navigate — the choice must persist
  const themeAfterToggle = await page.getAttribute('html', 'data-theme')
  await mark('.content') // index content — a swap replaces it with the article
  await page.click('.sortable-list li:first-child .item-link')
  await page.waitForSelector('.island.like', { timeout: 2000 })
  check('clicking a post swaps the content region', (await marker('.content')) === null || (await page.locator('.island.like').count()) === 1)
  check('theme persists across navigation (shell stays mounted)', (await page.getAttribute('html', 'data-theme')) === themeAfterToggle, `theme=${themeAfterToggle}`)
  check('post page has like + timer + player islands', (await page.locator('.island.like').count()) === 1 && (await page.locator('.island.timer').count()) === 1 && (await page.locator('.island.player').count()) === 1)

  // ── 6. Swapped-in island hydrates: like button reacts ───────────────────
  await page.click('.island.like')
  check('like island hydrated after swap', (await text('.island.like .v')) === '1', `likes=${await text('.island.like .v')}`)

  // ── 7. Timer ticks, then disposal stops it on leave ─────────────────────
  await page.waitForTimeout(400)
  const t1 = await text('.island.timer .v')
  check('reading timer ticks on post page', Number(t1) > 0, `t=${t1}`)
  await page.click('.back') // leave → the outgoing timer island must be disposed (no leak)
  await page.waitForTimeout(500)
  await page.click('.sortable-list li:first-child .item-link') // re-enter → fresh timer near 0
  await page.waitForSelector('.island.timer', { timeout: 2000 })
  await page.waitForTimeout(200)
  const tFresh = await text('.island.timer .v')
  check('fresh timer starts near 0 after re-entry', Number(tFresh) < 1.5, `t=${tFresh}`)

  // ── 8. Back/forward ─────────────────────────────────────────────────────
  await page.goBack()
  await page.waitForTimeout(300)
  check('back returns to the index list', (await page.locator('.sortable-list').count()) === 1, page.url())
  await page.goForward()
  await page.waitForTimeout(300)
  check('forward returns to a post', (await page.locator('.island.like').count()) === 1, page.url())

  // ── 9. v1: data-bf-permanent keeps a LIVE node across a region swap ──────
  // Start the NowPlaying mini-player, let it accrue time, then page to the next
  // post. The marked node (play state + clock) survives the swap; the unmarked
  // reading timer beside it resets — same region, same swap, only the marker.
  await page.locator('.island.player .player-toggle').click() // ▶ play
  await page.waitForTimeout(1000)
  const playerBefore = Number(await text('.island.player .player-time'))
  check('NowPlaying ticks while playing', playerBefore > 0.5, `elapsed=${playerBefore}`)
  await mark('[data-bf-permanent="now-playing"]')
  await page.click('.pager a.pager-link[href*="/posts/"]')
  await page.waitForTimeout(400)
  check('permanent node is the SAME live instance across the swap', (await marker('[data-bf-permanent="now-playing"]')) === 'KEEP')
  const playerAfter = Number(await text('.island.player .player-time'))
  check('NowPlaying clock continued across the swap (state preserved)', playerAfter >= playerBefore, `${playerBefore} → ${playerAfter}`)
  check('NowPlaying keeps its play state across the swap', (await page.locator('.island.player .player-toggle').getAttribute('aria-label')) === 'pause')
  const timerAfter = Number(await text('.island.timer .v'))
  check('unmarked timer resets on the same swap (contrast)', timerAfter < 0.5 && playerAfter > 0.5, `timer=${timerAfter} vs player=${playerAfter}`)

  // ── 10. v2 sibling: the sidebar region persists while content swaps ──────
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(200)
  await page.click('.sidebar-pin')
  await page.click('.sidebar-pin')
  check('sidebar island hydrated (pin counter)', (await text('.sidebar-pin .v')) === '2')
  await mark('aside[bf-region] .sidebar')
  await page.click('.sortable-list li:first-child .item-link')
  await page.waitForSelector('.island.like', { timeout: 2000 })
  check('article content swapped in (like island present)', (await page.locator('.island.like').count()) === 1)
  check('sidebar region persisted across the content swap (v2 sibling)', (await text('.sidebar-pin .v')) === '2')
  check('sidebar is the SAME live node (never disposed)', (await marker('aside[bf-region] .sidebar')) === 'KEEP')

  // ── 11. v2 nested: outer region (ReaderToolbar) persists; inner swaps ────
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  await page.click('.reader-toolbar .rt-btn[aria-label="larger"]')
  await page.click('.reader-toolbar .rt-btn[aria-label="larger"]')
  check('reader toolbar hydrated (font level)', (await text('.reader-toolbar .v')) === '3')
  await mark('.reader-toolbar')
  await page.click('.sortable-list li:first-child .item-link')
  await page.waitForSelector('.island.like', { timeout: 2000 })
  check('inner region swapped (article in)', (await page.locator('.island.like').count()) === 1)
  check('outer region (toolbar) persisted across the inner swap (v2 nested)', (await text('.reader-toolbar .v')) === '3')
  check('toolbar is the SAME live node (outer region never swapped)', (await marker('.reader-toolbar')) === 'KEEP')

  // ── 12. No console / page errors throughout ─────────────────────────────
  check('no console or page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
} catch (e) {
  check('script ran to completion', false, String(e))
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)

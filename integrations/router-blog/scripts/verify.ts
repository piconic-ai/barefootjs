/**
 * Browser verification for the router-blog. Drives a real Chromium through
 * the router's behaviors and asserts each one, exiting non-zero on drift.
 *
 *   PORT=8788 bun run server.tsx &
 *   bun run scripts/verify.ts
 */
import { chromium } from '@playwright/test'

const BASE = process.env.BASE ?? 'http://localhost:8788'
const results: { name: string; ok: boolean; info: string }[] = []
const check = (name: string, ok: boolean, info = '') => {
  results.push({ name, ok, info })
  console.log(`${ok ? '✅' : '❌'} ${name}${info ? ` — ${info}` : ''}`)
}

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
})
const page = await browser.newPage()
const errors: string[] = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

const text = (sel: string) => page.locator(sel).first().innerText()
const navCount = () => page.locator('.shell-stats .chip:nth-child(2) b').innerText()

try {
  // ── 1. First load + hydration ───────────────────────────────────────────
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(300)
  const items = await page.locator('.sortable-list li').count()
  check('index hydrates with 10 posts', items === 10, `${items} items`)
  const uptime0 = await text('.shell-stats .chip:nth-child(1) b')
  await page.waitForTimeout(400)
  const uptime1 = await text('.shell-stats .chip:nth-child(1) b')
  check('shell uptime clock runs', uptime0 !== uptime1, `${uptime0} → ${uptime1}`)

  // ── 2. searchParams: sort with NO outlet swap ───────────────────────────
  const navsBeforeSort = await navCount()
  await page.click('.controls a.sort:has-text("title")')
  await page.waitForTimeout(200)
  const firstTitle = await text('.sortable-list li:first-child .item-link')
  const navsAfterSort = await navCount()
  check(
    'sort=title reorders list reactively',
    firstTitle.startsWith('A') || firstTitle.startsWith('B'),
    `first now "${firstTitle}"`,
  )
  check(
    'sort is a query-only update with NO outlet swap',
    navsBeforeSort === navsAfterSort,
    `partial navs ${navsBeforeSort} → ${navsAfterSort}`,
  )
  check('URL reflects sort', page.url().includes('sort=title'), page.url())

  // ── 3. Pin survives a re-sort (keyed island state) ──────────────────────
  await page.click('.sortable-list li:first-child .pin')
  const pinnedSlug = await page.locator('.sortable-list li.pinned .item-link').first().innerText()
  await page.click('.controls a.sort:has-text("date")')
  await page.waitForTimeout(200)
  const stillPinned = await page.locator('.sortable-list li.pinned .item-link').first().innerText()
  check('pinned item state survives re-sort', pinnedSlug === stillPinned, `"${pinnedSlug}"`)

  // ── 4. Tag filter (query-only, still no swap) ───────────────────────────
  const navsBeforeTag = await navCount()
  await page.click('.tags a.tag:has-text("#perf")')
  await page.waitForTimeout(200)
  const filtered = await page.locator('.sortable-list li:visible').count()
  check('tag=perf filters to 3 posts', filtered === 3, `${filtered} visible`)
  check('tag filter does NOT swap outlet', (await navCount()) === navsBeforeTag, `navs ${navsBeforeTag}`)

  // ── 5. Navigate to a post: outlet SWAPS, shell persists ─────────────────
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(200)
  // toggle theme, then navigate — the choice must persist (shell never reloads)
  await page.click('.toggle')
  const themeAfterToggle = await page.getAttribute('html', 'data-theme')
  const navsBeforePost = await navCount()
  await page.click('.sortable-list li:first-child .item-link')
  await page.waitForTimeout(300)
  check('clicking a post swaps the outlet (partial nav)', (await navCount()) !== navsBeforePost, `navs ${navsBeforePost} → ${await navCount()}`)
  check('theme persists across navigation (shell stays mounted)', (await page.getAttribute('html', 'data-theme')) === themeAfterToggle, `theme=${themeAfterToggle}`)
  check('post page has like + timer islands', (await page.locator('.island.like').count()) === 1 && (await page.locator('.island.timer').count()) === 1)

  // ── 6. Outlet island hydrates: like button reacts ───────────────────────
  await page.click('.island.like')
  check('like island hydrated after swap', (await text('.island.like .v')) === '1', `likes=${await text('.island.like .v')}`)

  // ── 7. Timer ticks, then disposal stops it on leave ─────────────────────
  await page.waitForTimeout(400)
  const t1 = await text('.island.timer .v')
  check('reading timer ticks on post page', Number(t1) > 0, `t=${t1}`)
  // leave the post → the outgoing timer island must be disposed (no leak)
  await page.click('.back')
  await page.waitForTimeout(500)
  // come back to a post and ensure a fresh timer starts near 0 (old one gone)
  await page.click('.sortable-list li:first-child .item-link')
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

  // ── 9. No console / page errors throughout ──────────────────────────────
  check('no console or page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
} catch (e) {
  check('script ran to completion', false, String(e))
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length === 0 ? 0 : 1)

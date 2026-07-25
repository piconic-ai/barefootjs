/**
 * SSR ↔ hydration audit runner.
 *
 *   bun run explorations/tagged-todo/harness/compile.ts   # first
 *   bun run explorations/tagged-todo/harness/audit.ts
 *
 * For every scenario in states.ts:
 *   1. loads the *initial* SSR HTML + compiled client JS in Chromium,
 *      waits for hydration, performs the scenario's clicks, and captures
 *      the DOM (semantic extraction + full serialization);
 *   2. loads the scenario's *fresh SSR* HTML with no client JS and runs
 *      the same extraction;
 *   3. diffs the two and records mismatches, console errors, and
 *      hydration-induced DOM changes (for the no-op scenario).
 *
 * Results: out/audit-results.json, out/dom-<scenario>.{hydrated,ssr}.html
 */
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Page } from '@playwright/test'
import { scenarios } from './states'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(HERE, '../out')
const RUNTIME_PATH = resolve(HERE, '../../../packages/client/dist/runtime/standalone.js')

const runtimeSource = readFileSync(RUNTIME_PATH, 'utf8')
const clientJs = readFileSync(resolve(OUT, 'client.js'), 'utf8')
const ssrHtml = new Map(
  scenarios.map(sc => [sc.id, readFileSync(resolve(OUT, `ssr-${sc.id}.html`), 'utf8')]),
)

function hostPage(body: string, withScript: boolean): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>tagged-todo audit</title>
<script type="importmap">
${JSON.stringify({ imports: { '@barefootjs/client/runtime': '/__runtime.js' } })}
</script>
</head>
<body>
${body}
${withScript ? '<script type="module" src="/__client.js"></script>' : ''}
</body>
</html>`
}

const server: Server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (url.pathname === '/__runtime.js') {
    res.writeHead(200, { 'content-type': 'application/javascript' }).end(runtimeSource)
    return
  }
  if (url.pathname === '/__client.js') {
    res.writeHead(200, { 'content-type': 'application/javascript' }).end(clientJs)
    return
  }
  const m = url.pathname.match(/^\/page\/([\w-]+)$/)
  if (m && ssrHtml.has(m[1])) {
    const withScript = url.searchParams.get('mode') !== 'ssr'
    // Hydrate mode always starts from the *initial* SSR page and drives
    // interactions; ssr mode serves the scenario's own fresh SSR HTML.
    const body = withScript ? ssrHtml.get('initial')! : ssrHtml.get(m[1])!
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(hostPage(body, withScript))
    return
  }
  res.writeHead(404).end('not found')
})

await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

/** Runs inside the page: extract the semantically visible state. */
const extractState = () => {
  const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()
  const rows = [...document.querySelectorAll('#todo-table tbody tr')].map(tr => ({
    key: tr.getAttribute('data-key'),
    dataTitle: tr.getAttribute('data-title'),
    cells: [...tr.querySelectorAll('td')]
      .filter(td => td.className !== 'actions')
      .map(td => `${td.className}=${norm(td.textContent)}`),
  }))
  const tags = [...document.querySelectorAll('#tag-list li')].map(li => ({
    key: li.getAttribute('data-key'),
    dataTag: li.getAttribute('data-tag'),
    text: norm(li.textContent),
    attrNames: li.getAttributeNames(),
  }))
  return {
    heading: norm(document.querySelector('#heading')?.textContent),
    sortLabel: norm(document.querySelector('#cycle-sort')?.textContent),
    hideLabel: norm(document.querySelector('#toggle-hide-done')?.textContent),
    rowCount: rows.length,
    rows,
    tags,
  }
}

type Extracted = ReturnType<typeof extractState> extends infer T ? T : never

async function settle(page: Page) {
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => setTimeout(r, 30))))
}

interface ScenarioResult {
  scenario: string
  consoleMessages: string[]
  pageErrors: string[]
  hydratedState: unknown
  ssrState: unknown
  diffs: string[]
  hydrationMutatedDom?: boolean
}

/** Flat, order-sensitive comparison with dotted paths. */
function diffValues(path: string, a: unknown, b: unknown, out: string[]) {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) out.push(`${path}: length ${a.length} (hydrated) vs ${b.length} (ssr)`)
    const n = Math.max(a.length, b.length)
    for (let i = 0; i < n; i++) diffValues(`${path}[${i}]`, a[i], b[i], out)
    return
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    for (const k of keys) {
      diffValues(`${path}.${k}`, (a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], out)
    }
    return
  }
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    out.push(`${path}: ${JSON.stringify(a)} (hydrated) vs ${JSON.stringify(b)} (ssr)`)
  }
}

// Pinned @playwright/test expects a newer bundled Chromium than the
// preinstalled one — point at the environment's binary explicitly.
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/opt/pw-browsers/chromium',
})
const results: ScenarioResult[] = []

for (const sc of scenarios) {
  const page = await browser.newPage()
  const consoleMessages: string[] = []
  const pageErrors: string[] = []
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      consoleMessages.push(`${msg.type()}: ${msg.text()}`)
    }
  })
  page.on('pageerror', err => pageErrors.push(err.message))

  // --- hydrate side: initial SSR + client JS, then drive actions ---
  await page.goto(`${baseUrl}/page/${sc.id}`)
  const preHydration = await page.evaluate(() => document.body.firstElementChild?.outerHTML ?? '')
  await settle(page)
  const postHydration = await page.evaluate(() => document.body.firstElementChild?.outerHTML ?? '')
  for (const a of sc.actions) {
    await page.locator(a.click).first().click()
    await settle(page)
  }
  const hydratedState = await page.evaluate(extractState)
  const hydratedDom = await page.evaluate(() => document.body.firstElementChild?.outerHTML ?? '')
  await page.close()

  // --- fresh SSR side: scenario's own SSR HTML, no client JS ---
  const ssrPage = await browser.newPage()
  await ssrPage.goto(`${baseUrl}/page/${sc.id}?mode=ssr`)
  const ssrState = await ssrPage.evaluate(extractState)
  const ssrDom = await ssrPage.evaluate(() => document.body.firstElementChild?.outerHTML ?? '')
  await ssrPage.close()

  const diffs: string[] = []
  diffValues('state', hydratedState, ssrState, diffs)

  const result: ScenarioResult = {
    scenario: sc.id,
    consoleMessages,
    pageErrors,
    hydratedState,
    ssrState,
    diffs,
  }
  if (sc.id === 'initial') {
    result.hydrationMutatedDom = preHydration !== postHydration
    if (result.hydrationMutatedDom) {
      writeFileSync(resolve(OUT, 'dom-initial.pre-hydration.html'), preHydration + '\n')
      writeFileSync(resolve(OUT, 'dom-initial.post-hydration.html'), postHydration + '\n')
    }
  }
  results.push(result)
  writeFileSync(resolve(OUT, `dom-${sc.id}.hydrated.html`), hydratedDom + '\n')
  writeFileSync(resolve(OUT, `dom-${sc.id}.ssr.html`), ssrDom + '\n')

  const status = diffs.length === 0 && pageErrors.length === 0 && consoleMessages.length === 0 ? 'OK' : 'DIVERGED'
  console.log(`\n=== ${sc.id}: ${status} ===`)
  for (const d of diffs) console.log(`  diff: ${d}`)
  for (const e of pageErrors) console.log(`  pageerror: ${e}`)
  for (const c of consoleMessages) console.log(`  console ${c}`)
}

await browser.close()
await new Promise<void>(r => server.close(() => r()))
writeFileSync(resolve(OUT, 'audit-results.json'), JSON.stringify(results, null, 2))
console.log(`\nwrote ${OUT}/audit-results.json`)

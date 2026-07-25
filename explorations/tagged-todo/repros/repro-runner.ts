/**
 * Compile, SSR, serve, and browser-drive each minimal repro case.
 *
 *   bun run explorations/tagged-todo/repros/repro-runner.ts
 *
 * Prints per case: compile diagnostics, SSR ok, hydration/page errors,
 * inspected subtree before and after the scripted clicks.
 * Results also land in ../out/repro-results.json.
 */
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { compileJSX } from '../../../packages/jsx/src/index'
import { HonoAdapter } from '../../../packages/adapter-hono/src/adapter/index'
import { renderHonoComponent } from '../../../packages/adapter-hono/src/test-render'
import { cases } from './cases'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(HERE, '../out')
const RUNTIME_PATH = resolve(HERE, '../../../packages/client/dist/runtime/standalone.js')
const runtimeSource = readFileSync(RUNTIME_PATH, 'utf8')

interface Prepared {
  id: string
  diagnostics: string[]
  clientJs: string
  ssrHtml: string
}

const prepared = new Map<string, Prepared>()
for (const c of cases) {
  const compiled = compileJSX(c.source, `${c.componentName}.tsx`, { adapter: new HonoAdapter() })
  const diagnostics = compiled.errors.map(e => `${e.severity}/${e.code}: ${e.message}`)
  const clientJs = compiled.files.find(f => f.type === 'clientJs')?.content ?? ''
  const ssrHtml = await renderHonoComponent({
    source: c.source,
    adapter: new HonoAdapter(),
    props: { __instanceId: `${c.componentName}_test` },
    componentName: c.componentName,
  })
  prepared.set(c.id, { id: c.id, diagnostics, clientJs, ssrHtml })
}

function hostPage(body: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<script type="importmap">${JSON.stringify({ imports: { '@barefootjs/client/runtime': '/__runtime.js' } })}</script>
</head><body>
${body}
<script type="module" src="__client.js"></script>
</body></html>`
}

const server: Server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (url.pathname === '/__runtime.js') {
    res.writeHead(200, { 'content-type': 'application/javascript' }).end(runtimeSource)
    return
  }
  const seg = url.pathname.split('/').filter(Boolean)
  const p = seg[0] ? prepared.get(seg[0]) : undefined
  if (!p) {
    res.writeHead(404).end('not found')
    return
  }
  if (seg[1] === '__client.js') {
    res.writeHead(200, { 'content-type': 'application/javascript' }).end(p.clientJs)
    return
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(hostPage(p.ssrHtml))
})
await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/opt/pw-browsers/chromium',
})

const results: Array<Record<string, unknown>> = []
for (const c of cases) {
  const p = prepared.get(c.id)!
  const page = await browser.newPage()
  const errors: string[] = []
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`console-error: ${msg.text()}`)
  })
  page.on('pageerror', err => errors.push(`pageerror: ${err.message}`))
  await page.goto(`${baseUrl}/${c.id}/`)
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => setTimeout(r, 30))))
  const before = await page.evaluate(
    sel => document.querySelector(sel)?.outerHTML ?? '(missing)',
    c.inspect,
  )
  for (const sel of c.clicks) {
    try {
      await page.locator(sel).first().click({ timeout: 3000 })
    } catch (e) {
      errors.push(`click-failed(${sel}): ${(e as Error).message.split('\n')[0]}`)
    }
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => setTimeout(r, 30))))
  }
  const after = await page.evaluate(
    sel => document.querySelector(sel)?.outerHTML ?? '(missing)',
    c.inspect,
  )
  await page.close()

  results.push({ id: c.id, claim: c.claim, diagnostics: p.diagnostics, errors, before, after })
  console.log(`\n========== ${c.id} ==========`)
  console.log(`claim: ${c.claim}`)
  if (p.diagnostics.length) console.log(`diagnostics: ${p.diagnostics.join(' | ')}`)
  console.log(`ssr subtree : ${p.ssrHtml.match(new RegExp(`<[^>]*id="list"[\\s\\S]*?</ul>`))?.[0] ?? '(n/a)'}`)
  console.log(`before      : ${before}`)
  console.log(`after clicks: ${after}`)
  for (const e of errors) console.log(`  ${e}`)
}

await browser.close()
await new Promise<void>(r => server.close(() => r()))
writeFileSync(resolve(OUT, 'repro-results.json'), JSON.stringify(results, null, 2))
console.log(`\nwrote ${OUT}/repro-results.json`)

/** @jsxImportSource hono/jsx */
import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { jsxRenderer } from 'hono/jsx-renderer'
import { JSDOM } from 'jsdom'
import { barefootDevReload, BfDevReload } from '../app'

describe('dev reload script endpoint', () => {
  for (const endpoint of [
    '/__reload',
    '</script><script>throw new Error("injected")</script>',
    '</ScRiPt><img src=x>',
    '<!--<script>',
    '/reload?value="\\\n\r\u2028\u2029&',
  ]) {
    test(`preserves ${JSON.stringify(endpoint)} as EventSource data`, async () => {
      const app = new Hono()
      app.use(barefootDevReload({ endpoint, enabled: true }))
      app.use(jsxRenderer(() => <><BfDevReload /><p id="after">after</p></>))
      app.get('/', c => c.render(null))
      const response = await app.request('/')
      const dom = new JSDOM(await response.text())
      try {
        const scripts = dom.window.document.querySelectorAll('script')
        expect(scripts).toHaveLength(1)
        expect(dom.window.document.querySelector('#after')?.textContent).toBe('after')
        expect(dom.window.document.querySelectorAll('img')).toHaveLength(0)
        const endpoints: string[] = []
        class EventSource {
          constructor(url: string) { endpoints.push(url) }
          addEventListener() {}
        }
        new Function('window', 'EventSource', scripts[0].textContent)({}, EventSource)
        expect(endpoints).toEqual([endpoint])
      } finally {
        dom.window.close()
      }
    })
  }

  test('disabled middleware emits no script', async () => {
    const app = new Hono()
    app.use(barefootDevReload({ endpoint: '/__reload', enabled: false }))
    app.use(jsxRenderer(() => <BfDevReload />))
    app.get('/', c => c.render(null))
    expect(await (await app.request('/')).text()).not.toContain('<script')
  })
})

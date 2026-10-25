import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { RUNTIME_PATH } from './fixture-host'

const ORIGIN = 'http://bf-css-escape.test'

for (const mode of ['native', 'missing-method', 'missing-object']) {
  test(`CSS attribute selectors preserve scope IDs with ${mode}`, async ({ page }) => {
    const runtime = readFileSync(RUNTIME_PATH, 'utf8')
    await page.route(`${ORIGIN}/**`, route => {
      if (new URL(route.request().url()).pathname === '/runtime.js') {
        return route.fulfill({ contentType: 'text/javascript', body: runtime })
      }
      const setup = mode === 'missing-object'
        ? 'globalThis.CSS = undefined'
        : mode === 'missing-method' ? 'CSS.escape = undefined' : ''
      return route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><script type="module">
          ${setup};
          const { cssEscape } = await import('/runtime.js');
          window.escapeScopeId = cssEscape;
        </script>`,
      })
    })
    await page.goto(`${ORIGIN}/`)
    await page.waitForFunction(() => typeof Reflect.get(window, 'escapeScopeId') === 'function')
    const matches = await page.evaluate(() => {
      const cssEscape: (s: string) => string = Reflect.get(window, 'escapeScopeId')
      const values = [
        '', 'scope_1', '0abc', 'root\\name', 'root\\', 'root"name',
        '\\"], [bf-m="s0', 'line\nfeed', 'carriage\rreturn', '\fform',
        '\x01a', '\x1f9', '\x7f0', '日本語🐾', 'null\0value',
      ]
      return values.map(value => {
        const root = document.createElement('div')
        const decoy = document.createElement('span')
        decoy.setAttribute('bf-m', 's0')
        const child = document.createElement('span')
        // CSS Syntax replaces U+0000 with U+FFFD, including CSS.escape.
        child.setAttribute('bf-h', value.replace(/\0/g, '\uFFFD'))
        child.setAttribute('bf-m', 's0')
        root.append(decoy, child)
        const selected = root.querySelectorAll(`[bf-h="${cssEscape(value)}"][bf-m="s0"]`)
        return { value, exactMatch: selected.length === 1 && selected[0] === child }
      })
    })
    expect(matches.filter(result => !result.exactMatch)).toEqual([])
  })
}

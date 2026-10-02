/**
 * `parseHTML(markup, parent)` parses dynamic markup in `parent`'s own
 * context, in a real browser (#3265).
 *
 * happy-dom, which the runtime's unit tests run on, implements neither the
 * MathML namespace nor the HTML parser's integration points, so the cases
 * that depend on them can only be checked here. For each foreign parent the
 * runtime's result must equal what the browser's own parser makes of the
 * same markup nested in that parent:
 *
 * - SVG `<desc>` / `<title>` / `<foreignObject>` and `<annotation-xml>` with
 *   an HTML `encoding` (HTML integration points): every child is HTML.
 * - MathML `<mi>` / `<mo>` / `<mn>` / `<ms>` / `<mtext>` (text integration
 *   points): children are HTML except `<mglyph>` / `<malignmark>`, which
 *   stay MathML.
 * - Any other SVG / MathML parent: children are SVG / MathML.
 */
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { RUNTIME_PATH } from './fixture-host'

const ORIGIN = 'http://bf-parse-html.test'

test.beforeEach(async ({ page }) => {
  const runtime = readFileSync(RUNTIME_PATH, 'utf8')
  await page.route(`${ORIGIN}/**`, (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/runtime.js') return route.fulfill({ contentType: 'text/javascript', body: runtime })
    return route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><body><script type="module">
        import { parseHTML } from '/runtime.js'
        window.parseHTML = parseHTML
        window.ready = true
      </script></body></html>`,
    })
  })
  await page.goto(`${ORIGIN}/`)
  await page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready === true)
})

const MARKUP =
  '<a href="#x"></a><span></span><circle></circle><mglyph></mglyph><malignmark></malignmark><mi></mi>'

const PARENTS: ReadonlyArray<{ label: string; root: 'svg' | 'math'; tag: string; attrs?: string }> = [
  { label: 'svg <g>', root: 'svg', tag: 'g' },
  { label: 'svg <desc>', root: 'svg', tag: 'desc' },
  { label: 'svg <title>', root: 'svg', tag: 'title' },
  { label: 'svg <foreignObject>', root: 'svg', tag: 'foreignObject' },
  { label: 'math <mrow>', root: 'math', tag: 'mrow' },
  { label: 'math <mi>', root: 'math', tag: 'mi' },
  { label: 'math <mo>', root: 'math', tag: 'mo' },
  { label: 'math <mn>', root: 'math', tag: 'mn' },
  { label: 'math <ms>', root: 'math', tag: 'ms' },
  { label: 'math <mtext>', root: 'math', tag: 'mtext' },
  { label: 'math <annotation-xml encoding="text/html">', root: 'math', tag: 'annotation-xml', attrs: ' encoding="text/html"' },
  { label: 'math <annotation-xml> (no encoding)', root: 'math', tag: 'annotation-xml' },
]

for (const { label, root, tag, attrs = '' } of PARENTS) {
  test(`parseHTML under ${label} matches the browser's own parse`, async ({ page }) => {
    const { actual, expected } = await page.evaluate(
      ({ markup, root, tag, attrs }) => {
        const describe = (nodes: Iterable<Element>) =>
          Array.from(nodes).map((e) => `${e.localName}:${e.namespaceURI}`)
        // The browser parsing the same markup nested in the real parent.
        const tpl = document.createElement('template')
        tpl.innerHTML = `<${root}><${tag}${attrs}>${markup}</${tag}></${root}>`
        const parent = tpl.content.firstElementChild!.firstElementChild!
        const expected = describe(parent.children)
        // The runtime, given that parent element as context.
        const parseHTML = (window as unknown as { parseHTML: (h: string, p: Element) => DocumentFragment }).parseHTML
        const actual = describe(parseHTML(markup, parent).children)
        return { actual, expected }
      },
      { markup: MARKUP, root, tag, attrs },
    )
    expect(actual).toEqual(expected)
  })
}

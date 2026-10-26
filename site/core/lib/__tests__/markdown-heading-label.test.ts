import { expect, test } from 'bun:test'
import { decodeHTML } from 'entities'
import { renderMarkdown } from '../markdown'

const cases = [
  { heading: 'Overview', label: 'Overview' },
  { heading: 'He said "hi" onmouseover="alert(1)', label: 'He said "hi" onmouseover="alert(1)' },
  { heading: '<em>bold</em> "title"', label: 'bold "title"' },
  { heading: 'A &amp; B &quot;quoted&quot; &copy; &NotEqualTilde;', label: 'A & B "quoted" © ≂̸' },
  { heading: 'prefix <script', label: 'prefix <script' },
]

for (const entry of cases) {
  test(`heading anchor keeps ${JSON.stringify(entry.heading)} in its label`, async () => {
    const { html } = await renderMarkdown(`## ${entry.heading}`)
    const anchors: { names: string[]; label: string }[] = []
    await new HTMLRewriter().on('a.heading-anchor', {
      element(element) {
        anchors.push({
          names: [...element.attributes].map(([name]) => name).sort(),
          label: decodeHTML(element.getAttribute('aria-label') ?? ''),
        })
      },
    }).transform(new Response(html)).text()
    expect(anchors).toEqual([{ names: ['aria-label', 'class', 'href'], label: `Link to ${entry.label}` }])
  })
}

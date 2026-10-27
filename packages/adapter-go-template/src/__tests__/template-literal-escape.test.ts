/**
 * Literal segments of a template literal land in Go-template markup outside
 * any `{{…}}` action, so html/template never escapes them. Each shape below
 * carries `"` / `<` / `>` / `&` in its literal text; unescaped, the attribute
 * forms fail to parse (`"` closes `class="…"`) and the text form emits a tag.
 * The shared `template-literal-attribute-quotes` fixture covers the nested
 * attribute shape against Hono; this file pins the sibling positions.
 */

import { expect, test } from 'bun:test'
import { GoTemplateAdapter } from '../adapter/go-template-adapter'
import { renderGoTemplateComponent } from '../test-render'

const cases = [
  {
    name: 'a flat attribute template literal',
    jsx: '<div className={`content-["x"] [&>svg]:a ${tag} z`}>ok</div>',
    expected: '<div class="content-[&quot;x&quot;] [&amp;&gt;svg]:a ok z"',
  },
  {
    name: 'a nested attribute template literal',
    jsx: '<div title={`t-["q"] ${`n-<"y"> ${tag}`}`}>ok</div>',
    expected: '<div title="t-[&quot;q&quot;] n-&lt;&quot;y&quot;&gt; ok"',
  },
  {
    name: 'a nested text template literal',
    jsx: '<div>{`p ${`q-"<r>" & ${tag}`}`}</div>',
    expected: 'p q-&quot;&lt;r&gt;&quot; &amp; ok',
  },
]

for (const entry of cases) {
  test(`escapes the literal segments of ${entry.name}`, async () => {
    const html = await renderGoTemplateComponent({
      source: `export function Quoted({ tag }: { tag: string }) {\n  return ${entry.jsx}\n}`,
      adapter: new GoTemplateAdapter(),
      props: { tag: 'ok' },
    })
    expect(html).toContain(entry.expected)
  })
}

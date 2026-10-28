/**
 * The reference harness inlines child components by splicing their compiled
 * modules together (`renderHonoComponent`'s `components`). Its import and
 * export rewriting walks the top-level statements, so an import- or
 * export-looking line inside a child's template literal is text, while a
 * real import of a sibling child (aliased or not) still resolves.
 */

import { describe, expect, test } from 'bun:test'
import { HonoAdapter } from '../src/adapter'
import { renderHonoComponent } from '../src/test-render'

const source = `
import { Mid } from './mid'
export function Root() {
  return <div><Mid /></div>
}
`

describe('renderHonoComponent inlining', () => {
  test('import- and export-looking lines in a child template literal stay text', async () => {
    const html = await renderHonoComponent({
      source,
      adapter: new HonoAdapter(),
      components: {
        './tag.tsx': 'export function Tag() {\n  return <i>tag</i>\n}\n',
        './mid.tsx': [
          "import { Tag } from './tag'",
          'const text = `before',
          "import { Tag } from './tag'",
          'export default text',
          'export { Tag }',
          'after`',
          'export function Mid() {',
          '  return <b>{text}<Tag /></b>',
          '}',
          '',
        ].join('\n'),
      },
    })
    expect(html).toContain(
      'before\nimport { Tag } from &#39;./tag&#39;\nexport default text\nexport { Tag }\nafter<i',
    )
  })

  test('an aliased import of a sibling child binds its local name', async () => {
    const html = await renderHonoComponent({
      source,
      adapter: new HonoAdapter(),
      components: {
        './tag.tsx': 'export function Tag() {\n  return <i>tag</i>\n}\n',
        './mid.tsx': "import { Tag as Label } from './tag'\nexport function Mid() {\n  return <b><Label /></b>\n}\n",
      },
    })
    expect(html).toContain('<i')
    expect(html).toContain('>tag</i></b>')
  })
})

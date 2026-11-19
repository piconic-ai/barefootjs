/**
 * An end tag spelled across the children of `<style>` / `<script>` (#3934).
 * The Hono adapter prints the whole element text through ONE `bfRawText`
 * call, so `{'<'}{value}` with `value` = `/style><img …>` cannot end the
 * element. Rendered and parsed here; the cross-adapter twin is the
 * `raw-text-split-boundary` conformance fixture.
 */
import { beforeAll, describe, expect, test } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { compileJSX } from '@barefootjs/jsx'
import { HonoAdapter } from '../adapter'
import { renderHonoComponent } from '../test-render'
import { bfRawText } from '../utils'

beforeAll(() => {
  if (typeof window === 'undefined') GlobalRegistrator.register()
})

const source = `
export function Split({ value, a, b }: { value: string; a: string; b: string }) {
  return (
    <div>
      <style>{'<'}{value}</style>
      <script type="text/plain">{a}{b}</script>
      <script type="text/plain">&lt;/scr<>{b}</></script>
      <b>after</b>
    </div>
  )
}
`
const props = {
  value: '/style><img src=x onerror="alert(1)">',
  a: '</scr',
  b: 'ipt><img src=x onerror="alert(1)">',
}

describe('split end tags in <style> / <script>', () => {
  test('the marked template calls bfRawText once per element, over every part', () => {
    const result = compileJSX(source, 'Split.tsx', { adapter: new HonoAdapter() })
    expect(result.errors).toEqual([])
    const template = result.files.find(f => f.type === 'markedTemplate')?.content ?? ''
    expect(template).toContain(`<style bf="s1">{bfRawText("style", [('<'), (value)])}</style>`)
    expect(template.split('bfRawText(').length - 1).toBe(3)
  })

  test('the rendered HTML holds no injected element', async () => {
    const html = await renderHonoComponent({ source, adapter: new HonoAdapter(), props })
    expect(html).not.toContain('</style><img')
    expect(html).not.toContain('</script><img')
    const host = document.createElement('div')
    host.innerHTML = html
    expect(host.querySelector('img')).toBeNull()
    const root = host.firstElementChild!
    expect(Array.from(root.children).map(el => el.tagName)).toEqual(['STYLE', 'SCRIPT', 'SCRIPT', 'B'])
    expect(root.children[0].textContent).toBe('<\\/style><img src=x onerror="alert(1)">')
    expect(root.children[1].textContent).toBe('\\u003c/script><img src=x onerror="alert(1)">')
    expect(root.children[2].textContent).toBe('\\u003c/script><img src=x onerror="alert(1)">')
  })

  test('bfRawText joins its parts before encoding', () => {
    expect(String(bfRawText('style', ['<', '/style>']))).toBe('<\\/style>')
    expect(String(bfRawText('script', ['<!--<scr', null, ['ipt', '>'], 1]))).toBe('<!--\\u003cscript>1')
  })
})

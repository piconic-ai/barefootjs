/**
 * `escapeRawTextContent` runtime contract (#3934).
 *
 * The text of a `<style>` / `<script>` in a client template is parsed as raw
 * text: the HTML parser decodes no character reference there, so the value is
 * written as it is and only the sequences that would end the element are
 * rewritten, byte-identical to the SSR adapters' output.
 */
import { describe, test, expect, beforeAll } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { escapeRawTextContent } from '../../src/runtime/component'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register()
  }
})

describe('escapeRawTextContent', () => {
  test('does not HTML-escape', () => {
    expect(escapeRawTextContent('style', `a[href="x"] > b & 'c'`)).toBe(`a[href="x"] > b & 'c'`)
    expect(escapeRawTextContent('script', `if (a < b && "c") {}`)).toBe(`if (a < b && "c") {}`)
  })

  test('rewrites the sequences that would end the element', () => {
    expect(escapeRawTextContent('style', 'x</style></STYLE><p>')).toBe('x<\\/style><\\/STYLE><p>')
    expect(escapeRawTextContent('script', '"</script><Script>"')).toBe('"\\u003c/script>\\u003cScript>"')
  })

  test('the rewritten text parses back to one element holding the value', () => {
    const host = document.createElement('div')
    const css = '.a::after { content: "</style><i id=x>" }'
    const json = JSON.stringify({ k: '</script><i id=y><!--<script>' })
    host.innerHTML = `<style>${escapeRawTextContent('style', css)}</style><script type="application/json">${escapeRawTextContent('script', json)}</script><b></b>`
    expect(host.querySelector('#x')).toBeNull()
    expect(host.querySelector('#y')).toBeNull()
    expect(host.children.length).toBe(3)
    expect(JSON.parse(host.querySelector('script')!.textContent!)).toEqual({ k: '</script><i id=y><!--<script>' })
  })

  test('the parts of the element text are joined before they are encoded', () => {
    // An end tag spelled across parts: neither part holds it.
    expect(escapeRawTextContent('style', ['<', '/style><i class="pwn">'])).toBe('<\\/style><i class="pwn">')
    expect(escapeRawTextContent('script', ['</scr', 'IPT><i class="pwn">'])).toBe('\\u003c/scrIPT><i class="pwn">')
    expect(escapeRawTextContent('script', ['<!--', '<scr', 'ipt>'])).toBe('<!--\\u003cscript>')
    // Non-string parts are turned into text first.
    expect(escapeRawTextContent('style', ['<', null, '/sty', ['le', '>'], 1, false])).toBe('<\\/style>1')
    expect(escapeRawTextContent('style', ['<', { toString: () => '/style>' }])).toBe('<\\/style>')
  })

  test('split parts inject no element and leave the next sibling in place', () => {
    const host = document.createElement('div')
    host.innerHTML =
      `<style>${escapeRawTextContent('style', ['<', '/style><i class="pwn">'])}</style>` +
      `<script type="text/plain">${escapeRawTextContent('script', ['</scr', 'ipt><i class="pwn">'])}</script>` +
      `<script type="text/plain">${escapeRawTextContent('script', ['<!--<scr', 'ipt><i class="pwn">'])}</script><b></b>`
    expect(host.querySelector('.pwn')).toBeNull()
    expect(Array.from(host.children).map(el => el.tagName)).toEqual(['STYLE', 'SCRIPT', 'SCRIPT', 'B'])
    expect(host.children[0].textContent).toBe('<\\/style><i class="pwn">')
    expect(host.children[1].textContent).toBe('\\u003c/script><i class="pwn">')
    expect(host.children[2].textContent).toBe('<!--\\u003cscript><i class="pwn">')
  })

  test('encoding an already encoded text changes nothing', () => {
    for (const tag of ['style', 'script'] as const) {
      const once = escapeRawTextContent(tag, ['<', '/style></script><script>'])
      expect(escapeRawTextContent(tag, [once])).toBe(once)
    }
  })

  test('nullish and boolean values render no text; an array renders its items in order', () => {
    expect(escapeRawTextContent('style', null)).toBe('')
    expect(escapeRawTextContent('style', undefined)).toBe('')
    expect(escapeRawTextContent('script', false)).toBe('')
    expect(escapeRawTextContent('script', 0)).toBe('0')
    expect(escapeRawTextContent('style', ['a', null, 1, ['</style>']])).toBe('a1<\\/style>')
  })
})

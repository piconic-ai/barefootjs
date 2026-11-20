/**
 * `escapeRawTextContent` runtime contract (#3934).
 *
 * The text of a `<style>` / `<script>` in a client template is parsed as raw
 * text: the HTML parser decodes no character reference there, so the value is
 * written as it is and each `<` that could begin markup is rewritten to its
 * CSS / JS escape, byte-identical to the SSR adapters' output. The helper
 * receives the element's WHOLE text as an array of parts and joins them
 * before encoding.
 */
import { describe, test, expect, beforeAll } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { escapeRawTextContent } from '../../src/runtime/component'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register()
  }
})

const PWN = '<i class="pwn">'

describe('escapeRawTextContent', () => {
  test('does not HTML-escape', () => {
    expect(escapeRawTextContent('style', `a[href="x"] > b & 'c'`)).toBe(`a[href="x"] > b & 'c'`)
    expect(escapeRawTextContent('script', `if (a < b && "c") {}`)).toBe(`if (a < b && "c") {}`)
  })

  test('rewrites each `<` that could begin markup', () => {
    expect(escapeRawTextContent('style', 'x</style></STYLE><p>')).toBe('x\\3c /style>\\3c /STYLE>\\3c p>')
    expect(escapeRawTextContent('script', '"</script><Script><!--"')).toBe('"\\u003c/script>\\u003cScript>\\u003c!--"')
  })

  test('the parts of the element text are joined before they are encoded', () => {
    // An end tag spelled across parts: neither part holds it.
    expect(escapeRawTextContent('style', ['<', `/style>${PWN}`])).toBe('\\3c /style>\\3c i class="pwn">')
    expect(escapeRawTextContent('script', ['</scr', `IPT>${PWN}`])).toBe('\\u003c/scrIPT>\\u003ci class="pwn">')
    expect(escapeRawTextContent('script', ['<', '!--', '<', 'script>'])).toBe('\\u003c!--\\u003cscript>')
    // Non-string parts are turned into text first.
    expect(escapeRawTextContent('style', ['<', null, '/sty', ['le', '>'], 1, false])).toBe('\\3c /style>1')
    expect(escapeRawTextContent('style', ['<', { toString: () => '/style>' }])).toBe('\\3c /style>')
    expect(escapeRawTextContent('style', ['<', undefined, true, 'a>'])).toBe('\\3c a>')
  })

  test('parsed as HTML raw text: no injected element, the whole text stays inside', () => {
    const host = document.createElement('div')
    host.innerHTML =
      `<style>${escapeRawTextContent('style', ['<', `/style>${PWN}`])}</style>` +
      `<script type="text/plain">${escapeRawTextContent('script', ['</scr', `ipt>${PWN}`])}</script>` +
      `<script type="text/plain">${escapeRawTextContent('script', ['<!--<scr', `ipt>${PWN}`])}</script><b></b>`
    expect(host.querySelector('.pwn')).toBeNull()
    expect(Array.from(host.children).map(el => el.tagName)).toEqual(['STYLE', 'SCRIPT', 'SCRIPT', 'B'])
    expect(host.children[0].textContent).toBe('\\3c /style>\\3c i class="pwn">')
    expect(host.children[1].textContent).toBe('\\u003c/script>\\u003ci class="pwn">')
    expect(host.children[2].textContent).toBe('\\u003c!--\\u003cscript>\\u003ci class="pwn">')
  })

  test('parsed as foreign content (inside an <svg>): no element is created from the text', () => {
    const host = document.createElement('div')
    host.innerHTML =
      `<svg><style>${escapeRawTextContent('style', ['<', `img class="pwn">${PWN}</style>${PWN}`])}</style>` +
      `<script>${escapeRawTextContent('script', [`${PWN}<!--<a class="pwn"><?x <![CDATA[`, PWN])}</script></svg><b></b>`
    expect(host.querySelector('.pwn')).toBeNull()
    expect(host.querySelectorAll('i, img, a').length).toBe(0)
    // happy-dom is not a faithful foreign-content parser, so the structure
    // is not asserted here; the real-browser check is the
    // `raw-text-foreign-content-reactive` fixture (Chromium).
  })

  test('a character reference spelled across parts is not left for a foreign-content parse', () => {
    expect(escapeRawTextContent('script', ['"a&', 'quot;+alert(1)+&', '#34;"'])).toBe(
      '"a\\u0026quot;+alert(1)+\\u0026#34;"',
    )
    expect(escapeRawTextContent('style', ['&', 'lt;img>'])).toBe('\\26 lt;img>')
    // No `&` is left before a letter or `#`, so a parser that decodes
    // references (the element inside an <svg>) finds none: the text is the
    // same string either way. Chromium checks the SVG parse itself in the
    // `raw-text-foreign-content-reactive` fixture.
    const value = 'a&quot;+alert(1)+&quot;&lt;img class="pwn"&gt;'
    const text = escapeRawTextContent('script', ['var s = ', JSON.stringify(value)])
    expect(text).not.toMatch(/&[A-Za-z#]/)
    expect(new Function(`${text}; return s`)()).toBe(value)
  })

  test('the JSON a script data block carries is recovered unchanged', () => {
    const value = { k: `</script>${PWN}<!--<script>&quot;&amp;` }
    const host = document.createElement('div')
    host.innerHTML = `<script type="application/json">${escapeRawTextContent('script', [JSON.stringify(value)])}</script>`
    expect(JSON.parse(host.querySelector('script')!.textContent!)).toEqual(value)
  })

  test('a backslash in one part and the character in the next keep the string they spelled', () => {
    const BS = '\\'
    // `"\<img …>"` is the text `<img …>`: the escape replaces the pair.
    const one = escapeRawTextContent('script', ['var s = "', BS, '<img class=pwn>', '"'])
    expect(one).toBe(`var s = "${BS}u003cimg class=pwn>"`)
    expect(new Function(`${one}; return s`)()).toBe('<img class=pwn>')
    // An even run is complete pairs: the escape follows it.
    const two = escapeRawTextContent('script', ['var s = "', BS, BS, '&quot;', '"'])
    expect(two).toBe(`var s = "${BS}${BS}${BS}u0026quot;"`)
    expect(new Function(`${two}; return s`)()).toBe(`${BS}&quot;`)
    expect(escapeRawTextContent('style', ['"', BS, '<b', BS, '&c"'])).toBe(`"${BS}3c b${BS}26 c"`)
    // Still no markup for either parse.
    const host = document.createElement('div')
    host.innerHTML = `<style>${escapeRawTextContent('style', [BS, PWN, BS, BS, PWN])}</style><b></b>`
    expect(host.querySelector('.pwn')).toBeNull()
    expect(Array.from(host.children).map(el => el.tagName)).toEqual(['STYLE', 'B'])
  })

  test('encoding an already encoded text changes nothing', () => {
    for (const tag of ['style', 'script'] as const) {
      const once = escapeRawTextContent(tag, ['<', '/style></script><script><!--'])
      expect(escapeRawTextContent(tag, [once])).toBe(once)
    }
  })

  test('nullish and boolean values render no text; an array renders its items in order', () => {
    expect(escapeRawTextContent('style', null)).toBe('')
    expect(escapeRawTextContent('style', undefined)).toBe('')
    expect(escapeRawTextContent('script', false)).toBe('')
    expect(escapeRawTextContent('script', 0)).toBe('0')
    expect(escapeRawTextContent('style', ['a', null, 1, ['</style>']])).toBe('a1\\3c /style>')
  })
})

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

  test('nullish and boolean values render no text; an array renders its items in order', () => {
    expect(escapeRawTextContent('style', null)).toBe('')
    expect(escapeRawTextContent('style', undefined)).toBe('')
    expect(escapeRawTextContent('script', false)).toBe('')
    expect(escapeRawTextContent('script', 0)).toBe('0')
    expect(escapeRawTextContent('style', ['a', null, 1, ['</style>']])).toBe('a1<\\/style>')
  })
})

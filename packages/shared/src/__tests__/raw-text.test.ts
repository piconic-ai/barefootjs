import { describe, expect, test } from 'bun:test'
import { escapeRawText, isRawTextTag } from '../raw-text'

describe('escapeRawText', () => {
  test('leaves characters that HTML text escaping would rewrite', () => {
    expect(escapeRawText('style', `a[href="x"] > b & c { content: '<' }`)).toBe(`a[href="x"] > b & c { content: '<' }`)
    expect(escapeRawText('script', `if (a < b && c > "d") {}`)).toBe(`if (a < b && c > "d") {}`)
  })

  test('style: rewrites every case of the end tag', () => {
    expect(escapeRawText('style', 'a{}</style><img>')).toBe('a{}<\\/style><img>')
    expect(escapeRawText('style', '</STYLE></StYlE ')).toBe('<\\/STYLE><\\/StYlE ')
    expect(escapeRawText('style', '</styl></script><style>')).toBe('</styl></script><style>')
  })

  test('script: rewrites every case of the start and end tag', () => {
    expect(escapeRawText('script', 'x="</script><script>alert(1)</script>"')).toBe(
      'x="\\u003c/script>\\u003cscript>alert(1)\\u003c/script>"',
    )
    expect(escapeRawText('script', '</SCRIPT><ScRiPt')).toBe('\\u003c/SCRIPT>\\u003cScRiPt')
    expect(escapeRawText('script', '<!-- </style> <scrip i<s')).toBe('<!-- </style> <scrip i<s')
  })

  test('the rewritten script text is the same JavaScript and JSON string', () => {
    const value = '</script><!--<script>'
    const encoded = escapeRawText('script', JSON.stringify(value))
    expect(encoded).not.toContain('</script')
    expect(encoded).not.toContain('<script')
    expect(JSON.parse(encoded)).toBe(value)
    expect(new Function(`return ${encoded}`)()).toBe(value)
  })

  test('is stable when applied twice', () => {
    for (const tag of ['style', 'script'] as const) {
      const once = escapeRawText(tag, '</style></script><script>')
      expect(escapeRawText(tag, once)).toBe(once)
    }
  })

  test('does not treat a non-ASCII case fold as the tag name', () => {
    expect(escapeRawText('script', '</\u017Fcript>')).toBe('</\u017Fcript>')
    expect(escapeRawText('style', '</\u017Ftyle>')).toBe('</\u017Ftyle>')
  })
})

describe('isRawTextTag', () => {
  test('names only style and script', () => {
    expect(isRawTextTag('style')).toBe(true)
    expect(isRawTextTag('script')).toBe(true)
    expect(isRawTextTag('textarea')).toBe(false)
    expect(isRawTextTag('title')).toBe(false)
  })
})

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

describe('escapeRawText over the whole text', () => {
  // The encoder is sound only over the complete element text: an end tag
  // can be spelled across the pieces the text is built from. Every caller
  // joins first; these vectors are the pieces an attacker would choose.
  const splits: [tag: 'style' | 'script', pieces: string[]][] = [
    ['style', ['<', '/style><img src=x onerror=alert(1)>']],
    ['style', ['</', 'style>']],
    ['style', ['</sty', 'le>']],
    ['style', ['<', '/', 'S', 'T', 'Y', 'L', 'E', '>']],
    ['style', ['</styl', 'e >']],
    ['style', ['', '<', '', '/style', '']],
    ['script', ['<', '/script><img src=x onerror=alert(1)>']],
    ['script', ['</scr', 'ipt>']],
    ['script', ['<', '/', 'ScR', 'iPt', '>']],
    ['script', ['<!--', '<scr', 'ipt>']],
    ['script', ['<!--<', 'script', '>']],
    ['script', ['<s', 'cript>', '</s', 'cript>']],
  ]

  for (const [tag, pieces] of splits) {
    test(`${tag}: ${JSON.stringify(pieces)}`, () => {
      const encoded = escapeRawText(tag, pieces.join(''))
      expect(encoded.toLowerCase()).not.toContain(`</${tag}`)
      if (tag === 'script') expect(encoded.toLowerCase()).not.toContain('<script')
      // Encoding piece by piece is what must never be done: it leaves the tag.
      const perPiece = pieces.map(piece => escapeRawText(tag, piece)).join('').toLowerCase()
      expect(perPiece.includes(`</${tag}`) || perPiece.includes('<script')).toBe(true)
    })
  }

  test('text that ends in a partial end tag stays as written (the real end tag follows it)', () => {
    for (const tail of ['<', '</', '</s', '</styl', '</ style', '</\0style']) {
      expect(escapeRawText('style', `a${tail}`)).toBe(`a${tail}`)
    }
    for (const tail of ['<', '</', '<scrip', '</scrip', '<!--', '<!--<scrip', '</ script']) {
      expect(escapeRawText('script', `a${tail}`)).toBe(`a${tail}`)
    }
  })

  test('a complete end tag at the very end is rewritten', () => {
    expect(escapeRawText('style', 'a</style')).toBe('a<\\/style')
    expect(escapeRawText('script', 'a</script')).toBe('a\\u003c/script')
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

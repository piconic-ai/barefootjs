import { describe, expect, test } from 'bun:test'
import { escapeRawText, isRawTextTag } from '../raw-text'

/** A `<` the HTML tokenizer could take as the start of markup, or an `&` as the start of a character reference. */
const MARKUP = /<[A-Za-z/!?]|&[A-Za-z#]/

describe('escapeRawText', () => {
  test('leaves characters that HTML text escaping would rewrite', () => {
    expect(escapeRawText('style', `a[href="x"] > b & c { content: '<' }`)).toBe(`a[href="x"] > b & c { content: '<' }`)
    expect(escapeRawText('script', `if (a < b && c > "d" && e <= 1 && f << 2) {}`)).toBe(
      `if (a < b && c > "d" && e <= 1 && f << 2) {}`,
    )
  })

  test('an `&` that could begin a character reference becomes the CSS / JS escape', () => {
    expect(escapeRawText('style', 'a&amp;b &#39; &quot &x')).toBe('a\\26 amp;b \\26 #39; \\26 quot \\26 x')
    expect(escapeRawText('script', '"a&quot;+alert(1)+&#x22;" a&&b')).toBe(
      '"a\\u0026quot;+alert(1)+\\u0026#x22;" a&\\u0026b',
    )
    // The JSON a value was serialized into reads back unchanged.
    const value = 'a&quot;+alert(1)+&quot;'
    expect(JSON.parse(escapeRawText('script', JSON.stringify(value)))).toBe(value)
  })

  test('an `&` before anything else begins no reference and stays', () => {
    for (const tail of ['&', '& ', '&&', '&1', '&=', '&;', '&:hover', '&.a', '&\u00e9']) {
      expect(escapeRawText('style', `a${tail}`)).toBe(`a${tail}`)
      expect(escapeRawText('script', `a${tail}`)).toBe(`a${tail}`)
    }
  })

  test('style: a `<` that could begin markup becomes the CSS escape', () => {
    expect(escapeRawText('style', 'a{}</style><img>')).toBe('a{}\\3c /style>\\3c img>')
    expect(escapeRawText('style', '</STYLE></StYlE <!-- <?x <![CDATA[')).toBe(
      '\\3c /STYLE>\\3c /StYlE \\3c !-- \\3c ?x \\3c ![CDATA[',
    )
  })

  test('script: a `<` that could begin markup becomes the JS / JSON escape', () => {
    expect(escapeRawText('script', 'x="</script><script>alert(1)</script>"')).toBe(
      'x="\\u003c/script>\\u003cscript>alert(1)\\u003c/script>"',
    )
    expect(escapeRawText('script', '</SCRIPT><ScRiPt<!--<img>')).toBe(
      '\\u003c/SCRIPT>\\u003cScRiPt\\u003c!--\\u003cimg>',
    )
  })

  test('a `<` before anything else is text to the tokenizer and stays', () => {
    for (const tail of ['<', '< ', '<1', '<<', '<=', '<\u00e9', '<\u017f', '<\0', '<>', '<-']) {
      expect(escapeRawText('style', `a${tail}`)).toBe(`a${tail}`)
      expect(escapeRawText('script', `a${tail}`)).toBe(`a${tail}`)
    }
  })

  test('the rewritten script text is the same JavaScript and JSON string', () => {
    const value = '</script><!--<script><img src=x onerror=alert(1)>'
    const encoded = escapeRawText('script', JSON.stringify(value))
    expect(encoded).not.toMatch(MARKUP)
    expect(JSON.parse(encoded)).toBe(value)
    expect(new Function(`return ${encoded}`)()).toBe(value)
  })

  test('the rewritten style text is the same CSS string', () => {
    // `\3c ` is the code point U+003C; the space ends the escape.
    const encoded = escapeRawText('style', '"</style><a>"')
    expect(encoded).toBe('"\\3c /style>\\3c a>"')
    expect(encoded.replace(/\\3c /g, '<')).toBe('"</style><a>"')
  })

  test('is stable when applied twice', () => {
    for (const tag of ['style', 'script'] as const) {
      const once = escapeRawText(tag, '</style></script><script><!--<a><?x')
      expect(escapeRawText(tag, once)).toBe(once)
    }
  })
})

describe('escapeRawText over the whole text', () => {
  // The encoder is sound only over the complete element text: markup can be
  // spelled across the pieces the text is built from. Every caller joins
  // first; these vectors are the pieces an attacker would choose.
  const splits: [tag: 'style' | 'script', pieces: string[]][] = [
    ['style', ['<', '/style><img src=x onerror=alert(1)>']],
    ['style', ['<', '/', 'S', 'T', 'Y', 'L', 'E', '>']],
    ['style', ['', '<', '', '/style', '']],
    ['style', ['<', 'img src=x onerror=alert(1)>']],
    ['style', ['<', '!--']],
    ['script', ['<', '/script><img src=x onerror=alert(1)>']],
    ['script', ['<', '/', 'ScR', 'iPt', '>']],
    ['script', ['<!--', '<', 'script>']],
    ['script', ['<', '!--<', 'script', '>']],
    ['script', ['<', 'script>', '<', '/script>']],
    ['script', ['<', '?php']],
    ['script', ['"a&', 'quot;+alert(1)+&', '#34;"']],
    ['style', ['&', 'lt;']],
  ]

  for (const [tag, pieces] of splits) {
    test(`${tag}: ${JSON.stringify(pieces)}`, () => {
      expect(escapeRawText(tag, pieces.join(''))).not.toMatch(MARKUP)
      // Encoding piece by piece is what must never be done: it leaves markup.
      expect(pieces.map(piece => escapeRawText(tag, piece)).join('')).toMatch(MARKUP)
    })
  }

  test('no input leaves a `<` before a letter, `/`, `!` or `?`', () => {
    const alphabet = ['<', '&', '#', ';', '/', '!', '?', '-', 's', 'S', 'c', 'r', 'i', 'p', 't', 'y', 'l', 'e', '>', ' ', '\\', '3', 'u', '0']
    let seed = 0x3934
    const next = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed
    }
    for (let n = 0; n < 5000; n++) {
      let text = ''
      const length = next() % 14
      for (let i = 0; i < length; i++) text += alphabet[next() % alphabet.length]
      for (const tag of ['style', 'script'] as const) {
        const encoded = escapeRawText(tag, text)
        expect(encoded).not.toMatch(MARKUP)
        expect(escapeRawText(tag, encoded)).toBe(encoded)
      }
    }
  })

  test('a `<` or `&` that ends the text stays: the element end tag follows it', () => {
    for (const tail of ['<', '&', '<&', '&<']) {
      expect(escapeRawText('style', `a${tail}`)).toBe(`a${tail}`)
      expect(escapeRawText('script', `a${tail}`)).toBe(`a${tail}`)
    }
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

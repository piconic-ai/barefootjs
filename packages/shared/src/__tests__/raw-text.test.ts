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

  test('the rewritten script text is the same template literal and regular expression', () => {
    const value = '</script><img>&quot;&#60;<!--'
    const template = escapeRawText('script', `\`${value}\``)
    expect(template).not.toMatch(MARKUP)
    expect(new Function(`return ${template}`)()).toBe(value)
    const regex = new Function(`return ${escapeRawText('script', '/^<a&b<\\/c>&amp;$/')}`)() as RegExp
    expect(regex.test('<a&b</c>&amp;')).toBe(true)
    expect(regex.test('\\u003ca')).toBe(false)
  })

  test('operators written with a space are left alone, so the code still runs', () => {
    const code = 'var i = 1, n = 2, a = true, b = 3; return i < n && a & b && i <= n && n << 1'
    expect(escapeRawText('script', code)).toBe(code)
    expect(new Function(code)()).toBe(4)
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

describe('escapeRawText after a backslash', () => {
  const BS = '\\'

  test('an odd run already escapes the character: the escape replaces that pair', () => {
    expect(escapeRawText('script', `var s = "${BS}<b";`)).toBe(`var s = "${BS}u003cb";`)
    expect(escapeRawText('style', `${BS}&b ${BS}<a`)).toBe(`${BS}26 b ${BS}3c a`)
    expect(escapeRawText('script', `${BS}${BS}${BS}<b`)).toBe(`${BS}${BS}${BS}u003cb`)
  })

  test('an even run is complete pairs: the escape follows it', () => {
    expect(escapeRawText('script', `"${BS}${BS}<b"`)).toBe(`"${BS}${BS}${BS}u003cb"`)
    expect(escapeRawText('style', `${BS}${BS}&b`)).toBe(`${BS}${BS}${BS}26 b`)
  })

  test('a backslash before a `<` / `&` that is not rewritten is left alone', () => {
    for (const text of [`${BS}< a`, `${BS}& `, `${BS}<1`, `a${BS}`, `${BS}${BS}`, `${BS}<`, `${BS}&`]) {
      expect(escapeRawText('script', text)).toBe(text)
      expect(escapeRawText('style', text)).toBe(text)
    }
  })

  test('JavaScript reads the same string for every run length', () => {
    for (const tail of ['<b>', '</script>', '&amp;', '&#60;', '<!--', '<a&b<c']) {
      for (let n = 0; n <= 6; n++) {
        for (const quote of ['"', "'", '`']) {
          const source = `${quote}x${BS.repeat(n)}${tail}${BS.repeat(n)}${tail}${quote}`
          const encoded = escapeRawText('script', source)
          expect(encoded).not.toMatch(MARKUP)
          expect(new Function(`return ${encoded}`)()).toBe(new Function(`return ${source}`)())
        }
      }
    }
  })

  test('a regular expression matches the same text for every run length', () => {
    for (let n = 0; n <= 5; n++) {
      const source = `/^x${BS.repeat(n)}<b${BS.repeat(n)}&c$/`
      const before = new Function(`return ${source}`)() as RegExp
      const after = new Function(`return ${escapeRawText('script', source)}`)() as RegExp
      for (const probe of ['x<b&c', `x${BS}<b${BS}&c`, `x${BS}${BS}<b${BS}${BS}&c`, 'xu003cb']) {
        expect(after.test(probe)).toBe(before.test(probe))
      }
    }
  })

  test('CSS reads the same text for every run length', () => {
    // A CSS string: `\\` is a backslash, `\<` is `<`, `\3c ` is `<`, `\26 ` is `&`.
    const cssText = (css: string): string =>
      css.replace(/\\(?:([0-9a-fA-F]{1,6}) ?|([\s\S]))/g, (_all, hex?: string, ch?: string) =>
        hex ? String.fromCodePoint(Number.parseInt(hex, 16)) : (ch as string),
      )
    for (const tail of ['<b>', '</style>', '&amp;', '&#60;', '<a&b<c']) {
      for (let n = 0; n <= 6; n++) {
        const source = `x${BS.repeat(n)}${tail}${BS.repeat(n)}${tail}`
        const encoded = escapeRawText('style', source)
        expect(encoded).not.toMatch(MARKUP)
        expect(cssText(encoded)).toBe(cssText(source))
      }
    }
  })

  test('the backslash and the character may sit in different pieces of the text', () => {
    const pieces = [`var s = "`, BS, '<img src=x onerror=alert(1)>', BS, BS, '&quot;"']
    const encoded = escapeRawText('script', pieces.join(''))
    expect(encoded).toBe(`var s = "${BS}u003cimg src=x onerror=alert(1)>${BS}${BS}${BS}u0026quot;"`)
    expect(new Function(`${encoded}; return s`)()).toBe(`<img src=x onerror=alert(1)>${BS}&quot;`)
  })

  test('a long backslash run costs linear time', () => {
    const run = BS.repeat(200_000)
    const started = performance.now()
    expect(escapeRawText('script', `${run}x${run}<a`).length).toBe(400_000 + 1 + 6 + 1)
    expect(performance.now() - started).toBeLessThan(2000)
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

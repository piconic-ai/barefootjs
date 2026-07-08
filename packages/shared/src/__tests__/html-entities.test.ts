import { describe, test, expect } from 'bun:test'
import { decodeEntities, escapeHtml } from '../html-entities'

describe('decodeEntities', () => {
  test('escaping-set names decode', () => {
    expect(decodeEntities('Fish &amp; Chips')).toBe('Fish & Chips')
    expect(decodeEntities('a &lt; b &gt; c')).toBe('a < b > c')
    expect(decodeEntities('&quot;x&quot; &apos;y&apos;')).toBe(`"x" 'y'`)
  })

  test('common typographic names decode', () => {
    expect(decodeEntities('&copy; 2026')).toBe('© 2026')
    expect(decodeEntities('1&nbsp;000')).toBe('1 000')
    expect(decodeEntities('A&hellip;')).toBe('A…')
    expect(decodeEntities('&euro;5 / &pound;4 / &yen;3')).toBe('€5 / £4 / ¥3')
  })

  test('numeric decimal and hex references decode', () => {
    expect(decodeEntities('&#169;')).toBe('©')
    expect(decodeEntities('&#xA9;')).toBe('©')
    expect(decodeEntities('&#x1F600;')).toBe('😀')
  })

  test('unknown / malformed references stay verbatim', () => {
    expect(decodeEntities('&unknownname;')).toBe('&unknownname;')
    expect(decodeEntities('a & b')).toBe('a & b')
    expect(decodeEntities('&amp')).toBe('&amp')
    // Lone surrogate / out-of-range code points are refused, not
    // replaced with garbage.
    expect(decodeEntities('&#xD800;')).toBe('&#xD800;')
    expect(decodeEntities('&#x110000;')).toBe('&#x110000;')
  })

  test('double-escaped input decodes exactly one level', () => {
    expect(decodeEntities('&amp;copy;')).toBe('&copy;')
  })
})

describe('escapeHtml', () => {
  test('escapes & < > " and leaves the rest', () => {
    expect(escapeHtml('Fish & Chips')).toBe('Fish &amp; Chips')
    expect(escapeHtml('a < b > c')).toBe('a &lt; b &gt; c')
    expect(escapeHtml('say "hi"')).toBe('say &quot;hi&quot;')
    expect(escapeHtml("it's © fine")).toBe("it's © fine")
  })

  test('decode → escape round-trips the entity text', () => {
    expect(escapeHtml(decodeEntities('Fish &amp; Chips'))).toBe('Fish &amp; Chips')
    expect(escapeHtml(decodeEntities('a &lt; b'))).toBe('a &lt; b')
    // Named references outside the escape set stay decoded — the
    // literal character is the canonical emission (`©`, not `&copy;`).
    expect(escapeHtml(decodeEntities('&copy; 2026'))).toBe('© 2026')
  })
})

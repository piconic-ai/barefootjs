/**
 * `escapeText` runtime contract (#1694).
 *
 * Client-render templates interpolate text content into the
 * `<!--bf:sN-->…<!--/-->` slots of an HTML string later inserted via
 * `innerHTML`. A string value containing `<` / `&` must be escaped so it
 * surfaces as *text* (not markup) and is byte-identical to the SSR
 * adapters' output. Although the HTML spec only requires `& < >` in text,
 * Hono escapes text with the same set as attribute values (`& " ' < >`),
 * and the conformance layer requires byte-parity — so `escapeText` matches
 * that full set (delegating to `escapeAttr`).
 */
import { describe, test, expect } from 'bun:test'
import { escapeText, escapeAttr } from '../../src/runtime/component'

describe('escapeText', () => {
  test('escapes the five HTML metacharacters (matches Hono text escaping)', () => {
    expect(escapeText('a&b<c>d"e\'f')).toBe('a&amp;b&lt;c&gt;d&quot;e&#39;f')
  })

  test('replaces & first so emitted entities are not double-escaped', () => {
    expect(escapeText('<')).toBe('&lt;')
    expect(escapeText('&lt;')).toBe('&amp;lt;')
  })

  test('neutralises a markup-injection attempt in text content', () => {
    // A `<b>` in a text slot must surface as literal text, never an element.
    expect(escapeText('Tom & Jerry <b>"x" \'y\'</b>')).toBe(
      'Tom &amp; Jerry &lt;b&gt;&quot;x&quot; &#39;y&#39;&lt;/b&gt;',
    )
  })

  test('leaves metacharacter-free text untouched', () => {
    expect(escapeText('count: 0')).toBe('count: 0')
  })

  test('coerces non-nullish non-string values via String()', () => {
    expect(escapeText(0)).toBe('0')
    // `false` keeps its String() form, matching the reactive text path
    // (`dynamic-text.ts` is nullish-only via `?? ''`).
    expect(escapeText(false)).toBe('false')
  })

  test('renders nullish as empty text (#2137)', () => {
    // JSX/Solid semantics + the Hono SSR reference: `{undefined}` / `{null}`
    // produce no text. Matches the reactive update path (`String(value ?? '')`).
    expect(escapeText(undefined)).toBe('')
    expect(escapeText(null)).toBe('')
  })

  test('is byte-identical to escapeAttr for non-nullish values (Hono escapes both contexts alike)', () => {
    const samples = ['a&b<c>d"e\'f', 'plain', '<script>', "O'Brien & co"]
    for (const s of samples) expect(escapeText(s)).toBe(escapeAttr(s))
  })
})

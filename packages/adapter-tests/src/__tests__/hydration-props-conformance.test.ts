import { describe, test, expect } from 'bun:test'
import {
  decodeHtmlEntities,
  extractBfPOccurrences,
  jsonDeepEqual,
  compareHydrationProps,
} from '../hydration-props-conformance'

describe('decodeHtmlEntities', () => {
  test('decodes named entities', () => {
    expect(decodeHtmlEntities('&quot;a&quot; &amp; &lt;b&gt;')).toBe('"a" & <b>')
  })

  test('decodes decimal numeric references, including &#39; and &#34;', () => {
    expect(decodeHtmlEntities('&#39;')).toBe("'")
    expect(decodeHtmlEntities('&#34;')).toBe('"')
  })

  test('decodes hex numeric references, upper and lower case', () => {
    expect(decodeHtmlEntities('&#x27;')).toBe("'")
    expect(decodeHtmlEntities('&#X22;')).toBe('"')
  })

  test('passes malformed numeric references through instead of throwing', () => {
    // `String.fromCodePoint` throws RangeError on both of these — above
    // the Unicode max, and a lone UTF-16 surrogate.
    expect(decodeHtmlEntities('&#x110000;')).toBe('&#x110000;')
    expect(decodeHtmlEntities('&#xD800;')).toBe('&#xD800;')
    expect(decodeHtmlEntities('&#9999999999;')).toBe('&#9999999999;')
  })

  test('does not double-decode a literal &amp;lt; into <', () => {
    // Two independent entities in the source: `&amp;` followed by the
    // literal text `lt;`. A naive chained .replace(/&amp;/).replace(/&lt;/)
    // would re-scan its own output and over-decode this to `<`.
    expect(decodeHtmlEntities('&amp;lt;')).toBe('&lt;')
  })

  test('leaves unrecognised entities untouched', () => {
    expect(decodeHtmlEntities('&nbsp;')).toBe('&nbsp;')
  })
})

describe('extractBfPOccurrences', () => {
  test('extracts a double-quoted bf-p with named-entity-escaped JSON', () => {
    // "Foo_test" normalizes to "Foo_*": normalizeBfSValue treats the
    // trailing segment after the component name the same as a random
    // per-render suffix (matching normalizeHTML's identical bf-s
    // regex), so the harness's fixed default scope id 'test' collapses
    // the same way a real random suffix would.
    const html = `<div bf-s="Foo_test" bf-p="{&quot;n&quot;:1}">x</div>`
    const occs = extractBfPOccurrences(html)
    expect(occs).toHaveLength(1)
    expect(occs[0].tagName).toBe('div')
    expect(occs[0].bfS).toBe('Foo_*')
    expect(occs[0].raw).toBe('{&quot;n&quot;:1}')
    expect(occs[0].decoded).toBe('{"n":1}')
    expect(occs[0].value).toEqual({ n: 1 })
    expect(occs[0].parseError).toBeUndefined()
  })

  test('extracts a single-quoted bf-p (ERB / Jinja / Perl / Rust style) with raw JSON quotes', () => {
    const html = `<div bf-s="Foo_test" bf-p='{"n":1}'>x</div>`
    const occs = extractBfPOccurrences(html)
    expect(occs).toHaveLength(1)
    expect(occs[0].raw).toBe('{"n":1}')
    expect(occs[0].decoded).toBe('{"n":1}')
    expect(occs[0].value).toEqual({ n: 1 })
  })

  test('decodes &#34; (decimal numeric reference) the same as &quot;', () => {
    const html = `<div bf-p="{&#34;n&#34;:2}">x</div>`
    const occs = extractBfPOccurrences(html)
    expect(occs[0].decoded).toBe('{"n":2}')
    expect(occs[0].value).toEqual({ n: 2 })
  })

  test('numeric-entity double-quoted bf-p and single-quoted bf-p with the same logical value decode to equal JSON', () => {
    const doubleQuoted = extractBfPOccurrences(`<div bf-p="{&#34;n&#34;:3}">x</div>`)[0]
    const singleQuoted = extractBfPOccurrences(`<div bf-p='{"n":3}'>x</div>`)[0]
    expect(doubleQuoted.decoded).toBe(singleQuoted.decoded)
    expect(jsonDeepEqual(doubleQuoted.value, singleQuoted.value)).toBe(true)
  })

  test('records index in document order across multiple occurrences', () => {
    const html = `<div bf-p='{"a":1}'>x</div><span bf-p="{&quot;b&quot;:2}">y</span>`
    const occs = extractBfPOccurrences(html)
    expect(occs).toHaveLength(2)
    expect(occs[0].index).toBe(0)
    expect(occs[0].tagName).toBe('div')
    expect(occs[1].index).toBe(1)
    expect(occs[1].tagName).toBe('span')
  })

  test('an element with no bf-p attribute contributes no occurrence', () => {
    const html = `<div bf-s="Foo_test" class="x">x</div><span bf-p='{"a":1}'>y</span>`
    const occs = extractBfPOccurrences(html)
    expect(occs).toHaveLength(1)
    expect(occs[0].tagName).toBe('span')
  })

  test('an element with no bf-s has bfS: null', () => {
    const html = `<div bf-p='{"a":1}'>x</div>`
    const occs = extractBfPOccurrences(html)
    expect(occs[0].bfS).toBeNull()
  })

  test('normalizes bf-s the same way normalizeHTML does: child scope prefix + non-deterministic suffix', () => {
    const html = `<div bf-s="~Foo_abc123_s10" bf-p='{"a":1}'>x</div>`
    const occs = extractBfPOccurrences(html)
    expect(occs[0].bfS).toBe('Foo_*_s10')
  })

  test('records a parseError instead of a value when the decoded content is not valid JSON', () => {
    const html = `<div bf-p='not json'>x</div>`
    const occs = extractBfPOccurrences(html)
    expect(occs[0].value).toBeUndefined()
    expect(occs[0].parseError).toBeDefined()
  })

  test('a > inside a quoted attribute value does not end the tag early', () => {
    const html = `<div data-x="a > b" bf-p='{"a":1}'>x</div>`
    const occs = extractBfPOccurrences(html)
    expect(occs).toHaveLength(1)
    expect(occs[0].value).toEqual({ a: 1 })
  })
})

describe('jsonDeepEqual', () => {
  test('matches equal primitives, objects, and arrays regardless of key order', () => {
    expect(jsonDeepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true)
    expect(jsonDeepEqual([1, 2, 3], [1, 2, 3])).toBe(true)
    expect(jsonDeepEqual(null, null)).toBe(true)
    expect(jsonDeepEqual('x', 'x')).toBe(true)
  })

  test('rejects a value mismatch', () => {
    expect(jsonDeepEqual({ a: 1 }, { a: 2 })).toBe(false)
  })

  test('rejects a missing / extra key', () => {
    expect(jsonDeepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false)
    expect(jsonDeepEqual({ a: 1, b: 2 }, { a: 1 })).toBe(false)
  })

  test('rejects array vs object of otherwise-matching shape', () => {
    expect(jsonDeepEqual([1, 2], { 0: 1, 1: 2 })).toBe(false)
  })

  test('rejects differing array length even with matching prefix', () => {
    expect(jsonDeepEqual([1, 2], [1, 2, 3])).toBe(false)
  })

  test('null does not equal an object with the same shape', () => {
    expect(jsonDeepEqual(null, {})).toBe(false)
  })
})

describe('compareHydrationProps', () => {
  test('fully matching payloads across quote styles report zero divergences', () => {
    const reference = `<div bf-s="Foo_test" bf-p="{&quot;n&quot;:1}">x</div>`
    const adapter = `<div bf-s="Foo_test" bf-p='{"n":1}'>x</div>`
    const result = compareHydrationProps(reference, adapter)
    expect(result.referenceCount).toBe(1)
    expect(result.adapterCount).toBe(1)
    expect(result.matched).toBe(1)
    expect(result.divergences).toHaveLength(0)
    expect(result.adapterEmitsNothing).toBe(false)
  })

  test('reports a value-mismatch when decoded JSON values differ', () => {
    const reference = `<div bf-s="Foo_test" bf-p='{"n":1}'>x</div>`
    const adapter = `<div bf-s="Foo_test" bf-p='{"n":2}'>x</div>`
    const result = compareHydrationProps(reference, adapter)
    expect(result.matched).toBe(0)
    expect(result.divergences).toHaveLength(1)
    expect(result.divergences[0].kind).toBe('value-mismatch')
    expect(result.divergences[0].detail).toContain('reference={"n":1}')
    expect(result.divergences[0].detail).toContain('adapter={"n":2}')
  })

  test('reports missing-in-adapter when the adapter has no counterpart occurrence', () => {
    const reference = `<div bf-s="Foo_test" bf-p='{"n":1}'>x</div>`
    const adapter = `<div bf-s="Foo_test">x</div>`
    const result = compareHydrationProps(reference, adapter)
    expect(result.referenceCount).toBe(1)
    expect(result.adapterCount).toBe(0)
    expect(result.divergences).toHaveLength(1)
    expect(result.divergences[0].kind).toBe('missing-in-adapter')
    expect(result.adapterEmitsNothing).toBe(true)
  })

  test('reports extra-in-adapter when the adapter has an occurrence the reference lacks', () => {
    const reference = `<div bf-s="Foo_test">x</div>`
    const adapter = `<div bf-s="Foo_test" bf-p='{"n":1}'>x</div>`
    const result = compareHydrationProps(reference, adapter)
    expect(result.referenceCount).toBe(0)
    expect(result.adapterCount).toBe(1)
    expect(result.divergences).toHaveLength(1)
    expect(result.divergences[0].kind).toBe('extra-in-adapter')
    // adapterEmitsNothing only fires when the REFERENCE has occurrences
    // and the adapter has none — not the reverse.
    expect(result.adapterEmitsNothing).toBe(false)
  })

  test('pairs occurrences by normalized bf-s even when document order differs between sides', () => {
    const reference = [
      `<span bf-s="Child_test_s1" bf-p='{"v":1}'>a</span>`,
      `<span bf-s="Child_test_s2" bf-p='{"v":2}'>b</span>`,
    ].join('')
    // Adapter emits the same two scopes in the OPPOSITE order.
    const adapter = [
      `<span bf-s="~Child_xyz789_s2" bf-p='{"v":2}'>b</span>`,
      `<span bf-s="~Child_xyz789_s1" bf-p='{"v":1}'>a</span>`,
    ].join('')
    const result = compareHydrationProps(reference, adapter)
    expect(result.matched).toBe(2)
    expect(result.divergences).toHaveLength(0)
  })

  test('falls back to positional pairing for occurrences with no bf-s on either side', () => {
    const reference = `<div bf-p='{"a":1}'>x</div><div bf-p='{"a":2}'>y</div>`
    const adapter = `<div bf-p='{"a":1}'>x</div><div bf-p='{"a":2}'>y</div>`
    const result = compareHydrationProps(reference, adapter)
    expect(result.matched).toBe(2)
    expect(result.divergences).toHaveLength(0)
  })

  test('a parse error on the reference side is reported distinctly from a value-mismatch', () => {
    const reference = `<div bf-s="Foo_test" bf-p='not json'>x</div>`
    const adapter = `<div bf-s="Foo_test" bf-p='{"n":1}'>x</div>`
    const result = compareHydrationProps(reference, adapter)
    expect(result.divergences).toHaveLength(1)
    expect(result.divergences[0].kind).toBe('parse-error-reference')
  })

  test('a parse error on the adapter side is reported distinctly from a value-mismatch', () => {
    const reference = `<div bf-s="Foo_test" bf-p='{"n":1}'>x</div>`
    const adapter = `<div bf-s="Foo_test" bf-p='not json'>x</div>`
    const result = compareHydrationProps(reference, adapter)
    expect(result.divergences).toHaveLength(1)
    expect(result.divergences[0].kind).toBe('parse-error-adapter')
  })

  test('no bf-p on either side is a trivial full match', () => {
    const reference = `<div bf-s="Foo_test">x</div>`
    const adapter = `<div bf-s="Foo_test">x</div>`
    const result = compareHydrationProps(reference, adapter)
    expect(result.referenceCount).toBe(0)
    expect(result.adapterCount).toBe(0)
    expect(result.matched).toBe(0)
    expect(result.divergences).toHaveLength(0)
    expect(result.adapterEmitsNothing).toBe(false)
  })
})

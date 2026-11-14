/**
 * An array in child position renders its items one after another, as JSX
 * does, at every door that turns a child value into text: the template's
 * `escapeText`, and the reactive `textOrNode` / claimed-text write.
 * `String(array)` joined the items with commas, so a component that read
 * a list of children into state (`<Note>{label}!</Note>`) printed
 * `hello,!` for the server's `hello!` once it initialized (#3714).
 */
import { describe, test, expect } from 'bun:test'
import { childText } from '../../src/runtime/child-text'
import { escapeText } from '../../src/runtime/component'
import { textOrNode } from '../../src/runtime/claim-slots'

describe('childText', () => {
  test('joins an array without a separator', () => {
    expect(childText(['hello', '!'])).toBe('hello!')
    expect(childText(['a', 1, 'b'])).toBe('a1b')
  })

  test('skips nullish and boolean items, and flattens nested arrays', () => {
    expect(childText(['a', null, undefined, false, true, 'b'])).toBe('ab')
    expect(childText(['a', ['b', ['c']], 0])).toBe('abc0')
    expect(childText([])).toBe('')
  })

  test('keeps every other value as before', () => {
    expect(childText('a,b')).toBe('a,b')
    expect(childText(0)).toBe('0')
    expect(childText(null)).toBe('')
    expect(childText(undefined)).toBe('')
    expect(childText(false)).toBe('')
    expect(childText({})).toBe('[object Object]')
  })
})

describe('the text doors print an array child like JSX', () => {
  test('escapeText joins the items, then escapes', () => {
    expect(escapeText(['hello', '!'])).toBe('hello!')
    expect(escapeText(['<b>', null, '&'])).toBe('&lt;b&gt;&amp;')
  })

  test('textOrNode joins the items', () => {
    expect(textOrNode(['hello', '!'])).toBe('hello!')
    expect(textOrNode('a,b')).toBe('a,b')
  })
})

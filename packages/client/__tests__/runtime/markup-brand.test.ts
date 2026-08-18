/**
 * `bfMarkup()` brand + its two consumers, `escapeTextOrMarkup` (static/
 * initial-render) and `escapeTextOrNode` (reactive-write) — #2651.
 *
 * A JSX element passed at a non-`children` component prop position
 * (`header={<strong>Title</strong>}`) is compiler-built HTML that must
 * reach the receiving template raw, not re-escaped as if it were plain
 * text. `bfMarkup()` brands that string; the two functions below are the
 * only legal places the brand is unwrapped. Both are compiler-emitted-code
 * only (exported from `@barefootjs/client/runtime`, not the public
 * `@barefootjs/client` entry) — see `bfMarkup`'s docstring for why calling
 * it directly from userland is unsafe.
 */
import { describe, test, expect, beforeAll } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { bfMarkup, isBfMarkup, escapeText, escapeTextOrMarkup, escapeTextOrNode } from '../../src/runtime/component'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register()
  }
})

describe('bfMarkup / isBfMarkup', () => {
  test('wraps a string under the brand key', () => {
    const m = bfMarkup('<strong>Title</strong>')
    expect(isBfMarkup(m)).toBe(true)
    expect((m as unknown as Record<string, string>).__bfMarkup).toBe('<strong>Title</strong>')
  })

  test('rejects plain strings, nullish, and shapeless objects', () => {
    expect(isBfMarkup('<strong>Title</strong>')).toBe(false)
    expect(isBfMarkup(null)).toBe(false)
    expect(isBfMarkup(undefined)).toBe(false)
    expect(isBfMarkup({})).toBe(false)
    expect(isBfMarkup({ __bfMarkup: 123 })).toBe(false)
  })
})

describe('escapeTextOrMarkup (static/initial-render escape)', () => {
  // Quadrant 1: plain string → escaped, same as escapeText.
  test('escapes a plain string exactly like escapeText', () => {
    const s = 'Tom & Jerry <b>"x"</b>'
    expect(escapeTextOrMarkup(s)).toBe(escapeText(s))
  })

  // Quadrant 2: bfMarkup-branded → raw, unescaped.
  test('unwraps a bfMarkup-branded value raw, without escaping', () => {
    const html = '<strong bf-s="__BF_PARENT_SCOPE__">Title</strong>'
    expect(escapeTextOrMarkup(bfMarkup(html))).toBe(html)
  })

  // Quadrant 3: nullish → ''.
  test('renders nullish as empty text, matching escapeText', () => {
    expect(escapeTextOrMarkup(null)).toBe('')
    expect(escapeTextOrMarkup(undefined)).toBe('')
  })

  // Quadrant 4 (superset guarantee): identical to escapeText for every
  // non-branded value, so switching a call site never changes output
  // unless the value is actually branded.
  test('is byte-identical to escapeText for every non-branded value', () => {
    const samples: unknown[] = ['plain', 0, false, '<script>', null, undefined]
    for (const v of samples) expect(escapeTextOrMarkup(v)).toBe(escapeText(v))
  })
})

describe('escapeTextOrNode (reactive-write escape)', () => {
  // Quadrant 1: plain string → escaped.
  test('escapes a plain string', () => {
    expect(escapeTextOrNode('Tom & Jerry')).toBe('Tom &amp; Jerry')
  })

  // Quadrant 2: bfMarkup-branded → raw string, not re-escaped, not
  // stringified to "[object Object]".
  test('unwraps a bfMarkup-branded value raw', () => {
    const html = '<em>reactive header</em>'
    expect(escapeTextOrNode(bfMarkup(html))).toBe(html)
  })

  // Quadrant 3: live Node → identity passthrough, checked after the
  // bfMarkup branch (the two shapes are mutually exclusive).
  test('passes a live Node through by identity', () => {
    const node = document.createElement('span')
    expect(escapeTextOrNode(node)).toBe(node)
  })

  // Quadrant 4: nullish → ''.
  test('renders nullish as empty text', () => {
    expect(escapeTextOrNode(null)).toBe('')
    expect(escapeTextOrNode(undefined)).toBe('')
  })
})

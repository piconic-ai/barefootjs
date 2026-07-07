import { describe, test, expect } from 'bun:test'
import { indentHTML } from '../indent-html'
import { normalizeExpectedHtml } from '../types'
import { jsxFixtures } from '../../fixtures'

describe('indentHTML', () => {
  test('single leaf element stays on one line', () => {
    const html = '<button bf-s="test" bf="s1">Count: <span bf="s0">0</span></button>'
    const result = indentHTML(html)
    const contentLines = result.trim().split('\n').filter(l => l.trim())
    expect(contentLines.length).toBe(1)
    expect(contentLines[0].trim()).toBe(html)
  })

  test('element with 2+ child elements is expanded', () => {
    const html = '<div bf-s="test"><h2 bf="s1"><span bf="s0">Hello</span></h2><span bf-s="test_s2" bf="s1"><span bf="s0">New</span></span></div>'
    const result = indentHTML(html)
    const lines = result.trim().split('\n')
    expect(lines.length).toBe(4)
    expect(lines[0].trim()).toBe('<div bf-s="test">')
    expect(lines[1].trim()).toBe('<h2 bf="s1"><span bf="s0">Hello</span></h2>')
    expect(lines[2].trim()).toBe('<span bf-s="test_s2" bf="s1"><span bf="s0">New</span></span>')
    expect(lines[3].trim()).toBe('</div>')
  })

  test('void elements cause parent expansion', () => {
    const html = '<div bf-s="test"><br><hr><img src="test.png" alt="test"><input type="text"></div>'
    const result = indentHTML(html)
    const lines = result.trim().split('\n')
    expect(lines.length).toBe(6) // open + 4 voids + close
    expect(lines[0].trim()).toBe('<div bf-s="test">')
    expect(lines[1].trim()).toBe('<br>')
    expect(lines[2].trim()).toBe('<hr>')
    expect(lines[5].trim()).toBe('</div>')
  })

  test('HTML comments (fragments)', () => {
    const html = '<!--bf-scope:test--><span>A</span><span bf="s1"><span bf="s0">0</span></span>'
    const result = indentHTML(html)
    expect(result).toContain('<!--bf-scope:test-->')
    expect(result).toContain('<span>A</span>')
    expect(result).toContain('<span bf="s1"><span bf="s0">0</span></span>')
  })

  test('hyphenated custom-element tags survive tokenization', () => {
    // Regression: the tokenizer's tag-name class lacked `-`, so
    // `<my-widget …>` fell through to TEXT with its `<` dropped,
    // corrupting generated fixture HTML (custom-element-tag fixture).
    const html = '<my-widget theme="light" widget-id="w1"><span>slotted</span></my-widget>'
    const result = indentHTML(html)
    expect(normalizeExpectedHtml(result)).toBe(html)
  })

  test('nested single-child chain stays on one line', () => {
    const html = '<span bf="s1"><span bf="s0">Hello</span></span>'
    const result = indentHTML(html)
    const contentLines = result.trim().split('\n').filter(l => l.trim())
    expect(contentLines.length).toBe(1)
  })

  test('deeply nested with siblings expands correctly', () => {
    const html = '<div bf-s="test"><span bf="s3"><span bf="s2"></span></span><span bf="s5"><span bf="s4">0</span></span></div>'
    const result = indentHTML(html)
    const lines = result.trim().split('\n')
    expect(lines.length).toBe(4)
    expect(lines[0].trim()).toBe('<div bf-s="test">')
    expect(lines[1].trim()).toBe('<span bf="s3"><span bf="s2"></span></span>')
    expect(lines[2].trim()).toBe('<span bf="s5"><span bf="s4">0</span></span>')
    expect(lines[3].trim()).toBe('</div>')
  })
})

describe('normalizeExpectedHtml', () => {
  test('collapses inter-tag whitespace', () => {
    const indented = `
    <div bf-s="test">
      <span bf="s0">Hello</span>
    </div>
  `
    expect(normalizeExpectedHtml(indented)).toBe(
      '<div bf-s="test"><span bf="s0">Hello</span></div>'
    )
  })

  test('collapses multiple spaces', () => {
    expect(normalizeExpectedHtml('  <div>   text  </div>  ')).toBe('<div> text </div>')
  })

  test('already flat HTML passes through', () => {
    const flat = '<button bf-s="test" bf="s1">Count: <span bf="s0">0</span></button>'
    expect(normalizeExpectedHtml(flat)).toBe(flat)
  })
})

describe('round-trip: normalizeExpectedHtml(indentHTML(html)) === html', () => {
  for (const fixture of jsxFixtures) {
    if (!fixture.expectedHtml) continue
    test(`[${fixture.id}] round-trip preserves normalized HTML`, () => {
      const indented = indentHTML(fixture.expectedHtml!)
      const normalized = normalizeExpectedHtml(indented)
      expect(normalized).toBe(fixture.expectedHtml)
    })
  }
})

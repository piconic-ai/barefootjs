import { describe, test, expect } from 'bun:test'
import { escapeBraceDelimiters } from '../adapters/brace-delimiter-text'

describe('escapeBraceDelimiters (#3767)', () => {
  const B = "{{ '{' }}"
  const esc = (t: string) => escapeBraceDelimiters(t, '{%#', B)

  test('rewrites a brace that opens a tag', () => {
    expect(esc('{{ 1 }}')).toBe(`${B}{ 1 }}`)
    expect(esc('{% if x %}')).toBe(`${B}% if x %}`)
    expect(esc('{# c #}')).toBe(`${B}# c #}`)
  })

  test('rewrites every brace of a run, so none is left before another', () => {
    expect(esc('{{{')).toBe(B + B + B)
  })

  test('rewrites a brace that ends the text', () => {
    expect(esc('a{')).toBe(`a${B}`)
  })

  test('leaves a brace that cannot open a tag, and closing braces', () => {
    expect(esc('{a} }} %} #}')).toBe('{a} }} %} #}')
    expect(escapeBraceDelimiters('{%', '{', '{{"{"}}')).toBe('{%')
  })
})

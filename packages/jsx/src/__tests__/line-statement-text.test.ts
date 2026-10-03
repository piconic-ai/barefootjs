import { describe, test, expect } from 'bun:test'
import { escapeLineStatementSigil } from '../adapters/line-statement-text'

describe('escapeLineStatementSigil (#3311)', () => {
  const esc = (t: string) => escapeLineStatementSigil(t, '%', "<%= '%' %>")

  test('rewrites a sigil that leads the text, keeping its indentation', () => {
    expect(esc('%y')).toBe("<%= '%' %>y")
    expect(esc(' %y')).toBe(" <%= '%' %>y")
  })

  test('rewrites a sigil that leads any later line', () => {
    expect(esc('a\n  %b\nc')).toBe("a\n  <%= '%' %>b\nc")
  })

  test('leaves a sigil that does not lead its line', () => {
    expect(esc('50%')).toBe('50%')
    expect(esc('a % b')).toBe('a % b')
  })

  test('rewrites only the leading sigil, once', () => {
    expect(esc('%%')).toBe("<%= '%' %>%")
    expect(escapeLineStatementSigil(': :x', ':', "<: ':' :>")).toBe("<: ':' :> :x")
  })
})

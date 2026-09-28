// What `npm:` specifier a deno.json `imports` entry gets for a package.json
// dependency range. Deno rejects compound ranges outright, so a widened peer
// range such as vite's must collapse to one Deno can parse.
import { describe, expect, test } from 'bun:test'
import { npmSpecifierRange } from '../jsr-packages'

describe('npmSpecifierRange', () => {
  test('passes a single caret / tilde / exact range through', () => {
    expect(npmSpecifierRange('^4.0.0')).toBe('^4.0.0')
    expect(npmSpecifierRange('~5.1.0')).toBe('~5.1.0')
    expect(npmSpecifierRange('1.2.3')).toBe('1.2.3')
    expect(npmSpecifierRange('^0.0.76')).toBe('^0.0.76')
  })

  test('keeps the first alternative of an `||` range', () => {
    expect(npmSpecifierRange('^6.0.0 || ^7.0.0 || ^8.0.0')).toBe('^6.0.0')
    expect(npmSpecifierRange('^6.0.0||^7.0.0')).toBe('^6.0.0')
  })

  test('falls back to `*` for anything Deno cannot parse', () => {
    expect(npmSpecifierRange('workspace:*')).toBe('*')
    expect(npmSpecifierRange('catalog:')).toBe('*')
    expect(npmSpecifierRange('>=6.0.0 <9.0.0')).toBe('*')
    expect(npmSpecifierRange('6 - 8')).toBe('*')
  })
})

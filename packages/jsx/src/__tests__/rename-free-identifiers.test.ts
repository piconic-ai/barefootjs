/**
 * `renameFreeIdentifiers` (#3402): only free `identifier` references to a
 * renamed name change. String literals, member property names, and names an
 * `arrow` param rebinds stay as they are.
 */
import { describe, test, expect } from 'bun:test'
import { parseExpression, renameFreeIdentifiers, stringifyParsedExpr } from '../expression-parser'

const rename = (src: string, map: Record<string, string>) =>
  stringifyParsedExpr(renameFreeIdentifiers(parseExpression(src), new Map(Object.entries(map))))

describe('renameFreeIdentifiers', () => {
  test('renames free references only', () => {
    expect(rename('t === name || t === "name"', { name: 'alias' })).toBe(stringifyParsedExpr(parseExpression('t === alias || t === "name"')))
  })
  test('leaves member property names alone', () => {
    expect(rename('t.name === name', { name: 'alias' })).toBe(stringifyParsedExpr(parseExpression('t.name === alias')))
  })
  test('an arrow param shadows the rename in its body', () => {
    expect(rename('xs.some(name => name === t) && name', { name: 'alias' })).toBe(stringifyParsedExpr(parseExpression('xs.some(name => name === t) && alias')))
  })
  test('an empty map returns the same tree', () => {
    const e = parseExpression('a + b')
    expect(renameFreeIdentifiers(e, new Map())).toBe(e)
  })
})

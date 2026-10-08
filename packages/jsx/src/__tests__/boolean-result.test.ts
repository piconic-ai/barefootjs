import { describe, test, expect } from 'bun:test'
import { isBooleanResultParsed, stringifyBooleanTernaryBranches } from '../adapters/boolean-result'
import { exprToString, parseExpression } from '../expression-parser'

const rewrite = (src: string) => exprToString(stringifyBooleanTernaryBranches(parseExpression(src)!))

describe('stringifyBooleanTernaryBranches (#3349)', () => {
  test('a literal boolean branch next to a non-boolean branch becomes a string literal', () => {
    expect(rewrite("yes() ? false : s()")).toBe(exprToString(parseExpression("yes() ? 'false' : s()")!))
  })

  test('a comparison branch becomes a true/false string ternary', () => {
    expect(rewrite("yes() ? n() > 0 : 'x'")).toBe(exprToString(parseExpression("yes() ? (n() > 0 ? 'true' : 'false') : 'x'")!))
  })

  test('nested mixed ternaries are rewritten recursively', () => {
    expect(rewrite("a() ? (b() ? 'x' : false) : 'y'")).toBe(exprToString(parseExpression("a() ? (b() ? 'x' : 'false') : 'y'")!))
  })

  test('a wholly boolean ternary and a non-ternary are left unchanged', () => {
    const whole = parseExpression('c() ? true : false')!
    expect(isBooleanResultParsed(whole)).toBe(true)
    expect(stringifyBooleanTernaryBranches(whole)).toBe(whole)
    const plain = parseExpression('s()')!
    expect(stringifyBooleanTernaryBranches(plain)).toBe(plain)
  })
})

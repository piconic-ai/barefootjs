import { describe, test, expect } from 'bun:test'
import { collectBooleanValueNames, isBooleanResultParsed, stringifyBooleanBranches } from '../adapters/boolean-result'
import { exprToString, parseExpression } from '../expression-parser'

const rewrite = (src: string) => exprToString(stringifyBooleanBranches(parseExpression(src)!))

describe('stringifyBooleanBranches (#3349, #3789)', () => {
  test('a literal boolean branch next to a non-boolean branch becomes a string literal', () => {
    expect(rewrite("yes() ? false : s()")).toBe(exprToString(parseExpression("yes() ? 'false' : s()")!))
  })

  test('a comparison branch becomes a true/false string ternary', () => {
    expect(rewrite("yes() ? n() > 0 : 'x'")).toBe(exprToString(parseExpression("yes() ? (n() > 0 ? 'true' : 'false') : 'x'")!))
  })

  test('nested mixed ternaries are rewritten recursively', () => {
    expect(rewrite("a() ? (b() ? 'x' : false) : 'y'")).toBe(exprToString(parseExpression("a() ? (b() ? 'x' : 'false') : 'y'")!))
  })

  test('a comparison an && / || / ?? operand returns is stringified where it decides the result', () => {
    expect(rewrite("n() > 0 && 'y'")).toBe(exprToString(parseExpression("n() > 0 ? 'y' : 'false'")!))
    expect(rewrite("n() > 0 || 'y'")).toBe(exprToString(parseExpression("n() > 0 ? 'true' : 'y'")!))
    expect(rewrite("!n() ?? 'y'")).toBe(exprToString(parseExpression("!n() ? 'true' : 'false'")!))
    expect(rewrite("s() || n() > 0")).toBe(exprToString(parseExpression("s() || (n() > 0 ? 'true' : 'false')")!))
    expect(rewrite("n() > 0 && (m() < 0 || 'y')")).toBe(exprToString(parseExpression("n() > 0 ? (m() < 0 ? 'true' : 'y') : 'false'")!))
    const plain = parseExpression("s() && 'y'")!
    expect(stringifyBooleanBranches(plain)).toBe(plain)
  })

  test('a wholly boolean ternary and a non-ternary are left unchanged', () => {
    const whole = parseExpression('c() ? true : false')!
    expect(isBooleanResultParsed(whole)).toBe(true)
    expect(stringifyBooleanBranches(whole)).toBe(whole)
    const plain = parseExpression('s()')!
    expect(stringifyBooleanBranches(plain)).toBe(plain)
  })
})

describe('collectBooleanValueNames props (#3443)', () => {
  const boolType = { kind: 'primitive', raw: 'boolean', primitive: 'boolean' } as const
  const prop = (name: string, optional: boolean, defaultValue?: string) => ({
    name,
    type: boolType,
    optional,
    ...(defaultValue === undefined ? {} : { defaultValue, parsed: parseExpression(defaultValue)! }),
  })
  const collect = (params: ReturnType<typeof prop>[]) =>
    collectBooleanValueNames({ signals: [], memos: [], localConstants: [], propsParams: params })

  test('a required or boolean-defaulted prop is boolean', () => {
    const { names, props } = collect([prop('a', false), prop('b', true, 'false'), prop('c', true, '!x')])
    expect([...names].sort()).toEqual(['a', 'b', 'c'])
    expect([...props].sort()).toEqual(['a', 'b', 'c'])
  })

  test('a default reading an earlier proven-boolean param is boolean', () => {
    // `{ off = false, on = off }`: `off` is in scope and boolean. A later or
    // unproven binding (`{ a = c, c = false }`, `{ b, d = b }`) is not.
    const { names } = collect([prop('off', true, 'false'), prop('on', true, 'off'), prop('a', true, 'c'), prop('c', true, 'false'), prop('b', true), prop('d', true, 'b')])
    expect([...names].sort()).toEqual(['c', 'off', 'on'])
  })

  test('an optional prop without a boolean default is not', () => {
    // `{ on = undefined }` still renders `undefined` when omitted; so does a
    // default of any other non-boolean expression.
    const { names, props } = collect([prop('a', true), prop('b', true, 'undefined'), prop('c', true, 'fallback()')])
    expect(names.size).toBe(0)
    expect(props.size).toBe(0)
  })
})

import { describe, test, expect } from 'bun:test'
import { isStringTypedOperand, isStringConcatBinary, type StringNameTest } from '../adapters/parsed-expr-emitter'
import { BindingScope } from '../scope/binding-scope'
import { parseExpression } from '../expression-parser'

// #2212: `isStringTypedOperand` gained a bare-`identifier` arm — previously
// `a + b` where BOTH operands are plain identifiers (destructured props,
// same-file consts) fell through every existing arm (literal, template
// literal, zero-arg getter, `props.x` member) and was treated as numeric
// `+`, even when both operands are string-typed. Twig/Blade/Mojolicious/
// Xslate route a detected string-concat through their own concat operator
// instead of native `+` (numeric-only on all four); this pins the shared
// detection function itself, independent of any one adapter's emitter.
describe('isStringTypedOperand identifier arm (#2212)', () => {
  const isStr = (n: string) => n === 'first' || n === 'last'

  test('a bare identifier known to be string-typed is detected', () => {
    const expr = parseExpression('first')
    expect(isStringTypedOperand(expr, isStr)).toBe(true)
  })

  test('a bare identifier NOT in the known-string set is not detected', () => {
    const expr = parseExpression('count')
    expect(isStringTypedOperand(expr, isStr)).toBe(false)
  })

  test('isStringConcatBinary(+) is true when only ONE identifier operand is string-typed', () => {
    const parsed = parseExpression('first + count')
    if (parsed.kind !== 'binary') throw new Error('expected binary')
    expect(isStringConcatBinary(parsed.op, parsed.left, parsed.right, isStr)).toBe(true)
  })

  test('isStringConcatBinary(+) is false when NEITHER identifier operand is known string-typed', () => {
    const parsed = parseExpression('count + total')
    if (parsed.kind !== 'binary') throw new Error('expected binary')
    expect(isStringConcatBinary(parsed.op, parsed.left, parsed.right, isStr)).toBe(false)
  })

  test('two bare-identifier string operands: first + last', () => {
    const parsed = parseExpression('first + last')
    if (parsed.kind !== 'binary') throw new Error('expected binary')
    expect(isStringConcatBinary(parsed.op, parsed.left, parsed.right, isStr)).toBe(true)
  })

  test('a nested + chain of bare identifiers still resolves via the existing binary-recursion arm', () => {
    const parsed = parseExpression('first + count + last')
    if (parsed.kind !== 'binary') throw new Error('expected binary')
    expect(isStringConcatBinary(parsed.op, parsed.left, parsed.right, isStr)).toBe(true)
  })

  test('a non-+ binary op is never treated as string concat regardless of operand names', () => {
    const parsed = parseExpression('first - last')
    if (parsed.kind !== 'binary') throw new Error('expected binary')
    expect(isStringConcatBinary(parsed.op, parsed.left, parsed.right, isStr)).toBe(false)
  })
})

// #3762: a field read (`row.id`) is string-typed when the binding's declared
// row type says the field is; a member of a string-typed name is not.
describe('isStringTypedOperand member arm (#3762)', () => {
  const rowType = {
    raw: 'Row',
    properties: [
      { name: 'id', type: { primitive: 'string' } },
      { name: 'n', type: { primitive: 'number' } },
      { name: 'meta', type: { properties: [{ name: 'label', type: { primitive: 'string' } }] } },
    ],
  }
  const scope = BindingScope.EMPTY.enterLoopRow({ param: 'r', index: 'i', rowType })
  const isStr: StringNameTest = (n, property, path) =>
    scope.isStringValueName(n, name => name === 'label', property, path)
  const concat = (source: string) => {
    const parsed = parseExpression(source)
    if (parsed.kind !== 'binary') throw new Error('expected binary')
    return isStringConcatBinary(parsed.op, parsed.left, parsed.right, isStr)
  }

  test('a string row field, alone or nested, makes + a concatenation', () => {
    expect(concat('r.id + i')).toBe(true)
    expect(concat('r.n + r.id')).toBe(true)
    expect(concat('r.meta.label + r.n')).toBe(true)
  })

  test('a numeric field, an unknown field and a member of a string name stay numeric', () => {
    expect(concat('r.n + i')).toBe(false)
    expect(concat('r.missing + 1')).toBe(false)
    expect(concat('label.length + 1')).toBe(false)
  })

  test('a test that ignores the path never types a member as a string', () => {
    const nameOnly: StringNameTest = n => n === 'label'
    expect(isStringTypedOperand(parseExpression('label.length'), nameOnly)).toBe(false)
  })
})

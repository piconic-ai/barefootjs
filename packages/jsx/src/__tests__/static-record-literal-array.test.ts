import { describe, expect, test } from 'bun:test'
import { lookupStaticArrayElement, lookupStaticRecordLiteral } from '../augment-inherited-props.ts'
import { parseExpression } from '../expression-parser.ts'
import { analyzeComponent } from '../analyzer.ts'
import { buildMetadata } from '../compiler.ts'
import type { ConstantInfo } from '../types.ts'

const loc = { file: 'c.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } }

function moduleConst(name: string, value: string, extra: Partial<ConstantInfo> = {}): ConstantInfo {
  return {
    name,
    value: value as ConstantInfo['value'],
    parsed: parseExpression(value),
    declarationKind: 'const',
    isModule: true,
    type: null,
    loc,
    ...extra,
  }
}

const notShadowed = () => false
const num = (value: number) => ({ kind: 'literal', value, literalType: 'number', raw: String(value) })
const str = (value: string) => ({ kind: 'literal', value, literalType: 'string' })

describe('lookupStaticArrayElement', () => {
  const QS = moduleConst('QS', `['a1', "b\\"c", \`m1\nm2\`, 1e3, 0x10, .5, -0, -1.5]`)
  const read = (key: string) => lookupStaticArrayElement('QS', key, [QS], notShadowed)

  test('a canonical index reads the element as a typed node', () => {
    expect(read('0')).toEqual(str('a1'))
    expect(read('1')).toEqual(str('b"c'))
    expect(read('2')).toEqual(str('m1\nm2'))
    expect(read('3')).toEqual(num(1000))
    expect(read('4')).toEqual(num(16))
    expect(read('5')).toEqual(num(0.5))
  })

  test('a negated element stays a unary minus, so -0 keeps its sign', () => {
    expect(read('6')).toEqual({ kind: 'unary', op: '-', argument: num(0) })
    expect(read('7')).toEqual({ kind: 'unary', op: '-', argument: num(1.5) })
  })

  test('length is the element count', () => {
    expect(read('length')).toEqual(num(8))
  })

  test('a key that names no element falls back to the generic lowering', () => {
    expect(read('01')).toBeNull()
    expect(read('8')).toBeNull()
    expect(read('-1')).toBeNull()
    expect(read('x')).toBeNull()
  })

  test('a hole, a spread or a non-literal element is not resolved', () => {
    const holes = moduleConst('H', `['a', , 'c']`)
    expect(lookupStaticArrayElement('H', '0', [holes], notShadowed)).toEqual(str('a'))
    expect(lookupStaticArrayElement('H', '2', [holes], notShadowed)).toBeNull()
    expect(lookupStaticArrayElement('H', 'length', [holes], notShadowed)).toBeNull()
    const spread = moduleConst('S', `[...xs, 'b']`)
    expect(lookupStaticArrayElement('S', '1', [spread], notShadowed)).toBeNull()
    const ref = moduleConst('R', `[other, 'b']`)
    expect(lookupStaticArrayElement('R', '0', [ref], notShadowed)).toBeNull()
    expect(lookupStaticArrayElement('R', '1', [ref], notShadowed)).toEqual(str('b'))
  })

  test('a loop binding, a component binding or a later mutation keeps the read live', () => {
    expect(lookupStaticArrayElement('QS', '0', [QS], name => name === 'QS')).toBeNull()
    const shadowed = moduleConst('QS', `['a1']`, { shadowedInComponent: true })
    expect(lookupStaticArrayElement('QS', '0', [shadowed], notShadowed)).toBeNull()
    const mutated = moduleConst('QS', `['a1']`, { mutatedAfterDeclaration: true })
    expect(lookupStaticArrayElement('QS', 'length', [mutated], notShadowed)).toBeNull()
  })

  test('a record const is not an array, and the record lookup no longer reads arrays', () => {
    const rec = moduleConst('REC', `{ lf: 'r1' }`)
    expect(lookupStaticArrayElement('REC', 'lf', [rec], notShadowed)).toBeNull()
    expect(lookupStaticRecordLiteral('QS', '0', [QS], notShadowed)).toBeNull()
  })
})

describe('resolveStaticConstBinding: a component-local literal const', () => {
  const constantsOf = (source: string) => buildMetadata(analyzeComponent(source, 'c.tsx')).localConstants
  const element = (source: string, key = '0') => lookupStaticArrayElement('QS', key, constantsOf(source), notShadowed)
  const member = (source: string, key = 'k') => lookupStaticRecordLiteral('REC', key, constantsOf(source), notShadowed)

  test('a component-local array or record const resolves like a module const', () => {
    const source = `export function C() {
  const QS = ['a', 'b']
  const REC = { k: 'v', n: 3 }
  return <p>{QS[0]}{REC.k}</p>
}`
    expect(element(source, '1')).toEqual(str('b'))
    expect(element(source, 'length')).toEqual(num(2))
    expect(member(source)).toEqual({ kind: 'string', text: 'v' })
    expect(member(source, 'n')).toEqual({ kind: 'number', text: '3' })
  })

  test('a component-local const shadows the module const of the same name', () => {
    const source = `const QS = ['module']
const REC = { k: 'module' }
export function C() {
  const QS = ['local']
  const REC = { k: 'local' }
  return <p>{QS[0]}{REC.k}</p>
}`
    expect(element(source)).toEqual(str('local'))
    expect(member(source)).toEqual({ kind: 'string', text: 'local' })
  })

  test('a loop binding of the name keeps the read live', () => {
    const constants = constantsOf(`export function C() {
  const QS = ['a']
  return <p>{QS[0]}</p>
}`)
    expect(lookupStaticArrayElement('QS', '0', constants, name => name === 'QS')).toBeNull()
  })

  test('a const the component changes during render is not resolved, local or module', () => {
    expect(element(`export function C() {
  const QS = ['a']
  QS.push('b')
  return <p>{QS[1]}</p>
}`, '1')).toBeNull()
    expect(member(`export function C() {
  const REC = { k: 'v' }
  REC.k = 'w'
  return <p>{REC.k}</p>
}`)).toBeNull()
    expect(member(`const REC = { k: 'v' }
export function C() {
  REC.k = 'w'
  return <p>{REC.k}</p>
}`)).toBeNull()
  })

  test('a let is not resolved', () => {
    expect(element(`export function C() {
  let QS = ['a']
  return <p>{QS[0]}</p>
}`)).toBeNull()
  })

  test("an early-return branch's own const does not leak into the main return", () => {
    const source = `export function C({ on }: { on: boolean }) {
  if (on) {
    const QS = ['inner']
    return <p>{QS[0]}</p>
  }
  const QS = ['outer']
  return <p>{QS[0]}</p>
}`
    expect(element(source)).toEqual(str('outer'))
  })

  test('each component of a file reads its own declaration', () => {
    const source = `export function A() {
  const QS = ['a']
  return <p>{QS[0]}</p>
}
export function B() {
  const QS = ['b']
  return <p>{QS[0]}</p>
}`
    const read = (name: string) =>
      lookupStaticArrayElement('QS', '0', buildMetadata(analyzeComponent(source, 'c.tsx', name)).localConstants, notShadowed)
    expect(read('A')).toEqual(str('a'))
    expect(read('B')).toEqual(str('b'))
  })
})

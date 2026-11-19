import { describe, expect, test } from 'bun:test'
import { lookupStaticRecordLiteral } from '../augment-inherited-props.ts'
import { lookupStaticConstMember, readStaticConstMember, spellStaticConstMember, staticIndexKey } from '../static-const-member.ts'
import { parseExpression } from '../expression-parser.ts'
import { analyzeComponent } from '../analyzer.ts'
import { buildMetadata } from '../compiler.ts'
import type { CompilerError, ConstantInfo, SourceLocation } from '../types.ts'

const loc = { file: 'c.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } }

function moduleConst(name: string, value: string, extra: Partial<ConstantInfo> = {}): ConstantInfo {
  return {
    name,
    value: value as ConstantInfo['value'],
    // Parenthesised, as the analyzer parses it, so an object literal is not a block.
    parsed: parseExpression(`(${value})`),
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
const UNDEFINED = { kind: 'identifier', name: 'undefined' }
const ident = (name: string) => ({ kind: 'identifier' as const, name })
const lookupStaticArrayElement = (name: string, key: string, constants: ConstantInfo[] | undefined, isShadowed: (n: string) => boolean) =>
  lookupStaticConstMember(ident(name), key, constants, isShadowed)

describe('lookupStaticConstMember: an array literal', () => {
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

  test('a key that names no element reads undefined', () => {
    expect(read('01')).toEqual(UNDEFINED)
    expect(read('8')).toEqual(UNDEFINED)
    expect(read('-1')).toEqual(UNDEFINED)
    expect(read('x')).toEqual(UNDEFINED)
  })

  test('a key only Array.prototype has is inherited, not undefined', () => {
    expect(read('map')).toBeNull()
    expect(readStaticConstMember(ident('QS'), 'map', [QS], notShadowed)).toEqual({ kind: 'inherited', key: 'map' })
    expect(readStaticConstMember(ident('QS'), 'constructor', [QS], notShadowed)).toEqual({ kind: 'inherited', key: 'constructor' })
  })

  test('a hole, a spread or a non-literal element is not resolved', () => {
    const holes = moduleConst('H', `['a', , 'c']`)
    expect(lookupStaticArrayElement('H', '0', [holes], notShadowed)).toEqual(str('a'))
    expect(lookupStaticArrayElement('H', '2', [holes], notShadowed)).toBeNull()
    expect(lookupStaticArrayElement('H', 'length', [holes], notShadowed)).toBeNull()
    // Past the end is unknown once a hole or spread hides the length, but a
    // non-index key is missing either way.
    expect(lookupStaticArrayElement('H', '9', [holes], notShadowed)).toBeNull()
    expect(lookupStaticArrayElement('H', '01', [holes], notShadowed)).toEqual(UNDEFINED)
    const spread = moduleConst('S', `[...xs, 'b']`)
    expect(lookupStaticArrayElement('S', '1', [spread], notShadowed)).toBeNull()
    expect(lookupStaticArrayElement('S', '9', [spread], notShadowed)).toBeNull()
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

  test('the record lookup does not read arrays', () => {
    expect(lookupStaticRecordLiteral('QS', '0', [QS], notShadowed)).toBeNull()
  })
})

describe('lookupStaticConstMember: an object literal and a nested read', () => {
  const REC = moduleConst('REC', `{ k: 'v', n: 3, k2: 'a', k2: 'b' }`)
  const NEST = moduleConst('NEST', `{ a: { b: 1, q: ['x'] } }`)
  const member = (object: Parameters<typeof lookupStaticConstMember>[0], key: string) =>
    lookupStaticConstMember(object, key, [REC, NEST], notShadowed)
  const nestA = { kind: 'member' as const, object: ident('NEST'), property: 'a', computed: false, optional: false }

  test('a listed key reads its value, the last entry winning', () => {
    expect(member(ident('REC'), 'k')).toEqual(str('v'))
    expect(member(ident('REC'), 'n')).toEqual(num(3))
    expect(member(ident('REC'), 'k2')).toEqual(str('b'))
    expect(member(nestA, 'b')).toEqual(num(1))
  })

  test('a key the literal does not list reads undefined, nested too', () => {
    expect(member(ident('REC'), 'nope')).toEqual(UNDEFINED)
    expect(member(ident('REC'), 'length')).toEqual(UNDEFINED)
    expect(member(nestA, 'c')).toEqual(UNDEFINED)
    expect(member({ kind: 'member', object: nestA, property: 'q', computed: false, optional: false }, '1')).toEqual(UNDEFINED)
  })

  test('a key only Object.prototype has is inherited', () => {
    for (const key of ['toString', 'constructor', 'hasOwnProperty', '__proto__']) {
      expect(member(ident('REC'), key)).toBeNull()
      expect(readStaticConstMember(ident('REC'), key, [REC], notShadowed)).toEqual({ kind: 'inherited', key })
    }
    expect(readStaticConstMember(nestA, 'toString', [NEST], notShadowed)).toEqual({ kind: 'inherited', key: 'toString' })
  })

  test('a spread or an __proto__ entry makes a missing key unknown', () => {
    const spread = moduleConst('SP', `{ ...base, k: 'v' }`)
    const proto = moduleConst('PR', `{ __proto__: base, k: 'v' }`)
    expect(lookupStaticConstMember(ident('SP'), 'nope', [spread], notShadowed)).toBeNull()
    expect(lookupStaticConstMember(ident('PR'), 'nope', [proto], notShadowed)).toBeNull()
  })

  test('a value that is not a string or number has no compile-time value', () => {
    expect(member(ident('NEST'), 'a')).toBeNull()
    expect(member(nestA, 'q')).toBeNull()
  })

  test('a shadowed root keeps the read live', () => {
    expect(lookupStaticConstMember(ident('REC'), 'nope', [REC], name => name === 'REC')).toBeNull()
  })
})

describe('staticIndexKey', () => {
  test('a literal index is its JS property key', () => {
    expect(staticIndexKey(num(1))).toBe('1')
    expect(staticIndexKey(str('01'))).toBe('01')
    expect(staticIndexKey({ kind: 'unary', op: '-', argument: num(1) } as never)).toBe('-1')
    expect(staticIndexKey({ kind: 'unary', op: '-', argument: num(0) } as never)).toBe('0')
    expect(staticIndexKey(ident('i'))).toBeNull()
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

describe('lookupStaticConstMember: an object literal with a spread of a literal const (#3916)', () => {
  const R = moduleConst('R', `{ k: 'v', z: 1 }`)
  const Q = moduleConst('Q', `{ ...R, z: 2 }`)
  const B = moduleConst('B', `{ k: 'a', ...Q, extra: 1 }`)
  const read = (name: string, key: string, constants: ConstantInfo[]) => lookupStaticConstMember(ident(name), key, constants, notShadowed)

  test('a key of the spread source reads through, and a later entry overrides an earlier one', () => {
    expect(read('B', 'k', [R, Q, B])).toEqual(str('v'))
    expect(read('B', 'z', [R, Q, B])).toEqual(num(2))
    expect(read('B', 'extra', [R, Q, B])).toEqual(num(1))
    expect(read('B', 'nope', [R, Q, B])).toEqual(UNDEFINED)
  })

  test('a spread of a source that is not a literal const object stays unanswered', () => {
    const call = moduleConst('B', `{ ...mk() }`)
    const member = moduleConst('B', `{ ...R.sub }`)
    const array = moduleConst('B', `{ ...[1, 2] }`)
    const absent = moduleConst('B', `{ ...MISSING }`)
    const letSource = moduleConst('B', `{ ...L }`)
    const L = moduleConst('L', `{ k: 'v' }`, { declarationKind: 'let' })
    const mutated = moduleConst('M', `{ k: 'v' }`, { mutatedAfterDeclaration: true })
    const ofMutated = moduleConst('B', `{ ...M }`)
    expect(read('B', 'k', [R, call])).toBeNull()
    expect(read('B', 'k', [R, member])).toBeNull()
    expect(read('B', 'k', [R, array])).toBeNull()
    expect(read('B', 'k', [R, absent])).toBeNull()
    expect(read('B', 'k', [L, letSource])).toBeNull()
    expect(read('B', 'k', [mutated, ofMutated])).toBeNull()
  })

  test('a spread inside a module const reads the module const, not a component binding of the same name', () => {
    const local = moduleConst('R', `{ k: 'local' }`, { isModule: false })
    const ofModule = moduleConst('B', `{ ...R }`)
    expect(read('B', 'k', [R, local, ofModule])).toEqual(str('v'))
    // The component's own const spreading `R` reads the component's `R`.
    const ownB = moduleConst('B', `{ ...R }`, { isModule: false })
    expect(read('B', 'k', [R, local, ownB])).toEqual(str('local'))
  })
})

describe('readStaticConstMember: a spread the literal cannot expand (#3944)', () => {
  const R = moduleConst('R', `{ k: 'v', sub: { a: 'x' } }`)
  const read = (key: string, constants: ConstantInfo[]) => readStaticConstMember(ident('B'), key, constants, notShadowed)

  test('a key no entry lists after the spread is unresolvable, for each kind of source', () => {
    const L = moduleConst('L', `{ k: 'v' }`, { declarationKind: 'let' })
    const sources = [`{ ...mk() }`, `{ ...[1] }`, `{ ...L }`, `{ ...MISSING }`, `{ ...R.nope }`, `{ ...props.x }`]
    for (const source of sources) {
      const B = moduleConst('B', source)
      expect(read('k', [R, L, B])).toEqual({ kind: 'unresolvable' })
      expect(read('toString', [R, L, B])).toEqual({ kind: 'unresolvable' })
    }
  })

  test('a key listed before the spread may be overridden by it, one listed after is that entry', () => {
    const B = moduleConst('B', `{ k: 'first', ...mk(), z: 'last' }`)
    expect(read('k', [B])).toEqual({ kind: 'unresolvable' })
    expect(read('z', [B])).toEqual({ kind: 'value', expr: str('last') })
    const both = moduleConst('B', `{ ...mk(), k: 'after', ...mk() }`)
    expect(read('k', [both])).toEqual({ kind: 'unresolvable' })
  })

  test('a spread of a literal member of a literal const expands, including its own spreads', () => {
    const member = moduleConst('B', `{ ...R.sub, n: 1 }`)
    expect(read('a', [R, member])).toEqual({ kind: 'value', expr: str('x') })
    expect(read('n', [R, member])).toEqual({ kind: 'value', expr: num(1) })
    expect(read('nope', [R, member])).toEqual({ kind: 'value', expr: UNDEFINED })
    const indexed = moduleConst('B', `{ ...R['sub'] }`)
    expect(read('a', [R, indexed])).toEqual({ kind: 'value', expr: str('x') })
    const Base = moduleConst('Base', `{ z: 'z' }`)
    const Nested = moduleConst('N', `{ sub: { ...Base, y: 'y' } }`)
    const viaNested = moduleConst('B', `{ ...N.sub }`)
    expect(read('z', [Base, Nested, viaNested])).toEqual({ kind: 'value', expr: str('z') })
  })

  test('spellStaticConstMember records BF101 once, with the client escape unless the position cannot defer', () => {
    const B = moduleConst('B', `{ ...mk() }`)
    const errors: CompilerError[] = []
    const sink = { errors, componentName: 'C' }
    const spell = (where?: { loc: SourceLocation; deferrable?: boolean }) =>
      spellStaticConstMember(ident('B'), 'k', [B], notShadowed, sink, where)
    expect(spell()).toBeNull()
    expect(spell()).toBeNull()
    expect(errors).toHaveLength(1)
    expect(errors[0].code).toBe('BF101')
    expect(errors[0].suggestion?.escape).toEqual([{ kind: 'client-directive' }])
    errors.length = 0
    const loc = { file: 'C.tsx', start: { line: 2, column: 0 }, end: { line: 2, column: 5 } }
    spell({ loc, deferrable: false })
    expect(errors[0].suggestion?.escape).toBeUndefined()
  })
})

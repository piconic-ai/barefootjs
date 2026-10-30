import { describe, expect, test } from 'bun:test'
import { lookupStaticRecordLiteral } from '../augment-inherited-props.ts'
import type { ConstantInfo } from '../types.ts'

const loc = { file: 'c.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } }

function moduleConst(name: string, value: string, extra: Partial<ConstantInfo> = {}): ConstantInfo {
  return { name, value: value as ConstantInfo['value'], declarationKind: 'const', isModule: true, type: null, loc, ...extra }
}

const notShadowed = () => false

describe('lookupStaticRecordLiteral on a module array-literal const', () => {
  const QS = moduleConst('QS', `['a1', "b\\"c", \`m1\nm2\`, 1e3, 0x10, .5, -0, -1.5]`)
  const read = (key: string) => lookupStaticRecordLiteral('QS', key, [QS], notShadowed)

  test('a canonical index reads the element as JS prints it', () => {
    expect(read('0')).toEqual({ kind: 'string', text: 'a1' })
    expect(read('1')).toEqual({ kind: 'string', text: 'b"c' })
    expect(read('2')).toEqual({ kind: 'string', text: 'm1\nm2' })
    expect(read('3')).toEqual({ kind: 'number', text: '1000' })
    expect(read('4')).toEqual({ kind: 'number', text: '16' })
    expect(read('5')).toEqual({ kind: 'number', text: '0.5' })
    expect(read('6')).toEqual({ kind: 'number', text: '0' })
    expect(read('7')).toEqual({ kind: 'number', text: '-1.5' })
  })

  test('length is the element count', () => {
    expect(read('length')).toEqual({ kind: 'number', text: '8' })
  })

  test('a key that names no element falls back to the generic lowering', () => {
    expect(read('01')).toBeNull()
    expect(read('8')).toBeNull()
    expect(read('-1')).toBeNull()
    expect(read('x')).toBeNull()
  })

  test('a hole, a spread or a non-literal element is not resolved', () => {
    const holes = moduleConst('H', `['a', , 'c']`)
    expect(lookupStaticRecordLiteral('H', '1', [holes], notShadowed)).toBeNull()
    expect(lookupStaticRecordLiteral('H', '2', [holes], notShadowed)).toEqual({ kind: 'string', text: 'c' })
    const spread = moduleConst('S', `[...xs, 'b']`)
    expect(lookupStaticRecordLiteral('S', '1', [spread], notShadowed)).toBeNull()
    expect(lookupStaticRecordLiteral('S', 'length', [spread], notShadowed)).toBeNull()
    const ref = moduleConst('R', `[other, 'b']`)
    expect(lookupStaticRecordLiteral('R', '0', [ref], notShadowed)).toBeNull()
    expect(lookupStaticRecordLiteral('R', '1', [ref], notShadowed)).toEqual({ kind: 'string', text: 'b' })
  })

  test('a loop binding or a component binding of the name shadows the const', () => {
    expect(lookupStaticRecordLiteral('QS', '0', [QS], name => name === 'QS')).toBeNull()
    const shadowed = moduleConst('QS', `['a1']`, { shadowedInComponent: true })
    expect(lookupStaticRecordLiteral('QS', '0', [shadowed], notShadowed)).toBeNull()
  })
})

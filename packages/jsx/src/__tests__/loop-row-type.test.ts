import { describe, test, expect } from 'bun:test'
import { loopRowType, type DeclaredValueTypes } from '../adapters/loop-row-type'
import { parseExpression } from '../expression-parser'
import { BindingScope } from '../scope/binding-scope'
import type { PropertyInfo, TypeInfo } from '../types'

// #3762 review: a `concat` row's field is a definite string only when it is
// one in the receiver's element type and in every argument's, whatever the
// types are named.
describe('concat row type', () => {
  const str: TypeInfo = { kind: 'primitive', raw: 'string', primitive: 'string' }
  const num: TypeInfo = { kind: 'primitive', raw: 'number', primitive: 'number' }
  const field = (name: string, type: TypeInfo, optional = false): PropertyInfo => ({ name, type, optional, readonly: false })
  const named: Record<string, PropertyInfo[]> = {
    Row: [field('id', str)],
    Other: [field('id', str)],
    Numeric: [field('id', num)],
    Optional: [field('id', str, true)],
    Bare: [field('n', num)],
  }
  const arrayOf = (raw: string): TypeInfo => ({ kind: 'array', raw: `${raw}[]`, elementType: { kind: 'interface', raw } })
  const types: DeclaredValueTypes = {
    propsParams: [
      ...Object.keys(named).map(name => ({ name: name.toLowerCase(), type: arrayOf(name) })),
      { name: 'extras', type: { kind: 'array', raw: 'any[]', elementType: { kind: 'unknown', raw: 'any' } } },
      { name: 'one', type: { kind: 'interface', raw: 'Other' } },
    ],
    signals: [],
    memos: [],
    propsObjectName: 'props',
    namedFields: name => named[name],
  }
  const idIsString = (array: string): boolean => {
    const rowType = loopRowType(types, { arrayParsed: parseExpression(array) }, BindingScope.EMPTY)
    if (!rowType) return false
    const scope = BindingScope.EMPTY.enterLoopRow({ param: 'r', rowType })
    return scope.isStringValueName('r', () => false, false, ['id'], types.namedFields)
  }

  test('a field that is a string in every member stays one, across differently named types', () => {
    expect(idIsString('props.row.concat(props.row)')).toBe(true)
    expect(idIsString('props.row.concat(props.other)')).toBe(true)
    expect(idIsString('props.row.concat(props.one)')).toBe(true)
  })

  test('an any, a number, an optional or a missing field in one member types nothing', () => {
    expect(idIsString('props.row.concat(props.extras)')).toBe(false)
    expect(idIsString('props.row.concat(props.numeric)')).toBe(false)
    expect(idIsString('props.row.concat(props.optional)')).toBe(false)
    expect(idIsString('props.row.concat(props.bare)')).toBe(false)
    expect(idIsString('props.row.concat(props.other).concat(props.extras)')).toBe(false)
    expect(idIsString('props.row.concat(props.missing)')).toBe(false)
  })
})

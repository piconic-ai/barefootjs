import { describe, test, expect } from 'bun:test'
import { concatType, loopRowType, type DeclaredValueTypes } from '../adapters/loop-row-type'
import { parseExpression } from '../expression-parser'
import { BindingScope } from '../scope/binding-scope'
import type { TypeInfo } from '../types'

// #3762 review: `concat` keeps the receiver's element type only when every
// argument has that element type too.
describe('concat row type', () => {
  const row: TypeInfo = { kind: 'interface', raw: 'Row' }
  const rows: TypeInfo = { kind: 'array', raw: 'Row[]', elementType: row }
  const anys: TypeInfo = { kind: 'array', raw: 'any[]', elementType: { kind: 'unknown', raw: 'any' } }
  const types: DeclaredValueTypes = {
    propsParams: [
      { name: 'rows', type: rows },
      { name: 'more', type: rows },
      { name: 'extras', type: anys },
      { name: 'one', type: row },
    ],
    signals: [],
    memos: [],
    propsObjectName: 'props',
    namedFields: () => undefined,
  }
  const rowTypeOf = (array: string) => loopRowType(types, { arrayParsed: parseExpression(array) }, BindingScope.EMPTY)

  test('same element type arguments keep the row type', () => {
    expect(rowTypeOf('props.rows.concat(props.more)')).toBe(row)
    expect(rowTypeOf('props.rows.concat(props.one)')).toBe(row)
  })

  test('an argument of unknown or another element type drops it', () => {
    expect(rowTypeOf('props.rows.concat(props.extras)')).toBeNull()
    expect(rowTypeOf('props.rows.concat(props.more).concat(props.extras)')).toBeNull()
    expect(rowTypeOf('props.rows.concat(props.missing)')).toBeNull()
  })

  test('the result is still an array of the receiver kind', () => {
    expect(concatType(rows, [anys])).toEqual({ ...rows, elementType: undefined })
    expect(concatType(rows, [rows, anys])).toEqual({ ...rows, elementType: undefined })
    expect(concatType(rows, [rows, row])).toBe(rows)
  })
})

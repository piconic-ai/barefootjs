import { describe, expect, test } from 'bun:test'
import { parseExpression } from '@barefootjs/jsx'
import { allocateRowsFields, loopDrivingProp, nestedRowsFieldName, reservedRowsFieldNames } from '../adapter/lib/nested-rows-field'

const params = [{ name: 'items' }, { name: 'other' }, { name: 'tags' }]

describe('nestedRowsFieldName', () => {
  test('a plural no prop claims stays the plural', () => {
    expect(nestedRowsFieldName('Badge', params)).toBe('Badges')
  })

  test('a plural a prop claims is renamed', () => {
    expect(nestedRowsFieldName('Item', params)).toBe('ItemRows')
  })

  test('a loop over the very prop owning the plural is renamed too, bodyless (#3616) or not (#3603)', () => {
    expect(nestedRowsFieldName('Tag', params)).toBe('TagRows')
  })

  test('the renamed field skips a name another prop already claims', () => {
    const taken = [...params, { name: 'itemRows' }]
    expect(nestedRowsFieldName('Item', taken)).toBe('ItemRows2')
  })

  test("the renamed field skips a sibling loop's plural and state fields", () => {
    const reserved = reservedRowsFieldNames(['Item', 'ItemRow'], ['count'])
    expect(reserved.has('ItemRows')).toBe(true)
    expect(reserved.has('Count')).toBe(true)
    expect(nestedRowsFieldName('Item', params, reserved)).toBe('ItemRows2')
    expect(nestedRowsFieldName('ItemRow', params, reserved)).toBe('ItemRows')
  })
})

describe('allocateRowsFields', () => {
  const site = (name: string, marker: string) => ({ name, loopMarkerId: marker })

  test('each loop site over the same component gets its own field and local (#3599)', () => {
    const fields = allocateRowsFields(
      [site('Chip', 'l0'), site('Chip', 'l1'), site('Chip', 'l2')],
      [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
      [],
    )
    expect(fields.get('l0')).toEqual({ field: 'Chips', varName: 'chips' })
    expect(fields.get('l1')).toEqual({ field: 'ChipRows', varName: 'chipRows' })
    expect(fields.get('l2')).toEqual({ field: 'ChipRows2', varName: 'chipRows2' })
  })

  test("a later site's field skips props, state fields and other components' plurals", () => {
    const fields = allocateRowsFields(
      [site('Chip', 'l0'), site('ChipRow', 'l1'), site('Chip', 'l2')],
      [{ name: 'a' }, { name: 'b' }, { name: 'chipRows2' }],
      ['chipRows3'],
    )
    expect(fields.get('l1')?.field).toBe('ChipRows')
    expect(fields.get('l2')?.field).toBe('ChipRows4')
  })

  test('a first site keeps the single-site name, including a renamed one', () => {
    const fields = allocateRowsFields([site('Item', 'l0'), site('Item', 'l1')], params, [])
    expect(fields.get('l0')).toEqual({ field: 'ItemRows', varName: 'items' })
    expect(fields.get('l1')).toEqual({ field: 'ItemRows2', varName: 'itemRows2' })
  })
})

describe('loopDrivingProp', () => {
  test('a bare identifier is a prop only for destructured props', () => {
    expect(loopDrivingProp(parseExpression('items'), params, null)?.name).toBe('items')
    expect(loopDrivingProp(parseExpression('items'), params, 'props')).toBeUndefined()
  })

  test('an aliased prop resolves by its caller-facing name', () => {
    const aliased = [{ name: 'rows', sourceName: 'items' }]
    expect(loopDrivingProp(parseExpression('props.items'), aliased, 'props')?.name).toBe('rows')
  })
})

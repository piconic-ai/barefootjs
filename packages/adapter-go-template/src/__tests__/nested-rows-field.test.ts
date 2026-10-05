import { describe, expect, test } from 'bun:test'
import { parseExpression } from '@barefootjs/jsx'
import { loopDrivingProp, nestedRowsFieldName, reservedRowsFieldNames } from '../adapter/lib/nested-rows-field'

const params = [{ name: 'items' }, { name: 'other' }, { name: 'tags' }]

describe('nestedRowsFieldName', () => {
  test('a plural no prop claims stays the plural', () => {
    expect(nestedRowsFieldName('Badge', parseExpression('props.items'), params, 'props')).toBe('Badges')
  })

  test("a plural claimed by a different prop than the loop's source is renamed", () => {
    expect(nestedRowsFieldName('Item', parseExpression('props.other'), params, 'props')).toBe('ItemRows')
    expect(nestedRowsFieldName('Item', parseExpression('list()'), params, 'props')).toBe('ItemRows')
  })

  test('a loop over the very prop owning the plural keeps it (#2627)', () => {
    expect(nestedRowsFieldName('Tag', parseExpression('props.tags'), params, 'props')).toBe('Tags')
    expect(nestedRowsFieldName('Tag', parseExpression('tags'), params, null)).toBe('Tags')
  })

  test('the renamed field skips a name another prop already claims', () => {
    const taken = [...params, { name: 'itemRows' }]
    expect(nestedRowsFieldName('Item', parseExpression('props.other'), taken, 'props')).toBe('ItemRows2')
  })

  test("the renamed field skips a sibling loop's plural and state fields", () => {
    const reserved = reservedRowsFieldNames(['Item', 'ItemRow'], ['count'])
    expect(reserved.has('ItemRows')).toBe(true)
    expect(reserved.has('Count')).toBe(true)
    expect(nestedRowsFieldName('Item', parseExpression('props.other'), params, 'props', reserved)).toBe('ItemRows2')
    expect(nestedRowsFieldName('ItemRow', parseExpression('props.rows'), params, 'props', reserved)).toBe('ItemRows')
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

import { describe, test, expect } from 'bun:test'
import { BindingScope } from '../scope/binding-scope'
import { rootPropAliasName, rootPropAliasesForLoop, rootPropReadName } from '../scope/root-prop-alias'

describe('root-prop aliases (#3314)', () => {
  const props = new Set(['value', 'index', 'values'])
  const outer = BindingScope.EMPTY
  const row = outer.enterLoopRow({ param: 'value', index: 'index' })
  const inner = row.enterLoopRow({ param: 'value' })

  test('a loop row aliases exactly the props it newly shadows', () => {
    expect(rootPropAliasesForLoop(outer, row, props)).toEqual(['value', 'index'])
  })

  test('a nested loop re-binding an already shadowed name adds no alias', () => {
    expect(rootPropAliasesForLoop(row, inner, props)).toEqual([])
  })

  test('a binding that is not a prop needs no alias', () => {
    expect(rootPropAliasesForLoop(outer, outer.enterLoopRow({ param: 'item' }), props)).toEqual([])
  })

  test('props.X reads the alias only while X is shadowed', () => {
    expect(rootPropReadName('value', outer)).toBe('value')
    expect(rootPropReadName('value', row)).toBe(rootPropAliasName('value'))
    expect(rootPropReadName('value', inner)).toBe(rootPropAliasName('value'))
    expect(rootPropReadName('values', row)).toBe('values')
  })
})

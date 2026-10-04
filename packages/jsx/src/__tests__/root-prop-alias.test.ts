import { describe, test, expect } from 'bun:test'
import { BindingScope } from '../scope/binding-scope'
import { rootPropAliasNames, rootPropAliasesForLoop, rootPropReadName } from '../scope/root-prop-alias'
import type { ComponentIR } from '../types'

function irWith(opts: { localConstants?: string[]; loopParam?: string } = {}): ComponentIR {
  const root = opts.loopParam
    ? { type: 'loop', param: opts.loopParam, children: [] }
    : { type: 'element', children: [] }
  return {
    root,
    metadata: {
      localConstants: (opts.localConstants ?? []).map(name => ({ name })),
      localFunctions: [],
      signals: [],
      memos: [],
    },
  } as unknown as ComponentIR
}

describe('root-prop aliases (#3314)', () => {
  const props = new Set(['value', 'index', 'values'])
  const aliases = rootPropAliasNames(irWith(), props)
  const outer = BindingScope.EMPTY
  const row = outer.enterLoopRow({ param: 'value', index: 'index' })
  const inner = row.enterLoopRow({ param: 'value' })

  test('a loop row aliases exactly the props it newly shadows', () => {
    expect(rootPropAliasesForLoop(outer, row, aliases)).toEqual([
      { name: 'value', alias: '__bf_root_value' },
      { name: 'index', alias: '__bf_root_index' },
    ])
  })

  test('a nested loop re-binding an already shadowed name adds no alias', () => {
    expect(rootPropAliasesForLoop(row, inner, aliases)).toEqual([])
  })

  test('a binding that is not a prop needs no alias', () => {
    expect(rootPropAliasesForLoop(outer, outer.enterLoopRow({ param: 'item' }), aliases)).toEqual([])
  })

  test('props.X reads the alias only while X is shadowed', () => {
    expect(rootPropReadName('value', outer, aliases)).toBe('value')
    expect(rootPropReadName('value', row, aliases)).toBe('__bf_root_value')
    expect(rootPropReadName('value', inner, aliases)).toBe('__bf_root_value')
    expect(rootPropReadName('values', row, aliases)).toBe('values')
  })

  test('an alias never takes a name the component already uses', () => {
    expect(rootPropAliasNames(irWith(), ['value', '__bf_root_value']).get('value')).toBe('__bf_root_value_')
    expect(rootPropAliasNames(irWith({ localConstants: ['__bf_root_value'] }), ['value']).get('value')).toBe(
      '__bf_root_value_',
    )
    expect(rootPropAliasNames(irWith({ loopParam: '__bf_root_value' }), ['value']).get('value')).toBe(
      '__bf_root_value_',
    )
    // `value` (bumped past the prop) and `value_` would otherwise share `__bf_root_value_`.
    const both = rootPropAliasNames(irWith(), ['value', '__bf_root_value', 'value_'])
    expect(new Set(both.values()).size).toBe(3)
  })
})

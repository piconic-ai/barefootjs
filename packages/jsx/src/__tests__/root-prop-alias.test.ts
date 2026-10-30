import { describe, test, expect } from 'bun:test'
import { BindingScope } from '../scope/binding-scope'
import { isRootPropsObject, rootPropAliasNames, rootPropAliasesForLoop, rootPropReadName } from '../scope/root-prop-alias'
import type { ParsedExpr } from '../expression-parser'
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

describe('the props object a binding named props shadows (#3693)', () => {
  const props: ParsedExpr = { kind: 'identifier', name: 'props' }
  const isBoundIn = (scope: BindingScope) => (name: string) => scope.isBound(name)

  test('props is the component props object until a binding of that name shadows it', () => {
    expect(isRootPropsObject(props, isBoundIn(BindingScope.EMPTY), 'props')).toBe(true)
    expect(isRootPropsObject(props, isBoundIn(BindingScope.EMPTY.enterLoopRow({ param: 'row' })), 'props')).toBe(true)
    expect(isRootPropsObject(props, isBoundIn(BindingScope.EMPTY.enterLoopRow({ param: 'props' })), 'props')).toBe(false)
    const destructured = BindingScope.EMPTY.enterLoopRow({ param: '{ props }', paramBindings: [{ name: 'props' }] })
    expect(isRootPropsObject(props, isBoundIn(destructured), 'props')).toBe(false)
    const preamble = BindingScope.EMPTY.enterLoopRow({ param: 'row', preamble: { declaredNames: ['props'] } })
    expect(isRootPropsObject(props, isBoundIn(preamble), 'props')).toBe(false)
    expect(isRootPropsObject(props, isBoundIn(BindingScope.EMPTY.enterCallback(['props'])), 'props')).toBe(false)
  })

  test('only the bare identifier props reads the props object', () => {
    expect(isRootPropsObject({ kind: 'identifier', name: 'row' }, () => false, 'props')).toBe(false)
    expect(isRootPropsObject({ kind: 'member', object: props, property: 'a', computed: false, optional: false }, () => false, 'props')).toBe(false)
  })

  test('a props.<name> read has no component typing while props is shadowed', () => {
    const outer = BindingScope.EMPTY
    const row = outer.enterLoopRow({ param: 'props' })
    expect(outer.shadowsPropsObject()).toBe(false)
    expect(row.shadowsPropsObject()).toBe(true)
    expect(outer.isStringValueName('label', () => true, true)).toBe(true)
    expect(row.isStringValueName('label', () => true, true)).toBe(false)
    // A bare `label` is untouched: only the `props.<name>` form changes.
    expect(row.isStringValueName('label', () => true)).toBe(true)
  })
})

describe('a props object parameter not named props (#3729)', () => {
  const p: ParsedExpr = { kind: 'identifier', name: 'p' }
  const props: ParsedExpr = { kind: 'identifier', name: 'props' }
  const component = BindingScope.forComponent('p')
  const isBoundIn = (scope: BindingScope) => (name: string) => scope.isBound(name)

  test('the props parameter name is the props object; props is not', () => {
    expect(component.propsObject).toBe('p')
    expect(isRootPropsObject(p, isBoundIn(component), component.propsObject)).toBe(true)
    expect(isRootPropsObject(props, isBoundIn(component), component.propsObject)).toBe(false)
  })

  test('a destructured or props-named component keeps props', () => {
    expect(BindingScope.forComponent(null).propsObject).toBe('props')
    expect(BindingScope.forComponent('props').propsObject).toBe('props')
  })

  test('child scopes keep the name, and a binding of it shadows the props object', () => {
    const row = component.enterLoopRow({ param: 'p' })
    expect(row.propsObject).toBe('p')
    expect(isRootPropsObject(p, isBoundIn(row), row.propsObject)).toBe(false)
    expect(row.shadowsPropsObject()).toBe(true)
    expect(component.enterLoopRow({ param: 'props' }).shadowsPropsObject()).toBe(false)
    expect(component.enterCallback(['x']).propsObject).toBe('p')
    expect(component.isStringValueName('label', () => true, true)).toBe(true)
    expect(row.isStringValueName('label', () => true, true)).toBe(false)
  })
})

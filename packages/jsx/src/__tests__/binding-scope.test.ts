/**
 * Unit tests for `BindingScope` (#2482 Stage 0). See
 * `packages/jsx/src/scope/binding-scope.ts` for the service itself — this
 * file pins its observable behavior, especially the destructure semantics
 * mirrored from `jsx-to-ir.ts`'s `ctx.loopParams` add site and the
 * immutability win over that Set-based design's nested-same-name hazard.
 */

import { describe, test, expect } from 'bun:test'
import { BindingScope } from '../scope/binding-scope.ts'

describe('BindingScope', () => {
  test('EMPTY: nothing bound, lookup null, empty boundNames, shadow predicate false', () => {
    const scope = BindingScope.EMPTY
    expect(scope.isBound('x')).toBe(false)
    expect(scope.lookup('x')).toBeNull()
    expect(scope.boundNames().size).toBe(0)
    expect(scope.asShadowPredicate()('x')).toBe(false)
  })

  test('simple loop row: param and index bound with sources item/index', () => {
    const scope = BindingScope.EMPTY.enterLoopRow({ param: 'item', index: 'i' })
    expect(scope.isBound('item')).toBe(true)
    expect(scope.isBound('i')).toBe(true)
    expect(scope.lookup('item')).toEqual({
      depth: 0,
      frame: scope.lookup('item')!.frame,
      binding: { source: 'item' },
    })
    expect(scope.lookup('i')?.binding).toEqual({ source: 'index' })
    expect(scope.lookup('item')?.frame.kind).toBe('loop-row')
  })

  test('loop row with no index: index name not bound', () => {
    const scope = BindingScope.EMPTY.enterLoopRow({ param: 'item', index: null })
    expect(scope.isBound('item')).toBe(true)
    expect(scope.isBound('i')).toBe(false)
  })

  test('destructured row: paramBindings names bound as destructure; raw param NOT bound', () => {
    // Mirrors jsx-to-ir.ts:4330-4335 exactly: when paramBindings is
    // non-empty, ONLY the destructured binding names are added to
    // ctx.loopParams — the else branch that adds the raw `param` text is
    // skipped entirely. For a destructured callback `param` holds the
    // original pattern source text (e.g. "{ id, name }"), which is not a
    // usable identifier anyway, so not binding it is correct, not just
    // an accident of mirroring.
    const scope = BindingScope.EMPTY.enterLoopRow({
      param: '{ id, name }',
      index: null,
      paramBindings: [{ name: 'id' }, { name: 'name' }],
    })
    expect(scope.isBound('id')).toBe(true)
    expect(scope.isBound('name')).toBe(true)
    expect(scope.lookup('id')?.binding).toEqual({ source: 'destructure' })
    expect(scope.lookup('name')?.binding).toEqual({ source: 'destructure' })
    // The raw pattern text is not a bound name.
    expect(scope.isBound('{ id, name }')).toBe(false)
  })

  test('preamble locals: declaredNames bound as preamble', () => {
    const scope = BindingScope.EMPTY.enterLoopRow({
      param: 'row',
      index: null,
      preamble: { declaredNames: ['out', 'label'] },
    })
    expect(scope.isBound('row')).toBe(true)
    expect(scope.lookup('out')?.binding).toEqual({ source: 'preamble' })
    expect(scope.lookup('label')?.binding).toEqual({ source: 'preamble' })
  })

  test('nested loops with the SAME param name: inner lookup is depth 0; discarding the inner scope still leaves the parent bound', () => {
    // Pins the immutability win over the old `ctx.loopParams` Set design:
    // that mechanism `.add`s a nested loop's param and `.delete`s it on
    // the way back out, so a caller that captured "the current set"
    // reference before entering the nested loop observes the SAME
    // mutable object both inside and after — there is no way to ask "what
    // was bound one loop level up" once the same name has been added
    // twice and deleted once. BindingScope's immutable child scopes make
    // that question well-formed: `outer` below is never touched by
    // `enterLoopRow` on `inner`, so it still resolves `item` after we
    // stop using (conceptually "pop") the inner scope by simply going
    // back to holding the `outer` reference.
    const outer = BindingScope.EMPTY.enterLoopRow({ param: 'item', index: null })
    const inner = outer.enterLoopRow({ param: 'item', index: null })

    expect(inner.lookup('item')?.depth).toBe(0)
    expect(outer.lookup('item')?.depth).toBe(0)
    // "Discarding" the inner scope is just no longer holding its
    // reference — `outer` was never mutated and still has `item` bound.
    expect(outer.isBound('item')).toBe(true)
  })

  test('callback frame: enterCallback binds params as source param, frame kind callback; row bindings still visible beneath', () => {
    const row = BindingScope.EMPTY.enterLoopRow({ param: 'item', index: null })
    const withCallback = row.enterCallback(['a', 'b'])

    expect(withCallback.lookup('a')).toEqual({
      depth: 0,
      frame: withCallback.lookup('a')!.frame,
      binding: { source: 'param' },
    })
    expect(withCallback.lookup('a')?.frame.kind).toBe('callback')
    expect(withCallback.lookup('b')?.binding).toEqual({ source: 'param' })

    // The row binding is still visible, one frame further out.
    const itemLookup = withCallback.lookup('item')
    expect(itemLookup?.depth).toBe(1)
    expect(itemLookup?.frame.kind).toBe('loop-row')
    expect(itemLookup?.binding).toEqual({ source: 'item' })
  })

  test('shadowing: inner binding wins lookup (depth 0) over a same-named outer binding', () => {
    const outer = BindingScope.EMPTY.enterLoopRow({ param: 'x', index: null })
    const inner = outer.enterCallback(['x'])

    const found = inner.lookup('x')
    expect(found?.depth).toBe(0)
    expect(found?.binding).toEqual({ source: 'param' })
    expect(found?.frame.kind).toBe('callback')
  })

  test('boundNames unions across frames; asShadowPredicate matches isBound', () => {
    const scope = BindingScope.EMPTY
      .enterLoopRow({ param: 'item', index: 'i', preamble: { declaredNames: ['out'] } })
      .enterCallback(['a'])

    const names = scope.boundNames()
    expect(names.has('item')).toBe(true)
    expect(names.has('i')).toBe(true)
    expect(names.has('out')).toBe(true)
    expect(names.has('a')).toBe(true)
    expect(names.size).toBe(4)

    const shadowed = scope.asShadowPredicate()
    for (const n of ['item', 'i', 'out', 'a', 'not-bound']) {
      expect(shadowed(n)).toBe(scope.isBound(n))
    }
  })

  describe('valueBoundNames (#2482 Stage 1a Commit 2)', () => {
    test('excludes preamble names that boundNames() includes', () => {
      const scope = BindingScope.EMPTY.enterLoopRow({
        param: 'item',
        index: 'i',
        preamble: { declaredNames: ['label', 'out'] },
      })

      // Shadow-guard query: sees everything, including preamble locals.
      const all = scope.boundNames()
      expect(all.has('item')).toBe(true)
      expect(all.has('i')).toBe(true)
      expect(all.has('label')).toBe(true)
      expect(all.has('out')).toBe(true)
      expect(all.size).toBe(4)

      // Reactivity/slotId query: item/index/destructure only.
      const values = scope.valueBoundNames()
      expect(values.has('item')).toBe(true)
      expect(values.has('i')).toBe(true)
      expect(values.has('label')).toBe(false)
      expect(values.has('out')).toBe(false)
      expect(values.size).toBe(2)
    })

    test('destructured bindings count as value bindings', () => {
      const scope = BindingScope.EMPTY.enterLoopRow({
        param: '{ id, name }',
        index: null,
        paramBindings: [{ name: 'id' }, { name: 'name' }],
        preamble: { declaredNames: ['formatted'] },
      })

      const values = scope.valueBoundNames()
      expect(values.has('id')).toBe(true)
      expect(values.has('name')).toBe(true)
      expect(values.has('formatted')).toBe(false)
      expect(values.size).toBe(2)
    })

    test('excludes enterCallback param-sourced names too', () => {
      // A filter/sort/nested-arrow frame's own parameters are a distinct
      // binding shape from a loop row's item/index/destructure names
      // (see the class doc comment) — valueBoundNames() must not surface
      // them either, only boundNames() does.
      const scope = BindingScope.EMPTY
        .enterLoopRow({ param: 'item', index: null })
        .enterCallback(['a', 'b'])

      expect(scope.boundNames().has('a')).toBe(true)
      expect(scope.valueBoundNames().has('a')).toBe(false)
      expect(scope.valueBoundNames().has('item')).toBe(true)
    })

    test('EMPTY scope: both queries return an empty set', () => {
      expect(BindingScope.EMPTY.boundNames().size).toBe(0)
      expect(BindingScope.EMPTY.valueBoundNames().size).toBe(0)
    })
  })
})

describe('scoped string value types', () => {
  test('nested string rows retain outer types; numeric shadows and indexes do not inherit them', () => {
    const outer = BindingScope.EMPTY.enterLoopRow({ param: 'item', itemType: { primitive: 'string' } })
    const inner = outer.enterLoopRow({ param: 'choice', index: 'i', itemType: { primitive: 'string' } })
    expect(inner.isStringValueName('item', () => false)).toBe(true)
    expect(inner.isStringValueName('choice', () => false)).toBe(true)
    expect(inner.isStringValueName('choice', () => false, true)).toBe(false)
    expect(inner.isStringValueName('i', () => true)).toBe(false)
    const shadow = inner.enterLoopRow({ param: 'item', itemType: { primitive: 'number' } })
    expect(shadow.isStringValueName('item', () => true)).toBe(false)
    expect(shadow.shadowedNames()).toEqual(['item'])
    expect(inner.shadowedNames()).toEqual([])
    expect(outer.isStringValueName('item', () => false)).toBe(true)
    expect(inner.isStringValueName('title', () => true)).toBe(true)
  })
  test('a union of string literals is string-valued; mixed unions are not', () => {
    const stringRow = BindingScope.EMPTY.enterLoopRow({ param: 'row', itemType: {
      unionTypes: [{ primitive: 'string' }, { primitive: 'string' }],
    } })
    expect(stringRow.isStringValueName('row', () => false)).toBe(true)
    const mixedRow = stringRow.enterLoopRow({ param: 'row', itemType: {
      unionTypes: [{ primitive: 'string' }, { primitive: 'number' }],
    } })
    expect(mixedRow.isStringValueName('row', () => true)).toBe(false)
  })
})

describe('row types', () => {
  test('a plain item carries the row type and an empty path; rowType wins over itemType without changing string typing', () => {
    const rowType = { kind: 'interface', raw: 'Row' } as { primitive?: string }
    const scope = BindingScope.EMPTY.enterLoopRow({ param: 'r', itemType: null, rowType })
    expect(scope.lookup('r')?.binding.row).toEqual({ itemType: rowType, segments: [] })
    expect(scope.isStringValueName('r', () => false)).toBe(false)
    const scalar = BindingScope.EMPTY.enterLoopRow({ param: 'n', itemType: { primitive: 'number' } })
    expect(scalar.lookup('n')?.binding.row).toEqual({ itemType: { primitive: 'number' }, segments: [] })
    expect(BindingScope.EMPTY.enterLoopRow({ param: 'x' }).lookup('x')?.binding.row).toBeUndefined()
  })

  test('a destructured binding carries its path; a rest binding carries none', () => {
    const rowType = { kind: 'interface', raw: 'Row' } as { primitive?: string }
    const scope = BindingScope.EMPTY.enterLoopRow({
      param: '{ id, ...rest }',
      rowType,
      paramBindings: [
        { name: 'id', segments: [{ kind: 'field', key: 'id', isIdent: true }] },
        { name: 'rest', segments: [], rest: { kind: 'object', exclude: [] } },
      ],
    })
    expect(scope.lookup('id')?.binding).toEqual({
      source: 'destructure',
      row: { itemType: rowType, segments: [{ kind: 'field', key: 'id', isIdent: true }] },
    })
    expect(scope.lookup('rest')?.binding).toEqual({ source: 'destructure' })
  })
})

describe('enterAliases (#3402)', () => {
  test('binds each alias like the name it stands for', () => {
    const row = BindingScope.EMPTY.enterLoopRow({ param: 'name', itemType: { primitive: 'string' } })
    const aliased = row.enterAliases(new Map([['__bf_cap_l0_name', 'name'], ['__bf_cap_l0_x', 'x']]))
    expect(aliased.lookup('__bf_cap_l0_name')?.binding).toEqual(row.lookup('name')?.binding)
    expect(aliased.isStringValueName('__bf_cap_l0_name', () => false)).toBe(true)
    expect(aliased.isBound('__bf_cap_l0_x')).toBe(false)
    expect(BindingScope.EMPTY.enterAliases(new Map([['a', 'b']]))).toBe(BindingScope.EMPTY)
  })
})

describe('row field string typing (#3762)', () => {
  const fields = { Row: [{ name: 'id', type: { primitive: 'string' } }, { name: 'n', type: { primitive: 'number' } }] }
  const named = (name: string) => fields[name as keyof typeof fields]
  const rowType = { raw: 'Row' }

  test('a row read resolves its field through the named type', () => {
    const scope = BindingScope.EMPTY.enterLoopRow({ param: 'r', rowType })
    expect(scope.isStringValueName('r', () => true, false, ['id'], named)).toBe(true)
    expect(scope.isStringValueName('r', () => true, false, ['n'], named)).toBe(false)
    expect(scope.isStringValueName('r', () => true, false, ['id'])).toBe(false)
    expect(scope.isStringValueName('r', () => true)).toBe(false)
  })

  test('a destructured binding resolves its own path', () => {
    const scope = BindingScope.EMPTY.enterLoopRow({
      param: '{ id, n }',
      rowType,
      paramBindings: [
        { name: 'id', segments: [{ kind: 'field', key: 'id', isIdent: true }] },
        { name: 'n', segments: [{ kind: 'field', key: 'n', isIdent: true }] },
      ],
    })
    expect(scope.isStringValueName('id', () => false, false, [], named)).toBe(true)
    expect(scope.isStringValueName('n', () => true, false, [], named)).toBe(false)
  })

  test('an outer name types itself, not its members; a shadowing props row types props.<field>', () => {
    expect(BindingScope.EMPTY.isStringValueName('label', () => true, false, ['length'])).toBe(false)
    const props = BindingScope.EMPTY.enterLoopRow({ param: 'props', rowType })
    expect(props.isStringValueName('id', () => false, true, [], named)).toBe(true)
    expect(props.isStringValueName('n', () => true, true, [], named)).toBe(false)
  })

  test('a callback param shadows an outer string name', () => {
    const scope = BindingScope.EMPTY.enterCallback(['label'])
    expect(scope.isStringValueName('label', () => true)).toBe(false)
  })
})

describe('optional row fields (#3762 review)', () => {
  const fields = { Opt: [{ name: 'id', type: { primitive: 'string' }, optional: true }] }
  const named = (name: string) => fields[name as keyof typeof fields]

  test('an optional string field is not definitely a string, read or destructured', () => {
    const row = BindingScope.EMPTY.enterLoopRow({ param: 'o', rowType: { raw: 'Opt' } })
    expect(row.isStringValueName('o', () => true, false, ['id'], named)).toBe(false)
    const destructured = BindingScope.EMPTY.enterLoopRow({
      param: '{ id }',
      rowType: { raw: 'Opt' },
      paramBindings: [{ name: 'id', segments: [{ kind: 'field', key: 'id', isIdent: true }] }],
    })
    expect(destructured.isStringValueName('id', () => true, false, [], named)).toBe(false)
  })
})

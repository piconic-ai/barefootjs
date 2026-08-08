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

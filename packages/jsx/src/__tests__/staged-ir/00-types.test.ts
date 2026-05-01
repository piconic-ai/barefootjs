/**
 * Pins the **staged-IR primitive contract** at the type level. These
 * tests are the canary for accidental regressions on the Phase / Scope /
 * Effect / OriginInfo additions in `types.ts` — if any field becomes
 * non-optional during the migration, or visibility rules drift, this
 * file is the proximate failure.
 */

import { describe, test, expect } from 'bun:test'
import { isVisibleIn } from '../../types'
import type {
  Phase,
  Scope,
  Effect,
  BindingKind,
  OriginInfo,
  FreeReference,
  ConstantInfo,
  IRExpression,
  InitStatementInfo,
  FunctionInfo,
} from '../../types'

describe('Phase / Scope / Effect type primitives', () => {
  test('Phase admits exactly the documented set', () => {
    const phases: Phase[] = ['compile', 'ssr', 'hydrate', 'tick', 'event']
    expect(phases).toHaveLength(5)
  })

  test('Scope admits exactly the documented set', () => {
    const scopes: Scope[] = ['module', 'init', 'template', 'sub-init', 'render-item']
    expect(scopes).toHaveLength(5)
  })

  test('Effect admits exactly the documented set', () => {
    const effects: Effect[] = ['pure', 'signal-read', 'signal-write', 'dom', 'io']
    expect(effects).toHaveLength(5)
  })

  test('BindingKind admits the documented bindings', () => {
    const kinds: BindingKind[] = [
      'prop', 'signal-getter', 'signal-setter', 'memo-getter',
      'init-local', 'sub-init-local', 'render-item',
      'module-import', 'module-local', 'global',
    ]
    expect(kinds).toHaveLength(10)
  })
})

describe('isVisibleIn — Scope visibility table', () => {
  test('template scope: only props, module-import, module-local, global reachable', () => {
    expect(isVisibleIn('template', 'prop')).toBe(true)
    expect(isVisibleIn('template', 'module-import')).toBe(true)
    expect(isVisibleIn('template', 'module-local')).toBe(true)
    expect(isVisibleIn('template', 'global')).toBe(true)

    expect(isVisibleIn('template', 'signal-getter')).toBe(false)
    expect(isVisibleIn('template', 'memo-getter')).toBe(false)
    expect(isVisibleIn('template', 'init-local')).toBe(false)
    expect(isVisibleIn('template', 'sub-init-local')).toBe(false)
    expect(isVisibleIn('template', 'render-item')).toBe(false)
  })

  test('init scope: everything component-internal is reachable', () => {
    const allKinds: BindingKind[] = [
      'prop', 'signal-getter', 'signal-setter', 'memo-getter',
      'init-local', 'module-import', 'module-local', 'global',
    ]
    for (const k of allKinds) {
      expect(isVisibleIn('init', k)).toBe(true)
    }
  })

  test('module scope: only module-level + global reachable', () => {
    expect(isVisibleIn('module', 'module-import')).toBe(true)
    expect(isVisibleIn('module', 'module-local')).toBe(true)
    expect(isVisibleIn('module', 'global')).toBe(true)

    expect(isVisibleIn('module', 'prop')).toBe(false)
    expect(isVisibleIn('module', 'init-local')).toBe(false)
    expect(isVisibleIn('module', 'signal-getter')).toBe(false)
  })

  test('sub-init scope: sees everything init sees + sub-init-locals', () => {
    expect(isVisibleIn('sub-init', 'init-local')).toBe(true)
    expect(isVisibleIn('sub-init', 'sub-init-local')).toBe(true)
    expect(isVisibleIn('sub-init', 'signal-getter')).toBe(true)
  })

  test('render-item scope: sees init bindings + the item accessor', () => {
    expect(isVisibleIn('render-item', 'render-item')).toBe(true)
    expect(isVisibleIn('render-item', 'init-local')).toBe(true)
    expect(isVisibleIn('render-item', 'signal-getter')).toBe(true)
  })
})

describe('OriginInfo: structural shape', () => {
  test('minimal OriginInfo (no freeRefs) is well-typed', () => {
    const o: OriginInfo = { phase: 'tick', scope: 'init', effect: 'signal-read' }
    expect(o.phase).toBe('tick')
  })

  test('FreeReference shape', () => {
    const r: FreeReference = { name: 'count', bindingScope: 'init', kind: 'signal-getter' }
    expect(r.name).toBe('count')
  })
})

describe('Backwards compatibility: legacy IR producers omit origin', () => {
  test('IRExpression accepts no origin', () => {
    const e: IRExpression = {
      type: 'expression',
      expr: 'count()',
      typeInfo: null,
      reactive: true,
      slotId: null,
      loc: { file: 'x.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 7 } },
    }
    expect(e.origin).toBeUndefined()
  })

  test('ConstantInfo accepts no origin', () => {
    const c: ConstantInfo = {
      name: 'doubled',
      declarationKind: 'const',
      type: null,
      loc: { file: 'x.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 7 } },
    }
    expect(c.origin).toBeUndefined()
  })

  test('FunctionInfo accepts no declarationKind / no isGenerator', () => {
    const f: FunctionInfo = {
      name: 'foo',
      params: [],
      body: '',
      returnType: null,
      containsJsx: false,
      loc: { file: 'x.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 1 } },
    }
    expect(f.declarationKind).toBeUndefined()
    expect(f.isGenerator).toBeUndefined()
  })

  test('InitStatementInfo accepts no needsLeadingSemi / no origin', () => {
    const s: InitStatementInfo = {
      body: 'foo()',
      loc: { file: 'x.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 5 } },
    }
    expect(s.needsLeadingSemi).toBeUndefined()
  })
})

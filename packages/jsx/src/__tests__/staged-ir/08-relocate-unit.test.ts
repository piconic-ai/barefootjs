/**
 * Unit-level tests for relocate(). Pin the §2.2 decision matrix
 * directly without going through the analyzer / emit pipeline. These
 * tests document each (fromScope, toScope, BindingKind) combination
 * with its expected action and rewrittenAs.
 */

import { describe, test, expect } from 'bun:test'
import type { RelocateEnv } from '../../relocate'
import { relocate } from '../../relocate'
import type { BindingKind } from '../../types'

function envWith(
  bindings: Array<[string, BindingKind]>,
  options?: Partial<RelocateEnv>,
): RelocateEnv {
  return {
    bindings: new Map(bindings),
    inlinable: options?.inlinable ?? new Map(),
    propsForLift: new Set(
      bindings.filter(([, k]) => k === 'prop').map(([n]) => n),
    ),
    propsObjectName: options?.propsObjectName ?? 'props',
    allowFallback: options?.allowFallback ?? true,
  }
}

describe('relocate: same-scope is pass-through', () => {
  test('init → init: text unchanged', () => {
    const env = envWith([['count', 'signal-getter']])
    const r = relocate('count() * 2', null, 'init', 'init', env)
    expect(r.text).toBe('count() * 2')
    expect(r.ok).toBe(true)
  })
})

describe('relocate: init → template, props lift to _p.X', () => {
  test('bare prop ref → _p.X', () => {
    const env = envWith([['name', 'prop']])
    const r = relocate('"hello " + name', null, 'init', 'template', env)
    expect(r.text).toContain('_p.name')
    expect(r.ok).toBe(true)
  })

  test('multiple props lifted', () => {
    const env = envWith([['a', 'prop'], ['b', 'prop']])
    const r = relocate('a + b', null, 'init', 'template', env)
    expect(r.text).toContain('_p.a')
    expect(r.text).toContain('_p.b')
  })
})

describe('relocate: init → template, module imports pass through', () => {
  test('module-import bare name stays bare', () => {
    const env = envWith([['nodeTypes', 'module-import']])
    const r = relocate('nodeTypes', null, 'init', 'template', env)
    expect(r.text).toBe('nodeTypes')
    expect(r.usedExternals.has('nodeTypes')).toBe(true)
  })
})

describe('relocate: init → template, init-locals fall back when not inlinable', () => {
  test('init-local with no inlinable form → undefined', () => {
    const env = envWith([['cachedViewport', 'init-local']])
    const r = relocate('cachedViewport', null, 'init', 'template', env)
    expect(r.text).toBe('undefined')
    const decision = r.decisions.find(d => d.name === 'cachedViewport')
    expect(decision?.action).toBe('fallback')
  })

  test('init-local with inlinable form → inlined', () => {
    const env = envWith([['greeting', 'init-local']], {
      inlinable: new Map([['greeting', '"hello"']]),
    })
    const r = relocate('greeting', null, 'init', 'template', env)
    expect(r.text).toBe('"hello"')
    const decision = r.decisions.find(d => d.name === 'greeting')
    expect(decision?.action).toBe('inline')
  })
})

describe('relocate: init → template, reactive bindings reject (or fallback)', () => {
  test('signal-getter falls back to undefined', () => {
    const env = envWith([['count', 'signal-getter']])
    const r = relocate('count', null, 'init', 'template', env)
    expect(r.text).toBe('undefined')
    const decision = r.decisions.find(d => d.name === 'count')
    expect(decision?.action).toBe('fallback')
  })

  test('signal-getter rejects (ok=false) when allowFallback=false', () => {
    const env = envWith([['count', 'signal-getter']], { allowFallback: false })
    const r = relocate('count', null, 'init', 'template', env)
    expect(r.ok).toBe(false)
    const decision = r.decisions.find(d => d.name === 'count')
    expect(decision?.action).toBe('reject')
  })

  test('memo-getter rejects similarly', () => {
    const env = envWith([['doubled', 'memo-getter']], { allowFallback: false })
    const r = relocate('doubled', null, 'init', 'template', env)
    expect(r.ok).toBe(false)
  })
})

describe('relocate: shadow precedence (#1132)', () => {
  test('signal getter shadowing prop name does NOT lift', () => {
    // `count` is a signal getter; even though it could be a prop,
    // env.bindings has it as signal-getter (analyzer won the shadow).
    const env = envWith([['count', 'signal-getter']])
    const r = relocate('count() * 2', null, 'init', 'template', env)
    // Signal-getter falls back, but does NOT become _p.count.
    expect(r.text).not.toContain('_p.count')
  })

  test('local-init shadowing prop name does NOT lift', () => {
    const env = envWith([['label', 'init-local']])
    const r = relocate('label.toUpperCase()', null, 'init', 'template', env)
    expect(r.text).not.toContain('_p.label')
  })
})

describe('relocate: usedExternals tracking for import preservation (#1133)', () => {
  test('module-import refs are recorded in usedExternals', () => {
    const env = envWith([['useYjs', 'module-import']])
    const r = relocate('useYjs(123)', null, 'init', 'template', env)
    expect(r.usedExternals.has('useYjs')).toBe(true)
  })

  test('inlined initializer contributes its bare names to usedExternals', () => {
    const env = envWith([['yjs', 'init-local']], {
      inlinable: new Map([['yjs', 'useYjs(_p.roomId)']]),
    })
    const r = relocate('yjs.id', null, 'init', 'template', env)
    expect(r.usedExternals.has('useYjs')).toBe(true)
  })
})

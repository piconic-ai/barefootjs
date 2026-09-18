import { describe, test, expect } from 'bun:test'
import { explore, expectedPathCount } from '../explorer'
import { canonicalStateKey, pathId, type Scenario } from '../scenario'

/**
 * Contract test for the bounded explorer (#3046). The browser leg trusts
 * these properties without re-deriving them: every prefix of a path is a
 * path (shortest failing sequence is always present), states are deduped
 * by canonical key, and the enumeration is deterministic.
 */

type S = { items: string[] }
type A = 'push' | 'pop' | 'noop'

const toy: Scenario<S, A> = {
  id: 'toy',
  description: 'test-only',
  componentName: 'Toy',
  // The shape check only looks for the `data-action` literals; a real
  // scenario's source is a full component file.
  source: '<button data-action="push"/><button data-action="pop"/><button data-action="noop"/>',
  initialState: { items: [] },
  actions: ['push', 'pop', 'noop'],
  stateSignals: ['items'],
  reduce(state, action) {
    switch (action) {
      case 'push':
        return { items: [...state.items, `i${state.items.length}`] }
      case 'pop':
        return { items: state.items.slice(0, -1) }
      case 'noop':
        return { items: [...state.items] }
    }
  },
  bounds: { maxDepth: 2 },
}

describe('explore()', () => {
  test('enumerates every sequence of length 0..maxDepth in BFS order', () => {
    const { paths } = explore(toy)
    expect(paths.length).toBe(expectedPathCount(3, 2))
    expect(paths.map(p => p.id).slice(0, 5)).toEqual(['initial', 'push', 'pop', 'noop', 'push>push'])
    // Every prefix of every path is itself a path.
    const ids = new Set(paths.map(p => p.id))
    for (const p of paths) {
      for (let n = 0; n < p.actions.length; n++) {
        expect(ids.has(pathId(p.actions.slice(0, n)))).toBe(true)
      }
    }
  })

  test('dedupes states by canonical key and resolves each path to its end state', () => {
    const { states, paths } = explore(toy)
    // Reachable at depth ≤ 2: [], [i0], [i0,i1] — pop/noop never create new shapes.
    expect(states.map(s => s.state)).toEqual([{ items: [] }, { items: ['i0'] }, { items: ['i0', 'i1'] }])
    const byId = new Map(paths.map(p => [p.id, p]))
    expect(byId.get('push>pop')!.toKey).toBe(canonicalStateKey({ items: [] }))
    expect(byId.get('noop')!.toKey).toBe(byId.get('initial')!.toKey)
    expect(byId.get('push>push')!.toKey).toBe(states[2].key)
    for (const p of paths) expect(states.some(s => s.key === p.toKey)).toBe(true)
  })

  test('is deterministic and never hands the reducer a shared object', () => {
    const a = explore(toy)
    const b = explore(toy)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))

    const mutating: Scenario<S, 'push'> = {
      ...toy,
      id: 'mutating',
      actions: ['push'],
      source: '<button data-action="push"/>',
      reduce(state) {
        state.items.push('x') // a buggy reducer that mutates
        return state
      },
      bounds: { maxDepth: 2 },
    }
    const { states } = explore(mutating)
    // The initial state entry is still empty — the mutation hit a clone.
    expect(states[0].state).toEqual({ items: [] })
    expect(states.map(s => s.state.items.length)).toEqual([0, 1, 2])
  })

  test('canonicalStateKey ignores object key order but not array order', () => {
    expect(canonicalStateKey({ b: 1, a: [1, 2] })).toBe(canonicalStateKey({ a: [1, 2], b: 1 }))
    expect(canonicalStateKey({ a: [1, 2] })).not.toBe(canonicalStateKey({ a: [2, 1] }))
  })

  test('rejects a scenario whose source renders no button for a declared action', () => {
    expect(() => explore({ ...toy, source: '<button data-action="push"/>' })).toThrow(/renders no <button data-action="pop">/)
  })
})

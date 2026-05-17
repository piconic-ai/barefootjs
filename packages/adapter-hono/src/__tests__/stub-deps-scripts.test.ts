import { describe, test, expect } from 'bun:test'
import { collectStubDepScripts } from '../scripts'

// Issue #1243: the per-page script collector emits a <script src> for
// every rendered component, but until #1243 a component reached ONLY
// through an imperative `createComponent('Foo', ...)` stub call (no
// JSX render) never had its `.client.js` shipped. `collectStubDepScripts`
// closes the gap: given the manifest and the set of names whose SSR
// function did execute, it returns the script URLs for every transitively
// reachable stubDep.

describe('collectStubDepScripts (#1243)', () => {
  test('emits a script for a single-hop stubDep', () => {
    const out = collectStubDepScripts(
      {
        IssueCardNode: {
          clientJs: 'components/IssueCardNode.client.js',
          stubDeps: ['DraftTitleEditor'],
        },
        DraftTitleEditor: { clientJs: 'components/DraftTitleEditor.client.js' },
      },
      '/static/components/',
      new Set(['IssueCardNode']),
      new Set(['IssueCardNode']),
    )
    expect([...out.values()]).toEqual([{ src: '/static/components/DraftTitleEditor.client.js' }])
  })

  test('walks transitively (A → B → C)', () => {
    const out = collectStubDepScripts(
      {
        A: { clientJs: 'components/A.client.js', stubDeps: ['B'] },
        B: { clientJs: 'components/B.client.js', stubDeps: ['C'] },
        C: { clientJs: 'components/C.client.js' },
      },
      '/static/components/',
      new Set(['A']),
      new Set(['A']),
    )
    expect(new Set([...out.keys()])).toEqual(new Set(['B', 'C']))
  })

  // Issue #1243 — Copilot review:
  // `<script type="module">` tags execute in document order with
  // microtask checkpoints between them. A's `hydrate()` schedules a
  // walk that fires before later scripts evaluate, so any stub call
  // from A.init must resolve against a registry the LATER scripts
  // populated. Emitting B before C in document order would let B's
  // `createComponent('C', ...)` fail. The walker must produce
  // post-order (deepest first → A→B→C ships C, then B).
  test('emits a transitive chain in post-order (C before B for A → B → C)', () => {
    const out = collectStubDepScripts(
      {
        A: { clientJs: 'components/A.client.js', stubDeps: ['B'] },
        B: { clientJs: 'components/B.client.js', stubDeps: ['C'] },
        C: { clientJs: 'components/C.client.js' },
      },
      '/static/components/',
      new Set(['A']),
      new Set(['A']),
    )
    // Map preserves insertion order; iteration = emission order in DOM.
    expect([...out.keys()]).toEqual(['C', 'B'])
  })

  // Post-order isn't just leaves-first; for a DAG where a sibling
  // depends on another sibling (A → B, A → C, C → B), `B` must
  // precede `C` in the output even though both are direct children
  // of A. BFS+reverse can't express this — DFS post-order does.
  test('emits DAG edges in topological order (B before C for A → B, A → C, C → B)', () => {
    const out = collectStubDepScripts(
      {
        A: { clientJs: 'components/A.client.js', stubDeps: ['B', 'C'] },
        B: { clientJs: 'components/B.client.js' },
        C: { clientJs: 'components/C.client.js', stubDeps: ['B'] },
      },
      '/static/components/',
      new Set(['A']),
      new Set(['A']),
    )
    // A's first dep is B → visited (no further deps) → emit B.
    // A's second dep is C → recurse into C's deps → B already visited
    // → emit C. So order is B then C.
    expect([...out.keys()]).toEqual(['B', 'C'])
  })

  test('short-circuits on a cycle (A → B → A)', () => {
    const out = collectStubDepScripts(
      {
        A: { clientJs: 'components/A.client.js', stubDeps: ['B'] },
        B: { clientJs: 'components/B.client.js', stubDeps: ['A'] },
      },
      '/static/components/',
      new Set(['A']),
      new Set(['A']),
    )
    // A is in `excluded` so it's not re-emitted; B is reached once.
    expect([...out.keys()]).toEqual(['B'])
  })

  test('skips deps already in excluded set', () => {
    const out = collectStubDepScripts(
      {
        Parent: { clientJs: 'components/Parent.client.js', stubDeps: ['AlreadyEmitted'] },
        AlreadyEmitted: { clientJs: 'components/AlreadyEmitted.client.js' },
      },
      '/static/components/',
      new Set(['Parent']),
      // Caller already emitted AlreadyEmitted's script some other way.
      new Set(['Parent', 'AlreadyEmitted']),
    )
    expect(out.size).toBe(0)
  })

  test('mutates excluded so caller can pass it to a later pass', () => {
    const excluded = new Set(['Root'])
    collectStubDepScripts(
      {
        Root: { clientJs: 'components/Root.client.js', stubDeps: ['Leaf'] },
        Leaf: { clientJs: 'components/Leaf.client.js' },
      },
      '/static/components/',
      new Set(['Root']),
      excluded,
    )
    expect(excluded.has('Leaf')).toBe(true)
  })

  test('honors a base path with no trailing slash', () => {
    const out = collectStubDepScripts(
      {
        Parent: { clientJs: 'components/Parent.client.js', stubDeps: ['Child'] },
        Child: { clientJs: 'components/Child.client.js' },
      },
      '/assets/bf',
      new Set(['Parent']),
      new Set(['Parent']),
    )
    expect(out.get('Child')?.src).toBe('/assets/bf/Child.client.js')
  })

  test('returns an empty map when no stubDeps are present', () => {
    const out = collectStubDepScripts(
      {
        Solo: { clientJs: 'components/Solo.client.js' },
      },
      '/static/components/',
      new Set(['Solo']),
      new Set(['Solo']),
    )
    expect(out.size).toBe(0)
  })

  test('skips a dep whose manifest entry has no clientJs', () => {
    // A misconfigured manifest could list a stubDep that resolves to
    // an SSR-only entry. The walker still records it as visited (so
    // it doesn't loop) but emits no script for it.
    const out = collectStubDepScripts(
      {
        Parent: { clientJs: 'components/Parent.client.js', stubDeps: ['Phantom'] },
        Phantom: { clientJs: undefined },
      },
      '/static/components/',
      new Set(['Parent']),
      new Set(['Parent']),
    )
    expect(out.size).toBe(0)
  })

  test('ignores __barefoot__ as a root (it has no stubDeps and would noise the walk)', () => {
    const out = collectStubDepScripts(
      {
        __barefoot__: { clientJs: 'components/barefoot.js' },
        Parent: { clientJs: 'components/Parent.client.js', stubDeps: ['Child'] },
        Child: { clientJs: 'components/Child.client.js' },
      },
      '/static/components/',
      new Set(['__barefoot__', 'Parent']),
      new Set(['__barefoot__', 'Parent']),
    )
    expect([...out.keys()]).toEqual(['Child'])
  })
})

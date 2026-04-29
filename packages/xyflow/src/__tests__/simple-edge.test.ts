import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderToTest } from '@barefootjs/test'

// IR-level test for the JSX-native SimpleEdge (#1081 step 2). Verifies the
// shape of the JSX matches the imperative `mountSimpleEdge` it replaces:
// two <path> elements (hit area + visible) with the right data attributes
// and reactive bindings.
const source = readFileSync(resolve(__dirname, '../simple-edge.tsx'), 'utf-8')

describe('SimpleEdge JSX shape (#1081 step 2)', () => {
  const result = renderToTest(source, 'simple-edge.tsx', 'SimpleEdge')

  test('JSX → IR pipeline reports no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('component is recognized as a client component', () => {
    expect(result.isClient).toBe(true)
  })

  test('declares selected, animated, pathD, visibleClass memos', () => {
    // Per-field memos are the per-edge isolation contract carried over
    // from edge-renderer.ts: each one dedupes on Object.is so unrelated
    // edge updates do not re-run this edge's effects.
    expect(result.memos).toContain('selected')
    expect(result.memos).toContain('animated')
    expect(result.memos).toContain('pathD')
    expect(result.memos).toContain('visibleClass')
  })

  test('renders two <path> elements (hit area + visible)', () => {
    const paths = result.findAll({ tag: 'path' })
    expect(paths.length).toBe(2)
  })

  test('hit-area path carries data-hit-id and transparent stroke', () => {
    const paths = result.findAll({ tag: 'path' })
    const hit = paths.find(p => 'data-hit-id' in p.props)
    expect(hit).toBeDefined()
    expect(hit!.props['stroke']).toBe('transparent')
    expect(hit!.props['stroke-width']).toBe('20')
    expect(hit!.props['fill']).toBe('none')
  })

  test('visible path carries data-id and a reactive className memo', () => {
    const paths = result.findAll({ tag: 'path' })
    const visible = paths.find(p => 'data-id' in p.props)
    expect(visible).toBeDefined()
    // The full class string is computed inside the visibleClass memo,
    // so the IR records the memo call as the binding rather than
    // expanding the static token list. The reactivity contract is
    // therefore "visibleClass()" appearing as a class entry.
    expect(visible!.classes).toContain('visibleClass()')
    expect(visible!.props['fill']).toBe('none')
  })
})

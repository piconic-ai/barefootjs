import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderToTest } from '@barefootjs/test'

// IR-level test for the JSX-native MiniMap (#1081 step 7). Verifies the
// container > svg > {<g> > <rect>...} + <path> mask shape.
const source = readFileSync(resolve(__dirname, '../components/minimap.tsx'), 'utf-8')

describe('MiniMap JSX shape (#1081 step 7)', () => {
  const result = renderToTest(source, 'minimap.tsx', 'MiniMap')

  test('JSX → IR pipeline reports no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('component is recognized as a client component', () => {
    expect(result.isClient).toBe(true)
  })

  test('declares geometry/viewBox/maskPathD/nodeRects memos', () => {
    expect(result.memos).toContain('geometry')
    expect(result.memos).toContain('viewBox')
    expect(result.memos).toContain('maskPathD')
    expect(result.memos).toContain('nodeRects')
  })

  test('renders the minimap container div', () => {
    const container = result.find({ tag: 'div' })
    expect(container).not.toBeNull()
    expect(container!.classes).toContain('bf-flow__minimap')
    expect(container!.classes).toContain('nopan')
    expect(container!.classes).toContain('nowheel')
    expect(container!.classes).toContain('nodrag')
  })

  test('contains an <svg> with reactive viewBox', () => {
    const svg = result.find({ tag: 'svg' })
    expect(svg).not.toBeNull()
    expect(svg!.props['viewBox']).toBe('viewBox()')
  })

  test('renders the mask <path> with evenodd fill rule', () => {
    const path = result.find({ tag: 'path' })
    expect(path).not.toBeNull()
    expect(path!.props['fill-rule']).toBe('evenodd')
    expect(path!.classes).toContain('bf-flow__minimap-mask')
  })
})

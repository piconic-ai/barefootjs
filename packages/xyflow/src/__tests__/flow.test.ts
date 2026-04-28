import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderToTest } from '@barefootjs/test'

// IR-level test for the JSX-native Flow container (#1081 step 8). Verifies
// the four-level container tree (.bf-flow > .bf-flow__viewport > {<svg>
// edges + .bf-flow__nodes}) and the per-edge / per-node mapArray bodies.
const source = readFileSync(resolve(__dirname, '../components/flow.tsx'), 'utf-8')

describe('Flow JSX shape (#1081 step 8)', () => {
  const result = renderToTest(source, 'flow.tsx', 'Flow')

  test('JSX → IR pipeline reports no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('component is recognized as a client component', () => {
    expect(result.isClient).toBe(true)
  })

  test('declares viewportTransform / visibleEdges / visibleNodes memos', () => {
    expect(result.memos).toContain('viewportTransform')
    expect(result.memos).toContain('visibleEdges')
    expect(result.memos).toContain('visibleNodes')
  })

  test('renders the .bf-flow root <div>', () => {
    const root = result.find({ tag: 'div' })
    expect(root).not.toBeNull()
    expect(root!.classes).toContain('bf-flow')
  })

  test('renders the viewport <div> with reactive transform', () => {
    const viewport = result.findAll({ tag: 'div' }).find(d =>
      d.classes.includes('bf-flow__viewport'),
    )
    expect(viewport).toBeDefined()
    // The full style string is composed in JSX via a template literal,
    // so the IR exposes the expression as the bound style value rather
    // than a parsed object.
    expect(typeof viewport!.props['style']).toBe('string')
  })

  test('renders the edges <svg> at full viewport with pointer-events:none', () => {
    const svg = result.find({ tag: 'svg' })
    expect(svg).not.toBeNull()
    expect(svg!.classes).toContain('bf-flow__edges')
  })

  test('renders the nodes container <div>', () => {
    const nodesContainer = result.findAll({ tag: 'div' }).find(d =>
      d.classes.includes('bf-flow__nodes'),
    )
    expect(nodesContainer).toBeDefined()
  })

  test('mounts SimpleEdge and NodeWrapper components', () => {
    const simpleEdge = result.find({ componentName: 'SimpleEdge' })
    const nodeWrapper = result.find({ componentName: 'NodeWrapper' })
    expect(simpleEdge).not.toBeNull()
    expect(nodeWrapper).not.toBeNull()
  })
})

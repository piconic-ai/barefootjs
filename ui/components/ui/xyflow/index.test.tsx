import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { renderToTest } from '@barefootjs/test'

// Consolidated IR test for all xyflow JSX components. Mirrors the chart
// pattern: every component lives in `index.tsx`, every assertion lives
// in this file.
//
// Component coverage in this file:
//   - SimpleEdge   — per-edge <path> hit area + visible
//   - NodeWrapper  — per-node <div> with reactive class / transform
//   - Handle       — per-node connection handle
//   - Background   — SVG pattern background
//   - Controls     — zoom / fit / lock buttons
//   - MiniMap      — overview map with viewport mask
//   - Flow         — top-level container

const source = readFileSync(resolve(__dirname, 'index.tsx'), 'utf-8')

// ============================================================================
describe('SimpleEdge', () => {
  const result = renderToTest(source, 'xyflow.tsx', 'SimpleEdge')

  test('compiles cleanly as a client component', () => {
    expect(result.errors).toEqual([])
    expect(result.isClient).toBe(true)
  })

  test('declares per-field memos for selection / animation / path / class', () => {
    expect(result.memos).toContain('selected')
    expect(result.memos).toContain('animated')
    expect(result.memos).toContain('pathD')
    expect(result.memos).toContain('visibleClass')
  })

  test('renders both hit-area and visible <path>', () => {
    const paths = result.findAll({ tag: 'path' })
    expect(paths.length).toBe(2)
    const hit = paths.find(p => 'data-hit-id' in p.props)
    const visible = paths.find(p => 'data-id' in p.props)
    expect(hit).toBeDefined()
    expect(visible).toBeDefined()
    expect(hit!.props['stroke']).toBe('transparent')
    expect(hit!.props['stroke-width']).toBe('20')
  })
})

// ============================================================================
describe('NodeWrapper', () => {
  const result = renderToTest(source, 'xyflow.tsx', 'NodeWrapper')

  test('compiles cleanly as a client component', () => {
    expect(result.errors).toEqual([])
    expect(result.isClient).toBe(true)
  })

  test('declares position/class/style memos', () => {
    expect(result.memos).toContain('node')
    expect(result.memos).toContain('transform')
    expect(result.memos).toContain('zIndex')
    expect(result.memos).toContain('className')
    expect(result.memos).toContain('style')
  })

  test('renders a single wrapper <div> with data-id and reactive className', () => {
    const divs = result.findAll({ tag: 'div' })
    expect(divs.length).toBe(1)
    expect(divs[0]!.props['data-id']).toBe('props.nodeId')
    expect(divs[0]!.classes).toContain('className()')
  })
})

// ============================================================================
describe('Handle', () => {
  const result = renderToTest(source, 'xyflow.tsx', 'Handle')

  test('compiles cleanly as a client component', () => {
    expect(result.errors).toEqual([])
    expect(result.isClient).toBe(true)
  })

  test('declares handleType / position / className / style memos', () => {
    expect(result.memos).toContain('handleType')
    expect(result.memos).toContain('position')
    expect(result.memos).toContain('className')
    expect(result.memos).toContain('style')
  })

  test('div carries the data-* attributes connection.ts queries', () => {
    const div = result.find({ tag: 'div' })!
    const keys = Object.keys(div.props)
    expect(keys).toContain('data-handle-type')
    expect(keys).toContain('data-handlepos')
    expect(keys).toContain('data-handle-position')
    expect(keys).toContain('data-node-id')
    expect(keys).toContain('data-handleid')
  })
})

// ============================================================================
describe('Background', () => {
  const result = renderToTest(source, 'xyflow.tsx', 'Background')

  test('compiles cleanly as a client component', () => {
    expect(result.errors).toEqual([])
    expect(result.isClient).toBe(true)
  })

  test('declares pattern geometry + variant child memos', () => {
    expect(result.memos).toContain('patternBox')
    expect(result.memos).toContain('patternWidth')
    expect(result.memos).toContain('patternHeight')
    expect(result.memos).toContain('patternX')
    expect(result.memos).toContain('patternY')
    expect(result.memos).toContain('dotR')
    expect(result.memos).toContain('linePathD')
    expect(result.memos).toContain('crossPathD')
  })

  test('renders <svg> > <defs> > <pattern> + fill <rect>', () => {
    const svg = result.find({ tag: 'svg' })
    const pattern = result.find({ tag: 'pattern' })
    const rect = result.find({ tag: 'rect' })
    expect(svg).not.toBeNull()
    expect(pattern).not.toBeNull()
    expect(pattern!.props['patternUnits']).toBe('userSpaceOnUse')
    expect(rect).not.toBeNull()
    expect(rect!.props['width']).toBe('100%')
    expect(rect!.props['height']).toBe('100%')
  })
})

// ============================================================================
describe('Controls', () => {
  const result = renderToTest(source, 'xyflow.tsx', 'Controls')

  test('compiles cleanly as a client component', () => {
    expect(result.errors).toEqual([])
    expect(result.isClient).toBe(true)
  })

  test('declares interactive signal + per-prop default memos', () => {
    expect(result.signals).toContain('interactive')
    expect(result.memos).toContain('position')
    expect(result.memos).toContain('showZoom')
    expect(result.memos).toContain('showFitView')
    expect(result.memos).toContain('showInteractive')
    expect(result.memos).toContain('containerStyle')
  })

  test('renders the four control buttons with correct titles', () => {
    const buttons = result.findAll({ tag: 'button' })
    expect(buttons.length).toBeGreaterThanOrEqual(4)
    const titles = buttons.map(b => b.props['title']).filter(Boolean) as string[]
    expect(titles).toContain('Zoom in')
    expect(titles).toContain('Zoom out')
    expect(titles).toContain('Fit view')
    expect(titles).toContain('Toggle interactivity')
  })
})

// ============================================================================
describe('MiniMap', () => {
  const result = renderToTest(source, 'xyflow.tsx', 'MiniMap')

  test('compiles cleanly as a client component', () => {
    expect(result.errors).toEqual([])
    expect(result.isClient).toBe(true)
  })

  test('declares geometry / viewBox / nodeRects / maskPathD memos', () => {
    expect(result.memos).toContain('geometry')
    expect(result.memos).toContain('viewBox')
    expect(result.memos).toContain('nodeRects')
    expect(result.memos).toContain('maskPathD')
  })

  test('renders container <div> + <svg> with reactive viewBox + mask <path>', () => {
    const container = result.find({ tag: 'div' })
    expect(container).not.toBeNull()
    // Imported identifiers (`BF_FLOW_MINIMAP`) inside template literals
    // are not resolved into static tokens by the IR analyzer — only the
    // literal parts (`nopan` / `nowheel` / `nodrag`) appear in `.classes`.
    // Same workaround pattern as chart's IR tests.
    expect(container!.classes).toContain('nopan')

    const svg = result.find({ tag: 'svg' })
    expect(svg).not.toBeNull()
    expect(svg!.props['viewBox']).toBe('viewBox()')

    const path = result.find({ tag: 'path' })
    expect(path).not.toBeNull()
    expect(path!.props['fill-rule']).toBe('evenodd')
    expect(path!.classes).toContain('BF_FLOW_MINIMAP_MASK')
  })
})

// ============================================================================
describe('Flow', () => {
  const result = renderToTest(source, 'xyflow.tsx', 'Flow')

  test('compiles cleanly as a client component', () => {
    expect(result.errors).toEqual([])
    expect(result.isClient).toBe(true)
  })

  test('declares viewportTransform / visibleEdges / visibleNodes memos', () => {
    expect(result.memos).toContain('viewportTransform')
    expect(result.memos).toContain('visibleEdges')
    expect(result.memos).toContain('visibleNodes')
  })

  test('renders the four-level container tree', () => {
    // The IR analyzer does not resolve imported `BF_FLOW*` constants
    // into their literal values (same workaround as MiniMap above), so
    // `.classes` is empty/sparse here. We assert the tree shape via
    // tag counts + the `<svg>` lookup, and rely on e2e tests for the
    // resolved `bf-flow*` class names on the rendered DOM.
    const divs = result.findAll({ tag: 'div' })
    // root + viewport + nodes container, plus per-node wrappers from
    // the loop body (one `NodeWrapper` div).
    expect(divs.length).toBeGreaterThanOrEqual(3)

    const edgesSvg = result.find({ tag: 'svg' })
    expect(edgesSvg).not.toBeNull()
  })

  test('mounts SimpleEdge and NodeWrapper inside the loops', () => {
    expect(result.find({ componentName: 'SimpleEdge' })).not.toBeNull()
    expect(result.find({ componentName: 'NodeWrapper' })).not.toBeNull()
  })

  test('invokes props.onInit(store) so consumers can capture the store handle', () => {
    // Asserts the Flow body contains a `props.onInit(...)` call site
    // (gated by `if (props.onInit)` to satisfy the JSX-native compiler's
    // expression-statement preservation rules). If a future refactor
    // drops it, downstream consumers (e.g. piconic-ai/desk's DeskCanvas)
    // silently lose imperative access to the store.
    expect(source).toMatch(/props\.onInit\(store/)
  })
})

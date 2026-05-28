import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { renderToTest } from '@barefootjs/test'

const scrollAreaSource = readFileSync(resolve(__dirname, 'index.tsx'), 'utf-8')

// ---------------------------------------------------------------------------
// ScrollArea (stateful — manages hover, scroll, thumb position signals)
// ---------------------------------------------------------------------------

describe('ScrollArea', () => {
  const result = renderToTest(scrollAreaSource, 'scroll-area.tsx', 'ScrollArea')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('isClient is true', () => {
    expect(result.isClient).toBe(true)
  })

  test('componentName is ScrollArea', () => {
    expect(result.componentName).toBe('ScrollArea')
  })

  test('has signals: hovered, scrolling, thumbVSize', () => {
    expect(result.signals).toContain('hovered')
    expect(result.signals).toContain('scrolling')
    expect(result.signals).toContain('thumbVSize')
  })

  test('root tag is div', () => {
    expect(result.root.tag).toBe('div')
  })

  test('root has data-slot=scroll-area', () => {
    expect(result.root.props['data-slot']).toBe('scroll-area')
  })

  test('root has mouseenter event handler', () => {
    expect(result.root.events).toContain('mouseenter')
  })

  test('hover handlers wire to the hovered signal', () => {
    expect(result.root.on('mouseenter')!.setters).toContain('setHovered')
    expect(result.root.on('mouseleave')!.setters).toContain('setHovered')
  })

  test('scroll handler wires through updateScrollMetrics to thumb signals', () => {
    // onScroll -> handleScroll -> updateScrollMetrics -> set* (transitive).
    // The scroll listener sits on the viewport div, not the root.
    const viewport = result.findAll({ tag: 'div' })
      .find(d => d.props['data-slot'] === 'scroll-area-viewport')
    expect(viewport).toBeDefined()
    const handler = viewport!.on('scroll')
    expect(handler).not.toBeNull()
    expect(handler!.via).toContain('handleScroll')
    expect(handler!.via).toContain('updateScrollMetrics')
    expect(handler!.setters).toContain('setScrolling')
    expect(handler!.setters).toContain('setThumbVPos')
  })

  test('contains viewport div with data-slot=scroll-area-viewport', () => {
    const viewport = result.find({ tag: 'div' })
    expect(viewport).not.toBeNull()
    // Find the viewport specifically
    const allDivs = result.findAll({ tag: 'div' })
    const viewportDiv = allDivs.find(d => d.props['data-slot'] === 'scroll-area-viewport')
    expect(viewportDiv).not.toBeNull()
    expect(viewportDiv!.props['data-slot']).toBe('scroll-area-viewport')
  })

  test('contains two scrollbar divs with data-slot=scroll-area-scrollbar', () => {
    const allDivs = result.findAll({ tag: 'div' })
    const scrollbars = allDivs.filter(d => d.props['data-slot'] === 'scroll-area-scrollbar')
    expect(scrollbars.length).toBe(2)
  })

  test('scrollbars have vertical and horizontal orientations', () => {
    const allDivs = result.findAll({ tag: 'div' })
    const scrollbars = allDivs.filter(d => d.props['data-slot'] === 'scroll-area-scrollbar')
    const orientations = scrollbars.map(s => s.props['data-orientation'])
    expect(orientations).toContain('vertical')
    expect(orientations).toContain('horizontal')
  })
})

// ---------------------------------------------------------------------------
// ScrollBar (stateless standalone scrollbar — default orientation=vertical)
// ---------------------------------------------------------------------------

describe('ScrollBar', () => {
  const result = renderToTest(scrollAreaSource, 'scroll-area.tsx', 'ScrollBar')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is ScrollBar', () => {
    expect(result.componentName).toBe('ScrollBar')
  })

  test('root tag is div', () => {
    expect(result.root.tag).toBe('div')
  })

  test('root has data-slot=scroll-area-scrollbar', () => {
    expect(result.root.props['data-slot']).toBe('scroll-area-scrollbar')
  })

  test('has data-orientation attribute', () => {
    // data-orientation is dynamic (resolved from orientation variable), just check it exists
    expect(result.root.props['data-orientation']).not.toBeUndefined()
  })
})

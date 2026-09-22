import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { renderToTest } from '@barefootjs/test'
import { clampHoverCardPosition } from '../../../lib/clamp-hover-card-position'

const source = readFileSync(resolve(__dirname, 'index.tsx'), 'utf-8')

// ---------------------------------------------------------------------------
// HoverCard (context-only root — Provider + div wrapper)
// ---------------------------------------------------------------------------

describe('HoverCard', () => {
  const result = renderToTest(source, 'hover-card.tsx', 'HoverCard')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is HoverCard', () => {
    expect(result.componentName).toBe('HoverCard')
  })

  test('contains div with data-slot=hover-card', () => {
    const div = result.find({ tag: 'div' })
    expect(div).not.toBeNull()
    expect(div!.props['data-slot']).toBe('hover-card')
  })
})

// ---------------------------------------------------------------------------
// HoverCardTrigger (asChild conditional, span with aria-expanded)
// ---------------------------------------------------------------------------

describe('HoverCardTrigger', () => {
  const result = renderToTest(source, 'hover-card.tsx', 'HoverCardTrigger')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is HoverCardTrigger', () => {
    expect(result.componentName).toBe('HoverCardTrigger')
  })

  test('root type is conditional (asChild branch)', () => {
    expect(result.root.type).toBe('conditional')
  })

  test('contains span with aria-expanded', () => {
    const span = result.find({ tag: 'span' })
    expect(span).not.toBeNull()
    expect(span!.aria).toHaveProperty('expanded')
  })

  test('that span has data-slot=hover-card-trigger', () => {
    const span = result.find({ tag: 'span' })!
    expect(span.props['data-slot']).toBe('hover-card-trigger')
  })
})

// ---------------------------------------------------------------------------
// HoverCardContent (portaled content, data-state=closed initially)
// ---------------------------------------------------------------------------

describe('HoverCardContent', () => {
  const result = renderToTest(source, 'hover-card.tsx', 'HoverCardContent')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is HoverCardContent', () => {
    expect(result.componentName).toBe('HoverCardContent')
  })

  test('root tag is div', () => {
    expect(result.root.tag).toBe('div')
  })

  test('root has data-slot=hover-card-content', () => {
    expect(result.root.props['data-slot']).toBe('hover-card-content')
  })

  test('root has data-state=closed (initial state)', () => {
    expect(result.root.dataState).toBe('closed')
  })
})

// ---------------------------------------------------------------------------
// clampHoverCardPosition (viewport-edge clamp math, #3117)
// ---------------------------------------------------------------------------

describe('clampHoverCardPosition', () => {
  const viewport = { width: 1024, height: 768 }
  const gap = 4

  test('bottom/center: normal case anchors below and centered on the trigger', () => {
    const rect = { top: 100, bottom: 130, left: 200, right: 300, width: 100 }
    const { top, left } = clampHoverCardPosition(rect, { width: 200, height: 80 }, viewport, 'bottom', 'center')
    expect(top).toBe(134) // rect.bottom + gap
    expect(left).toBe(150) // rect.left + width/2 - contentWidth/2
  })

  test('bottom/start: content flush with the trigger’s left edge', () => {
    const rect = { top: 100, bottom: 130, left: 200, right: 300, width: 100 }
    const { left } = clampHoverCardPosition(rect, { width: 200, height: 80 }, viewport, 'bottom', 'start')
    expect(left).toBe(200) // rect.left
  })

  test('bottom/end: content right-aligned to the trigger’s right edge', () => {
    const rect = { top: 100, bottom: 130, left: 200, right: 300, width: 100 }
    const { left } = clampHoverCardPosition(rect, { width: 200, height: 80 }, viewport, 'bottom', 'end')
    expect(left).toBe(100) // rect.right - contentWidth
  })

  test('top side: content sits above the trigger', () => {
    const rect = { top: 300, bottom: 330, left: 200, right: 300, width: 100 }
    const { top } = clampHoverCardPosition(rect, { width: 200, height: 80 }, viewport, 'top', 'center')
    expect(top).toBe(216) // rect.top - contentHeight - gap
  })

  // The off-screen bug #3117 fixes (Popover's version was fixed in #3100):
  // a trigger near the viewport's bottom edge with tall content used to
  // render partly below `innerHeight`, off-screen and unreachable (a
  // `position: fixed` overlay doesn't scroll into view).
  test('bottom/center: a trigger near the viewport bottom clamps content to stay fully visible', () => {
    const rect = { top: 700, bottom: 730, left: 400, right: 500, width: 100 }
    const contentSize = { width: 300, height: 400 } // taller than the remaining viewport space
    const { top, left } = clampHoverCardPosition(rect, contentSize, viewport, 'bottom', 'center')
    expect(top).toBe(viewport.height - contentSize.height - gap) // clamped to the ceiling, not rect.bottom + gap (734, off-screen)
    expect(top + contentSize.height).toBeLessThanOrEqual(viewport.height)
    expect(left).toBeGreaterThanOrEqual(gap)
  })

  test('bottom/start: a trigger near the viewport right edge clamps left to stay on-screen', () => {
    const rect = { top: 100, bottom: 130, left: 950, right: 1010, width: 60 }
    const contentSize = { width: 200, height: 80 }
    const { left } = clampHoverCardPosition(rect, contentSize, viewport, 'bottom', 'start')
    expect(left).toBe(viewport.width - contentSize.width - gap) // clamped, not rect.left (950, would overflow)
    expect(left + contentSize.width).toBeLessThanOrEqual(viewport.width)
  })

  test('content larger than the viewport still clamps to the gap floor on both axes (no negative overflow)', () => {
    const rect = { top: 100, bottom: 130, left: 100, right: 200, width: 100 }
    const contentSize = { width: viewport.width + 500, height: viewport.height + 500 }
    const { top, left } = clampHoverCardPosition(rect, contentSize, viewport, 'bottom', 'center')
    expect(top).toBe(gap)
    expect(left).toBe(gap)
  })
})

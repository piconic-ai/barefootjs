import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { renderToTest } from '@barefootjs/test'
import { clampPopoverPosition } from '../../../lib/clamp-position'

const popoverSource = readFileSync(resolve(__dirname, 'index.tsx'), 'utf-8')

describe('Popover', () => {
  const result = renderToTest(popoverSource, 'popover.tsx', 'Popover')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('isClient is true', () => {
    expect(result.isClient).toBe(true)
  })

  test('componentName is Popover', () => {
    expect(result.componentName).toBe('Popover')
  })

  test('no signals (open state from props via context)', () => {
    expect(result.signals).toEqual([])
  })

  test('renders a div with data-slot=popover', () => {
    const div = result.find({ tag: 'div' })
    expect(div).not.toBeNull()
    expect(div!.props['data-slot']).toBe('popover')
  })
})

describe('PopoverTrigger', () => {
  const result = renderToTest(popoverSource, 'popover.tsx', 'PopoverTrigger')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is PopoverTrigger', () => {
    expect(result.componentName).toBe('PopoverTrigger')
  })

  test('root is conditional (asChild branch)', () => {
    expect(result.root.type).toBe('conditional')
  })

  test('has aria-expanded attribute', () => {
    const trigger = result.find({ tag: 'button' })
    expect(trigger).not.toBeNull()
    expect(trigger!.aria).toHaveProperty('expanded')
  })

})

describe('PopoverContent', () => {
  const result = renderToTest(popoverSource, 'popover.tsx', 'PopoverContent')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is PopoverContent', () => {
    expect(result.componentName).toBe('PopoverContent')
  })

  test('has data-slot=popover-content', () => {
    const div = result.find({ tag: 'div' })
    expect(div!.props['data-slot']).toBe('popover-content')
  })

  test('has data-state attribute', () => {
    const div = result.find({ tag: 'div' })!
    expect(div.dataState).not.toBeNull()
  })
})

describe('clampPopoverPosition', () => {
  const viewport = { width: 1024, height: 768 }
  const gap = 4

  test('bottom/center: normal case anchors below and centered on the trigger', () => {
    const rect = { top: 100, bottom: 130, left: 200, right: 300, width: 100 }
    const { top, left } = clampPopoverPosition(rect, { width: 200, height: 80 }, viewport, 'bottom', 'center')
    expect(top).toBe(134) // rect.bottom + gap
    expect(left).toBe(150) // rect.left + width/2 - contentWidth/2
  })

  test('bottom/start: content flush with the trigger’s left edge', () => {
    const rect = { top: 100, bottom: 130, left: 200, right: 300, width: 100 }
    const { left } = clampPopoverPosition(rect, { width: 200, height: 80 }, viewport, 'bottom', 'start')
    expect(left).toBe(200) // rect.left
  })

  test('bottom/end: content right-aligned to the trigger’s right edge', () => {
    const rect = { top: 100, bottom: 130, left: 200, right: 300, width: 100 }
    const { left } = clampPopoverPosition(rect, { width: 200, height: 80 }, viewport, 'bottom', 'end')
    expect(left).toBe(100) // rect.right - contentWidth
  })

  test('top side: content sits above the trigger', () => {
    const rect = { top: 300, bottom: 330, left: 200, right: 300, width: 100 }
    const { top } = clampPopoverPosition(rect, { width: 200, height: 80 }, viewport, 'top', 'center')
    expect(top).toBe(216) // rect.top - contentHeight - gap
  })

  // The bug this PR fixes (site/ui/e2e/popover.spec.ts's intermittent
  // "Form Demo" failure): a trigger near the viewport's bottom edge with
  // tall content used to render partly below `innerHeight`, off-screen and
  // unreachable (a `position: fixed` overlay doesn't scroll into view).
  test('bottom/center: a trigger near the viewport bottom clamps content to stay fully visible', () => {
    const rect = { top: 700, bottom: 730, left: 400, right: 500, width: 100 }
    const contentSize = { width: 300, height: 400 } // taller than the remaining viewport space
    const { top, left } = clampPopoverPosition(rect, contentSize, viewport, 'bottom', 'center')
    expect(top).toBe(viewport.height - contentSize.height - gap) // clamped to the ceiling, not rect.bottom + gap (734, off-screen)
    expect(top + contentSize.height).toBeLessThanOrEqual(viewport.height)
    expect(left).toBeGreaterThanOrEqual(gap)
  })

  test('bottom/start: a trigger near the viewport right edge clamps left to stay on-screen', () => {
    const rect = { top: 100, bottom: 130, left: 950, right: 1010, width: 60 }
    const contentSize = { width: 200, height: 80 }
    const { left } = clampPopoverPosition(rect, contentSize, viewport, 'bottom', 'start')
    expect(left).toBe(viewport.width - contentSize.width - gap) // clamped, not rect.left (950, would overflow)
    expect(left + contentSize.width).toBeLessThanOrEqual(viewport.width)
  })

  test('content larger than the viewport still clamps to the gap floor on both axes (no negative overflow)', () => {
    const rect = { top: 100, bottom: 130, left: 100, right: 200, width: 100 }
    const contentSize = { width: viewport.width + 500, height: viewport.height + 500 }
    const { top, left } = clampPopoverPosition(rect, contentSize, viewport, 'bottom', 'center')
    expect(top).toBe(gap)
    expect(left).toBe(gap)
  })
})

describe('PopoverClose', () => {
  const result = renderToTest(popoverSource, 'popover.tsx', 'PopoverClose')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is PopoverClose', () => {
    expect(result.componentName).toBe('PopoverClose')
  })

  test('renders as <button>', () => {
    const button = result.find({ tag: 'button' })
    expect(button).not.toBeNull()
    expect(button!.props['data-slot']).toBe('popover-close')
  })

})

import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { renderToTest } from '@barefootjs/test'

const source = readFileSync(resolve(__dirname, 'index.tsx'), 'utf-8')

// ---------------------------------------------------------------------------
// Tooltip (stateful — open signal, hover/focus events, role=tooltip)
// ---------------------------------------------------------------------------

describe('Tooltip', () => {
  const result = renderToTest(source, 'tooltip.tsx', 'Tooltip')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('isClient is true', () => {
    expect(result.isClient).toBe(true)
  })

  test('componentName is Tooltip', () => {
    expect(result.componentName).toBe('Tooltip')
  })

  test('has signal: open', () => {
    expect(result.signals).toContain('open')
  })

  test('root tag is span', () => {
    expect(result.root.tag).toBe('span')
  })

  test('root has data-slot=tooltip', () => {
    expect(result.root.props['data-slot']).toBe('tooltip')
  })

  test('root has mouseenter event handler', () => {
    expect(result.root.events).toContain('mouseenter')
  })

  test('hover/focus handlers all wire to setOpen', () => {
    // All four open/close triggers route through their respective handler
    // function to the single `open` signal setter.
    for (const [event, via] of [
      ['mouseenter', 'handleMouseEnter'],
      ['mouseleave', 'handleMouseLeave'],
      ['focus', 'handleFocus'],
      ['blur', 'handleBlur'],
    ] as const) {
      const handler = result.root.on(event)
      expect(handler).not.toBeNull()
      expect(handler!.via).toContain(via)
      expect(handler!.setters).toContain('setOpen')
    }
  })

  test('contains div with role=tooltip', () => {
    const tooltipDiv = result.find({ role: 'tooltip' })
    expect(tooltipDiv).not.toBeNull()
  })

  test('tooltip content div has data-slot=tooltip-content', () => {
    const tooltipDiv = result.find({ role: 'tooltip' })!
    expect(tooltipDiv.props['data-slot']).toBe('tooltip-content')
  })

  test('tooltip content div has data-state attribute', () => {
    // data-state is dynamic (ternary on open()), just check it exists
    const tooltipDiv = result.find({ role: 'tooltip' })!
    expect(tooltipDiv.dataState).not.toBeNull()
  })
})

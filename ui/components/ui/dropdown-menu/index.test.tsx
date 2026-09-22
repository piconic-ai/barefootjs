import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { renderToTest } from '@barefootjs/test'
import { clampDropdownMenuPosition } from '../../../lib/clamp-dropdown-menu-position'

const dropdownMenuSource = readFileSync(resolve(__dirname, 'index.tsx'), 'utf-8')

describe('DropdownMenu', () => {
  const result = renderToTest(dropdownMenuSource, 'dropdown-menu.tsx', 'DropdownMenu')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('isClient is true', () => {
    expect(result.isClient).toBe(true)
  })

  test('componentName is DropdownMenu', () => {
    expect(result.componentName).toBe('DropdownMenu')
  })

  test('no signals (open state from props via context)', () => {
    expect(result.signals).toEqual([])
  })

  test('renders a div with data-slot=dropdown-menu', () => {
    const div = result.find({ tag: 'div' })
    expect(div).not.toBeNull()
    expect(div!.props['data-slot']).toBe('dropdown-menu')
  })
})

describe('DropdownMenuTrigger', () => {
  const result = renderToTest(dropdownMenuSource, 'dropdown-menu.tsx', 'DropdownMenuTrigger')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is DropdownMenuTrigger', () => {
    expect(result.componentName).toBe('DropdownMenuTrigger')
  })

  test('root is conditional (asChild branch)', () => {
    expect(result.root.type).toBe('conditional')
  })

  test('button has aria-expanded and aria-haspopup', () => {
    const button = result.find({ tag: 'button' })
    expect(button).not.toBeNull()
    expect(button!.aria).toHaveProperty('expanded')
    expect(button!.aria).toHaveProperty('haspopup')
  })
})

describe('DropdownMenuContent', () => {
  const result = renderToTest(dropdownMenuSource, 'dropdown-menu.tsx', 'DropdownMenuContent')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is DropdownMenuContent', () => {
    expect(result.componentName).toBe('DropdownMenuContent')
  })

  test('has role=menu', () => {
    const menu = result.find({ role: 'menu' })
    expect(menu).not.toBeNull()
    expect(menu!.props['data-slot']).toBe('dropdown-menu-content')
  })

  test('has data-state attribute', () => {
    const menu = result.find({ role: 'menu' })!
    expect(menu.dataState).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// clampDropdownMenuPosition (viewport-edge clamp math, #3117)
// ---------------------------------------------------------------------------

describe('clampDropdownMenuPosition', () => {
  const viewport = { width: 1024, height: 768 }
  const gap = 4

  test('default align (start): content flush with the trigger’s left edge, below it', () => {
    const rect = { bottom: 130, left: 200, right: 300 }
    const { top, left } = clampDropdownMenuPosition(rect, { width: 200, height: 80 }, viewport, undefined)
    expect(top).toBe(134) // rect.bottom + gap
    expect(left).toBe(200) // rect.left
  })

  test('align=end: content right-aligned to the trigger’s right edge', () => {
    const rect = { bottom: 130, left: 200, right: 300 }
    const { left } = clampDropdownMenuPosition(rect, { width: 200, height: 80 }, viewport, 'end')
    expect(left).toBe(100) // rect.right - contentWidth
  })

  // The off-screen bug #3117 fixes (Popover's version was fixed in #3100):
  // a trigger near the viewport's bottom edge with tall content used to
  // render partly below `innerHeight`, off-screen and unreachable (a
  // `position: fixed` overlay doesn't scroll into view).
  test('a trigger near the viewport bottom clamps content to stay fully visible', () => {
    const rect = { bottom: 730, left: 400, right: 500 }
    const contentSize = { width: 300, height: 400 } // taller than the remaining viewport space
    const { top } = clampDropdownMenuPosition(rect, contentSize, viewport, undefined)
    expect(top).toBe(viewport.height - contentSize.height - gap) // clamped, not rect.bottom + gap (734, off-screen)
    expect(top + contentSize.height).toBeLessThanOrEqual(viewport.height)
  })

  test('align=end: a trigger near the viewport left edge clamps left to stay on-screen', () => {
    const rect = { bottom: 130, left: -50, right: 10 }
    const contentSize = { width: 200, height: 80 }
    const { left } = clampDropdownMenuPosition(rect, contentSize, viewport, 'end')
    expect(left).toBe(gap) // clamped, not rect.right - contentWidth (-190, would overflow)
  })

  test('content larger than the viewport still clamps to the gap floor on both axes (no negative overflow)', () => {
    const rect = { bottom: 130, left: 100, right: 200 }
    const contentSize = { width: viewport.width + 500, height: viewport.height + 500 }
    const { top, left } = clampDropdownMenuPosition(rect, contentSize, viewport, undefined)
    expect(top).toBe(gap)
    expect(left).toBe(gap)
  })
})

describe('DropdownMenuItem', () => {
  const result = renderToTest(dropdownMenuSource, 'dropdown-menu.tsx', 'DropdownMenuItem')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is DropdownMenuItem', () => {
    expect(result.componentName).toBe('DropdownMenuItem')
  })

  test('has role=menuitem', () => {
    const item = result.find({ role: 'menuitem' })
    expect(item).not.toBeNull()
    expect(item!.props['data-slot']).toBe('dropdown-menu-item')
  })

})

describe('DropdownMenuSub', () => {
  const result = renderToTest(dropdownMenuSource, 'dropdown-menu.tsx', 'DropdownMenuSub')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is DropdownMenuSub', () => {
    expect(result.componentName).toBe('DropdownMenuSub')
  })

  test('has signal: subOpen (createSignal)', () => {
    expect(result.signals).toContain('subOpen')
  })

  test('renders a div with data-slot=dropdown-menu-sub', () => {
    const div = result.find({ tag: 'div' })
    expect(div).not.toBeNull()
    expect(div!.props['data-slot']).toBe('dropdown-menu-sub')
  })
})

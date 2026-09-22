import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { renderToTest } from '@barefootjs/test'
import { clampNavigationMenuPosition } from '../../../lib/clamp-navigation-menu-position'

const source = readFileSync(resolve(__dirname, 'index.tsx'), 'utf-8')

// ---------------------------------------------------------------------------
// NavigationMenu (stateful — activeValue signal, Provider wrapping)
// ---------------------------------------------------------------------------

describe('NavigationMenu', () => {
  const result = renderToTest(source, 'navigation-menu.tsx', 'NavigationMenu')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('isClient is true', () => {
    expect(result.isClient).toBe(true)
  })

  test('componentName is NavigationMenu', () => {
    expect(result.componentName).toBe('NavigationMenu')
  })

  test('has activeValue signal', () => {
    expect(result.signals).toContain('activeValue')
  })

  test('renders as nav with data-slot=navigation-menu', () => {
    const nav = result.find({ tag: 'nav' })
    expect(nav).not.toBeNull()
    expect(nav!.props['data-slot']).toBe('navigation-menu')
  })

  test('has resolved CSS classes', () => {
    const nav = result.find({ tag: 'nav' })!
    expect(nav.classes).toContain('relative')
  })

  test('toStructure() shows nav element', () => {
    const structure = result.toStructure()
    expect(structure).toContain('nav')
  })
})

// ---------------------------------------------------------------------------
// NavigationMenuList (stateless — styled <ul>)
// ---------------------------------------------------------------------------

describe('NavigationMenuList', () => {
  const result = renderToTest(source, 'navigation-menu.tsx', 'NavigationMenuList')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is NavigationMenuList', () => {
    expect(result.componentName).toBe('NavigationMenuList')
  })

  test('no signals (stateless)', () => {
    expect(result.signals).toEqual([])
  })

  test('renders as ul with data-slot=navigation-menu-list', () => {
    expect(result.root.tag).toBe('ul')
    expect(result.root.props['data-slot']).toBe('navigation-menu-list')
  })

  test('has resolved CSS classes', () => {
    expect(result.root.classes).toContain('flex')
    expect(result.root.classes).toContain('items-center')
  })
})

// ---------------------------------------------------------------------------
// NavigationMenuItem (stateless — <li> wrapper with data-value)
// ---------------------------------------------------------------------------

describe('NavigationMenuItem', () => {
  const result = renderToTest(source, 'navigation-menu.tsx', 'NavigationMenuItem')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is NavigationMenuItem', () => {
    expect(result.componentName).toBe('NavigationMenuItem')
  })

  test('no signals (stateless)', () => {
    expect(result.signals).toEqual([])
  })

  test('renders as li with data-slot=navigation-menu-item', () => {
    expect(result.root.tag).toBe('li')
    expect(result.root.props['data-slot']).toBe('navigation-menu-item')
  })

  test('has data-value attribute', () => {
    expect(result.root.props).toHaveProperty('data-value')
  })

  test('has relative positioning class', () => {
    expect(result.root.classes).toContain('relative')
  })
})

// ---------------------------------------------------------------------------
// NavigationMenuTrigger (stateful — ref handler with useContext, createEffect)
// ---------------------------------------------------------------------------

describe('NavigationMenuTrigger', () => {
  const result = renderToTest(source, 'navigation-menu.tsx', 'NavigationMenuTrigger')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is NavigationMenuTrigger', () => {
    expect(result.componentName).toBe('NavigationMenuTrigger')
  })

  test('renders as <button>', () => {
    const button = result.find({ tag: 'button' })
    expect(button).not.toBeNull()
  })

  test('has data-slot=navigation-menu-trigger', () => {
    const button = result.find({ tag: 'button' })!
    expect(button.props['data-slot']).toBe('navigation-menu-trigger')
  })

  test('has aria-haspopup=menu', () => {
    const button = result.find({ tag: 'button' })!
    expect(button.aria).toHaveProperty('haspopup')
  })

  test('has aria-expanded attribute', () => {
    const button = result.find({ tag: 'button' })!
    expect(button.aria).toHaveProperty('expanded')
  })

  test('has data-state=closed initially', () => {
    const button = result.find({ tag: 'button' })!
    expect(button.dataState).toBe('closed')
  })

  test('contains chevron icon', () => {
    const icon = result.find({ componentName: 'ChevronDownIcon' })
    expect(icon).not.toBeNull()
  })

  test('has resolved CSS classes', () => {
    const button = result.find({ tag: 'button' })!
    expect(button.classes).toContain('inline-flex')
    expect(button.classes).toContain('items-center')
    expect(button.classes).toContain('rounded-md')
    expect(button.classes).toContain('cursor-pointer')
  })

  test('toStructure() shows trigger button with ARIA', () => {
    const structure = result.toStructure()
    expect(structure).toContain('button')
    expect(structure).toContain('[aria-haspopup]')
    expect(structure).toContain('[aria-expanded]')
    expect(structure).toContain('ChevronDownIcon')
  })
})

// ---------------------------------------------------------------------------
// NavigationMenuContent (stateful — portal, positioning, timer management)
// ---------------------------------------------------------------------------

describe('NavigationMenuContent', () => {
  const result = renderToTest(source, 'navigation-menu.tsx', 'NavigationMenuContent')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is NavigationMenuContent', () => {
    expect(result.componentName).toBe('NavigationMenuContent')
  })

  test('root tag is div', () => {
    expect(result.root.tag).toBe('div')
  })

  test('has data-slot=navigation-menu-content', () => {
    expect(result.root.props['data-slot']).toBe('navigation-menu-content')
  })

  test('has data-state=closed initially', () => {
    expect(result.root.dataState).toBe('closed')
  })

  test('has resolved CSS classes', () => {
    expect(result.root.classes).toContain('fixed')
    expect(result.root.classes).toContain('z-50')
    expect(result.root.classes).toContain('rounded-md')
  })

  test('toStructure() shows content with data-state', () => {
    const structure = result.toStructure()
    expect(structure).toContain('[data-state]')
  })
})

// ---------------------------------------------------------------------------
// clampNavigationMenuPosition (viewport-edge clamp math, #3117)
// ---------------------------------------------------------------------------

describe('clampNavigationMenuPosition', () => {
  const viewport = { width: 1024, height: 768 }
  const gap = 8

  test('normal case: content flush with the trigger’s left edge, below it', () => {
    const rect = { bottom: 130, left: 200 }
    const { top, left } = clampNavigationMenuPosition(rect, { width: 200, height: 80 }, viewport)
    expect(top).toBe(138) // rect.bottom + gap
    expect(left).toBe(200) // rect.left
  })

  // The off-screen bug #3117 fixes (Popover's version was fixed in #3100):
  // a trigger near the viewport's bottom edge with tall content used to
  // render partly below `innerHeight`, off-screen and unreachable (a
  // `position: fixed` overlay doesn't scroll into view).
  test('a trigger near the viewport bottom clamps content to stay fully visible', () => {
    const rect = { bottom: 730, left: 400 }
    const contentSize = { width: 300, height: 400 } // taller than the remaining viewport space
    const { top } = clampNavigationMenuPosition(rect, contentSize, viewport)
    expect(top).toBe(viewport.height - contentSize.height - gap) // clamped, not rect.bottom + gap (738, off-screen)
    expect(top + contentSize.height).toBeLessThanOrEqual(viewport.height)
  })

  test('a trigger near the viewport right edge clamps left to stay on-screen', () => {
    const rect = { bottom: 130, left: 950 }
    const contentSize = { width: 200, height: 80 }
    const { left } = clampNavigationMenuPosition(rect, contentSize, viewport)
    expect(left).toBe(viewport.width - contentSize.width - gap) // clamped, not rect.left (950, would overflow)
    expect(left + contentSize.width).toBeLessThanOrEqual(viewport.width)
  })

  test('content larger than the viewport still clamps to the gap floor on both axes (no negative overflow)', () => {
    const rect = { bottom: 130, left: 100 }
    const contentSize = { width: viewport.width + 500, height: viewport.height + 500 }
    const { top, left } = clampNavigationMenuPosition(rect, contentSize, viewport)
    expect(top).toBe(gap)
    expect(left).toBe(gap)
  })
})

// ---------------------------------------------------------------------------
// NavigationMenuLink (stateless — <a> with active page support)
// ---------------------------------------------------------------------------

describe('NavigationMenuLink', () => {
  const result = renderToTest(source, 'navigation-menu.tsx', 'NavigationMenuLink')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is NavigationMenuLink', () => {
    expect(result.componentName).toBe('NavigationMenuLink')
  })

  test('no signals (stateless)', () => {
    expect(result.signals).toEqual([])
  })

  test('renders as <a> with data-slot=navigation-menu-link', () => {
    expect(result.root.tag).toBe('a')
    expect(result.root.props['data-slot']).toBe('navigation-menu-link')
  })

  test('has resolved CSS classes', () => {
    expect(result.root.classes).toContain('block')
    expect(result.root.classes).toContain('rounded-sm')
    expect(result.root.classes).toContain('no-underline')
  })

  test('toStructure() shows link element', () => {
    const structure = result.toStructure()
    expect(structure).toContain('a')
  })
})

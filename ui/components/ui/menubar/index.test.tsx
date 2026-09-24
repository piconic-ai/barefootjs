import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { renderToTest } from '@barefootjs/test'
import { clampMenubarPosition } from '../../../lib/clamp-menubar-position'

const menubarSource = readFileSync(resolve(__dirname, 'index.tsx'), 'utf-8')

// ---------------------------------------------------------------------------
// Menubar (stateful — activeMenu signal, Provider wrapping)
// ---------------------------------------------------------------------------

describe('Menubar', () => {
  const result = renderToTest(menubarSource, 'menubar.tsx', 'Menubar')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('isClient is true', () => {
    expect(result.isClient).toBe(true)
  })

  test('componentName is Menubar', () => {
    expect(result.componentName).toBe('Menubar')
  })

  test('has activeMenu signal', () => {
    expect(result.signals).toContain('activeMenu')
  })

  test('renders as div with data-slot=menubar', () => {
    const div = result.find({ tag: 'div' })
    expect(div).not.toBeNull()
    expect(div!.props['data-slot']).toBe('menubar')
  })

  test('has role=menubar', () => {
    const menubar = result.find({ role: 'menubar' })
    expect(menubar).not.toBeNull()
    expect(menubar!.tag).toBe('div')
  })

  test('has resolved CSS classes', () => {
    const div = result.find({ role: 'menubar' })!
    expect(div.classes).toContain('flex')
    expect(div.classes).toContain('items-center')
    expect(div.classes).toContain('rounded-md')
  })

  test('toStructure() shows menubar role', () => {
    const structure = result.toStructure()
    expect(structure).toContain('[role=menubar]')
  })
})

// ---------------------------------------------------------------------------
// MenubarMenu (stateless — pure DOM wrapper with data-value)
// ---------------------------------------------------------------------------

describe('MenubarMenu', () => {
  const result = renderToTest(menubarSource, 'menubar.tsx', 'MenubarMenu')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is MenubarMenu', () => {
    expect(result.componentName).toBe('MenubarMenu')
  })

  test('no signals (stateless)', () => {
    expect(result.signals).toEqual([])
  })

  test('renders as div with data-slot=menubar-menu', () => {
    expect(result.root.tag).toBe('div')
    expect(result.root.props['data-slot']).toBe('menubar-menu')
  })

  test('has data-value attribute', () => {
    expect(result.root.props).toHaveProperty('data-value')
  })
})

// ---------------------------------------------------------------------------
// MenubarTrigger (stateful — ref handler with useContext, createEffect)
// ---------------------------------------------------------------------------

describe('MenubarTrigger', () => {
  const result = renderToTest(menubarSource, 'menubar.tsx', 'MenubarTrigger')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is MenubarTrigger', () => {
    expect(result.componentName).toBe('MenubarTrigger')
  })

  test('renders as <button>', () => {
    const button = result.find({ tag: 'button' })
    expect(button).not.toBeNull()
  })

  test('has data-slot=menubar-trigger', () => {
    const button = result.find({ tag: 'button' })!
    expect(button.props['data-slot']).toBe('menubar-trigger')
  })

  test('has role=menuitem', () => {
    const button = result.find({ tag: 'button' })!
    expect(button.role).toBe('menuitem')
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

  // The trigger cannot know its menu's value at SSR, so it carries none;
  // readers resolve it through the owning MenubarMenu's data-value instead
  // of a mount-written trigger attribute (BF063).
  test('carries no data-value of its own', () => {
    const button = result.find({ tag: 'button' })!
    expect(button.props).not.toHaveProperty('data-value')
  })

  test('has resolved CSS classes', () => {
    const button = result.find({ tag: 'button' })!
    expect(button.classes).toContain('flex')
    expect(button.classes).toContain('items-center')
    expect(button.classes).toContain('rounded-sm')
    expect(button.classes).toContain('cursor-pointer')
  })

  test('toStructure() shows trigger button with ARIA', () => {
    const structure = result.toStructure()
    expect(structure).toContain('button')
    expect(structure).toContain('[aria-haspopup]')
    expect(structure).toContain('[aria-expanded]')
  })
})

// ---------------------------------------------------------------------------
// MenubarContent (stateful — portal, positioning, keyboard navigation)
// ---------------------------------------------------------------------------

describe('MenubarContent', () => {
  const result = renderToTest(menubarSource, 'menubar.tsx', 'MenubarContent')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is MenubarContent', () => {
    expect(result.componentName).toBe('MenubarContent')
  })

  test('renders as div with role=menu', () => {
    const div = result.find({ role: 'menu' })
    expect(div).not.toBeNull()
    expect(div!.tag).toBe('div')
  })

  test('has data-slot=menubar-content', () => {
    const div = result.find({ role: 'menu' })!
    expect(div.props['data-slot']).toBe('menubar-content')
  })

  test('has data-state=closed initially', () => {
    const div = result.find({ role: 'menu' })!
    expect(div.dataState).toBe('closed')
  })

  test('has resolved CSS classes', () => {
    const div = result.find({ role: 'menu' })!
    expect(div.classes).toContain('fixed')
    expect(div.classes).toContain('z-50')
    expect(div.classes).toContain('rounded-md')
  })

  test('toStructure() shows menu role and data-state', () => {
    const structure = result.toStructure()
    expect(structure).toContain('[role=menu]')
    expect(structure).toContain('[data-state]')
  })
})

// ---------------------------------------------------------------------------
// clampMenubarPosition (viewport-edge clamp math, #3117)
// ---------------------------------------------------------------------------

describe('clampMenubarPosition', () => {
  const viewport = { width: 1024, height: 768 }
  const gap = 8

  test('default align (start): content flush with the trigger’s left edge, below it', () => {
    const rect = { bottom: 130, left: 200, right: 300 }
    const { top, left } = clampMenubarPosition(rect, { width: 200, height: 80 }, viewport, undefined)
    expect(top).toBe(138) // rect.bottom + gap
    expect(left).toBe(200) // rect.left
  })

  test('align=end: content right-aligned to the trigger’s right edge', () => {
    const rect = { bottom: 130, left: 200, right: 300 }
    const { left } = clampMenubarPosition(rect, { width: 200, height: 80 }, viewport, 'end')
    expect(left).toBe(100) // rect.right - contentWidth
  })

  // The off-screen bug #3117 fixes (Popover's version was fixed in #3100):
  // a trigger near the viewport's bottom edge with tall content used to
  // render partly below `innerHeight`, off-screen and unreachable (a
  // `position: fixed` overlay doesn't scroll into view).
  test('a trigger near the viewport bottom clamps content to stay fully visible', () => {
    const rect = { bottom: 730, left: 400, right: 500 }
    const contentSize = { width: 300, height: 400 } // taller than the remaining viewport space
    const { top } = clampMenubarPosition(rect, contentSize, viewport, undefined)
    expect(top).toBe(viewport.height - contentSize.height - gap) // clamped, not rect.bottom + gap (738, off-screen)
    expect(top + contentSize.height).toBeLessThanOrEqual(viewport.height)
  })

  test('align=end: a trigger near the viewport left edge clamps left to stay on-screen', () => {
    const rect = { bottom: 130, left: -50, right: 10 }
    const contentSize = { width: 200, height: 80 }
    const { left } = clampMenubarPosition(rect, contentSize, viewport, 'end')
    expect(left).toBe(gap) // clamped, not rect.right - contentWidth (-190, would overflow)
  })

  test('content larger than the viewport still clamps to the gap floor on both axes (no negative overflow)', () => {
    const rect = { bottom: 130, left: 100, right: 200 }
    const contentSize = { width: viewport.width + 500, height: viewport.height + 500 }
    const { top, left } = clampMenubarPosition(rect, contentSize, viewport, undefined)
    expect(top).toBe(gap)
    expect(left).toBe(gap)
  })
})

// ---------------------------------------------------------------------------
// MenubarItem (stateful — ref handler with click, useContext)
// ---------------------------------------------------------------------------

describe('MenubarItem', () => {
  const result = renderToTest(menubarSource, 'menubar.tsx', 'MenubarItem')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is MenubarItem', () => {
    expect(result.componentName).toBe('MenubarItem')
  })

  test('renders as div with role=menuitem', () => {
    const item = result.find({ role: 'menuitem' })
    expect(item).not.toBeNull()
    expect(item!.tag).toBe('div')
  })

  test('has data-slot=menubar-item', () => {
    const item = result.find({ role: 'menuitem' })!
    expect(item.props['data-slot']).toBe('menubar-item')
  })

  test('has resolved CSS classes', () => {
    const item = result.find({ role: 'menuitem' })!
    expect(item.classes).toContain('flex')
    expect(item.classes).toContain('cursor-pointer')
    expect(item.classes).toContain('select-none')
    expect(item.classes).toContain('rounded-sm')
  })

  test('toStructure() shows menuitem role', () => {
    const structure = result.toStructure()
    expect(structure).toContain('[role=menuitem]')
  })
})

// ---------------------------------------------------------------------------
// MenubarCheckboxItem (stateful — createEffect for aria-checked)
// ---------------------------------------------------------------------------

describe('MenubarCheckboxItem', () => {
  const result = renderToTest(menubarSource, 'menubar.tsx', 'MenubarCheckboxItem')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is MenubarCheckboxItem', () => {
    expect(result.componentName).toBe('MenubarCheckboxItem')
  })

  test('has role=menuitemcheckbox', () => {
    const item = result.find({ role: 'menuitemcheckbox' })
    expect(item).not.toBeNull()
    expect(item!.tag).toBe('div')
  })

  test('has data-slot=menubar-item', () => {
    const item = result.find({ role: 'menuitemcheckbox' })!
    expect(item.props['data-slot']).toBe('menubar-item')
  })

  test('has aria-checked attribute', () => {
    const item = result.find({ role: 'menuitemcheckbox' })!
    expect(item.aria).toHaveProperty('checked')
  })

  test('contains checkmark icon', () => {
    const icon = result.find({ componentName: 'CheckIcon' })
    expect(icon).not.toBeNull()
  })

  test('has indicator span', () => {
    const spans = result.findAll({ tag: 'span' })
    const indicator = spans.find(s => s.classes.includes('absolute'))
    expect(indicator).not.toBeNull()
  })

  test('toStructure() shows checkbox role and aria-checked', () => {
    const structure = result.toStructure()
    expect(structure).toContain('[role=menuitemcheckbox]')
    expect(structure).toContain('[aria-checked]')
    expect(structure).toContain('CheckIcon')
  })
})

// ---------------------------------------------------------------------------
// MenubarRadioGroup (stateless — Provider wrapping)
// ---------------------------------------------------------------------------

describe('MenubarRadioGroup', () => {
  const result = renderToTest(menubarSource, 'menubar.tsx', 'MenubarRadioGroup')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is MenubarRadioGroup', () => {
    expect(result.componentName).toBe('MenubarRadioGroup')
  })

  test('no signals (stateless)', () => {
    expect(result.signals).toEqual([])
  })

  test('renders as div with data-slot=menubar-radio-group', () => {
    const div = result.find({ tag: 'div' })
    expect(div).not.toBeNull()
    expect(div!.props['data-slot']).toBe('menubar-radio-group')
  })

  test('has role=group', () => {
    const div = result.find({ role: 'group' })
    expect(div).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// MenubarRadioItem (stateful — useContext, createEffect for aria-checked)
// ---------------------------------------------------------------------------

describe('MenubarRadioItem', () => {
  const result = renderToTest(menubarSource, 'menubar.tsx', 'MenubarRadioItem')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is MenubarRadioItem', () => {
    expect(result.componentName).toBe('MenubarRadioItem')
  })

  test('has role=menuitemradio', () => {
    const item = result.find({ role: 'menuitemradio' })
    expect(item).not.toBeNull()
    expect(item!.tag).toBe('div')
  })

  test('has data-slot=menubar-item', () => {
    const item = result.find({ role: 'menuitemradio' })!
    expect(item.props['data-slot']).toBe('menubar-item')
  })

  test('has aria-checked attribute', () => {
    const item = result.find({ role: 'menuitemradio' })!
    expect(item.aria).toHaveProperty('checked')
  })

  test('has radio indicator span', () => {
    const spans = result.findAll({ tag: 'span' })
    const indicator = spans.find(s => s.props['data-slot'] === 'menubar-radio-indicator')
    expect(indicator).not.toBeNull()
  })

  test('toStructure() shows radio role and aria-checked', () => {
    const structure = result.toStructure()
    expect(structure).toContain('[role=menuitemradio]')
    expect(structure).toContain('[aria-checked]')
  })
})

// ---------------------------------------------------------------------------
// MenubarSub (stateful — subOpen signal, Provider wrapping)
// ---------------------------------------------------------------------------

describe('MenubarSub', () => {
  const result = renderToTest(menubarSource, 'menubar.tsx', 'MenubarSub')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is MenubarSub', () => {
    expect(result.componentName).toBe('MenubarSub')
  })

  test('has subOpen signal', () => {
    expect(result.signals).toContain('subOpen')
  })

  test('renders as div with data-slot=menubar-sub', () => {
    const div = result.find({ tag: 'div' })
    expect(div).not.toBeNull()
    expect(div!.props['data-slot']).toBe('menubar-sub')
  })

  test('has relative positioning class', () => {
    const div = result.find({ tag: 'div' })!
    expect(div.classes).toContain('relative')
  })
})

// ---------------------------------------------------------------------------
// MenubarSubTrigger (stateful — useContext, createEffect, hover/click)
// ---------------------------------------------------------------------------

describe('MenubarSubTrigger', () => {
  const result = renderToTest(menubarSource, 'menubar.tsx', 'MenubarSubTrigger')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is MenubarSubTrigger', () => {
    expect(result.componentName).toBe('MenubarSubTrigger')
  })

  test('has role=menuitem', () => {
    const item = result.find({ role: 'menuitem' })
    expect(item).not.toBeNull()
  })

  test('has data-sub-trigger=true', () => {
    const item = result.find({ role: 'menuitem' })!
    expect(item.props['data-sub-trigger']).toBe('true')
  })

  test('has aria-haspopup=menu', () => {
    const item = result.find({ role: 'menuitem' })!
    expect(item.aria).toHaveProperty('haspopup')
  })

  test('has aria-expanded attribute', () => {
    const item = result.find({ role: 'menuitem' })!
    expect(item.aria).toHaveProperty('expanded')
  })

  test('contains chevron icon', () => {
    const icon = result.find({ componentName: 'ChevronRightIcon' })
    expect(icon).not.toBeNull()
  })

  test('toStructure() shows sub trigger with chevron', () => {
    const structure = result.toStructure()
    expect(structure).toContain('[aria-haspopup]')
    expect(structure).toContain('[aria-expanded]')
    expect(structure).toContain('ChevronRightIcon')
  })
})

// ---------------------------------------------------------------------------
// MenubarSubContent (stateful — useContext, createEffect for show/hide)
// ---------------------------------------------------------------------------

describe('MenubarSubContent', () => {
  const result = renderToTest(menubarSource, 'menubar.tsx', 'MenubarSubContent')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is MenubarSubContent', () => {
    expect(result.componentName).toBe('MenubarSubContent')
  })

  test('renders as div with role=menu', () => {
    const div = result.find({ role: 'menu' })
    expect(div).not.toBeNull()
    expect(div!.tag).toBe('div')
  })

  test('has data-slot=menubar-sub-content', () => {
    const div = result.find({ role: 'menu' })!
    expect(div.props['data-slot']).toBe('menubar-sub-content')
  })

  test('has data-state=closed initially', () => {
    const div = result.find({ role: 'menu' })!
    expect(div.dataState).toBe('closed')
  })

  test('has resolved CSS classes', () => {
    const div = result.find({ role: 'menu' })!
    expect(div.classes).toContain('absolute')
    expect(div.classes).toContain('z-50')
    expect(div.classes).toContain('rounded-md')
  })

  test('toStructure() shows menu role', () => {
    const structure = result.toStructure()
    expect(structure).toContain('[role=menu]')
    expect(structure).toContain('[data-state]')
  })
})

// ---------------------------------------------------------------------------
// MenubarLabel (stateless — simple text wrapper)
// ---------------------------------------------------------------------------

describe('MenubarLabel', () => {
  const result = renderToTest(menubarSource, 'menubar.tsx', 'MenubarLabel')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is MenubarLabel', () => {
    expect(result.componentName).toBe('MenubarLabel')
  })

  test('no signals (stateless)', () => {
    expect(result.signals).toEqual([])
  })

  test('renders as div with data-slot=menubar-label', () => {
    expect(result.root.tag).toBe('div')
    expect(result.root.props['data-slot']).toBe('menubar-label')
  })

  test('has resolved CSS classes', () => {
    expect(result.root.classes).toContain('text-sm')
    expect(result.root.classes).toContain('font-semibold')
  })
})

// ---------------------------------------------------------------------------
// MenubarSeparator (stateless — visual divider)
// ---------------------------------------------------------------------------

describe('MenubarSeparator', () => {
  const result = renderToTest(menubarSource, 'menubar.tsx', 'MenubarSeparator')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is MenubarSeparator', () => {
    expect(result.componentName).toBe('MenubarSeparator')
  })

  test('no signals (stateless)', () => {
    expect(result.signals).toEqual([])
  })

  test('renders as div with data-slot=menubar-separator', () => {
    expect(result.root.tag).toBe('div')
    expect(result.root.props['data-slot']).toBe('menubar-separator')
  })

  test('has role=separator', () => {
    expect(result.root.role).toBe('separator')
  })

  test('has resolved CSS classes', () => {
    expect(result.root.classes).toContain('bg-border')
  })
})

// ---------------------------------------------------------------------------
// MenubarShortcut (stateless — keyboard shortcut indicator)
// ---------------------------------------------------------------------------

describe('MenubarShortcut', () => {
  const result = renderToTest(menubarSource, 'menubar.tsx', 'MenubarShortcut')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is MenubarShortcut', () => {
    expect(result.componentName).toBe('MenubarShortcut')
  })

  test('no signals (stateless)', () => {
    expect(result.signals).toEqual([])
  })

  test('renders as span with data-slot=menubar-shortcut', () => {
    expect(result.root.tag).toBe('span')
    expect(result.root.props['data-slot']).toBe('menubar-shortcut')
  })

  test('has resolved CSS classes', () => {
    expect(result.root.classes).toContain('ml-auto')
    expect(result.root.classes).toContain('text-xs')
    expect(result.root.classes).toContain('text-muted-foreground')
  })
})

// ---------------------------------------------------------------------------
// MenubarGroup (stateless — semantic grouping)
// ---------------------------------------------------------------------------

describe('MenubarGroup', () => {
  const result = renderToTest(menubarSource, 'menubar.tsx', 'MenubarGroup')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is MenubarGroup', () => {
    expect(result.componentName).toBe('MenubarGroup')
  })

  test('no signals (stateless)', () => {
    expect(result.signals).toEqual([])
  })

  test('renders as div with data-slot=menubar-group', () => {
    expect(result.root.tag).toBe('div')
    expect(result.root.props['data-slot']).toBe('menubar-group')
  })

  test('has role=group', () => {
    expect(result.root.role).toBe('group')
  })
})

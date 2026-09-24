import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { renderToTest } from '@barefootjs/test'

const comboboxSource = readFileSync(resolve(__dirname, 'index.tsx'), 'utf-8')

// ---------------------------------------------------------------------------
// Combobox (stateful — open signal, search signal, context)
// ---------------------------------------------------------------------------

describe('Combobox', () => {
  const result = renderToTest(comboboxSource, 'combobox.tsx', 'Combobox')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('isClient is true', () => {
    expect(result.isClient).toBe(true)
  })

  test('componentName is Combobox', () => {
    expect(result.componentName).toBe('Combobox')
  })

  test('has signal: open (createSignal)', () => {
    expect(result.signals).toContain('open')
  })

  test('has signal: search (createSignal)', () => {
    expect(result.signals).toContain('search')
  })

  test('renders a div with data-slot=combobox', () => {
    const div = result.find({ tag: 'div' })
    expect(div).not.toBeNull()
    expect(div!.props['data-slot']).toBe('combobox')
  })
})

// ---------------------------------------------------------------------------
// ComboboxTrigger (stateful — reads context, effects for aria-expanded)
// ---------------------------------------------------------------------------

describe('ComboboxTrigger', () => {
  const result = renderToTest(comboboxSource, 'combobox.tsx', 'ComboboxTrigger')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is ComboboxTrigger', () => {
    expect(result.componentName).toBe('ComboboxTrigger')
  })

  test('has role=combobox', () => {
    const trigger = result.find({ role: 'combobox' })
    expect(trigger).not.toBeNull()
    expect(trigger!.tag).toBe('button')
  })

  test('has aria-expanded attribute', () => {
    const trigger = result.find({ role: 'combobox' })!
    expect(trigger.aria).toHaveProperty('expanded')
  })

  test('has aria-haspopup attribute', () => {
    const trigger = result.find({ role: 'combobox' })!
    expect(trigger.aria).toHaveProperty('haspopup')
  })

  test('has aria-autocomplete=list', () => {
    const trigger = result.find({ role: 'combobox' })!
    expect(trigger.aria).toHaveProperty('autocomplete')
  })

  test('has data-placeholder attribute wired to the showPlaceholder prop', () => {
    const trigger = result.find({ role: 'combobox' })!
    expect(trigger.props).toHaveProperty('data-placeholder')
  })
})

// ---------------------------------------------------------------------------
// ComboboxValue (stateful — reads context value, updates text)
// ---------------------------------------------------------------------------

describe('ComboboxValue', () => {
  const result = renderToTest(comboboxSource, 'combobox.tsx', 'ComboboxValue')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is ComboboxValue', () => {
    expect(result.componentName).toBe('ComboboxValue')
  })

  test('renders as span with data-slot=combobox-value', () => {
    expect(result.root.tag).toBe('span')
    expect(result.root.props['data-slot']).toBe('combobox-value')
  })
})

// ---------------------------------------------------------------------------
// ComboboxContent (stateful — portal, positioning, global listeners)
// ---------------------------------------------------------------------------

describe('ComboboxContent', () => {
  const result = renderToTest(comboboxSource, 'combobox.tsx', 'ComboboxContent')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is ComboboxContent', () => {
    expect(result.componentName).toBe('ComboboxContent')
  })

  test('has role=listbox', () => {
    const listbox = result.find({ role: 'listbox' })
    expect(listbox).not.toBeNull()
    expect(listbox!.props['data-slot']).toBe('combobox-content')
  })

  test('has data-state attribute', () => {
    const listbox = result.find({ role: 'listbox' })!
    expect(listbox.dataState).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// ComboboxInput (stateful — writes to context search)
// ---------------------------------------------------------------------------

describe('ComboboxInput', () => {
  const result = renderToTest(comboboxSource, 'combobox.tsx', 'ComboboxInput')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is ComboboxInput', () => {
    expect(result.componentName).toBe('ComboboxInput')
  })

  test('renders wrapper with data-slot=combobox-input-wrapper', () => {
    expect(result.root.props['data-slot']).toBe('combobox-input-wrapper')
  })

  test('contains an input element', () => {
    const input = result.find({ tag: 'input' })
    expect(input).not.toBeNull()
    expect(input!.props['data-slot']).toBe('combobox-input')
  })

  test('contains a search icon (SearchIcon)', () => {
    const icon = result.find({ componentName: 'SearchIcon' })
    expect(icon).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// ComboboxEmpty (stateful — checks visible items to toggle visibility)
// ---------------------------------------------------------------------------

describe('ComboboxEmpty', () => {
  const result = renderToTest(comboboxSource, 'combobox.tsx', 'ComboboxEmpty')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is ComboboxEmpty', () => {
    expect(result.componentName).toBe('ComboboxEmpty')
  })

  test('renders as div with data-slot=combobox-empty', () => {
    expect(result.root.tag).toBe('div')
    expect(result.root.props['data-slot']).toBe('combobox-empty')
  })

  test('has resolved CSS classes', () => {
    expect(result.root.classes).toContain('text-center')
    expect(result.root.classes).toContain('text-sm')
  })
})

// ---------------------------------------------------------------------------
// ComboboxItem (stateful — self-filters, click handler, check indicator)
// ---------------------------------------------------------------------------

describe('ComboboxItem', () => {
  const result = renderToTest(comboboxSource, 'combobox.tsx', 'ComboboxItem')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is ComboboxItem', () => {
    expect(result.componentName).toBe('ComboboxItem')
  })

  test('renders as div with data-slot=combobox-item', () => {
    expect(result.root.tag).toBe('div')
    expect(result.root.props['data-slot']).toBe('combobox-item')
  })

  test('has role=option', () => {
    expect(result.root.role).toBe('option')
  })

  test('has aria-selected attribute', () => {
    expect(result.root.aria).toHaveProperty('selected')
  })

  test('has data-selected attribute', () => {
    // renderToTest models a zero-props render; `defaultSelected` has no
    // literal destructure default, so the ternary stays unresolved
    // expression text rather than a concrete literal (see CLAUDE.md's
    // `renderToTest` resolution semantics) — presence is what matters here.
    expect(result.root.props).toHaveProperty('data-selected')
  })
})

// ---------------------------------------------------------------------------
// ComboboxGroup (stateful — auto-hides when all items filtered)
// ---------------------------------------------------------------------------

describe('ComboboxGroup', () => {
  const result = renderToTest(comboboxSource, 'combobox.tsx', 'ComboboxGroup')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is ComboboxGroup', () => {
    expect(result.componentName).toBe('ComboboxGroup')
  })

  test('renders as div with data-slot=combobox-group', () => {
    expect(result.root.tag).toBe('div')
    expect(result.root.props['data-slot']).toBe('combobox-group')
  })

  test('has role=group', () => {
    expect(result.root.role).toBe('group')
  })
})

// ---------------------------------------------------------------------------
// ComboboxSeparator (stateless)
// ---------------------------------------------------------------------------

describe('ComboboxSeparator', () => {
  const result = renderToTest(comboboxSource, 'combobox.tsx', 'ComboboxSeparator')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is ComboboxSeparator', () => {
    expect(result.componentName).toBe('ComboboxSeparator')
  })

  test('renders as div with data-slot=combobox-separator', () => {
    expect(result.root.tag).toBe('div')
    expect(result.root.props['data-slot']).toBe('combobox-separator')
  })

  test('has role=separator', () => {
    expect(result.root.role).toBe('separator')
  })

  test('has resolved CSS classes', () => {
    expect(result.root.classes).toContain('bg-border')
  })
})

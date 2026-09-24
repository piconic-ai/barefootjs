import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { renderToTest } from '@barefootjs/test'

const commandSource = readFileSync(resolve(__dirname, 'index.tsx'), 'utf-8')

// ---------------------------------------------------------------------------
// Command (stateful — search signal, selected signal, keyboard nav, context)
// ---------------------------------------------------------------------------

describe('Command', () => {
  const result = renderToTest(commandSource, 'command.tsx', 'Command')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is Command', () => {
    expect(result.componentName).toBe('Command')
  })

  test('renders as Provider wrapping a div', () => {
    // The root is Provider, find the div inside
    const div = result.find({ tag: 'div' })
    expect(div).not.toBeNull()
    expect(div!.props['data-slot']).toBe('command')
  })

  test('has resolved CSS classes', () => {
    const div = result.find({ tag: 'div' })!
    expect(div.classes).toContain('flex')
    expect(div.classes).toContain('flex-col')
    expect(div.classes).toContain('overflow-hidden')
  })
})

// ---------------------------------------------------------------------------
// CommandInput (stateful — writes to context search signal)
// ---------------------------------------------------------------------------

describe('CommandInput', () => {
  const result = renderToTest(commandSource, 'command.tsx', 'CommandInput')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is CommandInput', () => {
    expect(result.componentName).toBe('CommandInput')
  })

  test('renders wrapper with data-slot=command-input-wrapper', () => {
    expect(result.root.props['data-slot']).toBe('command-input-wrapper')
  })

  test('contains an input element', () => {
    const input = result.find({ tag: 'input' })
    expect(input).not.toBeNull()
    expect(input!.props['data-slot']).toBe('command-input')
  })

  test('contains a search icon (SearchIcon)', () => {
    const icon = result.find({ componentName: 'SearchIcon' })
    expect(icon).not.toBeNull()
  })

  test('input has resolved CSS classes', () => {
    const input = result.find({ tag: 'input' })!
    expect(input.classes).toContain('text-sm')
    expect(input.classes).toContain('bg-transparent')
  })
})

// ---------------------------------------------------------------------------
// CommandList (stateless — scrollable container)
// ---------------------------------------------------------------------------

describe('CommandList', () => {
  const result = renderToTest(commandSource, 'command.tsx', 'CommandList')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is CommandList', () => {
    expect(result.componentName).toBe('CommandList')
  })

  test('renders as div with data-slot=command-list', () => {
    expect(result.root.tag).toBe('div')
    expect(result.root.props['data-slot']).toBe('command-list')
  })

  test('has role=listbox', () => {
    expect(result.root.role).toBe('listbox')
  })

  test('has resolved CSS classes', () => {
    expect(result.root.classes).toContain('overflow-y-auto')
  })
})

// ---------------------------------------------------------------------------
// CommandEmpty (stateful — checks visible items to toggle visibility)
// ---------------------------------------------------------------------------

describe('CommandEmpty', () => {
  const result = renderToTest(commandSource, 'command.tsx', 'CommandEmpty')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is CommandEmpty', () => {
    expect(result.componentName).toBe('CommandEmpty')
  })

  test('renders as div with data-slot=command-empty', () => {
    expect(result.root.tag).toBe('div')
    expect(result.root.props['data-slot']).toBe('command-empty')
  })

  test('has resolved CSS classes', () => {
    expect(result.root.classes).toContain('text-center')
    expect(result.root.classes).toContain('text-sm')
  })
})

// ---------------------------------------------------------------------------
// CommandGroup (stateful — auto-hides when all items filtered)
// ---------------------------------------------------------------------------

describe('CommandGroup', () => {
  const result = renderToTest(commandSource, 'command.tsx', 'CommandGroup')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is CommandGroup', () => {
    expect(result.componentName).toBe('CommandGroup')
  })

  test('renders as div with data-slot=command-group', () => {
    expect(result.root.tag).toBe('div')
    expect(result.root.props['data-slot']).toBe('command-group')
  })

  test('has role=group', () => {
    expect(result.root.role).toBe('group')
  })

  test('has resolved CSS classes', () => {
    expect(result.root.classes).toContain('overflow-hidden')
    expect(result.root.classes).toContain('p-1')
  })
})

// ---------------------------------------------------------------------------
// CommandItem (stateful — self-filters, selected highlight, click handler)
// ---------------------------------------------------------------------------

describe('CommandItem', () => {
  const result = renderToTest(commandSource, 'command.tsx', 'CommandItem')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is CommandItem', () => {
    expect(result.componentName).toBe('CommandItem')
  })

  test('renders as div with data-slot=command-item', () => {
    expect(result.root.tag).toBe('div')
    expect(result.root.props['data-slot']).toBe('command-item')
  })

  test('has role=option', () => {
    expect(result.root.role).toBe('option')
  })

  test('has data-selected attribute', () => {
    // renderToTest models a zero-props render; `defaultSelected` has no
    // literal destructure default, so the ternary stays unresolved
    // expression text rather than a concrete literal (see CLAUDE.md's
    // `renderToTest` resolution semantics) — presence is what matters here.
    expect(result.root.props).toHaveProperty('data-selected')
  })

  test('has data-value attribute wired to the value prop', () => {
    expect(result.root.props).toHaveProperty('data-value')
  })

  test('has resolved CSS classes', () => {
    expect(result.root.classes).toContain('flex')
    expect(result.root.classes).toContain('items-center')
    expect(result.root.classes).toContain('rounded-sm')
    expect(result.root.classes).toContain('text-sm')
  })
})

// ---------------------------------------------------------------------------
// CommandSeparator (stateless)
// ---------------------------------------------------------------------------

describe('CommandSeparator', () => {
  const result = renderToTest(commandSource, 'command.tsx', 'CommandSeparator')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is CommandSeparator', () => {
    expect(result.componentName).toBe('CommandSeparator')
  })

  test('renders as div with data-slot=command-separator', () => {
    expect(result.root.tag).toBe('div')
    expect(result.root.props['data-slot']).toBe('command-separator')
  })

  test('has role=separator', () => {
    expect(result.root.role).toBe('separator')
  })

  test('has resolved CSS classes', () => {
    expect(result.root.classes).toContain('bg-border')
  })
})

// ---------------------------------------------------------------------------
// CommandShortcut (stateless)
// ---------------------------------------------------------------------------

describe('CommandShortcut', () => {
  const result = renderToTest(commandSource, 'command.tsx', 'CommandShortcut')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is CommandShortcut', () => {
    expect(result.componentName).toBe('CommandShortcut')
  })

  test('renders as span with data-slot=command-shortcut', () => {
    expect(result.root.tag).toBe('span')
    expect(result.root.props['data-slot']).toBe('command-shortcut')
  })

  test('has resolved CSS classes', () => {
    expect(result.root.classes).toContain('ml-auto')
    expect(result.root.classes).toContain('text-xs')
    expect(result.root.classes).toContain('tracking-widest')
  })
})

import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { renderToTest } from '@barefootjs/test'

const toggleGroupSource = readFileSync(resolve(__dirname, 'index.tsx'), 'utf-8')

describe('ToggleGroup', () => {
  const result = renderToTest(toggleGroupSource, 'toggle-group.tsx', 'ToggleGroup')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('isClient is true', () => {
    expect(result.isClient).toBe(true)
  })

  test('componentName is ToggleGroup', () => {
    expect(result.componentName).toBe('ToggleGroup')
  })

  test('has signals: internalValue, controlledValue (createSignal)', () => {
    expect(result.signals).toContain('internalValue')
    expect(result.signals).toContain('controlledValue')
  })

  test('isControlled and currentValue are memos, not in signals', () => {
    expect(result.memos).toContain('isControlled')
    expect(result.memos).toContain('currentValue')
    expect(result.signals).not.toContain('isControlled')
    expect(result.signals).not.toContain('currentValue')
  })

  test('has role=group', () => {
    const group = result.find({ role: 'group' })
    expect(group).not.toBeNull()
  })

  test('root div has data-slot=toggle-group', () => {
    const div = result.find({ tag: 'div' })
    expect(div!.props['data-slot']).toBe('toggle-group')
  })
})

describe('ToggleGroupItem', () => {
  const result = renderToTest(toggleGroupSource, 'toggle-group.tsx', 'ToggleGroupItem')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is ToggleGroupItem', () => {
    expect(result.componentName).toBe('ToggleGroupItem')
  })

  test('renders as <button>', () => {
    const button = result.find({ tag: 'button' })
    expect(button).not.toBeNull()
  })

  test('has aria-pressed attribute', () => {
    const button = result.find({ tag: 'button' })!
    expect(button.aria).toHaveProperty('pressed')
  })

  test('has data-state attribute', () => {
    const button = result.find({ tag: 'button' })!
    expect(button.dataState).not.toBeNull()
  })

  // An item cannot know its group's variant/size at SSR (context is
  // client-only), so its styling keys off the group root's own
  // `data-variant` / `data-size` rather than item attributes a mount ref
  // would add at hydration (BF063).
  test('variant/size styling keys off the group root, not item data attributes', () => {
    const button = result.find({ tag: 'button' })!
    expect(button.classes).toContain('group-data-[variant=outline]/toggle-group:border')
    expect(button.classes).toContain('group-data-[size=sm]/toggle-group:h-8')
    expect(button.classes).toContain('group-data-[size=lg]/toggle-group:h-10')
    expect(button.classes.filter(c => c.startsWith('data-[variant=') || c.startsWith('data-[size='))).toEqual([])
    expect(button.props).not.toHaveProperty('data-variant')
    expect(button.props).not.toHaveProperty('data-size')
  })
})

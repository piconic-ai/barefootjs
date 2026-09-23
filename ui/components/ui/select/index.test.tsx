import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { renderToTest } from '@barefootjs/test'

const selectSource = readFileSync(resolve(__dirname, 'index.tsx'), 'utf-8')

describe('Select', () => {
  const result = renderToTest(selectSource, 'select.tsx', 'Select')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('isClient is true', () => {
    expect(result.isClient).toBe(true)
  })

  test('componentName is Select', () => {
    expect(result.componentName).toBe('Select')
  })

  test('has signal: open (createSignal)', () => {
    expect(result.signals).toContain('open')
  })

  test('renders a div with data-slot=select', () => {
    const div = result.find({ tag: 'div' })
    expect(div).not.toBeNull()
    expect(div!.props['data-slot']).toBe('select')
  })
})

describe('SelectTrigger', () => {
  const result = renderToTest(selectSource, 'select.tsx', 'SelectTrigger')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is SelectTrigger', () => {
    expect(result.componentName).toBe('SelectTrigger')
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

  test('has data-placeholder attribute wired to the showPlaceholder prop', () => {
    const trigger = result.find({ role: 'combobox' })!
    expect(trigger.props).toHaveProperty('data-placeholder')
  })
})

describe('SelectContent', () => {
  const result = renderToTest(selectSource, 'select.tsx', 'SelectContent')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is SelectContent', () => {
    expect(result.componentName).toBe('SelectContent')
  })

  test('has role=listbox', () => {
    const listbox = result.find({ role: 'listbox' })
    expect(listbox).not.toBeNull()
    expect(listbox!.props['data-slot']).toBe('select-content')
  })

  test('has data-state attribute', () => {
    const listbox = result.find({ role: 'listbox' })!
    expect(listbox.dataState).not.toBeNull()
  })
})

describe('SelectItem', () => {
  const result = renderToTest(selectSource, 'select.tsx', 'SelectItem')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is SelectItem', () => {
    expect(result.componentName).toBe('SelectItem')
  })

  test('has role=option', () => {
    const option = result.find({ role: 'option' })
    expect(option).not.toBeNull()
    expect(option!.props['data-slot']).toBe('select-item')
  })

  test('has aria-selected attribute', () => {
    const option = result.find({ role: 'option' })!
    expect(option.aria).toHaveProperty('selected')
  })

})

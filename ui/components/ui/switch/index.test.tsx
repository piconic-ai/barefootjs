import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { renderToTest } from '@barefootjs/test'

const switchSource = readFileSync(resolve(__dirname, 'index.tsx'), 'utf-8')

describe('Switch', () => {
  const result = renderToTest(switchSource, 'switch.tsx', 'Switch')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('isClient is true', () => {
    expect(result.isClient).toBe(true)
  })

  test('componentName is Switch', () => {
    expect(result.componentName).toBe('Switch')
  })

  test('has signals: internalChecked, controlledChecked', () => {
    expect(result.signals).toContain('internalChecked')
    expect(result.signals).toContain('controlledChecked')
  })

  test('has button with role=switch', () => {
    const button = result.find({ role: 'switch' })
    expect(button).not.toBeNull()
    expect(button!.tag).toBe('button')
  })

  test('button has aria-checked attribute', () => {
    const button = result.find({ role: 'switch' })!
    expect(button.aria).toHaveProperty('checked')
  })

  test('button has data-state attribute', () => {
    const button = result.find({ role: 'switch' })!
    expect(button.dataState).not.toBeNull()
  })

  test('button has click event handler', () => {
    const button = result.find({ role: 'switch' })!
    expect(button.events).toContain('click')
  })

  test('click handler wires to checked setters via handleClick', () => {
    const button = result.find({ role: 'switch' })!
    // The onClick handler routes through the local `handleClick` function,
    // which updates either the controlled or uncontrolled checked signal.
    expect(button.onClick).toBeDefined()
    expect(button.onClick!.via).toContain('handleClick')
    expect(button.onClick!.setters).toContain('setInternalChecked')
    expect(button.onClick!.setters).toContain('setControlledChecked')
  })

  test('has span with data-slot=switch-thumb', () => {
    const thumb = result.find({ tag: 'span' })
    expect(thumb).not.toBeNull()
    expect(thumb!.props['data-slot']).toBe('switch-thumb')
  })

  test('toStructure() contains switch role and aria-checked', () => {
    const structure = result.toStructure()
    expect(structure).toContain('switch')
    expect(structure).toContain('aria-checked')
  })
})

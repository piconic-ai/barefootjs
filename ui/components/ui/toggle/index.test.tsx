import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { renderToTest } from '@barefootjs/test'

const toggleSource = readFileSync(resolve(__dirname, 'index.tsx'), 'utf-8')

describe('Toggle', () => {
  const result = renderToTest(toggleSource, 'toggle.tsx', 'Toggle')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('isClient is true', () => {
    expect(result.isClient).toBe(true)
  })

  test('componentName is Toggle', () => {
    expect(result.componentName).toBe('Toggle')
  })

  test('has signals: internalPressed, controlledPressed', () => {
    expect(result.signals).toContain('internalPressed')
    expect(result.signals).toContain('controlledPressed')
  })

  test('root tag is button', () => {
    expect(result.root.tag).toBe('button')
  })

  test('root has data-slot=toggle', () => {
    expect(result.root.props['data-slot']).toBe('toggle')
  })

  test('root has aria-pressed attribute', () => {
    expect(result.root.aria).toHaveProperty('pressed')
  })

  test('root has data-state attribute', () => {
    expect(result.root.dataState).not.toBeNull()
  })

  test('root has click event handler', () => {
    expect(result.root.events).toContain('click')
  })

  test('click handler wires to pressed setters via handleClick', () => {
    expect(result.root.onClick).toBeDefined()
    expect(result.root.onClick!.via).toContain('handleClick')
    expect(result.root.onClick!.setters).toContain('setInternalPressed')
    expect(result.root.onClick!.setters).toContain('setControlledPressed')
  })

  test('root classes are dynamic (reactive memo)', () => {
    // classes are wrapped in createMemo for variant/size reactivity,
    // so the IR sees the expression rather than resolved static classes
    expect(result.root.classes.length).toBeGreaterThan(0)
  })
})

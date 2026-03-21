import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { renderToTest } from '@barefootjs/test'

const kbdSource = readFileSync(resolve(__dirname, 'index.tsx'), 'utf-8')

describe('Kbd', () => {
  const result = renderToTest(kbdSource, 'kbd.tsx', 'Kbd')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is Kbd', () => {
    expect(result.componentName).toBe('Kbd')
  })

  test('no signals (stateless)', () => {
    expect(result.signals).toEqual([])
  })

  test('root is conditional (asChild branch)', () => {
    expect(result.root.type).toBe('conditional')
  })

  test('contains a kbd element with data-slot=kbd', () => {
    const kbd = result.find({ tag: 'kbd' })
    expect(kbd).not.toBeNull()
    expect(kbd!.props['data-slot']).toBe('kbd')
  })

  test('has resolved base CSS classes', () => {
    const kbd = result.find({ tag: 'kbd' })!
    expect(kbd.classes).toContain('inline-flex')
    expect(kbd.classes).toContain('items-center')
    expect(kbd.classes).toContain('rounded-sm')
  })

  test('contains Slot component for asChild', () => {
    const slot = result.find({ componentName: 'Slot' })
    expect(slot).not.toBeNull()
  })
})

describe('KbdGroup', () => {
  const result = renderToTest(kbdSource, 'kbd.tsx', 'KbdGroup')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is KbdGroup', () => {
    expect(result.componentName).toBe('KbdGroup')
  })

  test('no signals (stateless)', () => {
    expect(result.signals).toEqual([])
  })

  test('root is conditional (asChild branch)', () => {
    expect(result.root.type).toBe('conditional')
  })

  test('contains a kbd element with data-slot=kbd-group', () => {
    const kbd = result.find({ tag: 'kbd' })
    expect(kbd).not.toBeNull()
    expect(kbd!.props['data-slot']).toBe('kbd-group')
  })

  test('has resolved base CSS classes', () => {
    const kbd = result.find({ tag: 'kbd' })!
    expect(kbd.classes).toContain('inline-flex')
    expect(kbd.classes).toContain('items-center')
    expect(kbd.classes).toContain('gap-1')
  })

  test('contains Slot component for asChild', () => {
    const slot = result.find({ componentName: 'Slot' })
    expect(slot).not.toBeNull()
  })
})

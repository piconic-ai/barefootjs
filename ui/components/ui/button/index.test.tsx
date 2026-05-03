import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { renderToTest } from '@barefootjs/test'

const buttonSource = readFileSync(resolve(__dirname, 'index.tsx'), 'utf-8')

describe('Button', () => {
  const result = renderToTest(buttonSource, 'button.tsx')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('isClient is true', () => {
    expect(result.isClient).toBe(true)
  })

  test('componentName is Button', () => {
    expect(result.componentName).toBe('Button')
  })

  test('no signals (stateless component)', () => {
    expect(result.signals).toEqual([])
  })

  test('root is an if-statement (asChild branch)', () => {
    // Button has: if (asChild) return <Slot ...>; return <button ...>
    expect(result.root.type).toBe('conditional')
  })

  test('contains a <button> element', () => {
    const button = result.find({ tag: 'button' })
    expect(button).not.toBeNull()
  })

  test('button has resolved base classes from constants', () => {
    const button = result.find({ tag: 'button' })!
    // Constants are resolved: baseClasses string is expanded,
    // variantClasses[variant] and sizeClasses[size] are unresolvable (skipped)
    expect(button.classes).toContain('inline-flex')
    expect(button.classes).toContain('items-center')
    expect(button.classes).toContain('rounded-md')
  })

  test('contains a Slot component for asChild', () => {
    const slot = result.find({ componentName: 'Slot' })
    expect(slot).not.toBeNull()
  })

  test('toStructure() shows button and Slot', () => {
    const structure = result.toStructure()
    expect(structure.length).toBeGreaterThan(0)
    expect(structure).toContain('button')
    expect(structure).toContain('<Slot>')
    expect(structure).toMatch(/[├└]/)
  })
})

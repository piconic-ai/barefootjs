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
    // Constants are resolved structurally: baseClasses expands to
    // its literal tokens, and variantClasses[variant] /
    // sizeClasses[size] expand to every case's tokens (the test
    // framework can't pick a specific variant at IR time, so it
    // surfaces all branches so assertions on any one variant work).
    expect(button.classes).toContain('inline-flex')
    expect(button.classes).toContain('items-center')
    expect(button.classes).toContain('rounded-md')
  })

  test('button surfaces every variant and size case', () => {
    const button = result.find({ tag: 'button' })!
    // Default-variant tokens
    expect(button.classes).toContain('bg-primary')
    // Secondary-variant tokens (a different case in the same lookup)
    expect(button.classes).toContain('bg-secondary')
    // A size case
    expect(button.classes).toContain('h-9')
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

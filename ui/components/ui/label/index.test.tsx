import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { renderToTest } from '@barefootjs/test'

const labelSource = readFileSync(resolve(__dirname, 'index.tsx'), 'utf-8')

describe('Label', () => {
  const result = renderToTest(labelSource, 'label.tsx', 'Label')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is Label', () => {
    expect(result.componentName).toBe('Label')
  })

  test('isClient is true ("use client" directive present)', () => {
    expect(result.isClient).toBe(true)
  })

  test('no signals (stateless)', () => {
    expect(result.signals).toEqual([])
  })

  test('renders as <label>', () => {
    const label = result.find({ tag: 'label' })
    expect(label).not.toBeNull()
  })

  test('has data-slot=label', () => {
    const label = result.find({ tag: 'label' })
    expect(label!.props['data-slot']).toBe('label')
  })

  test('has resolved base CSS classes', () => {
    const label = result.find({ tag: 'label' })!
    expect(label.classes).toContain('flex')
    expect(label.classes).toContain('items-center')
    expect(label.classes).toContain('text-sm')
  })
})

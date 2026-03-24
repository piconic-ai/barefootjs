import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { renderToTest } from '@barefootjs/test'

const source = readFileSync(resolve(__dirname, 'index.tsx'), 'utf-8')

describe('DatePicker', () => {
  const result = renderToTest(source, 'date-picker.tsx', 'DatePicker')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('isClient is true', () => {
    expect(result.isClient).toBe(true)
  })

  test('componentName is DatePicker', () => {
    expect(result.componentName).toBe('DatePicker')
  })

  test('has signal: open', () => {
    expect(result.signals).toContain('open')
  })

  test('has signal: internalSelected', () => {
    expect(result.signals).toContain('internalSelected')
  })

  test('has memos: currentSelected, displayText', () => {
    expect(result.memos).toContain('currentSelected')
    expect(result.memos).toContain('displayText')
  })

  test('renders div with data-slot=date-picker', () => {
    expect(result.root.tag).toBe('div')
    expect(result.root.props['data-slot']).toBe('date-picker')
  })

  test('composes Popover child', () => {
    const popover = result.find({ componentName: 'Popover' })
    expect(popover).not.toBeNull()
  })

  test('composes Calendar child', () => {
    const calendar = result.find({ componentName: 'Calendar' })
    expect(calendar).not.toBeNull()
  })
})

describe('DateRangePicker', () => {
  const result = renderToTest(source, 'date-picker.tsx', 'DateRangePicker')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('isClient is true', () => {
    expect(result.isClient).toBe(true)
  })

  test('componentName is DateRangePicker', () => {
    expect(result.componentName).toBe('DateRangePicker')
  })

  test('has signal: open', () => {
    expect(result.signals).toContain('open')
  })

  test('has memo: displayText', () => {
    expect(result.memos).toContain('displayText')
  })

  test('renders div with data-slot=date-range-picker', () => {
    expect(result.root.tag).toBe('div')
    expect(result.root.props['data-slot']).toBe('date-range-picker')
  })
})

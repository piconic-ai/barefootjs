import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { renderToTest } from '@barefootjs/test'

const calendarSource = readFileSync(resolve(__dirname, 'index.tsx'), 'utf-8')

describe('Calendar', () => {
  const result = renderToTest(calendarSource, 'calendar.tsx')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('isClient is true', () => {
    expect(result.isClient).toBe(true)
  })

  test('componentName is Calendar', () => {
    expect(result.componentName).toBe('Calendar')
  })

  test('has signals: currentYear, currentMonth, internalSelected, controlledSelected (createSignal)', () => {
    expect(result.signals).toContain('currentYear')
    expect(result.signals).toContain('currentMonth')
    expect(result.signals).toContain('internalSelected')
    expect(result.signals).toContain('controlledSelected')
  })

  test('memos are not in signals', () => {
    expect(result.signals).not.toContain('isControlled')
    expect(result.signals).not.toContain('selectedDate')
    expect(result.signals).not.toContain('weeks')
    expect(result.signals).not.toContain('monthLabel')
    expect(result.signals).not.toContain('weekdays')
  })

  test('renders a table with role=grid', () => {
    const table = result.find({ role: 'grid' })
    expect(table).not.toBeNull()
    expect(table!.tag).toBe('table')
  })

  test('renders as <div> root element', () => {
    const root = result.find({ tag: 'div' })
    expect(root).not.toBeNull()
  })

  test('has navigation buttons (prev and next)', () => {
    const buttons = result.findAll({ tag: 'button' })
    // 2 static nav buttons (prev/next); day buttons are inside .map() and not statically visible
    expect(buttons.length).toBeGreaterThanOrEqual(2)
  })

  test('has click event handlers on nav buttons', () => {
    const buttons = result.findAll({ tag: 'button' })
    const clickableButtons = buttons.filter(b => b.events.includes('click'))
    // Both nav buttons have click handlers
    expect(clickableButtons.length).toBeGreaterThanOrEqual(2)
  })

  test('toStructure() includes role=grid and table', () => {
    const structure = result.toStructure()
    expect(structure).toContain('[role=grid]')
    expect(structure).toContain('table')
    expect(structure).toContain('button')
  })
})

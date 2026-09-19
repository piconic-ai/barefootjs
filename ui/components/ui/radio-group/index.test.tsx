import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { renderToTest } from '@barefootjs/test'

const radioGroupSource = readFileSync(resolve(__dirname, 'index.tsx'), 'utf-8')

describe('RadioGroup', () => {
  const result = renderToTest(radioGroupSource, 'radio-group.tsx', 'RadioGroup')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('isClient is true', () => {
    expect(result.isClient).toBe(true)
  })

  test('componentName is RadioGroup', () => {
    expect(result.componentName).toBe('RadioGroup')
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

  test('has role=radiogroup', () => {
    const group = result.find({ role: 'radiogroup' })
    expect(group).not.toBeNull()
  })

  test('root div has data-slot=radio-group', () => {
    const group = result.find({ role: 'radiogroup' })!
    expect(group.props['data-slot']).toBe('radio-group')
  })
})

describe('RadioGroupItem', () => {
  const result = renderToTest(radioGroupSource, 'radio-group.tsx', 'RadioGroupItem')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is RadioGroupItem', () => {
    expect(result.componentName).toBe('RadioGroupItem')
  })

  test('has role=radio', () => {
    const radio = result.find({ role: 'radio' })
    expect(radio).not.toBeNull()
    expect(radio!.tag).toBe('button')
  })

  test('has aria-checked attribute', () => {
    const radio = result.find({ role: 'radio' })!
    expect(radio.aria).toHaveProperty('checked')
  })

  test('has data-state attribute', () => {
    const radio = result.find({ role: 'radio' })!
    expect(radio.dataState).not.toBeNull()
  })

  test('aria-checked/data-state/indicator style are compiler-analyzable expressions bound to defaultChecked, not hard-coded literals (#3065)', () => {
    // Previously these were the literals "false" / "unchecked" /
    // "display:none", corrected only by the ref-mount effect — never at
    // SSR. They now depend on `props.defaultChecked` (passed by the
    // caller on the item matching the group's defaultValue), so the
    // server HTML and the hydrated DOM agree from the start.
    const radio = result.find({ role: 'radio' })!
    expect(radio.aria.checked).toBe('{props.defaultChecked}')
    expect(radio.dataState).toBe('{props.defaultChecked}')
  })

})

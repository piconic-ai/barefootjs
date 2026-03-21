import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { renderToTest } from '@barefootjs/test'

const source = readFileSync(resolve(__dirname, 'index.tsx'), 'utf-8')

describe('ButtonGroup', () => {
  const result = renderToTest(source, 'button-group.tsx', 'ButtonGroup')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is ButtonGroup', () => {
    expect(result.componentName).toBe('ButtonGroup')
  })

  test('no signals (stateless component)', () => {
    expect(result.signals).toEqual([])
  })

  test('has role=group', () => {
    const group = result.find({ role: 'group' })
    expect(group).not.toBeNull()
  })

  test('root div has data-slot=button-group', () => {
    const div = result.find({ tag: 'div' })
    expect(div!.props['data-slot']).toBe('button-group')
  })

  test('has base layout classes', () => {
    const div = result.find({ tag: 'div' })!
    expect(div.classes).toContain('flex')
    expect(div.classes).toContain('w-fit')
    expect(div.classes).toContain('items-stretch')
  })
})

describe('ButtonGroupText', () => {
  const result = renderToTest(source, 'button-group.tsx', 'ButtonGroupText')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is ButtonGroupText', () => {
    expect(result.componentName).toBe('ButtonGroupText')
  })

  test('root is a conditional (asChild branch)', () => {
    expect(result.root.type).toBe('conditional')
  })

  test('contains a <div> element', () => {
    const div = result.find({ tag: 'div' })
    expect(div).not.toBeNull()
  })

  test('contains a Slot component for asChild', () => {
    const slot = result.find({ componentName: 'Slot' })
    expect(slot).not.toBeNull()
  })
})

describe('ButtonGroupSeparator', () => {
  const result = renderToTest(source, 'button-group.tsx', 'ButtonGroupSeparator')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is ButtonGroupSeparator', () => {
    expect(result.componentName).toBe('ButtonGroupSeparator')
  })

  test('renders Separator component', () => {
    const separator = result.find({ componentName: 'Separator' })
    expect(separator).not.toBeNull()
  })
})

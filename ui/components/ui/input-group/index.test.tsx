import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { renderToTest } from '@barefootjs/test'

const source = readFileSync(resolve(__dirname, 'index.tsx'), 'utf-8')

describe('InputGroup', () => {
  const result = renderToTest(source, 'input-group.tsx', 'InputGroup')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is InputGroup', () => {
    expect(result.componentName).toBe('InputGroup')
  })

  test('no signals (stateless)', () => {
    expect(result.signals).toEqual([])
  })

  test('renders as <div>', () => {
    expect(result.root.tag).toBe('div')
  })

  test('has data-slot=input-group', () => {
    expect(result.root.props['data-slot']).toBe('input-group')
  })

  test('has role=group', () => {
    const el = result.find({ role: 'group' })
    expect(el).not.toBeNull()
    expect(el!.tag).toBe('div')
  })

  test('has resolved CSS classes', () => {
    expect(result.root.classes).toContain('flex')
    expect(result.root.classes).toContain('w-full')
    expect(result.root.classes).toContain('items-center')
    expect(result.root.classes).toContain('rounded-md')
    expect(result.root.classes).toContain('border')
  })
})

describe('InputGroupAddon', () => {
  const result = renderToTest(source, 'input-group.tsx', 'InputGroupAddon')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('renders as <div>', () => {
    expect(result.root.tag).toBe('div')
  })

  test('has data-slot=input-group-addon', () => {
    expect(result.root.props['data-slot']).toBe('input-group-addon')
  })

  test('has data-align attribute', () => {
    expect(result.root.props['data-align']).not.toBeUndefined()
  })

  test('has resolved CSS classes', () => {
    expect(result.root.classes).toContain('flex')
    expect(result.root.classes).toContain('items-center')
    expect(result.root.classes).toContain('text-sm')
  })
})

describe('InputGroupButton', () => {
  const result = renderToTest(source, 'input-group.tsx', 'InputGroupButton')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('renders as <button>', () => {
    expect(result.root.tag).toBe('button')
  })

  test('has data-slot=input-group-button', () => {
    expect(result.root.props['data-slot']).toBe('input-group-button')
  })

  test('has data-size attribute', () => {
    expect(result.root.props['data-size']).not.toBeUndefined()
  })

  test('has resolved CSS classes', () => {
    expect(result.root.classes).toContain('inline-flex')
    expect(result.root.classes).toContain('items-center')
  })
})

describe('InputGroupText', () => {
  const result = renderToTest(source, 'input-group.tsx', 'InputGroupText')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('renders as <span>', () => {
    expect(result.root.tag).toBe('span')
  })

  test('has data-slot=input-group-text', () => {
    expect(result.root.props['data-slot']).toBe('input-group-text')
  })

  test('has resolved CSS classes', () => {
    expect(result.root.classes).toContain('flex')
    expect(result.root.classes).toContain('items-center')
    expect(result.root.classes).toContain('text-sm')
  })
})

describe('InputGroupInput', () => {
  const result = renderToTest(source, 'input-group.tsx', 'InputGroupInput')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('renders as <input>', () => {
    expect(result.root.tag).toBe('input')
  })

  test('has data-slot=input-group-control', () => {
    expect(result.root.props['data-slot']).toBe('input-group-control')
  })

  test('has resolved CSS classes', () => {
    expect(result.root.classes).toContain('flex-1')
    expect(result.root.classes).toContain('border-0')
    expect(result.root.classes).toContain('bg-transparent')
  })
})

describe('InputGroupTextarea', () => {
  const result = renderToTest(source, 'input-group.tsx', 'InputGroupTextarea')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('renders as <textarea>', () => {
    expect(result.root.tag).toBe('textarea')
  })

  test('has data-slot=input-group-control', () => {
    expect(result.root.props['data-slot']).toBe('input-group-control')
  })

  test('has resolved CSS classes', () => {
    expect(result.root.classes).toContain('flex-1')
    expect(result.root.classes).toContain('resize-none')
    expect(result.root.classes).toContain('border-0')
  })
})

import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { renderToTest } from '@barefootjs/test'

const itemSource = readFileSync(resolve(__dirname, 'index.tsx'), 'utf-8')

describe('Item', () => {
  const result = renderToTest(itemSource, 'item.tsx', 'Item')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is Item', () => {
    expect(result.componentName).toBe('Item')
  })

  test('no signals (stateless)', () => {
    expect(result.signals).toEqual([])
  })

  test('renders as div with data-slot=item', () => {
    expect(result.root.tag).toBe('div')
    expect(result.root.props['data-slot']).toBe('item')
  })

  test('has variant and size data attributes', () => {
    expect(result.root.props['data-variant']).toBeDefined()
    expect(result.root.props['data-size']).toBeDefined()
  })

  test('has resolved CSS classes', () => {
    expect(result.root.classes).toContain('flex')
    expect(result.root.classes).toContain('flex-wrap')
    expect(result.root.classes).toContain('items-center')
    expect(result.root.classes).toContain('rounded-md')
  })
})

describe('ItemGroup', () => {
  const result = renderToTest(itemSource, 'item.tsx', 'ItemGroup')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('renders as div with data-slot=item-group', () => {
    expect(result.root.tag).toBe('div')
    expect(result.root.props['data-slot']).toBe('item-group')
  })

  test('has resolved CSS classes', () => {
    expect(result.root.classes).toContain('flex')
    expect(result.root.classes).toContain('flex-col')
  })
})

describe('ItemMedia', () => {
  const result = renderToTest(itemSource, 'item.tsx', 'ItemMedia')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('renders as div with data-slot=item-media', () => {
    expect(result.root.tag).toBe('div')
    expect(result.root.props['data-slot']).toBe('item-media')
  })

  test('has variant data attribute', () => {
    expect(result.root.props['data-variant']).toBeDefined()
  })
})

describe('ItemContent', () => {
  const result = renderToTest(itemSource, 'item.tsx', 'ItemContent')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('renders as div with data-slot=item-content', () => {
    expect(result.root.tag).toBe('div')
    expect(result.root.props['data-slot']).toBe('item-content')
  })

  test('has resolved CSS classes', () => {
    expect(result.root.classes).toContain('flex')
    expect(result.root.classes).toContain('flex-1')
    expect(result.root.classes).toContain('flex-col')
  })
})

describe('ItemTitle', () => {
  const result = renderToTest(itemSource, 'item.tsx', 'ItemTitle')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('renders as div with data-slot=item-title', () => {
    expect(result.root.tag).toBe('div')
    expect(result.root.props['data-slot']).toBe('item-title')
  })
})

describe('ItemDescription', () => {
  const result = renderToTest(itemSource, 'item.tsx', 'ItemDescription')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('renders as p with data-slot=item-description', () => {
    expect(result.root.tag).toBe('p')
    expect(result.root.props['data-slot']).toBe('item-description')
  })
})

describe('ItemActions', () => {
  const result = renderToTest(itemSource, 'item.tsx', 'ItemActions')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('renders as div with data-slot=item-actions', () => {
    expect(result.root.tag).toBe('div')
    expect(result.root.props['data-slot']).toBe('item-actions')
  })

  test('has resolved CSS classes', () => {
    expect(result.root.classes).toContain('flex')
    expect(result.root.classes).toContain('items-center')
  })
})

describe('ItemHeader', () => {
  const result = renderToTest(itemSource, 'item.tsx', 'ItemHeader')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('renders as div with data-slot=item-header', () => {
    expect(result.root.tag).toBe('div')
    expect(result.root.props['data-slot']).toBe('item-header')
  })
})

describe('ItemFooter', () => {
  const result = renderToTest(itemSource, 'item.tsx', 'ItemFooter')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('renders as div with data-slot=item-footer', () => {
    expect(result.root.tag).toBe('div')
    expect(result.root.props['data-slot']).toBe('item-footer')
  })

  test('has resolved CSS classes', () => {
    expect(result.root.classes).toContain('flex')
    expect(result.root.classes).toContain('items-center')
  })
})

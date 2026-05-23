import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { renderToTest } from '@barefootjs/test'

const directionSource = readFileSync(resolve(__dirname, 'index.tsx'), 'utf-8')

describe('DirectionProvider', () => {
  const result = renderToTest(directionSource, 'direction.tsx', 'DirectionProvider')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is DirectionProvider', () => {
    expect(result.componentName).toBe('DirectionProvider')
  })

  test('isClient is true ("use client" directive present)', () => {
    expect(result.isClient).toBe(true)
  })

  test('no signals (stateless)', () => {
    expect(result.signals).toEqual([])
  })

  test('renders as <div>', () => {
    const div = result.find({ tag: 'div' })
    expect(div).not.toBeNull()
  })

  test('has data-slot=direction-provider', () => {
    const div = result.find({ tag: 'div' })
    expect(div!.props['data-slot']).toBe('direction-provider')
  })

  test('has dir attribute', () => {
    const div = result.find({ tag: 'div' })
    expect(div!.props['dir']).toBeDefined()
  })
})

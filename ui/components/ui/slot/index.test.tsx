import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { renderToTest } from '@barefootjs/test'

const source = readFileSync(resolve(__dirname, 'index.tsx'), 'utf-8')

describe('Slot', () => {
  const result = renderToTest(source, 'slot.tsx', 'Slot')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is Slot', () => {
    expect(result.componentName).toBe('Slot')
  })

  test('has no signals (stateless)', () => {
    expect(result.signals).toEqual([])
  })

  test('has no memos (stateless)', () => {
    expect(result.memos).toEqual([])
  })
})

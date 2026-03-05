import { describe, test, expect } from 'bun:test'
import { __slot } from '../src/slot'

describe('__slot', () => {
  test('returns object with __isSlot flag', () => {
    const marker = __slot(() => 'hello')
    expect(marker.__isSlot).toBe(true)
  })

  test('toString() calls thunk and returns string', () => {
    const marker = __slot(() => 'hello')
    expect(marker.toString()).toBe('hello')
  })

  test('toString() handles null from thunk', () => {
    const marker = __slot(() => null)
    expect(marker.toString()).toBe('')
  })

  test('toString() handles undefined from thunk', () => {
    const marker = __slot(() => undefined)
    expect(marker.toString()).toBe('')
  })

  test('toString() converts non-string values', () => {
    const marker = __slot(() => 42)
    expect(marker.toString()).toBe('42')
  })

  test('thunk is deferred — not called at construction', () => {
    let called = false
    __slot(() => { called = true; return 'x' })
    expect(called).toBe(false)
  })

  test('thunk is called on each toString()', () => {
    let count = 0
    const marker = __slot(() => { count++; return 'x' })
    marker.toString()
    marker.toString()
    expect(count).toBe(2)
  })

  test('__isSlot guard works on primitives (optional chaining)', () => {
    const val: any = 'hello'
    expect(val?.__isSlot).toBeUndefined()
  })

  test('__isSlot guard works on slot objects', () => {
    const val: any = __slot(() => 'x')
    expect(val?.__isSlot).toBe(true)
  })

  test('__isSlot guard works on null/undefined', () => {
    const val1: any = null
    const val2: any = undefined
    expect(val1?.__isSlot).toBeUndefined()
    expect(val2?.__isSlot).toBeUndefined()
  })
})

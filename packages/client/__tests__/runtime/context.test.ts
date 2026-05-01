import { describe, test, expect } from 'bun:test'
import { createContext, useContext, provideContext } from '../../src/runtime/context'
import { createSignal } from '../../src/reactive'

describe('createContext', () => {
  test('creates context with unique id', () => {
    const ctx1 = createContext<string>()
    const ctx2 = createContext<string>()
    expect(typeof ctx1.id).toBe('symbol')
    expect(ctx1.id).not.toBe(ctx2.id)
  })

  test('stores default value', () => {
    const ctx = createContext('hello')
    expect(ctx.defaultValue).toBe('hello')
  })

  test('default is undefined when not provided', () => {
    const ctx = createContext<string>()
    expect(ctx.defaultValue).toBeUndefined()
  })

  test('default is undefined whether explicit or omitted', () => {
    const withExplicit = createContext<string | undefined>(undefined)
    const withoutDefault = createContext<string>()
    expect(withExplicit.defaultValue).toBeUndefined()
    expect(withoutDefault.defaultValue).toBeUndefined()
  })
})

describe('useContext', () => {
  test('returns default value when no provider', () => {
    const ctx = createContext('fallback')
    expect(useContext(ctx)).toBe('fallback')
  })

  test('returns undefined when no provider and no default', () => {
    const ctx = createContext<string>()
    expect(useContext(ctx)).toBeUndefined()
  })

  test('returns explicit undefined default without throwing', () => {
    const ctx = createContext<string | undefined>(undefined)
    expect(useContext(ctx)).toBeUndefined()
  })
})

describe('provideContext + useContext', () => {
  test('round-trip with simple value', () => {
    const ctx = createContext<number>()
    provideContext(ctx, 42)
    expect(useContext(ctx)).toBe(42)
  })

  test('round-trip with object', () => {
    const ctx = createContext<{ name: string }>()
    const value = { name: 'test' }
    provideContext(ctx, value)
    expect(useContext(ctx)).toBe(value)
  })

  test('round-trip with signal values', () => {
    const ctx = createContext<{ open: () => boolean; setOpen: (v: boolean) => void }>()
    const [open, setOpen] = createSignal(false)
    provideContext(ctx, { open, setOpen })

    const result = useContext(ctx)
    expect(result.open()).toBe(false)

    result.setOpen(true)
    expect(result.open()).toBe(true)
  })

  test('provided value overrides default', () => {
    const ctx = createContext('default')
    provideContext(ctx, 'provided')
    expect(useContext(ctx)).toBe('provided')
  })

  test('multiple independent contexts', () => {
    const ctx1 = createContext<string>()
    const ctx2 = createContext<number>()

    provideContext(ctx1, 'hello')
    provideContext(ctx2, 99)

    expect(useContext(ctx1)).toBe('hello')
    expect(useContext(ctx2)).toBe(99)
  })

  test('null as valid value', () => {
    const ctx = createContext<string | null>('default')
    provideContext(ctx, null)
    expect(useContext(ctx)).toBeNull()
  })

  test('0 as valid value', () => {
    const ctx = createContext<number>(999)
    provideContext(ctx, 0)
    expect(useContext(ctx)).toBe(0)
  })

  test('false as valid value', () => {
    const ctx = createContext<boolean>(true)
    provideContext(ctx, false)
    expect(useContext(ctx)).toBe(false)
  })

  test('empty string as valid value', () => {
    const ctx = createContext<string>('default')
    provideContext(ctx, '')
    expect(useContext(ctx)).toBe('')
  })

  test('reactivity propagates through context', () => {
    const ctx = createContext<() => number>()
    const [count, setCount] = createSignal(0)
    provideContext(ctx, count)

    const getter = useContext(ctx)
    expect(getter()).toBe(0)

    setCount(10)
    expect(getter()).toBe(10)
  })

  test('useContext captures value at call time', () => {
    const ctx = createContext<number>()

    provideContext(ctx, 1)
    const val1 = useContext(ctx)

    provideContext(ctx, 2)
    const val2 = useContext(ctx)

    // val1 captured the value 1, val2 captured 2
    expect(val1).toBe(1)
    expect(val2).toBe(2)
  })
})

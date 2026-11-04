/**
 * `spreadChildProps` (#3861): the source-ordered merge the compiler emits
 * for a child component call that spreads an arbitrary object
 * (`<Chip tone="a" {...row} label={x()} />`).
 */
import { describe, test, expect } from 'bun:test'
import { createEffect, createSignal } from '@barefootjs/client/reactive'
import { spreadChildProps } from '../../src/forward-props'

describe('spreadChildProps', () => {
  test('a later part overrides an earlier one, key by key', () => {
    const row = { label: 'Alpha', size: 1 }
    const props = spreadChildProps({ label: 'ignored', tone: 'base' }, () => row, { size: 9 })
    expect({ ...props }).toEqual({ label: 'Alpha', tone: 'base', size: 9 })
  })

  test('an own key whose value is undefined still overrides, as in JS', () => {
    const props = spreadChildProps({ tone: 'base' }, () => ({ tone: undefined }))
    expect('tone' in props).toBe(true)
    expect(props.tone).toBeUndefined()
  })

  test('a null or undefined spread contributes nothing', () => {
    expect({ ...spreadChildProps({ a: 1 }, () => null, () => undefined) }).toEqual({ a: 1 })
  })

  test('an explicit getter stays a getter', () => {
    const [count, setCount] = createSignal(1)
    const props = spreadChildProps(() => ({ a: 0 }), { get count() { return count() } })
    expect(props.count).toBe(1)
    setCount(2)
    expect(props.count).toBe(2)
  })

  test("a spread key reads the spread's later value", () => {
    const [row, setRow] = createSignal({ label: 'Alpha' })
    const props = spreadChildProps({ tone: 'base' }, () => row())
    expect(props.label).toBe('Alpha')
    setRow({ label: 'Alpha+' })
    expect(props.label).toBe('Alpha+')
  })
})

describe('spreadChildProps is lazy', () => {
  test('no spread thunk runs until the result is read', () => {
    // A call site evaluates the props object even when the child does not
    // exist (the UI Slot's `() => children.props` with no `children`).
    const children = undefined as unknown as { props: Record<string, unknown> }
    const props = spreadChildProps(() => children.props, { tone: 'base' })
    expect(() => props.tone).toThrow(TypeError)
  })

  test('keys, descriptors and `in` see the merged props', () => {
    const props = spreadChildProps({ a: 1 }, () => ({ b: 2 }))
    expect(Object.keys(props)).toEqual(['a', 'b'])
    expect('b' in props).toBe(true)
    expect(Object.getOwnPropertyDescriptor(props, 'b')?.enumerable).toBe(true)
    expect(Object.getOwnPropertyDescriptors(props).a?.get?.()).toBe(1)
  })

  test('keys and `in` follow the spread value', () => {
    const [row, setRow] = createSignal<Record<string, unknown>>({ b: 2 })
    const props = spreadChildProps({ a: 1 }, () => row())
    setRow({ c: 3 })
    expect(Object.keys(props)).toEqual(['a', 'c'])
    expect('b' in props).toBe(false)
    expect('c' in props).toBe(true)
  })
})

describe('spreadChildProps resolves each key against the parts that currently have it', () => {
  test('a key the spread drops falls back to the earlier explicit prop', () => {
    const [row, setRow] = createSignal<{ tone?: string }>({ tone: 'red' })
    const props = spreadChildProps({ tone: 'base' }, () => row())
    const seen: unknown[] = []
    createEffect(() => { seen.push(props.tone) })
    setRow({})
    expect(seen).toEqual(['red', 'base'])
  })

  test('a key the spread gains later overrides the earlier explicit prop', () => {
    const [row, setRow] = createSignal<{ tone?: string }>({})
    const props = spreadChildProps({ tone: 'base' }, () => row())
    expect(props.tone).toBe('base')
    setRow({ tone: 'red' })
    expect(props.tone).toBe('red')
  })

  test('a key present with the value undefined still overrides; an absent key does not', () => {
    const [row, setRow] = createSignal<{ tone?: string }>({ tone: undefined })
    const props = spreadChildProps({ tone: 'base' }, () => row())
    expect(props.tone).toBeUndefined()
    setRow({})
    expect(props.tone).toBe('base')
  })

  test('a later explicit prop wins over a spread that has the key', () => {
    const props = spreadChildProps(() => ({ id: 'row' }), { id: 'fixed' })
    expect(props.id).toBe('fixed')
  })

  test('an inherited key is not spread, as in JS', () => {
    const props = spreadChildProps({ tone: 'base' }, () => Object.create({ tone: 'proto' }))
    expect(props.tone).toBe('base')
  })
})

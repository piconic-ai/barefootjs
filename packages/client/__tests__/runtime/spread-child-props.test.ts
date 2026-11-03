/**
 * `spreadChildProps` (#3861): the source-ordered merge the compiler emits
 * for a child component call that spreads an arbitrary object
 * (`<Chip tone="a" {...row} label={x()} />`).
 */
import { describe, test, expect } from 'bun:test'
import { createSignal } from '@barefootjs/client/reactive'
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

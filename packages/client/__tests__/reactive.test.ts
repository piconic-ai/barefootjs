import { describe, test, expect } from 'bun:test'
import { createSignal, createMemo, createEffect, onCleanup, onMount } from '../src/reactive'

describe('createSignal', () => {
  test('returns initial value', () => {
    const [count] = createSignal(0)
    expect(count()).toBe(0)
  })

  test('returns string initial value', () => {
    const [name] = createSignal('hello')
    expect(name()).toBe('hello')
  })

  test('returns object initial value', () => {
    const [user] = createSignal({ name: 'Kenta', age: 30 })
    expect(user()).toEqual({ name: 'Kenta', age: 30 })
  })

  test('setter updates value directly', () => {
    const [count, setCount] = createSignal(0)
    setCount(5)
    expect(count()).toBe(5)
  })

  test('setter can be called multiple times', () => {
    const [count, setCount] = createSignal(0)
    setCount(1)
    setCount(2)
    setCount(3)
    expect(count()).toBe(3)
  })

  test('setter accepts function to update value', () => {
    const [count, setCount] = createSignal(0)
    setCount(n => n + 1)
    expect(count()).toBe(1)
  })

  test('setter accepts function consecutively', () => {
    const [count, setCount] = createSignal(0)
    setCount(n => n + 1)
    setCount(n => n + 1)
    setCount(n => n + 1)
    expect(count()).toBe(3)
  })

  test('setter updates object', () => {
    const [user, setUser] = createSignal({ name: 'Kenta', age: 30 })
    setUser(u => ({ ...u, age: 31 }))
    expect(user()).toEqual({ name: 'Kenta', age: 31 })
  })

  test('handles array signals', () => {
    const [items, setItems] = createSignal<string[]>([])
    setItems(arr => [...arr, 'a'])
    setItems(arr => [...arr, 'b'])
    expect(items()).toEqual(['a', 'b'])
  })

  test('mixes direct values and functions', () => {
    const [count, setCount] = createSignal(0)
    setCount(10)
    setCount(n => n * 2)
    setCount(5)
    setCount(n => n + 1)
    expect(count()).toBe(6)
  })

  test('does not trigger effect when value is same (Object.is)', () => {
    let effectCount = 0
    const [count, setCount] = createSignal(5)
    createEffect(() => {
      count()
      effectCount++
    })

    expect(effectCount).toBe(1) // initial run
    setCount(5) // same value
    expect(effectCount).toBe(1) // should not re-run
    setCount(10) // different value
    expect(effectCount).toBe(2) // should re-run
  })

  test('does not trigger effect for NaN === NaN (Object.is)', () => {
    let effectCount = 0
    const [value, setValue] = createSignal(NaN)
    createEffect(() => {
      value()
      effectCount++
    })

    expect(effectCount).toBe(1)
    setValue(NaN) // Object.is(NaN, NaN) is true
    expect(effectCount).toBe(1) // should not re-run
  })
})

describe('createMemo', () => {
  test('returns computed value', () => {
    const [count, setCount] = createSignal(2)
    const doubled = createMemo(() => count() * 2)

    expect(doubled()).toBe(4)
    setCount(5)
    expect(doubled()).toBe(10)
  })

  test('only recalculates when dependencies change', () => {
    let calcCount = 0
    const [count, setCount] = createSignal(1)
    const doubled = createMemo(() => {
      calcCount++
      return count() * 2
    })

    doubled()
    doubled()
    expect(calcCount).toBe(1) // cached, not recalculated

    setCount(2)
    expect(calcCount).toBe(2) // recalculated once
  })

  test('works with chained memos (A -> B -> C)', () => {
    const [a, setA] = createSignal(1)
    const b = createMemo(() => a() * 2)
    const c = createMemo(() => b() + 10)

    expect(c()).toBe(12) // 1*2 + 10
    setA(5)
    expect(c()).toBe(20) // 5*2 + 10
  })

  test('works as dependency in createEffect', () => {
    const results: number[] = []
    const [count, setCount] = createSignal(1)
    const doubled = createMemo(() => count() * 2)

    createEffect(() => {
      results.push(doubled())
    })

    expect(results).toEqual([2])
    setCount(3)
    expect(results).toEqual([2, 6])
  })

  test('tracks multiple dependencies', () => {
    let calcCount = 0
    const [a, setA] = createSignal(1)
    const [b, setB] = createSignal(10)
    const sum = createMemo(() => {
      calcCount++
      return a() + b()
    })

    expect(sum()).toBe(11)
    expect(calcCount).toBe(1)

    setA(2)
    expect(sum()).toBe(12)
    expect(calcCount).toBe(2)

    setB(20)
    expect(sum()).toBe(22)
    expect(calcCount).toBe(3)
  })

  test('stores function value without calling it', () => {
    const myFn = (x: number) => x * 2
    const memo = createMemo(() => myFn)

    expect(memo()).toBe(myFn)
    expect(memo()(3)).toBe(6)
  })

  test('nested memo with function value (issue #538)', () => {
    const defaultFormat = (d: Date) => d.toISOString()
    const customFormat = (d: Date) => d.toLocaleDateString()

    const [useCustom, setUseCustom] = createSignal(false)

    // Memo that returns a function — previously caused TypeError
    const formatter = createMemo(() =>
      useCustom() ? customFormat : defaultFormat
    )
    const displayText = createMemo(() => {
      const fmt = formatter()
      const date = new Date('2025-01-15T00:00:00Z')
      return fmt(date)
    })

    expect(displayText()).toBe(new Date('2025-01-15T00:00:00Z').toISOString())

    setUseCustom(true)
    expect(displayText()).toBe(new Date('2025-01-15T00:00:00Z').toLocaleDateString())
  })

  test('recomputes function value when signal changes', () => {
    const fnA = () => 'A'
    const fnB = () => 'B'
    const [which, setWhich] = createSignal<'a' | 'b'>('a')

    const memo = createMemo(() => which() === 'a' ? fnA : fnB)

    expect(memo()).toBe(fnA)
    expect(memo()()).toBe('A')

    setWhich('b')
    expect(memo()).toBe(fnB)
    expect(memo()()).toBe('B')
  })

  test('function value triggers dependent effect', () => {
    const results: string[] = []
    const fnA = () => 'A'
    const fnB = () => 'B'
    const [which, setWhich] = createSignal<'a' | 'b'>('a')

    const memo = createMemo(() => which() === 'a' ? fnA : fnB)

    createEffect(() => {
      results.push(memo()())
    })

    expect(results).toEqual(['A'])
    setWhich('b')
    expect(results).toEqual(['A', 'B'])
  })

  test('handles conditional dependencies', () => {
    let calcCount = 0
    const [condition, setCondition] = createSignal(true)
    const [a, setA] = createSignal(1)
    const [b, setB] = createSignal(100)

    const result = createMemo(() => {
      calcCount++
      return condition() ? a() : b()
    })

    expect(result()).toBe(1)
    expect(calcCount).toBe(1)

    // When condition is true, changing b should not trigger recalc
    setB(200)
    expect(result()).toBe(1)
    expect(calcCount).toBe(1) // no recalc because b is not tracked

    // Switch condition
    setCondition(false)
    expect(result()).toBe(200)
    expect(calcCount).toBe(2)

    // Now changing a should not trigger recalc
    setA(2)
    expect(result()).toBe(200)
    expect(calcCount).toBe(2) // no recalc because a is no longer tracked
  })
})

describe('createEffect', () => {
  test('runs immediately', () => {
    let ran = false
    createEffect(() => {
      ran = true
    })
    expect(ran).toBe(true)
  })

  test('re-runs when signal changes', () => {
    const results: number[] = []
    const [count, setCount] = createSignal(0)

    createEffect(() => {
      results.push(count())
    })

    expect(results).toEqual([0])
    setCount(1)
    expect(results).toEqual([0, 1])
    setCount(2)
    expect(results).toEqual([0, 1, 2])
  })

  test('cleanup function is called before re-run', () => {
    const events: string[] = []
    const [count, setCount] = createSignal(0)

    createEffect(() => {
      events.push(`run:${count()}`)
      return () => {
        events.push(`cleanup:${count()}`)
      }
    })

    expect(events).toEqual(['run:0'])

    setCount(1)
    // Cleanup should be called with OLD value captured in closure
    expect(events).toEqual(['run:0', 'cleanup:1', 'run:1'])

    setCount(2)
    expect(events).toEqual(['run:0', 'cleanup:1', 'run:1', 'cleanup:2', 'run:2'])
  })

  test('onCleanup registers cleanup function', () => {
    const events: string[] = []
    const [count, setCount] = createSignal(0)

    createEffect(() => {
      const current = count()
      events.push(`run:${current}`)
      onCleanup(() => {
        events.push(`onCleanup:${current}`)
      })
    })

    expect(events).toEqual(['run:0'])

    setCount(1)
    expect(events).toEqual(['run:0', 'onCleanup:0', 'run:1'])

    setCount(2)
    expect(events).toEqual(['run:0', 'onCleanup:0', 'run:1', 'onCleanup:1', 'run:2'])
  })

  test('multiple onCleanup calls are all executed', () => {
    const cleanups: number[] = []
    const [trigger, setTrigger] = createSignal(0)

    createEffect(() => {
      trigger()
      onCleanup(() => cleanups.push(1))
      onCleanup(() => cleanups.push(2))
      onCleanup(() => cleanups.push(3))
    })

    expect(cleanups).toEqual([])

    setTrigger(1)
    expect(cleanups).toEqual([1, 2, 3])
  })

  test('return cleanup overwrites onCleanup', () => {
    // Note: When you both call onCleanup AND return a cleanup function,
    // the returned function overwrites any previously registered cleanups.
    // This is expected behavior - use one or the other, not both.
    const cleanups: string[] = []
    const [trigger, setTrigger] = createSignal(0)

    createEffect(() => {
      trigger()
      onCleanup(() => cleanups.push('onCleanup'))
      return () => cleanups.push('return')
    })

    expect(cleanups).toEqual([])

    setTrigger(1)
    // Only 'return' runs because it overwrites the onCleanup
    expect(cleanups).toEqual(['return'])
  })

  test('re-tracks dependencies on each run', () => {
    const [condition, setCondition] = createSignal(true)
    const [a, setA] = createSignal('A')
    const [b, setB] = createSignal('B')
    const results: string[] = []

    createEffect(() => {
      if (condition()) {
        results.push(a())
      } else {
        results.push(b())
      }
    })

    expect(results).toEqual(['A'])

    // Changing b should NOT trigger (not tracked when condition is true)
    setB('B2')
    expect(results).toEqual(['A'])

    // Switch condition - now b is tracked, a is not
    setCondition(false)
    expect(results).toEqual(['A', 'B2'])

    // Changing a should NOT trigger (not tracked when condition is false)
    setA('A2')
    expect(results).toEqual(['A', 'B2'])

    // Changing b should trigger
    setB('B3')
    expect(results).toEqual(['A', 'B2', 'B3'])
  })

  test('handles multiple signals', () => {
    const [firstName, setFirstName] = createSignal('John')
    const [lastName, setLastName] = createSignal('Doe')
    const results: string[] = []

    createEffect(() => {
      results.push(`${firstName()} ${lastName()}`)
    })

    expect(results).toEqual(['John Doe'])

    setFirstName('Jane')
    expect(results).toEqual(['John Doe', 'Jane Doe'])

    setLastName('Smith')
    expect(results).toEqual(['John Doe', 'Jane Doe', 'Jane Smith'])
  })
})

describe('circular dependency detection', () => {
  test('deep memo chain (150 levels) works without hitting any limit', () => {
    const [source, setSource] = createSignal(1)
    const memos: ReturnType<typeof createMemo<number>>[] = []

    // Build a chain: source → memo0 → memo1 → ... → memo149
    memos.push(createMemo(() => source() + 1))
    for (let i = 1; i < 150; i++) {
      const prev = memos[i - 1]
      memos.push(createMemo(() => prev() + 1))
    }

    expect(memos[149]()).toBe(151) // 1 + 150
    setSource(10)
    expect(memos[149]()).toBe(160) // 10 + 150
  })

  test('circular dependency (effect writes to its own signal) is detected', () => {
    expect(() => {
      const [count, setCount] = createSignal(0)
      createEffect(() => {
        setCount(count() + 1)
      })
    }).toThrow('Circular dependency detected')
  })

  test('indirect circular dependency is detected', () => {
    expect(() => {
      const [a, setA] = createSignal(0)
      const [b, setB] = createSignal(0)
      createEffect(() => {
        setB(a() + 1)
      })
      createEffect(() => {
        setA(b() + 1)
      })
    }).toThrow('Circular dependency detected')
  })
})

describe('onMount', () => {
  test('runs once on mount', () => {
    let runCount = 0
    onMount(() => {
      runCount++
    })
    expect(runCount).toBe(1)
  })

  test('does not re-run when signals change', () => {
    let runCount = 0
    const [count, setCount] = createSignal(0)

    onMount(() => {
      runCount++
      // Reading signal inside onMount should NOT create a dependency
      count()
    })

    expect(runCount).toBe(1)
    setCount(1)
    expect(runCount).toBe(1) // should still be 1, not re-run
    setCount(2)
    expect(runCount).toBe(1)
  })

  test('onCleanup can be registered inside onMount', () => {
    const events: string[] = []

    onMount(() => {
      events.push('mount')
      onCleanup(() => {
        events.push('cleanup')
      })
    })

    expect(events).toEqual(['mount'])
    // onCleanup is registered for when the effect is cleaned up
    // In a real component lifecycle, this would be called on unmount
  })
})

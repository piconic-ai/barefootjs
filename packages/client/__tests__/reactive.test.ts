import { describe, test, expect } from 'bun:test'
import { createSignal, createMemo, createSelector, createEffect, createRoot, onCleanup, onMount, batch, untrack } from '../src/reactive'

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

describe('batch', () => {
  test('coalesces multiple signal updates into one effect run', () => {
    let effectCount = 0
    const [a, setA] = createSignal(0)
    const [b, setB] = createSignal(0)

    createEffect(() => {
      a()
      b()
      effectCount++
    })

    expect(effectCount).toBe(1) // initial run

    batch(() => {
      setA(1)
      setB(2)
    })

    expect(effectCount).toBe(2) // runs once after batch, not twice
    expect(a()).toBe(1)
    expect(b()).toBe(2)
  })

  test('returns the value from fn', () => {
    const result = batch(() => 42)
    expect(result).toBe(42)
  })

  test('nested batch flushes only when outermost ends', () => {
    let effectCount = 0
    const [a, setA] = createSignal(0)
    const [b, setB] = createSignal(0)

    createEffect(() => {
      a()
      b()
      effectCount++
    })

    expect(effectCount).toBe(1)

    batch(() => {
      setA(1)
      batch(() => {
        setB(2)
      })
      // inner batch ended but outer is still active — no flush yet
      expect(effectCount).toBe(1)
    })

    expect(effectCount).toBe(2)
  })

  test('deep memo chain propagates correctly after batch', () => {
    const [source, setSource] = createSignal(0)
    const m1 = createMemo(() => source() + 1)
    const m2 = createMemo(() => m1() + 1)
    const m3 = createMemo(() => m2() + 1)

    const results: number[] = []
    createEffect(() => {
      results.push(m3())
    })

    expect(results).toEqual([3]) // 0+1+1+1

    batch(() => {
      setSource(10)
      setSource(20)
      setSource(30)
    })

    // Only the final value propagates through the chain
    expect(results).toEqual([3, 33]) // 30+1+1+1
    expect(m3()).toBe(33)
  })

  test('values are updated immediately inside batch', () => {
    const [count, setCount] = createSignal(0)

    batch(() => {
      setCount(5)
      expect(count()).toBe(5) // value is available immediately
      setCount(n => n + 1)
      expect(count()).toBe(6)
    })
  })

  test('effects do not run during batch', () => {
    const results: number[] = []
    const [count, setCount] = createSignal(0)

    createEffect(() => {
      results.push(count())
    })

    expect(results).toEqual([0])

    batch(() => {
      setCount(1)
      setCount(2)
      setCount(3)
      // No effect runs yet
      expect(results).toEqual([0])
    })

    // Effect runs once with the final value
    expect(results).toEqual([0, 3])
  })

  test('batch with no changes does not trigger effects', () => {
    let effectCount = 0
    const [count, setCount] = createSignal(0)

    createEffect(() => {
      count()
      effectCount++
    })

    expect(effectCount).toBe(1)

    batch(() => {
      // no signal writes
    })

    expect(effectCount).toBe(1)
  })

  test('batch with same-value writes does not trigger effects', () => {
    let effectCount = 0
    const [count, setCount] = createSignal(5)

    createEffect(() => {
      count()
      effectCount++
    })

    expect(effectCount).toBe(1)

    batch(() => {
      setCount(5) // same value — Object.is skips
    })

    expect(effectCount).toBe(1)
  })

  test('multiple signals with shared effect run effect once', () => {
    let effectCount = 0
    const [a, setA] = createSignal(1)
    const [b, setB] = createSignal(2)
    const [c, setC] = createSignal(3)

    createEffect(() => {
      a() + b() + c()
      effectCount++
    })

    expect(effectCount).toBe(1)

    batch(() => {
      setA(10)
      setB(20)
      setC(30)
    })

    expect(effectCount).toBe(2)
    expect(a()).toBe(10)
    expect(b()).toBe(20)
    expect(c()).toBe(30)
  })
})

describe('createSelector', () => {
  test('O(changed): only old-key and new-key subscribers re-run', () => {
    const [selected, setSelected] = createSignal(1)
    const isSelected = createSelector(selected)
    const runs: Record<number, number> = {}
    const seen: Record<number, boolean> = {}
    for (const id of [1, 2, 3, 4, 5]) {
      createEffect(() => {
        runs[id] = (runs[id] ?? 0) + 1
        seen[id] = isSelected(id)
      })
    }
    expect(seen).toEqual({ 1: true, 2: false, 3: false, 4: false, 5: false })
    expect(runs).toEqual({ 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 })

    setSelected(3)
    // Only key 1 (deselected) and key 3 (selected) re-ran.
    expect(runs).toEqual({ 1: 2, 2: 1, 3: 2, 4: 1, 5: 1 })
    expect(seen).toEqual({ 1: false, 2: false, 3: true, 4: false, 5: false })

    setSelected(3) // no-op write: signal bails, nothing runs
    expect(runs).toEqual({ 1: 2, 2: 1, 3: 2, 4: 1, 5: 1 })
  })

  test('batched writes dispatch once through PendingEffects', () => {
    const [selected, setSelected] = createSignal(0)
    const isSelected = createSelector(selected)
    let runsA = 0
    createEffect(() => { runsA++; isSelected(1) })
    batch(() => {
      setSelected(1)
      setSelected(2)
      setSelected(1)
    })
    // initial + one flush (1 was false before batch, true after — flipped once)
    expect(runsA).toBe(2)
  })

  test('disposal prunes subscription (no leak, no dispatch to disposed)', () => {
    const [selected, setSelected] = createSignal(0)
    const isSelected = createSelector(selected)
    let runs = 0
    let dispose!: () => void
    createRoot(d => {
      dispose = d
      createEffect(() => { runs++; isSelected(7) })
    })
    expect(runs).toBe(1)
    dispose()
    setSelected(7)
    expect(runs).toBe(1)
  })

  test('re-run that stops reading a key unsubscribes it', () => {
    const [selected, setSelected] = createSignal(0)
    const [mode, setMode] = createSignal<'a' | 'b'>('a')
    const isSelected = createSelector(selected)
    let runs = 0
    createEffect(() => {
      runs++
      if (mode() === 'a') isSelected(1)
    })
    expect(runs).toBe(1)
    setMode('b')     // re-run, no longer reads key 1
    expect(runs).toBe(2)
    setSelected(1)   // key 1 flipped — but nobody subscribes anymore
    expect(runs).toBe(2)
  })

  test('custom comparator (range selection)', () => {
    const [range, setRange] = createSignal<[number, number]>([1, 3])
    const inRange = createSelector<[number, number], number>(range, (k, [lo, hi]) => k >= lo && k <= hi)
    const runs: Record<number, number> = {}
    const seen: Record<number, boolean> = {}
    for (const id of [1, 2, 3, 4, 5]) {
      createEffect(() => { runs[id] = (runs[id] ?? 0) + 1; seen[id] = inRange(id) })
    }
    expect(seen).toEqual({ 1: true, 2: true, 3: true, 4: false, 5: false })
    setRange([3, 4])
    // flipped: 1,2 (out), 4 (in). 3 and 5 unchanged.
    expect(runs).toEqual({ 1: 2, 2: 2, 3: 1, 4: 2, 5: 1 })
  })

  test('untracked read does not subscribe', () => {
    const [selected, setSelected] = createSignal(0)
    const isSelected = createSelector(selected)
    let runs = 0
    createEffect(() => { runs++; untrack(() => isSelected(9)) })
    setSelected(9)
    expect(runs).toBe(1)
  })

  test('re-run that switches keys is only subscribed to its most recent key', () => {
    const [selected, setSelected] = createSignal(0)
    const [key, setKey] = createSignal(1)
    const isSelected = createSelector(selected)
    let runs = 0
    createEffect(() => { runs++; isSelected(key()) })
    expect(runs).toBe(1)
    setKey(2)        // re-run reads key 2 — cleanup must drop the key-1 subscription
    expect(runs).toBe(2)
    setSelected(1)   // flips key 1 only: nobody subscribed anymore
    expect(runs).toBe(2)
    setSelected(2)   // flips key 2: the effect's current subscription fires
    expect(runs).toBe(3)
  })

  test('subscriber disposing another subscriber mid-dispatch is safe (collect-then-run)', () => {
    // A custom comparator can flip several keys in one sweep. The first
    // dispatched subscriber disposes the second — the `toRun` Set snapshot
    // must tolerate that (runEffect's disposed guard), same as signal.set()'s
    // subscriber-snapshot dispatch.
    const [range, setRange] = createSignal<[number, number]>([0, 0])
    const inRange = createSelector<[number, number], number>(range, (k, [lo, hi]) => k >= lo && k <= hi)
    let disposeOther!: () => void
    let runs1 = 0
    let runs2 = 0
    createRoot(d => { disposeOther = d; createEffect(() => { runs2++; inRange(2) }) })
    createEffect(() => { runs1++; inRange(1); if (runs1 > 1) disposeOther() })
    setRange([1, 2]) // flips keys 1 AND 2; subscriber 1 disposes subscriber 2 mid-sweep
    expect(runs1).toBe(2)
    setRange([0, 0]) // flips both again; the disposed subscriber must stay dead
    expect(runs2).toBeLessThanOrEqual(2)
    expect(runs1).toBe(3)
  })
})

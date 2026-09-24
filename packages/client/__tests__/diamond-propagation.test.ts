/**
 * Glitch-free propagation through memos (push-then-pull colouring in
 * `reactive.ts`, see its "Propagation" section).
 *
 * A diamond — one signal read through two memos by one effect — used to run
 * the effect once per edge, and its first re-run saw one memo recomputed and
 * the other stale. These pin the contract: one run per write, and every run
 * reads a consistent snapshot. The real-browser twin is the
 * `diamond-propagation` conformance fixture.
 */

import { describe, test, expect } from 'bun:test'
import { batch, createEffect, createMemo, createRoot, createSignal, untrack } from '../src/reactive'

function diamond() {
  const [a, setA] = createSignal(1)
  const b = createMemo(() => a() * 10)
  const c = createMemo(() => a() * 100)
  const seen: Array<[number, number, number]> = []
  createEffect(() => {
    seen.push([a(), b(), c()])
  })
  return { setA, seen }
}

const consistent = ([a, b, c]: [number, number, number]) => b === a * 10 && c === a * 100

describe('diamond propagation', () => {
  test('an effect behind a diamond runs once per write and sees both memos recomputed', () => {
    const { setA, seen } = diamond()
    expect(seen).toEqual([[1, 10, 100]])

    setA(2)
    expect(seen).toEqual([[1, 10, 100], [2, 20, 200]])

    setA(3)
    expect(seen).toEqual([[1, 10, 100], [2, 20, 200], [3, 30, 300]])
    expect(seen.every(consistent)).toBe(true)
  })

  test('the same holds under batch()', () => {
    const { setA, seen } = diamond()
    batch(() => setA(2))
    expect(seen).toEqual([[1, 10, 100], [2, 20, 200]])

    batch(() => {
      setA(5)
      setA(6)
    })
    expect(seen).toEqual([[1, 10, 100], [2, 20, 200], [6, 60, 600]])
  })

  test('an effect that reads only the two memos (not the signal) also runs once', () => {
    const [a, setA] = createSignal(1)
    const b = createMemo(() => a() + 1)
    const c = createMemo(() => a() * 2)
    const seen: Array<[number, number]> = []
    createEffect(() => {
      seen.push([b(), c()])
    })
    setA(4)
    expect(seen).toEqual([[2, 2], [5, 8]])
  })

  test('nested memos: a deeper diamond still runs the effect once with consistent values', () => {
    const [a, setA] = createSignal(1)
    const b = createMemo(() => a() + 1)
    const c = createMemo(() => b() * 2) // a → b → c
    const d = createMemo(() => a() * 3) // a → d
    const e = createMemo(() => c() + d()) // c, d → e
    const seen: Array<[number, number, number, number]> = []
    createEffect(() => {
      seen.push([a(), c(), d(), e()])
    })
    expect(seen).toEqual([[1, 4, 3, 7]])

    setA(2)
    expect(seen).toEqual([[1, 4, 3, 7], [2, 6, 6, 12]])
    for (const [av, cv, dv, ev] of seen) {
      expect(cv).toBe((av + 1) * 2)
      expect(dv).toBe(av * 3)
      expect(ev).toBe(cv + dv)
    }
  })

  test('each memo recomputes once per write', () => {
    const [a, setA] = createSignal(1)
    let bRuns = 0
    let cRuns = 0
    const b = createMemo(() => {
      bRuns++
      return a() + 1
    })
    const c = createMemo(() => {
      cRuns++
      return a() + b()
    })
    createEffect(() => {
      b()
      c()
    })
    expect([bRuns, cRuns]).toEqual([1, 1])
    setA(2)
    expect([bRuns, cRuns]).toEqual([2, 2])
  })

  test('a memo whose value does not change does not re-run its observers', () => {
    const [a, setA] = createSignal(1)
    const parity = createMemo(() => a() % 2)
    let runs = 0
    createEffect(() => {
      parity()
      runs++
    })
    setA(3) // parity stays 1
    expect(runs).toBe(1)
    setA(4)
    expect(runs).toBe(2)
  })

  test('a write followed by a memo read inside an effect sees the fresh memo', () => {
    const [a, setA] = createSignal(1)
    const doubled = createMemo(() => a() * 2)
    const [trigger, setTrigger] = createSignal(0)
    const seen: number[] = []
    createEffect(() => {
      if (trigger() === 0) return
      setA(trigger())
      seen.push(doubled())
    })
    setTrigger(5)
    expect(seen).toEqual([10])
    setTrigger(7)
    expect(seen).toEqual([10, 14])
  })

  test('a memo read inside batch() after a write is already recomputed', () => {
    const [n, setN] = createSignal(1)
    const doubled = createMemo(() => n() * 2)
    batch(() => {
      setN(10)
      expect(doubled()).toBe(20)
    })
    expect(doubled()).toBe(20)
  })

  test('writes made inside an effect propagate after that effect returns', () => {
    const [source, setSource] = createSignal(0)
    const [derived, setDerived] = createSignal(0)
    const log: string[] = []
    createEffect(() => {
      log.push(`reader:${derived()}`)
    })
    createEffect(() => {
      const v = source()
      if (v === 0) return
      setDerived(v * 10)
      log.push('writer:after-set')
    })
    log.length = 0
    setSource(1)
    // The reader runs once the writer's body has finished, not inside it.
    expect(log).toEqual(['writer:after-set', 'reader:10'])
  })

  test('an effect disposed before a queued run does not run', () => {
    const [a, setA] = createSignal(1)
    let dispose: (() => void) | undefined
    // Subscribed to `a` before the memo, so it runs first in the flush and
    // disposes the reader while the reader is still queued (CHECK).
    createEffect(() => {
      if (a() === 2) dispose?.()
    })
    const b = createMemo(() => a() * 2)
    let runs = 0
    createRoot((d) => {
      dispose = d
      createEffect(() => {
        b()
        runs++
      })
    })
    setA(2)
    expect(runs).toBe(1)
  })
})

describe('circular dependency detection with deferred propagation', () => {
  test('a self-writing effect still throws and does not hang', () => {
    expect(() => {
      const [n, setN] = createSignal(0)
      createEffect(() => {
        setN(n() + 1)
      })
    }).toThrow('Circular dependency detected')
  })

  test('a cycle through a memo still throws', () => {
    expect(() => {
      const [n, setN] = createSignal(0)
      const next = createMemo(() => n() + 1)
      createEffect(() => {
        setN(next())
      })
    }).toThrow('Circular dependency detected')
  })

  test('the graph keeps working for unrelated signals after a detected cycle', () => {
    const [n, setN] = createSignal(0)
    expect(() => {
      createEffect(() => {
        setN(n() + 1)
      })
    }).toThrow('Circular dependency detected')

    const [x, setX] = createSignal(1)
    const y = createMemo(() => x() * 2)
    const seen: number[] = []
    createEffect(() => {
      seen.push(y())
    })
    setX(2)
    expect(seen).toEqual([2, 4])
  })

  test('a memo pulled once per write in a loop inside one effect is not a cycle', () => {
    // Only runs taken off the flush queue count against the limit; a memo
    // read pulls at most once per read, so the effect's own loop bounds it.
    const [a, setA] = createSignal(0)
    const doubled = createMemo(() => a() * 2)
    const [go, setGo] = createSignal(false)
    let sum = 0
    createEffect(() => {
      if (!go()) return
      for (let i = 1; i <= 150; i++) {
        setA(i)
        sum += untrack(doubled)
      }
    })
    expect(() => setGo(true)).not.toThrow()
    expect(sum).toBe(150 * 151)
  })
})

describe('errors during a flush', () => {
  test('an effect that throws does not drop the updates other effects queued in the same flush', () => {
    const [t, setT] = createSignal(0)
    const [x, setX] = createSignal(0)
    const seen: number[] = []
    createEffect(() => {
      seen.push(x())
    })
    createEffect(() => {
      if (t()) setX(t())
    })
    createEffect(() => {
      if (t()) throw new Error('boom')
    })
    // The reader was queued by the second effect's write; the third effect's
    // throw still reaches the caller, but only after the reader has run.
    expect(() => setT(1)).toThrow('boom')
    expect(seen).toEqual([0, 1])
  })
})

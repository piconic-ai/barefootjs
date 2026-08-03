import { describe, test, expect } from 'bun:test'
import { createDebouncedSerialRunner } from '../debounced-serial-runner.ts'

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

/** A controllable async task: `resolveCall(n)` releases the nth call, and
 * `activeCount`/`maxActiveCount` track how many calls were in flight at
 * once — the thing this whole module exists to keep at 1. */
function controllableTask() {
  const calls: Array<{ resolve: () => void }> = []
  let activeCount = 0
  let maxActiveCount = 0

  const task = () =>
    new Promise<void>(resolvePromise => {
      activeCount++
      maxActiveCount = Math.max(maxActiveCount, activeCount)
      calls.push({
        resolve: () => {
          activeCount--
          resolvePromise()
        },
      })
    })

  return {
    task,
    resolveCall(n: number) {
      calls[n]?.resolve()
    },
    get callCount() {
      return calls.length
    },
    get maxActiveCount() {
      return maxActiveCount
    },
  }
}

describe('createDebouncedSerialRunner', () => {
  test('a single trigger() runs the task once, after the debounce window', async () => {
    let calls = 0
    const runner = createDebouncedSerialRunner(async () => { calls++ }, 20, () => {})

    runner.trigger()
    expect(calls).toBe(0) // debounced — not yet
    await sleep(60)
    expect(calls).toBe(1)
  })

  test('a burst of trigger() calls within the debounce window collapses into ONE run', async () => {
    let calls = 0
    const runner = createDebouncedSerialRunner(async () => { calls++ }, 30, () => {})

    for (let i = 0; i < 10; i++) {
      runner.trigger()
      await sleep(5) // well under the 30ms debounce — keeps re-arming it
    }
    await sleep(80)
    expect(calls).toBe(1)
  })

  test('trigger() during an in-flight run does NOT start a second, overlapping call', async () => {
    const c = controllableTask()
    const runner = createDebouncedSerialRunner(c.task, 10, () => {})

    runner.trigger()
    await sleep(30) // debounce fires, first call starts and is now stuck awaiting resolveCall(0)
    expect(c.callCount).toBe(1)

    // A change arrives mid-pass.
    runner.trigger()
    await sleep(30) // long past the debounce window — but the first call is still in flight
    expect(c.callCount).toBe(1) // no second call started while the first is running

    c.resolveCall(0)
    await sleep(20) // the queued follow-up now gets its turn
    expect(c.callCount).toBe(2)

    c.resolveCall(1)
    await sleep(20)
    expect(c.maxActiveCount).toBe(1) // never more than one task in flight, at any point
  })

  test('several trigger() calls while a run is in flight coalesce into exactly ONE follow-up, not one per trigger', async () => {
    const c = controllableTask()
    const runner = createDebouncedSerialRunner(c.task, 10, () => {})

    runner.trigger()
    await sleep(30)
    expect(c.callCount).toBe(1)

    // Five more changes land while the first pass is still running.
    for (let i = 0; i < 5; i++) {
      runner.trigger()
      await sleep(15) // each spaced past the debounce window on its own
    }

    c.resolveCall(0)
    await sleep(30)
    expect(c.callCount).toBe(2) // exactly one follow-up, not five

    c.resolveCall(1)
    await sleep(20)
    expect(c.callCount).toBe(2) // and nothing further queued after that
  })

  test('a rejected task is reported via onError and does not wedge future runs', async () => {
    let calls = 0
    const errors: unknown[] = []
    const runner = createDebouncedSerialRunner(
      async () => {
        calls++
        if (calls === 1) throw new Error('boom')
      },
      10,
      err => errors.push(err),
    )

    runner.trigger()
    await sleep(30)
    expect(calls).toBe(1)
    expect(errors).toHaveLength(1)

    runner.trigger()
    await sleep(30)
    expect(calls).toBe(2) // the runner recovered — a later trigger still runs
  })
})

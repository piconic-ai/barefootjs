/**
 * Regression test for #1366 — Runtime: cancel requestAnimationFrame on unmount
 *
 * Verifies the recommended pattern from the issue's repro:
 *
 *   createEffect(() => {
 *     const h = requestAnimationFrame(() => setT(performance.now()))
 *     onCleanup(() => cancelAnimationFrame(h))
 *   })
 *
 * Invariants:
 *   1. When the scope disposes before the next frame, the rAF handle
 *      is cancelled by onCleanup and the callback never runs.
 *   2. Even if the user forgets onCleanup and the rAF *does* fire after
 *      dispose, signal writes from the late callback cannot resurrect
 *      effects owned by the disposed scope.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createSignal, createEffect, createRoot, onCleanup } from '../src/reactive'

describe('onCleanup with requestAnimationFrame (#1366)', () => {
  let originalRAF: typeof globalThis.requestAnimationFrame | undefined
  let originalCAF: typeof globalThis.cancelAnimationFrame | undefined
  let frames: Map<number, FrameRequestCallback>
  let nextHandle: number

  beforeEach(() => {
    frames = new Map()
    nextHandle = 1
    originalRAF = globalThis.requestAnimationFrame
    originalCAF = globalThis.cancelAnimationFrame
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      const h = nextHandle++
      frames.set(h, cb)
      return h
    }) as typeof globalThis.requestAnimationFrame
    globalThis.cancelAnimationFrame = ((h: number) => {
      frames.delete(h)
    }) as typeof globalThis.cancelAnimationFrame
  })

  afterEach(() => {
    if (originalRAF) globalThis.requestAnimationFrame = originalRAF
    if (originalCAF) globalThis.cancelAnimationFrame = originalCAF
  })

  function tickFrame() {
    const pending = [...frames.values()]
    frames.clear()
    for (const cb of pending) cb(performance.now())
  }

  test('onCleanup cancels the rAF handle when scope disposes before frame fires', () => {
    let callbackFired = false
    let disposeFn!: () => void

    createRoot((dispose) => {
      disposeFn = dispose
      createEffect(() => {
        const h = requestAnimationFrame(() => {
          callbackFired = true
        })
        onCleanup(() => cancelAnimationFrame(h))
      })
    })

    expect(frames.size).toBe(1)

    disposeFn()
    expect(frames.size).toBe(0)

    tickFrame()
    expect(callbackFired).toBe(false)
  })

  test('Pulse-style: signal-writing rAF callback cancelled before next frame', () => {
    // Mirrors the issue's repro exactly: a reader effect subscribes to
    // the signal (the {t()} text bind in the JSX body), and a writer
    // effect schedules an rAF that calls setT. Synchronous dispose
    // between schedule and frame must produce zero reader re-runs.
    const [t, setT] = createSignal(0)
    let readerRuns = 0
    let writerFired = false
    let disposeFn!: () => void

    createRoot((dispose) => {
      disposeFn = dispose
      createEffect(() => {
        readerRuns++
        t()
      })
      createEffect(() => {
        const h = requestAnimationFrame(() => {
          writerFired = true
          setT(performance.now())
        })
        onCleanup(() => cancelAnimationFrame(h))
      })
    })

    expect(readerRuns).toBe(1)
    expect(frames.size).toBe(1)

    disposeFn()
    tickFrame()

    expect(writerFired).toBe(false)
    expect(readerRuns).toBe(1)
  })

  test('without onCleanup, a leaked rAF cannot re-run a disposed reader', () => {
    // Defensive invariant: if the user forgets onCleanup the rAF *does*
    // fire post-dispose, but disposeEffect already removed the reader
    // from the signal's subscribers Set, so the write is observable
    // only as a stored value — no owned effect re-runs.
    const [t, setT] = createSignal(0)
    let readerRuns = 0
    let disposeFn!: () => void

    createRoot((dispose) => {
      disposeFn = dispose
      createEffect(() => {
        readerRuns++
        t()
      })
      createEffect(() => {
        requestAnimationFrame(() => setT(performance.now()))
        // intentionally no onCleanup
      })
    })

    expect(readerRuns).toBe(1)

    disposeFn()
    tickFrame()

    expect(readerRuns).toBe(1)
  })

  test('rAF scheduled before an effect re-run is cancelled by the previous cleanup', () => {
    // An effect that reads a signal AND schedules an rAF: each re-run
    // must cancel the previous frame's handle, otherwise a flood of
    // setSignal-driven re-runs leaks rAF handles.
    const [trigger, setTrigger] = createSignal(0)
    const scheduled: number[] = []
    const cancelled: number[] = []

    let disposeFn!: () => void
    createRoot((dispose) => {
      disposeFn = dispose
      createEffect(() => {
        trigger()
        const h = requestAnimationFrame(() => {})
        scheduled.push(h)
        onCleanup(() => {
          cancelled.push(h)
          cancelAnimationFrame(h)
        })
      })
    })

    expect(scheduled).toHaveLength(1)
    expect(cancelled).toHaveLength(0)

    setTrigger(1)
    // re-run cleanup'd the previous handle before scheduling a new one
    expect(scheduled).toHaveLength(2)
    expect(cancelled).toEqual([scheduled[0]])

    disposeFn()
    expect(cancelled).toEqual([scheduled[0], scheduled[1]])
    expect(frames.size).toBe(0)
  })
})

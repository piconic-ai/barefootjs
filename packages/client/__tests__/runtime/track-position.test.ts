/**
 * `trackPosition` (#2848): keeps a floating element anchored while open
 * and — the load-bearing part — samples the position ONE more time,
 * synchronously, at dispose.
 *
 * `scroll` events are coalesced per rendering frame and dispatch with the
 * scroll position current at dispatch time, so a scroll that lands in the
 * same frame as the close never reaches the listener. The dispose-time
 * sample is what makes the closed element's inline position a function of
 * close-time geometry rather than of where the frame boundary fell.
 */
import { describe, test, expect, beforeAll } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { trackPosition } from '../../src/runtime/track-position'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register()
  }
})

describe('trackPosition', () => {
  test('samples immediately, then on every scroll and resize', () => {
    let calls = 0
    const dispose = trackPosition(() => {
      calls++
    })
    expect(calls).toBe(1)

    window.dispatchEvent(new Event('scroll'))
    expect(calls).toBe(2)
    window.dispatchEvent(new Event('resize'))
    expect(calls).toBe(3)

    dispose()
  })

  test('a scroll inside a nested container is observed (capture phase)', () => {
    let calls = 0
    const dispose = trackPosition(() => {
      calls++
    })
    const inner = document.createElement('div')
    document.body.appendChild(inner)
    // `scroll` does not bubble; only a capture-phase window listener sees
    // a nested scroll container's event.
    inner.dispatchEvent(new Event('scroll', { bubbles: false }))
    expect(calls).toBe(2)
    inner.remove()
    dispose()
  })

  test('dispose re-samples exactly once, then stops listening', () => {
    let calls = 0
    const dispose = trackPosition(() => {
      calls++
    })
    expect(calls).toBe(1)

    // The close-time sample: a scroll that already moved the page but has
    // not dispatched its (coalesced) event yet must still be reflected.
    dispose()
    expect(calls).toBe(2)

    // Nothing after dispose — the event that would have been coalesced
    // away is dropped, not double-applied.
    window.dispatchEvent(new Event('scroll'))
    window.dispatchEvent(new Event('resize'))
    expect(calls).toBe(2)
  })

  test('dispose detaches its own listeners only', () => {
    let calls = 0
    const dispose = trackPosition(() => {
      calls++
    })
    let otherCalls = 0
    const other = () => {
      otherCalls++
    }
    window.addEventListener('scroll', other, true)
    dispose()
    window.dispatchEvent(new Event('scroll'))
    expect(calls).toBe(2)
    expect(otherCalls).toBe(1)
    window.removeEventListener('scroll', other, true)
  })
})

/**
 * Invalidation bus (spec/async.md §7.4, async layer 0, #3199) — the meeting
 * point between `createQuery`'s cache and the router's page cache, which
 * don't otherwise import each other.
 */

import { describe, test, expect } from 'bun:test'
import { invalidate, onInvalidate, __listenerCountForTests, type InvalidationListener } from '../invalidation-bus'

describe('subscribe / unsubscribe', () => {
  test('a subscriber receives a published invalidation', () => {
    const received: (readonly string[])[] = []
    const unsubscribe = onInvalidate((prefixes) => received.push(prefixes))
    invalidate(['/api/posts'])
    expect(received).toEqual([['/api/posts']])
    unsubscribe()
  })

  test('unsubscribe stops further deliveries', () => {
    const received: (readonly string[])[] = []
    const unsubscribe = onInvalidate((prefixes) => received.push(prefixes))
    invalidate(['/api/a'])
    unsubscribe()
    invalidate(['/api/b'])
    expect(received).toEqual([['/api/a']])
  })

  test('unsubscribing is reflected in the listener count', () => {
    const before = __listenerCountForTests()
    const unsubscribe = onInvalidate(() => {})
    expect(__listenerCountForTests()).toBe(before + 1)
    unsubscribe()
    expect(__listenerCountForTests()).toBe(before)
  })
})

describe('a throwing listener', () => {
  test('does not stop the other listeners from running', () => {
    const order: string[] = []
    const originalError = console.error
    console.error = () => {} // the bus reports the throw; keep the test's own output clean
    try {
      const unsubA = onInvalidate(() => {
        order.push('a')
        throw new Error('boom')
      })
      const unsubB = onInvalidate(() => order.push('b'))
      invalidate(['/api/x'])
      expect(order).toEqual(['a', 'b'])
      unsubA()
      unsubB()
    } finally {
      console.error = originalError
    }
  })
})

describe('cross-instance sharing', () => {
  test('two module instances resolve to the same registry via a well-known globalThis symbol', () => {
    // Two bundles each resolving `@barefootjs/shared` independently get two
    // distinct module instances — distinct closures, distinct top-level
    // `const` bindings. What must be shared is the registry itself, so this
    // reaches it exactly the way a *second* instance of this module would:
    // through `globalThis[Symbol.for(...)]`, never through this module's own
    // binding. `Symbol.for` is guaranteed to return the same symbol for the
    // same description globally, which is the mechanism that makes this work.
    const key = Symbol.for('@barefootjs/shared/invalidation-bus')
    const registry = globalThis as unknown as Record<symbol, { listeners: Set<InvalidationListener> } | undefined>

    const received: (readonly string[])[] = []
    const unsubscribe = onInvalidate((prefixes) => received.push(prefixes))

    // The bus this module's `onInvalidate` just registered into is reachable
    // at the well-known key — i.e. it's the same object a second module
    // instance's own `getBus()` would return, not a private module-local one.
    const bus = registry[key]
    expect(bus).toBeDefined()
    expect(bus!.listeners.size).toBeGreaterThan(0)

    // Publish the way that "other instance"'s own `invalidate()` would —
    // straight through the shared registry, bypassing this module's
    // `invalidate` export entirely — and confirm our listener still fires.
    for (const listener of bus!.listeners) listener(['/api/shared'])
    expect(received).toEqual([['/api/shared']])
    unsubscribe()
  })
})

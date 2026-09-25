/**
 * Invalidation bus (spec/async.md §7.4, async layer 0, #3199).
 *
 * `createMutation`'s `invalidates` option has to evict two caches on a
 * successful write:
 *
 * - `createQuery`'s module-level cache (`packages/client/src/create-query.ts`).
 * - The router's page cache (`packages/router/src/cache.ts`).
 *
 * Neither package imports the other — both depend only on
 * `@barefootjs/shared` — so this bus is the meeting point rather than a new
 * dependency edge between `@barefootjs/client` and `@barefootjs/router`.
 *
 * The registry lives on `globalThis` under a `Symbol.for` key (not a plain
 * module-level variable) so two copies of this module — two separate
 * bundles, or the client and the router each resolving `@barefootjs/shared`
 * on their own — still publish to and subscribe from one shared bus, rather
 * than each holding an isolated listener set that never observes the
 * other's invalidations.
 */

/** A published invalidation: the key/URL prefixes a write just made stale. */
export type InvalidationListener = (prefixes: readonly string[]) => void

const REGISTRY_KEY = Symbol.for('@barefootjs/shared/invalidation-bus')

interface InvalidationBus {
  listeners: Set<InvalidationListener>
}

function getBus(): InvalidationBus {
  const registry = globalThis as unknown as Record<symbol, InvalidationBus | undefined>
  let bus = registry[REGISTRY_KEY]
  if (!bus) {
    bus = { listeners: new Set() }
    registry[REGISTRY_KEY] = bus
  }
  return bus
}

/**
 * Publish one invalidation. Every current subscriber is called, in
 * subscription order, with `prefixes` unchanged; what "matches" means is up
 * to each subscriber (`createQuery`'s cache matches by URL prefix, the
 * router evicts its whole page cache unconditionally — see spec/async.md
 * §7.4).
 *
 * A listener that throws is reported (`console.error`) and does not stop
 * the remaining listeners from running.
 */
export function invalidate(prefixes: readonly string[]): void {
  for (const listener of getBus().listeners) {
    try {
      listener(prefixes)
    } catch (err) {
      console.error('[barefootjs] an invalidation listener threw:', err)
    }
  }
}

/**
 * Subscribe to invalidations published by {@link invalidate}. Returns the
 * unsubscribe function.
 */
export function onInvalidate(listener: InvalidationListener): () => void {
  const bus = getBus()
  bus.listeners.add(listener)
  return () => {
    bus.listeners.delete(listener)
  }
}

/**
 * Test-only: the number of currently subscribed listeners. Not part of the
 * public API — used to assert that a subscriber (e.g. `startRouter`'s
 * `stop()`) actually unsubscribes, which no externally observable behavior
 * otherwise proves.
 *
 * @internal
 */
export function __listenerCountForTests(): number {
  return getBus().listeners.size
}

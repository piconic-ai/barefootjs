/**
 * Regression: when a child component's `hydrate()` registers BEFORE its
 * parent's, the document-order walker should still init the parent first
 * so the child's `useContext` resolves on the very first hydrate pass.
 *
 * Mirrors the bundled-module-order failure from
 * `worker/components/canvas/catalog/AxisCatalog.tsx` in piconic-ai/desk —
 * `hydrate('NodeBridge', ...)` lands in the bundle output before
 * `hydrate('AxisCatalog', ...)`, so a per-name walk would init the
 * descendant before the ancestor's `provideContext` had run.
 *
 * Issue: doc-order-hydrate follow-up to #1166 / #1169 / #1171.
 */
import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register()
})

describe('hydrate walks elements in document order', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('descendant useContext resolves when parent hydrate() registers AFTER child', async () => {
    const { createContext, provideContext, useContext } = await import('../../src/runtime/context')
    const { hydrate } = await import('../../src/runtime/hydrate')

    const Store = createContext<{ value: number } | undefined>(undefined)

    document.body.innerHTML =
      `<div bf-s="DocOrderParent_root">` +
        `<div bf-s="DocOrderChild_leaf"></div>` +
      `</div>`

    let observed: { value: number } | undefined

    // Register child FIRST — mimics bundle output where the renderNode
    // component lands above its `<Flow>` parent in module exec order.
    hydrate('DocOrderChild', {
      init: () => {
        observed = useContext(Store)
      },
    })

    hydrate('DocOrderParent', {
      init: () => {
        provideContext(Store, { value: 7 })
      },
    })

    await Promise.resolve()

    expect(observed).toEqual({ value: 7 })
  })

  test('multiple descendants under the same parent all see provided context', async () => {
    const { createContext, provideContext, useContext } = await import('../../src/runtime/context')
    const { hydrate } = await import('../../src/runtime/hydrate')

    const Store = createContext<string | undefined>(undefined)

    document.body.innerHTML =
      `<div bf-s="DocOrderParent2_root">` +
        `<div bf-s="DocOrderChild2_a"></div>` +
        `<div bf-s="DocOrderChild2_b"></div>` +
      `</div>`

    const observed: Array<string | undefined> = []

    hydrate('DocOrderChild2', {
      init: () => {
        observed.push(useContext(Store))
      },
    })

    hydrate('DocOrderParent2', {
      init: () => {
        provideContext(Store, 'hi')
      },
    })

    await Promise.resolve()

    expect(observed).toEqual(['hi', 'hi'])
  })

  test('flushHydration() drains pending walk synchronously', async () => {
    const { hydrate, flushHydration } = await import('../../src/runtime/hydrate')

    document.body.innerHTML = `<div bf-s="DocOrderFlush_1"></div>`

    let initRan = false

    hydrate('DocOrderFlush', {
      init: () => {
        initRan = true
      },
    })

    // Without flushHydration this would still be false until microtask
    // flush — that's the documented post-#1172 behaviour.
    expect(initRan).toBe(false)

    flushHydration()

    expect(initRan).toBe(true)

    // The queued microtask / rAF callbacks now treat themselves as
    // already-run and skip; no double-init even after we await.
    let rerunCount = 0
    hydrate('DocOrderFlush', {
      init: () => {
        rerunCount += 1
      },
    })
    flushHydration()
    await Promise.resolve()
    // Single hydrated element + WeakSet membership means re-running
    // the walk is a no-op for that scope.
    expect(rerunCount).toBe(0)
  })

  test('flushHydration() with nothing pending is a no-op', async () => {
    const { hydrate, flushHydration } = await import('../../src/runtime/hydrate')

    document.body.innerHTML = `<div bf-s="DocOrderFlushNoop_1"></div>`
    let initCount = 0

    hydrate('DocOrderFlushNoop', { init: () => initCount++ })
    flushHydration()
    expect(initCount).toBe(1)

    // No further hydrate() / rehydrateAll() — flushHydration must not
    // re-walk the DOM, which would be wasted work but also wouldn't
    // re-init (already in WeakSet).
    flushHydration()
    expect(initCount).toBe(1)
  })

  test('comment-scope parent inits before element-scope descendant in same doc', async () => {
    // Regression: an earlier draft of this PR ran the element-scope pass
    // first and the comment-scope pass second, which meant a comment-
    // rooted parent that called `provideContext()` only became visible
    // *after* every element-scope descendant had already missed it.
    // The unified TreeWalker(SHOW_ELEMENT | SHOW_COMMENT) pass below
    // must hydrate the parent (the comment) before the descendant
    // (the element) because that's true document order.
    const { createContext, provideContext, useContext } = await import('../../src/runtime/context')
    const { hydrate } = await import('../../src/runtime/hydrate')

    const Store = createContext<string | undefined>(undefined)

    document.body.innerHTML =
      `<!--bf-scope:DocOrderCommentParent_root|{"DocOrderCommentParent":{}}-->` +
      `<div bf-s="~DocOrderCommentParent_root_proxy">` +
        `<div bf-s="DocOrderCommentChild_leaf"></div>` +
      `</div>`

    let observed: string | undefined

    // Register child first (mimics bundled-output ordering).
    hydrate('DocOrderCommentChild', {
      init: () => {
        observed = useContext(Store)
      },
    })

    hydrate('DocOrderCommentParent', {
      init: () => {
        provideContext(Store, 'from-comment-parent')
      },
      comment: true,
    })

    await Promise.resolve()

    expect(observed).toBe('from-comment-parent')
  })
})

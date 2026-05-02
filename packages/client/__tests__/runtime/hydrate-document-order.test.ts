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
})

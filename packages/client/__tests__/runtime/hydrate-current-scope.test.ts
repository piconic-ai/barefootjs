/**
 * `hydrateComponent` (the DOM walker that picks up top-level scope
 * elements at hydrate time) sets `currentScope` to the scope element
 * before calling `init`. Without it, a component nested inside a
 * parent scope's DOM but hydrated as a top-level scope (e.g. a
 * `<Flow renderNode={Fn}>` bridge whose JSX is rendered by Flow's
 * SSR template into Flow's children but emits its own
 * `bf-s="ChildName_…"` marker) would call `useContext` against a
 * stale `currentScope` and miss every provided value upstream.
 *
 * The fix mirrors `createComponent`'s `setCurrentScope(element)`
 * around `init`, so `useContext`'s DOM ancestor walk starts from the
 * right anchor and finds the parent's `provideContext` value via
 * `parentElement` traversal.
 */
import { beforeAll, describe, expect, test } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register()
})

describe('hydrate sets currentScope before calling init', () => {
  test('child init can resolve a parent-provided context value', async () => {
    const { createContext, provideContext, useContext, setCurrentScope } = await import('../../src/runtime/context')
    const { hydrate } = await import('../../src/runtime/hydrate')

    const Theme = createContext<string>()

    // Build a SSR-shaped DOM where the parent's scope element has a
    // child whose `bf-s` marker triggers the top-level walker. The
    // parent provides `Theme` synchronously via `provideContext` before
    // the hydrate call so the value is on its CONTEXT_KEY map.
    const parent = document.createElement('section')
    parent.setAttribute('bf-s', 'Parent_root')
    document.body.appendChild(parent)

    // Provide on the parent element's CONTEXT_KEY map.
    const prevScope = setCurrentScope(parent)
    try {
      provideContext(Theme, 'dark')
    } finally {
      setCurrentScope(prevScope)
    }

    const child = document.createElement('div')
    child.setAttribute('bf-s', 'Child_inst')
    parent.appendChild(child)

    let observedTheme: string | undefined
    hydrate('Child', {
      init: (_el, _props) => {
        observedTheme = useContext(Theme)
      },
      template: () => '<div></div>',
    })

    expect(observedTheme).toBe('dark')
  })
})

/** `hydrateComponent` must mirror `createComponent`'s currentScope wrap so child `useContext` resolves. */
import { beforeAll, describe, expect, test } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register()
})

describe('hydrate sets currentScope before calling init', () => {
  test('child init resolves a parent-provided context value', async () => {
    const { createContext, provideContext, useContext, setCurrentScope } = await import('../../src/runtime/context')
    const { hydrate } = await import('../../src/runtime/hydrate')

    const Theme = createContext<string>()

    const parent = document.createElement('section')
    parent.setAttribute('bf-s', 'Parent_root')
    document.body.appendChild(parent)

    const prevScope = setCurrentScope(parent)
    provideContext(Theme, 'dark')
    setCurrentScope(prevScope)

    const child = document.createElement('div')
    child.setAttribute('bf-s', 'Child_inst')
    parent.appendChild(child)

    let observedTheme: string | undefined
    hydrate('Child', {
      init: () => {
        observedTheme = useContext(Theme)
      },
      template: () => '<div></div>',
    })
    await Promise.resolve()

    expect(observedTheme).toBe('dark')
  })
})

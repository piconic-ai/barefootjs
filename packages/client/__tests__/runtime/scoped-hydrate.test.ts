/**
 * Subtree-scoped re-hydration + disposal (P0 for the IR-driven router).
 *
 * - `rehydrateScope(root)` inits only the scopes inside `root` (O(root)),
 *   not the whole document like `rehydrateAll()`.
 * - `disposeScope(root)` tears down those scopes' reactive graphs, so a
 *   router can release the islands leaving a page instead of leaking.
 */
import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { createSignal, createEffect } from '../../src/reactive'
import { hydrate, rehydrateScope, disposeScope, flushHydration } from '../../src/runtime/hydrate'

beforeAll(() => {
  if (typeof window === 'undefined') GlobalRegistrator.register()
})

beforeEach(() => {
  document.body.innerHTML = ''
})

function mount(html: string): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  return host
}

test('rehydrateScope inits only the scopes inside the given root', () => {
  const seen: string[] = []
  hydrate('SWidget', {
    name: 'SWidget',
    init: (scope) => {
      seen.push(scope.getAttribute('bf-s')!)
    },
  })
  // Drain the walk that hydrate() scheduled so it can't hydrate our DOM.
  flushHydration()

  const a = mount('<div id="a"><div bf-s="SWidget_a1"></div></div>')
  mount('<div id="b"><div bf-s="SWidget_b2"></div></div>')

  rehydrateScope(a)

  // Only the scope inside `a` was initialized.
  expect(seen).toEqual(['SWidget_a1'])
})

test('disposeScope tears down a scope effect so it stops reacting', () => {
  const [n, setN] = createSignal(0)
  hydrate('SCounter', {
    name: 'SCounter',
    init: (scope) => {
      createEffect(() => {
        scope.textContent = String(n())
      })
    },
  })
  flushHydration()

  const root = mount('<section id="r"><div bf-s="SCounter_x"></div></section>')
  const el = root.querySelector('[bf-s]')!

  rehydrateScope(root)
  expect(el.textContent).toBe('0')

  setN(1)
  expect(el.textContent).toBe('1') // effect is live

  disposeScope(root)
  setN(2)
  expect(el.textContent).toBe('1') // disposed — effect no longer runs
})

test('disposeScope allows the same element to be re-hydrated later', () => {
  let inits = 0
  hydrate('SReinit', {
    name: 'SReinit',
    init: () => {
      inits += 1
    },
  })
  flushHydration()

  const root = mount('<div id="re"><div bf-s="SReinit_1"></div></div>')
  rehydrateScope(root)
  expect(inits).toBe(1)

  // Without disposal, a second walk must NOT re-init (hydratedScopes guard).
  rehydrateScope(root)
  expect(inits).toBe(1)

  // After disposal the mark is cleared, so it can hydrate again.
  disposeScope(root)
  rehydrateScope(root)
  expect(inits).toBe(2)
})

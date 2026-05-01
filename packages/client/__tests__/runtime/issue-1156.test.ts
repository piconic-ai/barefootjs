/**
 * Repro for issue #1156: useContext called from inlined child JSX template
 * doesn't see provideContext from parent's init.
 *
 * Compiler output for this pattern:
 *
 *   function Child() {
 *     const store = useContext(FlowContext)
 *     const display = createMemo(() => store?.value ?? 0)
 *     return <div>{display()}</div>
 *   }
 *   export function Flow() {
 *     provideContext(FlowContext, { value: 42 })
 *     return <div><Child /></div>
 *   }
 *
 * inlines the memo into Child's template, producing:
 *
 *   template: (_p) => `<div><!--bf:s0-->${useContext(FlowContext)?.value ?? 0}<!--/--></div>`
 *
 * Flow's template runs `renderChild('Child', ...)` BEFORE Flow's init has
 * called `provideContext`, so the inlined `useContext` runs with no provider.
 * Pre-fix it threw and aborted hydrate; post-fix it returns `undefined` and
 * init's `createEffect` repaints the slot once the provider is set up.
 */
import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { render } from '../../src/runtime/render'
import { hydrate } from '../../src/runtime/hydrate'
import {
  $c,
  $t,
  createContext,
  createEffect,
  initChild,
  provideContext,
  renderChild,
  useContext,
} from '../../src/runtime'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register()
  }
})

describe('issue #1156: useContext from inlined child template', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('CSR render does not throw when child template uses provider not yet set up', () => {
    type Store = { value: number }
    const FlowContext = createContext<Store>()

    hydrate('Issue1156NoDefaultChild', {
      init: ((__scope: Element) => {
        if (!__scope) return
        const store = useContext(FlowContext)
        const [_s0] = $t(__scope, 's0')
        createEffect(() => {
          if (_s0) _s0.nodeValue = String(store?.value ?? 0)
        })
      }) as never,
      template: () =>
        `<div><!--bf:s0-->${useContext(FlowContext)?.value ?? 0}<!--/--></div>`,
    })

    hydrate('Issue1156NoDefaultFlow', {
      init: ((__scope: Element) => {
        if (!__scope) return
        provideContext(FlowContext, { value: 99 })
        const [_s0] = $c(__scope, 's0')
        initChild('Issue1156NoDefaultChild', _s0, {})
      }) as never,
      template: () =>
        `<div>${renderChild('Issue1156NoDefaultChild', {}, undefined, 's0')}</div>`,
    })

    const container = document.createElement('div')
    document.body.appendChild(container)

    expect(() => render(container, 'Issue1156NoDefaultFlow', {})).not.toThrow()
  })

  test('SSR hydrate flow: createEffect repaints child with parent-provided value', () => {
    type Store = { value: number }
    const FlowContext = createContext<Store | undefined>(undefined)

    const def = {
      init: ((__scope: Element) => {
        if (!__scope) return
        provideContext(FlowContext, { value: 42 })
        const [_s0] = $c(__scope, 's0')
        initChild('Issue1156HydrChild', _s0, {})
      }) as never,
      template: () =>
        `<div>${renderChild('Issue1156HydrChild', {}, undefined, 's0')}</div>`,
    }

    hydrate('Issue1156HydrChild', {
      init: ((__scope: Element) => {
        if (!__scope) return
        const store = useContext(FlowContext)
        const [_s0] = $t(__scope, 's0')
        createEffect(() => {
          if (_s0) _s0.nodeValue = String(store?.value ?? 0)
        })
      }) as never,
      template: () =>
        `<div><!--bf:s0-->${useContext(FlowContext)?.value ?? 0}<!--/--></div>`,
    })

    hydrate('Issue1156HydrFlow', def)

    // Mimic SSR-rendered HTML with proper parent-child scope IDs.
    const parentId = 'Issue1156HydrFlow_ssr01'
    document.body.innerHTML =
      `<div bf-s="${parentId}">` +
        `<div bf-s="~${parentId}_s0">` +
          `<div><!--bf:s0-->0<!--/--></div>` +
        `</div>` +
      `</div>`

    expect(() => hydrate('Issue1156HydrFlow', def)).not.toThrow()
    expect(document.body.textContent).toBe('42')
  })
})

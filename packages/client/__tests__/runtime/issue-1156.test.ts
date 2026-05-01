/**
 * Repro for issue #1156: useContext called from inlined child JSX template
 * doesn't see provideContext from parent's init.
 *
 * Mirrors the actual compiler output for this pattern:
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
 * The memo's body is inlined into Child's template, producing:
 *
 *   template: (_p) => `<div><!--bf:s0-->${useContext(FlowContext)?.value ?? 0}<!--/--></div>`
 *
 * When Flow's template runs renderChild('Child', ...), Child's template runs
 * BEFORE Flow's init has called provideContext. Pre-fix, useContext threw
 * (when the context had no default value). Post-fix, useContext returns
 * undefined silently while in template scope, and init's createEffect
 * repaints the slot with the correct value once the provider is set up.
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

  test('child template useContext does not throw when context has no default (CSR render)', () => {
    type Store = { value: number }
    const FlowContext = createContext<Store>()

    function initIssue1156NoDefaultChild(__scope: Element, _p: Record<string, unknown> = {}) {
      if (!__scope) return
      const store = useContext(FlowContext)
      const [_s0] = $t(__scope, 's0')
      createEffect(() => {
        const __val = store?.value ?? 0
        if (_s0) _s0.nodeValue = String(__val ?? '')
      })
    }

    hydrate('Issue1156NoDefaultChild', {
      init: initIssue1156NoDefaultChild as never,
      template: (_p: unknown) =>
        `<div><!--bf:s0-->${(useContext(FlowContext))?.value ?? 0}<!--/--></div>`,
    })

    function initIssue1156NoDefaultFlow(__scope: Element, _p: Record<string, unknown> = {}) {
      if (!__scope) return
      provideContext(FlowContext, { value: 99 })
      const [_s0] = $c(__scope, 's0')
      initChild('Issue1156NoDefaultChild', _s0, {})
    }

    hydrate('Issue1156NoDefaultFlow', {
      init: initIssue1156NoDefaultFlow as never,
      template: (_p: unknown) =>
        `<div>${renderChild('Issue1156NoDefaultChild', {}, undefined, 's0')}</div>`,
    })

    const container = document.createElement('div')
    document.body.appendChild(container)

    // Pre-fix this threw "useContext: no provider found and no default value".
    // Post-fix the template renders with `undefined` substituted in for the
    // missing provider — the effect repaints once init completes.
    expect(() => render(container, 'Issue1156NoDefaultFlow', {})).not.toThrow()
  })

  test('child useContext sees parent-provided value via SSR hydrate flow', () => {
    type Store = { value: number }
    const FlowContext = createContext<Store | undefined>(undefined)

    function initIssue1156HydrChild(__scope: Element, _p: Record<string, unknown> = {}) {
      if (!__scope) return
      const store = useContext(FlowContext)
      const [_s0] = $t(__scope, 's0')
      createEffect(() => {
        const __val = store?.value ?? 0
        if (_s0) _s0.nodeValue = String(__val ?? '')
      })
    }

    hydrate('Issue1156HydrChild', {
      init: initIssue1156HydrChild as never,
      template: (_p: unknown) =>
        `<div><!--bf:s0-->${(useContext(FlowContext))?.value ?? 0}<!--/--></div>`,
    })

    function initIssue1156HydrFlow(__scope: Element, _p: Record<string, unknown> = {}) {
      if (!__scope) return
      provideContext(FlowContext, { value: 42 })
      const [_s0] = $c(__scope, 's0')
      initChild('Issue1156HydrChild', _s0, {})
    }

    hydrate('Issue1156HydrFlow', {
      init: initIssue1156HydrFlow as never,
      template: (_p: unknown) =>
        `<div>${renderChild('Issue1156HydrChild', {}, undefined, 's0')}</div>`,
    })

    // Mimic SSR-rendered HTML with proper parent-child scope IDs (matching
    // what insert() produces in production via setParentScopeId).
    const parentId = 'Issue1156HydrFlow_ssr01'
    const childSlotId = `${parentId}_s0`
    document.body.innerHTML =
      `<div bf-s="${parentId}">` +
        `<div bf-s="~${childSlotId}">` +
          `<div><!--bf:s0-->0<!--/--></div>` +
        `</div>` +
      `</div>`

    // Pre-fix the inlined useContext in Child's template would have thrown.
    // Post-fix init runs through and the effect repaints with 42.
    // (Re-running hydrate processes the freshly mounted SSR HTML.)
    expect(() => hydrate('Issue1156HydrFlow', {
      init: initIssue1156HydrFlow as never,
      template: (_p: unknown) =>
        `<div>${renderChild('Issue1156HydrChild', {}, undefined, 's0')}</div>`,
    })).not.toThrow()

    expect(document.body.textContent).toBe('42')
  })
})

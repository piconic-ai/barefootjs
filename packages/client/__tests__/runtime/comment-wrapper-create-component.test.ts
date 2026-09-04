/**
 * Regression test for #1222.
 *
 * `comment: true` components are transparent wrappers — their template
 * body is `${renderChild('Inner', ...)}` with no enclosing element of
 * their own, so the parsed `firstChild` IS the Inner component's root
 * (with its `~Inner_..._s0` scope marker). The CSR `createComponent`
 * string-path used to overwrite that `bf-s` with the wrapper's own
 * scope, stranding `$c(__scope, 's0')` lookups in the wrapper's init
 * — `_s0` resolved to null, the wrapper's `initChild('Inner', _s0,
 * ...)` bailed, and the Inner's body never ran.
 *
 * Surfaced through #1211 (synthesized inline-JSX-callback wrappers
 * are emitted with `comment: true`): `<Flow renderNode={(n) =>
 * <PillNode id={n.id} />}>` mounted PillNode but its initFn never
 * ran, so the JSX text-child slot stayed empty and `<Handle>` props
 * were never wired.
 *
 * Fix: when the registered def has `comment: true`, leave the inner
 * element's `bf-s` in place. `$cSingle`'s self-match fallback then
 * returns the scope element itself for the wrapper's slot lookup,
 * letting the wrapper's `initChild('Inner', _s0, ...)` mount the
 * Inner component correctly.
 */

import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register()
  }
})

describe('createComponent + comment: true wrapper (#1222)', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('preserves inner component scope when wrapper is registered with comment: true', async () => {
    // Re-import inside the test so the previous test's module mutations
    // (component registry) don't leak across tests; bun-test runs in
    // isolation but the static module-level Map persists across files.
    const {
      hydrate,
      createComponent,
      $c,
      initChild,
    } = await import('../../src/runtime')

    const innerInitCalls: Array<{ id: unknown; sawScope: boolean }> = []

    // Inner: a regular component with one prop and a single slot.
    hydrate('Inner_test1222', {
      init: (scope, p: any) => {
        innerInitCalls.push({ id: p?.id, sawScope: !!scope })
      },
      template: (p: any) =>
        `<div bf-s="Inner_test1222_${Math.random().toString(36).slice(2, 8)}_s0" data-id="${p.id}"></div>`,
    })

    // Wrapper: comment-mode (transparent). Its body is just the inner.
    hydrate('Wrapper_test1222', {
      init: (scope, p: any) => {
        const [_s0] = $c(scope, 's0')
        // The wrapper's slot lookup MUST resolve to the inner element.
        // Pre-fix this returned null because createComponent had
        // overwritten the inner's `bf-s` with the wrapper's scope.
        initChild('Inner_test1222', _s0, { id: p?.id })
      },
      template: (p: any) => {
        // Mirror the compiler's "comment: true" template shape:
        // pure renderChild interpolation with no enclosing element.
        const innerScope = `Inner_test1222_${Math.random().toString(36).slice(2, 8)}`
        return `<div bf-s="${innerScope}_s0" data-id="${p.id}"></div>`
      },
      comment: true,
    })

    // #2728: a bare mount now returns a DocumentFragment, not the inner
    // element directly — append first, then re-query the document.
    const result = createComponent('Wrapper_test1222', { id: 'src' })
    document.body.appendChild(result)
    const el = document.body.querySelector('[data-id]')!

    expect(innerInitCalls).toHaveLength(1)
    expect(innerInitCalls[0]).toEqual({ id: 'src', sawScope: true })
    // The element's bf-s should still be the inner's child-prefixed scope,
    // not the wrapper's. This is what lets `$c(scope, 's0')` self-match.
    const bfs = el.getAttribute('bf-s')
    expect(bfs).toMatch(/^Inner_test1222_/)
  })

  test('regular (non-comment) wrappers still get their bf-s overwritten as before', async () => {
    const {
      hydrate,
      createComponent,
    } = await import('../../src/runtime')

    hydrate('Normal_test1222', {
      init: () => {},
      template: () => `<div data-marker="payload"></div>`,
    })

    const el = createComponent('Normal_test1222', {})
    expect(el.getAttribute('bf-s')).toMatch(/^Normal_test1222_/)
    expect(el.getAttribute('data-marker')).toBe('payload')
  })
})

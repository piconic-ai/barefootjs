/**
 * Regression test for #2649 (grandchild composition through a
 * `comment: true` wrapper).
 *
 * `renderChild` pushes `_parentScopeId` to a child's OWN derived scope
 * while that child's `templateFn` evaluates (`component.ts`), so a
 * grandchild rendered inside it derives its `bf-s` from THIS child rather
 * than the caller — the fix for a third composition level collapsing onto
 * the second (`grandchild-composition`, `create-component-parent-scope
 * .test.ts` covers the parallel `createComponent` path).
 *
 * That push, on its own, reopens a DIFFERENT bug for a `comment: true`
 * wrapper (#1211 synthesized inline-JSX-callback wrappers, e.g. `<Flow
 * renderNode={(n) => <Body id={n.id} />}>`): the wrapper's own element IS
 * its single real child's element (no separate DOM node), so the
 * wrapper's init used to resolve that child via `$c(scope, 's0')`'s
 * self-match fallback (`comment-wrapper-create-component.test.ts`). Once
 * the real child's OWN first grandchild also derives a `bf-s` ending in
 * `_s0` (the exact scenario the push fixes), `$c(scope, 's0')`'s PRECISE
 * suffix search matches that grandchild first and never reaches the
 * self-match fallback — the wrapper's `initChild` receives the wrong
 * element, silently misrouting props/events onto a grandchild instead of
 * the real child (confirmed via `site/ui`'s xyflow Highlight-Depth demo,
 * where an early attempt at this exact push broke the `--node-glow`
 * style effect).
 *
 * Fix: a `comment: true` component's own root-level child needs no `$c`
 * lookup at all — it IS `__scope` (`ClientJsContext.commentScopeRootSlotId`,
 * `provider-and-child-inits.ts` / `emit-reactive.ts`). This test mirrors
 * that codegen shape directly (`__scope` for the wrapper's own child,
 * `$c` for the real child's OWN grandchildren) rather than routing the
 * wrapper's lookup through `$c` — the configuration this test guards
 * against is a wrapper init that goes back to `$c(scope, 's0')` for its
 * own child once a same-suffix grandchild exists underneath it.
 */

import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register()
  }
})

describe('comment: true wrapper + grandchild slot collision (#2649)', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('wrapper resolves its own (merged) child via __scope, not a same-suffix grandchild', async () => {
    const { hydrate, createComponent, renderChild, $c, initChild } = await import('../../src/runtime')

    const handleInitCalls: Array<{ kind: unknown; scope: string | null }> = []
    const bodyInitCalls: Array<{ id: unknown; scope: string | null }> = []

    // Handle: a real child component with no children of its own — the
    // "grandchild" whose slot suffix (`s0`, the first child) coincides
    // with the wrapper's own mount slot in its caller.
    hydrate('Handle_test2649', {
      init: (scope: Element | null, p: any) => {
        handleInitCalls.push({ kind: p?.kind, scope: scope?.getAttribute('bf-s') ?? null })
      },
      template: (p: any) => `<div data-role="handle">${p.kind}</div>`,
      name: 'Handle',
    })

    // Body: the real component the wrapper renders. Its FIRST child is
    // Handle at slot s0 — the same slot label the wrapper itself is
    // mounted at, one level up.
    hydrate('Body_test2649', {
      init: (scope: Element | null, p: any) => {
        bodyInitCalls.push({ id: p?.id, scope: scope?.getAttribute('bf-s') ?? null })
        const [s0, s1] = $c(scope, 's0', 's1')
        initChild('Handle_test2649', s0, { kind: 'target' })
        initChild('Handle_test2649', s1, { kind: 'source' })
      },
      template: (p: any) =>
        `<div data-role="body">${renderChild('Handle_test2649', { kind: 'target' }, undefined, 's0')}<span>${p.id}</span>${renderChild('Handle_test2649', { kind: 'source' }, undefined, 's1')}</div>`,
      name: 'Body',
    })

    // Wrapper: `comment: true` — transparent, its element IS Body's own
    // element. Mirrors the compiler's fix: the wrapper's own child slot
    // (`s0` relative to ITS caller) is `__scope` directly, never `$c`.
    hydrate('Wrapper_test2649', {
      init: (scope: Element | null, p: any) => {
        initChild('Body_test2649', scope, { id: p?.id })
      },
      template: (p: any) => `${renderChild('Body_test2649', { id: p.id }, undefined, 's0')}`,
      comment: true,
      name: 'Wrapper',
    })

    // Mount the wrapper as slot `s0` of some caller — the same slot
    // label Body's own first child (Handle target) will end up with,
    // once `renderChild`'s push makes Body derive its OWN scope.
    const el = createComponent('Wrapper_test2649', { id: 'n1' }, undefined, {
      parent: 'Flow_root',
      mount: 's0',
    })
    document.body.appendChild(el)

    // Body's own scope is the wrapper's borrowed identity: `Flow_root_s0`.
    expect(el.getAttribute('bf-s')).toBe('Flow_root_s0')

    // Body's init ran exactly once, on the correct (self-merged) element —
    // not skipped, not run on a grandchild.
    expect(bodyInitCalls).toHaveLength(1)
    expect(bodyInitCalls[0]).toEqual({ id: 'n1', scope: 'Flow_root_s0' })

    // Both Handle children resolved and initialised — the collapse bug
    // left the SECOND handle's `$c` lookup null (the first one
    // coincidentally matched the wrapper's own misrouted resolution).
    expect(handleInitCalls).toHaveLength(2)
    expect(handleInitCalls).toEqual(
      expect.arrayContaining([
        { kind: 'target', scope: 'Flow_root_s0_s0' },
        { kind: 'source', scope: 'Flow_root_s0_s1' },
      ]),
    )
  })
})

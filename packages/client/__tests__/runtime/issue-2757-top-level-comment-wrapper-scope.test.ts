/**
 * Regression tests for #2757: a TOP-LEVEL "root is a child call" component
 * (`comment: true`, `fragmentRoot: false` — #1211/#2649) must still thread a
 * scope id into the nested `renderChild`, so the child's `bf-s` prefix agrees
 * with the SSR/hydration convention.
 *
 * Measured on the Hono reference for this shape:
 *
 *   <div ... bf-s="<parentScope>_s2" bf-h="<parentScope>" bf-m="s2">
 *
 * Pre-fix, `materializeComponent` set `_parentScopeId` only from its own
 * `scopeId` (null by design for this shape) or from `slot.parent` (absent for a
 * top-level mount), so `renderChild` fell through to its "no parent known"
 * fallback and named the child after ITSELF (`PairwiseRow_xyz_s2`), emitting no
 * `bf-h`/`bf-m` at all — a csr-mount-only divergence from both other legs.
 */

import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register()
  }
})

describe('top-level root-is-a-child-call scope threading (#2757)', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('names the child after the WRAPPER, not after itself, and stamps bf-h/bf-m', async () => {
    const { hydrate, createComponent, renderChild } = await import('../../src/runtime')

    hydrate('Row2757', {
      init: () => {},
      template: (p: any) => `<div bf="s0">${p.children}</div>`,
    })
    // `comment: true` + no `fragmentRoot`: the wrapper's rendered firstChild IS
    // the child's own already-scoped element, so the wrapper never stamps a
    // `bf-s` of its own.
    hydrate('Case2757', {
      init: () => {},
      template: () => `${renderChild('Row2757', { children: '<span>0</span>' }, undefined, 's2')}`,
      comment: true,
    })

    // #2728: this bare top-level comment-wrapper mount now returns a
    // DocumentFragment carrying its own `<!--bf-scope:-->` boundary
    // comments (mirroring a genuine fragment root, #2722) — append first,
    // then re-acquire the child element from the document.
    const result = createComponent('Case2757', {})
    document.body.appendChild(result)
    const el = document.body.querySelector('div')!

    const scope = el.getAttribute('bf-s')!
    expect(scope).toMatch(/^Case2757_[a-z0-9]+_s2$/)
    expect(el.getAttribute('bf-h')).toBe(scope.slice(0, -'_s2'.length))
    expect(el.getAttribute('bf-m')).toBe('s2')
  })

  test('two mounts of the same wrapper get distinct scopes', async () => {
    const { hydrate, createComponent, renderChild } = await import('../../src/runtime')

    hydrate('RowB2757', { init: () => {}, template: () => `<div bf="s0"></div>` })
    hydrate('CaseB2757', {
      init: () => {},
      template: () => `${renderChild('RowB2757', {}, undefined, 's0')}`,
      comment: true,
    })

    // #2728: bare top-level mounts of this comment-wrapper now return a
    // DocumentFragment (detached DocumentFragments still support
    // querySelector, so no need to append to the live document here).
    const a = createComponent('CaseB2757', {}) as DocumentFragment
    const b = createComponent('CaseB2757', {}) as DocumentFragment
    const divA = a.querySelector('div')!
    const divB = b.querySelector('div')!
    expect(divA.getAttribute('bf-s')).not.toBe(divB.getAttribute('bf-s'))
  })

  test('a wrapper mounted WITH a slot still inherits slot.parent (#1320 unchanged)', async () => {
    // Reverse direction: the derived id must not displace the two existing
    // sources of truth. A comment wrapper given a slot keeps resolving the
    // hoisted-children placeholder against `slot.parent`.
    const { hydrate, createComponent, renderChild } = await import('../../src/runtime')

    hydrate('BoxC2757', {
      init: () => {},
      template: (p: any) => `<div bf="s0">${p.children}</div>`,
    })
    hydrate('CaseC2757', {
      init: () => {},
      template: () =>
        `${renderChild('BoxC2757', { children: '<span bf-s="__BF_PARENT_SCOPE__">x</span>' }, undefined, 's0')}`,
      comment: true,
    })

    const el = createComponent('CaseC2757', {}, undefined, { parent: 'Host_abc', mount: 's4' }) as HTMLElement
    document.body.appendChild(el)

    expect(el.getAttribute('bf-s')).toBe('Host_abc_s0')
    // The placeholder resolves against the CALLER's ambient scope, which
    // `renderChild` restores before substituting — `Host_abc`, not the
    // wrapper's derived `Host_abc_s0`. Unchanged by #2757.
    expect(el.querySelector('span')!.getAttribute('bf-s')).toBe('Host_abc')
  })

  test('a non-comment top-level component is unaffected', async () => {
    // Reverse direction: the ordinary shape already had a `scopeId`, so the
    // new branch must never be reached for it.
    const { hydrate, createComponent, renderChild } = await import('../../src/runtime')

    hydrate('LeafD2757', { init: () => {}, template: () => `<em bf="s0"></em>` })
    hydrate('CaseD2757', {
      init: () => {},
      template: () => `<div bf="s0">${renderChild('LeafD2757', {}, undefined, 's1')}</div>`,
    })

    const el = createComponent('CaseD2757', {}) as HTMLElement
    document.body.appendChild(el)
    const scope = el.getAttribute('bf-s')!
    expect(scope).toMatch(/^CaseD2757_[a-z0-9]+$/)
    expect(el.querySelector('em')!.getAttribute('bf-s')).toBe(`${scope}_s1`)
  })
})

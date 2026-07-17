/**
 * Fragment-rooted child components hydrate through a `<!--bf-scope:...-->`
 * comment instead of a `bf-s`/`bf-h`/`bf-m` element (#2289). These tests pin
 * the parent→child linkage for that shape:
 *
 *   - the parent's `$c(scope, 'sN')` resolves the comment-anchored child, so
 *     `initChild` delivers LIVE props — callbacks and reactive getters — not
 *     the JSON-safe subset serialized into the comment;
 *   - the child's own queries stay inside its comment range, bounded by the
 *     paired `<!--bf-/scope:...-->` end marker.
 *
 * DOM shapes mirror the hono adapter's SSR output; init functions mirror the
 * compiled client JS for the issue's repro (a `<button>` + `<p>` fragment).
 */
import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register()
})

/** SSR output of a ParentIsland rendering a fragment-rooted ChildFragment. */
function mountParentWithFragmentChild(parentId: string): void {
  document.body.innerHTML =
    `<div bf-s="${parentId}" bf-r="">` +
    '<span bf="s1"><!--bf:s0-->0<!--/--></span>' +
    `<!--bf-scope:${parentId}_s2|h=${parentId}|m=s2|{"label":"add"}-->` +
    '<button bf="s1"><!--bf:s0-->add<!--/--></button>' +
    '<p>hint</p>' +
    `<!--bf-/scope:${parentId}_s2-->` +
    '</div>'
}

/**
 * Same shape as `mountParentWithFragmentChild`, but the child's `bf="s1"`
 * slot sits one level inside the fragment's first top-level sibling (e.g.
 * `<header><button>` instead of a bare top-level `<button>`) — mirrors
 * piconic-ai/sora's `AppHeader` component (#2302), where every internal
 * slot is nested inside `<header>`/`<div popover>` rather than being a
 * direct child of the fragment itself.
 */
function mountParentWithNestedFragmentChild(parentId: string): void {
  document.body.innerHTML =
    `<div bf-s="${parentId}" bf-r="">` +
    '<span bf="s1"><!--bf:s0-->0<!--/--></span>' +
    `<!--bf-scope:${parentId}_s2|h=${parentId}|m=s2|{"label":"add"}-->` +
    '<header><button bf="s1"><!--bf:s0-->add<!--/--></button></header>' +
    '<p>hint</p>' +
    `<!--bf-/scope:${parentId}_s2-->` +
    '</div>'
}

describe('fragment-rooted child hydration (#2289)', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('$c resolves the comment-anchored child scope inside the parent', async () => {
    const { $c } = await import('../../src/runtime/query.ts')
    const { commentScopeRegistry } = await import('../../src/runtime/scope.ts')

    mountParentWithFragmentChild('ParentA_abc')
    const parentScope = document.querySelector('[bf-s="ParentA_abc"]')!

    const [child] = $c(parentScope, 's2')

    expect(child).not.toBeNull()
    expect(child!.tagName).toBe('BUTTON')
    // The proxy must be registered so the child's own $/$t walk the comment range.
    const info = commentScopeRegistry.get(child!)
    expect(info?.scopeId).toBe('ParentA_abc_s2')
  })

  test('function props and reactive getter props reach the child via initChild', async () => {
    const { hydrate, flushHydration } = await import('../../src/runtime/hydrate.ts')
    const { initChild } = await import('../../src/runtime/registry.ts')
    const { $, $t, $c } = await import('../../src/runtime/query.ts')
    const { createSignal, createEffect } = await import('../../src/reactive.ts')
    const { __bfText } = await import('../../src/runtime/index.ts')

    mountParentWithFragmentChild('ParentB_abc')

    // ChildFragB.client.js (compiled shape)
    function initChildFragB(__scope: Element, _p: Record<string, unknown> = {}) {
      if (!__scope) return
      const [_s1] = $(__scope, 's1')
      const [_s0] = $t(__scope, 's0')
      let __anchor_s0: Text | null = _s0
      createEffect(() => {
        __anchor_s0 = __bfText(__anchor_s0, (_p as { label?: unknown }).label)
      })
      if (_s1) _s1.addEventListener('click', () => (_p as { onClick: () => void }).onClick())
    }
    hydrate('ChildFragB', {
      init: initChildFragB,
      template: (_p) => `<button bf="s1"><!--bf:s0-->${_p.label}<!--/--></button><p>hint</p>`,
      comment: true,
    })

    // ParentB.client.js (compiled shape): label is a live getter over
    // the parent's signal, onClick a real function reference.
    function initParentB(__scope: Element) {
      if (!__scope) return
      const [count, setCount] = createSignal(0)
      const [_s0] = $t(__scope, 's0')
      const [_s2] = $c(__scope, 's2')
      let __anchor_s0: Text | null = _s0
      createEffect(() => {
        __anchor_s0 = __bfText(__anchor_s0, count())
      })
      initChild('ChildFragB', _s2, {
        get label() { return `add:${count()}` },
        onClick: () => setCount((c: number) => c + 1),
      })
    }
    hydrate('ParentB', { init: initParentB, template: () => '<div></div>' })

    flushHydration()

    const button = document.querySelector('button')!
    button.click()

    // Callback prop fired: the parent's signal moved and its text updated.
    expect(document.querySelector('span')!.textContent).toContain('1')
    // Getter prop is live: the child's text effect re-ran with the new value.
    expect(button.textContent).toContain('add:1')
  })

  test('$ resolves a slot nested inside one of the fragment child\'s top-level siblings (#2302)', async () => {
    const { $, $c } = await import('../../src/runtime/query.ts')

    mountParentWithNestedFragmentChild('ParentNest_abc')
    const parentScope = document.querySelector('[bf-s="ParentNest_abc"]')!

    const [child] = $c(parentScope, 's2')
    expect(child).not.toBeNull()
    expect(child!.tagName).toBe('HEADER')

    // Before the #2302 fix, `.closest('[bf-s]')` from the nested <button>
    // always found the parent island's own bf-s element and rejected the
    // candidate, so this returned null — no listener was ever attached.
    const [slot] = $(child!, 's1')
    expect(slot).not.toBeNull()
    expect(slot!.tagName).toBe('BUTTON')
  })

  test('callback prop reaches a slot nested inside the fragment child (#2302)', async () => {
    const { hydrate, flushHydration } = await import('../../src/runtime/hydrate.ts')
    const { initChild } = await import('../../src/runtime/registry.ts')
    const { $, $t, $c } = await import('../../src/runtime/query.ts')
    const { createSignal, createEffect } = await import('../../src/reactive.ts')
    const { __bfText } = await import('../../src/runtime/index.ts')

    mountParentWithNestedFragmentChild('ParentNest_abc')

    // ChildFragNest.client.js (compiled shape): slot is one level inside
    // the fragment's <header>, mirroring AppHeader's <header><select>/
    // <header><button> nesting.
    function initChildFragNest(__scope: Element, _p: Record<string, unknown> = {}) {
      if (!__scope) return
      const [_s1] = $(__scope, 's1')
      const [_s0] = $t(__scope, 's0')
      let __anchor_s0: Text | null = _s0 as Text | null
      createEffect(() => {
        __anchor_s0 = __bfText(__anchor_s0, (_p as { label?: unknown }).label) as Text | null
      })
      if (_s1) _s1.addEventListener('click', () => (_p as { onClick: () => void }).onClick())
    }
    hydrate('ChildFragNest', {
      init: initChildFragNest,
      template: (_p) => `<header><button bf="s1"><!--bf:s0-->${_p.label}<!--/--></button></header><p>hint</p>`,
      comment: true,
    })

    function initParentNest(__scope: Element) {
      if (!__scope) return
      const [count, setCount] = createSignal(0)
      const [_s0] = $t(__scope, 's0')
      const [_s2] = $c(__scope, 's2')
      let __anchor_s0: Text | null = _s0 as Text | null
      createEffect(() => {
        __anchor_s0 = __bfText(__anchor_s0, count()) as Text | null
      })
      initChild('ChildFragNest', _s2, {
        get label() { return `add:${count()}` },
        onClick: () => setCount((c: number) => c + 1),
      })
    }
    hydrate('ParentNest', { init: initParentNest, template: () => '<div></div>' })

    flushHydration()

    const button = document.querySelector('button')!
    button.click()

    // Before the #2302 fix, `_s1` above resolved to null, so no listener
    // was ever attached — this click would silently do nothing.
    expect(document.querySelector('span')!.textContent).toContain('1')
    expect(button.textContent).toContain('add:1')
  })

  test("a parent's own slot search doesn't reach into a nested fragment child's coincidentally-numbered slot (#2302)", async () => {
    const { hydrate, flushHydration } = await import('../../src/runtime/hydrate.ts')
    const { $, $c } = await import('../../src/runtime/query.ts')
    const { createEffect } = await import('../../src/reactive.ts')

    // Mirrors piconic-ai/sora's App + AppHeader: App's own `bf="s5"` element
    // (the sidebar-collapse button) sits AFTER a fragment-rooted AppHeader
    // child whose OWN internal numbering coincidentally also uses `bf="s5"`
    // (the info-button) for something unrelated, nested one level inside
    // <header>. Slot ids are local to each component's own template, so
    // this collision is normal — only scope-boundary resolution keeps them
    // apart.
    document.body.innerHTML =
      '<div bf-s="ParentCollide_abc" bf-r="">' +
      '<!--bf-scope:ParentCollide_abc_s0|h=ParentCollide_abc|m=s0-->' +
      '<header><button bf="s5" aria-label="child">i</button></header>' +
      '<!--bf-/scope:ParentCollide_abc_s0-->' +
      '<button bf="s5" aria-label="parent">collapse</button>' +
      '</div>'

    // ParentCollide.client.js (compiled shape): the parent's own `$()` for
    // its regular slots runs BEFORE `$c()` resolves (and registers) the
    // fragment child's scope — the actual compiled order (#2302's root
    // cause: at the time `$('s5')` runs, the child's comment scope isn't
    // in commentScopeRegistry yet, so registry-based detection can't help).
    function initParentCollide(__scope: Element) {
      if (!__scope) return
      const [_s5] = $(__scope, 's5')
      $c(__scope, 's0')
      createEffect(() => {
        if (_s5) _s5.setAttribute('aria-expanded', 'true')
      })
    }
    hydrate('ParentCollide', { init: initParentCollide, template: () => '<div></div>' })
    flushHydration()

    const parentButton = document.querySelector('[aria-label="parent"]')!
    const childButton = document.querySelector('[aria-label="child"]')!

    // Before the fix, `closest('[bf-s]')` from the child button walked past
    // <header> (no bf-s of its own) straight to the ParentCollide root, so
    // `belongsToScope` wrongly matched it — `_s5` resolved to whichever
    // bf="s5" element querySelectorAll found first (document order: the
    // child's), and `aria-expanded` landed on the wrong button.
    expect(parentButton.getAttribute('aria-expanded')).toBe('true')
    expect(childButton.getAttribute('aria-expanded')).toBeNull()
  })

  test('initChild queues until the child module registers (parent-first load order)', async () => {
    const { hydrate, flushHydration } = await import('../../src/runtime/hydrate.ts')
    const { initChild } = await import('../../src/runtime/registry.ts')
    const { $c } = await import('../../src/runtime/query.ts')

    mountParentWithFragmentChild('ParentC_abc')

    let received: Record<string, unknown> | null = null
    function initParent(__scope: Element) {
      const [_s2] = $c(__scope, 's2')
      initChild('LateChildC', _s2, { onClick: () => {} })
    }
    hydrate('ParentC', { init: initParent, template: () => '<div></div>' })
    flushHydration()

    // Child module arrives after the parent already ran initChild.
    hydrate('LateChildC', {
      init: (_scope, props) => { received = props ?? null },
      template: () => '<button></button><p></p>',
      comment: true,
    })
    flushHydration()

    expect(received).not.toBeNull()
    expect(typeof received!.onClick).toBe('function')
  })

  test('child queries stop at the bf-/scope end marker instead of leaking onto later parent siblings', async () => {
    const { $ } = await import('../../src/runtime/query.ts')
    const { commentScopeRegistry } = await import('../../src/runtime/scope.ts')

    // The child has no bf="s3" element (e.g. a false conditional branch); the
    // parent owns one AFTER the child in the same container. Without the end
    // marker the child's query used to grab it — the mechanism behind the
    // issue's misattached aria-binding symptom.
    document.body.innerHTML =
      '<div bf-s="ParentD_abc">' +
      '<!--bf-scope:ParentD_abc_s2|h=ParentD_abc|m=s2-->' +
      '<button bf="s1">go</button>' +
      '<p>hint</p>' +
      '<!--bf-/scope:ParentD_abc_s2-->' +
      '<em bf="s3">parent-owned</em>' +
      '</div>'

    const container = document.querySelector('[bf-s="ParentD_abc"]')!
    const comment = container.firstChild as Comment
    const proxy = container.querySelector('button')!
    commentScopeRegistry.set(proxy, { commentNode: comment, scopeId: 'ParentD_abc_s2' })

    const [inRange] = $(proxy, 's1')
    const [leaked] = $(proxy, 's3')
    expect(inRange).toBe(proxy)
    expect(leaked).toBeNull()
  })

  test('boundary falls back to the legacy heuristic when no end marker exists (older SSR output)', async () => {
    const { getCommentScopeBoundary } = await import('../../src/runtime/scope.ts')

    document.body.innerHTML =
      '<div>' +
      '<!--bf-scope:Old_abc_s2|h=Old_abc|m=s2-->' +
      '<button>go</button>' +
      '<!--bf-scope:Old_abc_s4|h=Old_abc|m=s4-->' +
      '<p>next</p>' +
      '</div>'

    const first = document.querySelector('div')!.firstChild as Comment
    const boundary = getCommentScopeBoundary(first)
    expect(boundary?.nodeType).toBe(8 /* COMMENT_NODE */)
    expect((boundary as Comment).nodeValue).toStartWith('bf-scope:Old_abc_s4')
  })

  test('boundary skips a nested child scope pair and ends at its own end marker', async () => {
    const { getCommentScopeBoundary } = await import('../../src/runtime/scope.ts')

    // Outer fragment scope contains a nested fragment child at top level;
    // the outer range must extend past the child's begin comment to the
    // outer end marker.
    document.body.innerHTML =
      '<div>' +
      '<!--bf-scope:Outer_abc-->' +
      '<span>a</span>' +
      '<!--bf-scope:Outer_abc_s1|h=Outer_abc|m=s1-->' +
      '<button>inner</button>' +
      '<!--bf-/scope:Outer_abc_s1-->' +
      '<footer>outer tail</footer>' +
      '<!--bf-/scope:Outer_abc-->' +
      '</div>'

    const outer = document.querySelector('div')!.firstChild as Comment
    const boundary = getCommentScopeBoundary(outer)
    expect((boundary as Comment).nodeValue).toBe('bf-/scope:Outer_abc')
  })
})

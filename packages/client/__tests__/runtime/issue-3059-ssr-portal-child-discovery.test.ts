/**
 * Regression for #3059's follow-up: `upsertChild`'s primary `(bf-h, bf-m)`
 * lookup (`findSsrScopeBySlotIn`) searched only `parent`'s DOM DESCENDANTS.
 * The Hono adapter's `ssrPortalOwnerScope` fix (#3059) places a `ref`-
 * callback SSR-portal child's markup at its portal outlet (`<BfPortals
 * />`, a `document.body`-level SIBLING of the whole page tree) — so the
 * child is no longer a descendant of its logical parent's scope element
 * at all, and the primary lookup returned null. `upsertChild` fell all
 * the way through to the CSR placeholder branch, found none, and
 * returned null — the child's `init()` (its `ref` callback, its
 * `useContext`/`createEffect` wiring) never ran at all, silently. Caught
 * by the real-browser oracle suite (`fixture-hydrate.playwright.ts` /
 * `oracle.playwright.ts`'s `[idempotence]` checks) on dialog / dropdown-
 * menu / popover / combobox / select, all of which use this pattern —
 * every click/ESC/interaction assertion timed out because the component
 * was inert.
 *
 * Fixed in `findSsrScopeBySlotIn` (`slot-resolver.ts`): once the
 * descendant-scoped lookups (primary, suffix) fail, fall back to
 * `relocatedDescendants(hostEl)` (`scope.ts`) — the same host-by-`bf-h`
 * (with a bounded transitive pass for multi-hop forwarding) walk the
 * parent-owned-slot claim system uses — filtered to the SAME `(bf-h,
 * bf-m)` pair this parent would have matched had the child stayed
 * in-subtree. A self-owner-portaled element (a child component whose OWN
 * root carries `bf-s`) always stamps `bf-po` to ITS OWN scope id, never
 * its parent's — see `logicalHost`'s doc comment in `scope.ts` — so the
 * fixtures below give the portal-placed element its own `bf-po`, matching
 * exactly what `HonoAdapter.renderElement`'s `ssrPortalOwnerScope` branch
 * emits, not a `bf-po` naming the parent (a shape the adapter never
 * actually produces).
 *
 * A second gap surfaced later (#3115, driving PR #3099's `.map()`-loop
 * regression in `form-builder.spec.ts`): a target forwarded through MORE
 * than one authoring layer (e.g. `Select` > `SelectContent` > `SelectItem`,
 * all three called directly in one caller's JSX) is never itself
 * portal-owned — only the OUTERMOST relocated piece (`SelectContent`) is —
 * so `relocatedDescendants` never yields the inner target (`SelectItem`)
 * at all, and the portal fallback's original self-only check could never
 * find it either. `findSsrScopeBySlotIn` now searches each relocated
 * candidate's own SUBTREE too, not just the candidate itself (mirroring
 * `findInPortals` in `query.ts`, which already did this), with the same
 * `hydratedScopes` order tiebreak resolving which row's nested copy is
 * "this row's own" once a `.map()` loop repeats the identical
 * `(bf-h, bf-m)` pair on both the outer and inner piece.
 */

import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { upsertChild } from '../../src/runtime/registry'
import { hydrate, flushHydration } from '../../src/runtime/hydrate'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register()
  }
})

describe('upsertChild — SSR-portal child discovery (#3059)', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('finds a (bf-h, bf-m) child rendered at the portal outlet, outside the parent subtree, and runs its init', () => {
    let initRan = false
    let initScope: Element | null = null
    hydrate('PopoverContent', {
      init: (scope: Element) => {
        initRan = true
        initScope = scope
      },
      template: () => '<div bf="s0" data-slot="popover-content"></div>',
    })
    flushHydration()

    // Parent scope — the Popover's own root. In the real bug, its
    // children never include the content element at all: the adapter
    // renders it at the `<BfPortals />` outlet instead.
    const parent = document.createElement('div')
    parent.setAttribute('bf-s', 'PopoverBasicDemo_test')
    parent.innerHTML = '<button data-slot="popover-trigger">Open</button>'
    document.body.appendChild(parent)

    // The portal outlet — a document.body-level SIBLING of `parent`,
    // exactly where Hono's `<BfPortals />` renders (`site/ui/renderer.tsx`
    // places it directly under `<body>`, after the page's own children).
    // The compiler stamps `bf-h`/`bf-m` (this child's normal slot
    // identity, unaffected by the portal move) alongside `bf-po` (the
    // owner scope) directly on the SAME element — no wrapper div, per
    // `HonoAdapter.renderElement`'s `ssrPortalOwnerScope` branch.
    const outlet = document.createElement('div')
    outlet.innerHTML =
      '<div data-slot="popover-content" bf-h="PopoverBasicDemo_test" bf-m="s9" bf-s="PopoverBasicDemo_test_s9" bf-po="PopoverBasicDemo_test_s9" bf="s0"></div>'
    document.body.appendChild(outlet)

    const found = upsertChild(parent, 'PopoverContent', 's9', {}, undefined, parent)

    expect(found).not.toBeNull()
    expect(found!.getAttribute('data-slot')).toBe('popover-content')
    // The found element is the ACTUAL portal-placed one, not a clone.
    expect(found).toBe(outlet.firstElementChild)
    expect(initRan).toBe(true)
    expect(initScope).toBe(found)
  })

  test('a normal (non-portal) descendant child still resolves via the primary in-subtree lookup (no regression)', () => {
    let initRan = false
    hydrate('DialogTrigger', {
      init: () => {
        initRan = true
      },
      template: () => '<button bf="s0"></button>',
    })
    flushHydration()

    const parent = document.createElement('div')
    parent.setAttribute('bf-s', 'DialogBasicDemo_test')
    parent.innerHTML =
      '<button data-slot="dialog-trigger" bf-h="DialogBasicDemo_test" bf-m="s0" bf-s="DialogBasicDemo_test_s0" bf="s0"></button>'
    document.body.appendChild(parent)

    const found = upsertChild(parent, 'DialogTrigger', 's0', {}, undefined, parent)
    expect(found).not.toBeNull()
    expect(found).toBe(parent.firstElementChild)
    expect(initRan).toBe(true)
  })

  test('an unrelated portal-owned element belonging to a DIFFERENT parent scope is never matched', () => {
    hydrate('PopoverContentB', {
      init: () => {},
      template: () => '<div bf="s0"></div>',
    })
    flushHydration()

    const parentA = document.createElement('div')
    parentA.setAttribute('bf-s', 'PopoverA_test')
    document.body.appendChild(parentA)

    // A portal-placed child owned by a DIFFERENT parent (PopoverB), at
    // the SAME slot id (s9) — (bf-h, bf-m) is unique by construction
    // per spec/compiler.md, so this must not satisfy a lookup scoped to
    // PopoverA.
    const outlet = document.createElement('div')
    outlet.innerHTML =
      '<div bf-h="PopoverB_test" bf-m="s9" bf-s="PopoverB_test_s9" bf-po="PopoverB_test_s9" bf="s0"></div>'
    document.body.appendChild(outlet)

    const found = upsertChild(parentA, 'PopoverContentB', 's9', {}, undefined, parentA)
    expect(found).toBeNull()
  })

  test('finds a slot NESTED inside a relocated candidate, not the candidate itself, and picks a distinct match per already-hydrated row (#3115)', () => {
    // A component forwarded through more than one authoring layer (e.g.
    // `Select` > `SelectContent` > `SelectItem`, all three called directly
    // in one caller's own JSX) stamps EVERY one of them with the outermost
    // author's bf-h — so the inner slot ("s6", an item) is never itself
    // portal-owned (no bf-po of its own); it's a plain descendant of the
    // relocated candidate that IS portal-owned ("s11", the content). A
    // `.map()` loop compounds this: `__bfParent` is the enclosing
    // component's own instance id, computed once for the whole loop, so
    // every row's copy of this forwarded chain shares the identical
    // (bf-h, bf-m) pair for BOTH slots.
    let itemInits = 0
    hydrate('SelectItem', {
      init: () => {
        itemInits++
      },
      template: () => '<div bf="s0"></div>',
    })
    flushHydration()

    const parent = document.createElement('div')
    parent.setAttribute('bf-s', 'FormBuilderDemo_test')
    document.body.appendChild(parent)

    // Two rows' worth of relocated "select-content" (bf-m="s11"), each
    // with ONE nested "select-item" (bf-m="s6") — byte-identical
    // (bf-h, bf-m) pairs on both the outer content and the inner item,
    // exactly as `.map()` over a looped `<Select>` emits once SSR-portal
    // placement (#3059) applies.
    const outlet = document.createElement('div')
    outlet.innerHTML =
      '<div bf-h="FormBuilderDemo_test" bf-m="s11" bf-s="FormBuilderDemo_test_s11" bf-po="FormBuilderDemo_test_s11" bf="s0">' +
      '<div bf-h="FormBuilderDemo_test" bf-m="s6" bf-s="FormBuilderDemo_test_s6" bf="s1"></div>' +
      '</div>' +
      '<div bf-h="FormBuilderDemo_test" bf-m="s11" bf-s="FormBuilderDemo_test_s11" bf-po="FormBuilderDemo_test_s11" bf="s0">' +
      '<div bf-h="FormBuilderDemo_test" bf-m="s6" bf-s="FormBuilderDemo_test_s6" bf="s1"></div>' +
      '</div>'
    document.body.appendChild(outlet)

    const row0Item = outlet.children[0].firstElementChild
    const row1Item = outlet.children[1].firstElementChild

    const foundRow0 = upsertChild(parent, 'SelectItem', 's6', {}, undefined, parent)
    expect(foundRow0).toBe(row0Item as HTMLElement)

    const foundRow1 = upsertChild(parent, 'SelectItem', 's6', {}, undefined, parent)
    expect(foundRow1).toBe(row1Item as HTMLElement)
    expect(foundRow1).not.toBe(foundRow0)

    expect(itemInits).toBe(2)
  })

  test('does not match a slot id belonging to an INTERMEDIATE host reached via the transitive pass', () => {
    // A never declared an "s2" slot of its own — the only "s2" in the
    // document belongs to W (bf-s="A_test_s1"), an ordinary in-subtree
    // child of A that itself hosts a relocated grandchild. Compiler slot
    // ids are assigned independently per component file, so this
    // collision is expected, not a corner case (#2316's class). Before
    // matching on the FULL (bf-h, bf-m) pair, `relocatedDescendants`'s
    // transitive pass could walk past W to reach A and wrongly hand A's
    // lookup this grandchild.
    const parent = document.createElement('div')
    parent.setAttribute('bf-s', 'A_test')
    document.body.appendChild(parent)

    const w = document.createElement('div')
    w.innerHTML = '<div bf-s="A_test_s1" bf-h="A_test" bf-m="s1"></div>'
    document.body.appendChild(w.firstElementChild!)

    const outlet = document.createElement('div')
    outlet.innerHTML =
      '<div bf-s="A_test_s1_s2" bf-h="A_test_s1" bf-m="s2" bf-po="A_test_s1_s2" bf="s0"></div>'
    document.body.appendChild(outlet)

    const found = upsertChild(parent, 'SomeChild', 's2', {}, undefined, parent)
    expect(found).toBeNull()
  })
})

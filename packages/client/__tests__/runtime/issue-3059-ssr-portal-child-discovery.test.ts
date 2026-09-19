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
 * descendant-scoped lookups (primary, suffix) fail, fall back to a
 * document-wide search for the SAME `(bf-h, bf-m)` pair scoped to this
 * parent's own portal-owned elements (`bf-po="<parentScope>"`) — the
 * exact attribute the adapter now stamps directly on an
 * `ssrPortalOwnerScope` element's own tag.
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
      '<div data-slot="popover-content" bf-h="PopoverBasicDemo_test" bf-m="s9" bf-s="PopoverBasicDemo_test_s9" bf-po="PopoverBasicDemo_test" bf="s0"></div>'
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
      '<div bf-h="PopoverB_test" bf-m="s9" bf-s="PopoverB_test_s9" bf-po="PopoverB_test" bf="s0"></div>'
    document.body.appendChild(outlet)

    const found = upsertChild(parentA, 'PopoverContentB', 's9', {}, undefined, parentA)
    expect(found).toBeNull()
  })
})

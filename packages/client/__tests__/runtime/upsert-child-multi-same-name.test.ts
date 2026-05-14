/**
 * Regression: multiple `<SameNameComponent>` children inside a single
 * parent's renderItem body get correctly upserted at distinct slot ids
 * (#135 board demo).
 *
 * When a `mapArray` body holds two or more child components of the same
 * name (e.g. three `<Button>`s on a Kanban task card — delete, move-left,
 * move-right), the per-item renderItem emits one `upsertChild` call per
 * slot. For a freshly inserted item (`__existing` undefined → cloned
 * template, no SSR scopes yet) the calls must each find their CSR
 * `[data-bf-ph="<slotId>"]` placeholder and replace it independently.
 *
 * Before the fix, `findSsrScopeBySlotIn`'s name-prefix last-resort
 * fallback (`[bf-s^="~Button_"], [bf-s^="Button_"]`) over-matched. After
 * the first upsertChild stamped `<button bf-s="~Button_xxx" bf-m="s10">`
 * into the parent, subsequent calls for `s13` / `s14` returned the
 * already-mounted `s10` element and ran `initChild` on it — leaving the
 * actual `data-bf-ph="s13"` / `s14` placeholders orphaned. The Kanban
 * card lost its arrow buttons after a task moved between columns.
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

describe('upsertChild — multiple same-name children at distinct slots', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('three Buttons at slots s10/s13/s14 each replace their own placeholder', () => {
    // Minimal SmallButton component — a single-root `<button>` with bf="s0"
    // and a children text slot. Modelled on the real Button's emit shape.
    hydrate('SmallButton', {
      init: () => {},
      template: (props) => {
        const children = props.children as unknown as string
        return `<button bf="s0">${children}</button>`
      },
    })
    flushHydration()

    // Simulate the inner-loop's freshly-cloned template clone — three
    // placeholders, all pointing at the same component name, at three
    // distinct slot ids. The parent (loop body root) carries a
    // `bf-s="ProductivityBoardDemo_xxx"`-shaped scope so `parentScopeOf`
    // can derive a non-empty `parentBfs` and the primary
    // `[bf-h][bf-m]` lookup is exercised first.
    const anchor = document.createElement('div')
    anchor.setAttribute('bf-s', 'ProductivityBoardDemo_test')
    document.body.appendChild(anchor)

    const card = document.createElement('div')
    card.innerHTML =
      '<button class="delete" data-bf-ph="s10"></button>' +
      '<button class="left" data-bf-ph="s13"></button>' +
      '<button class="right" data-bf-ph="s14"></button>'
    // Convert children to divs (placeholders) — the compiler emits
    // `<div data-bf-ph="…">` in real output, but the placeholder lookup
    // is by attribute, not tag.
    card.innerHTML =
      '<div data-bf-ph="s10"></div>' +
      '<div data-bf-ph="s13"></div>' +
      '<div data-bf-ph="s14"></div>'
    anchor.appendChild(card)

    // First call — the s10 placeholder.
    const e1 = upsertChild(card, 'SmallButton', 's10', { children: 'X' }, undefined, anchor)
    expect(e1).not.toBeNull()
    expect(e1!.tagName).toBe('BUTTON')
    expect(e1!.textContent).toBe('X')
    expect(e1!.getAttribute('bf-m')).toBe('s10')

    // Second call — the s13 placeholder must still be present and must
    // be replaced, NOT the already-mounted s10 element. This is the
    // critical regression assertion.
    const phS13Before = card.querySelector('[data-bf-ph="s13"]')
    expect(phS13Before).not.toBeNull()
    const e2 = upsertChild(card, 'SmallButton', 's13', { children: 'L' }, undefined, anchor)
    expect(e2).not.toBeNull()
    expect(e2!.getAttribute('bf-m')).toBe('s13')
    expect(e2!.textContent).toBe('L')
    // Critically: s10 keeps its content, s13 placeholder is gone, both
    // buttons exist side-by-side.
    expect(card.querySelector('[data-bf-ph="s13"]')).toBeNull()
    expect(e1!.textContent).toBe('X')
    expect(e1!.getAttribute('bf-m')).toBe('s10')

    // Third call — same again for s14.
    const e3 = upsertChild(card, 'SmallButton', 's14', { children: 'R' }, undefined, anchor)
    expect(e3).not.toBeNull()
    expect(e3!.getAttribute('bf-m')).toBe('s14')
    expect(e3!.textContent).toBe('R')
    expect(card.querySelector('[data-bf-ph="s14"]')).toBeNull()

    // All three buttons coexist with distinct content.
    const buttons = card.querySelectorAll('button')
    expect(buttons.length).toBe(3)
    expect(buttons[0].textContent).toBe('X')
    expect(buttons[1].textContent).toBe('L')
    expect(buttons[2].textContent).toBe('R')
  })

  test('SSR with two same-name children at distinct slots — (bf-h, bf-m) resolves each correctly', () => {
    // Post-#1249: identity is the (bf-h, bf-m) pair. Two same-name
    // children of the same host with distinct slot ids each carry their
    // own bf-m, so the resolver's primary lookup discriminates without
    // any fallback ladder. The legacy bf-s suffix lookup is gone.
    hydrate('Item', {
      init: () => {},
      template: () => '<i bf="s0"></i>',
    })
    flushHydration()

    const anchor = document.createElement('div')
    anchor.setAttribute('bf-s', 'Parent_test')
    document.body.appendChild(anchor)

    const host = document.createElement('div')
    // Two SSR scopes already in tree with bf-h/bf-m markers.
    host.innerHTML =
      '<i class="a" bf-s="Item_a" bf-h="Parent_test" bf-m="s10"></i>' +
      '<i class="b" bf-s="Item_b" bf-h="Parent_test" bf-m="s11"></i>'
    anchor.appendChild(host)

    const a = upsertChild(host, 'Item', 's10', {}, undefined, anchor)
    expect(a).not.toBeNull()
    expect(a!.classList.contains('a')).toBe(true)

    const b = upsertChild(host, 'Item', 's11', {}, undefined, anchor)
    expect(b).not.toBeNull()
    expect(b!.classList.contains('b')).toBe(true)
  })
})

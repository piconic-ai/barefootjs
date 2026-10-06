/**
 * Loop-row elements portaled out of their row by a `ref` callback (#3318):
 * the `row-portal.ts` registry and the row-level doors that consult it
 * (`mapArray`'s key backfill and disposal, `qsaItem`, the claim-plan marker
 * scan, delegated-event relay).
 */

import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register()
  }
})

const { createSignal, createRoot } = await import('../../src/reactive')
const { mapArray } = await import('../../src/runtime/map-array')
const { qsaItem } = await import('../../src/runtime/qsa-item')
const { claimSlots } = await import('../../src/runtime/claim-slots')
const {
  adoptRowPortal,
  claimRowPortals,
  relayRowPortalEvents,
  isRowPortalOf,
  relocatedRowElements,
} = await import('../../src/runtime/row-portal')

type Item = { id: string; label: string }

beforeEach(() => {
  document.body.innerHTML = ''
})

/**
 * A keyed loop whose row renders `<li>` plus a `<button>` that the row's
 * ref callback moves to `document.body`, as compiled code will. The button
 * is cloned with an empty `data-key`, like a template clone.
 */
function mountPortalLoop(items: () => Item[], container: HTMLElement): void {
  mapArray(
    items,
    container,
    item => item.id,
    item => {
      const li = document.createElement('li')
      li.setAttribute('data-key', '')
      const button = document.createElement('button')
      button.setAttribute('bf', 's3')
      button.setAttribute('data-key', '')
      button.textContent = item().label
      li.appendChild(button)
      document.body.appendChild(button)
      adoptRowPortal(li, button, container)
      return li
    },
  )
}

describe('adoptRowPortal through mapArray (CSR)', () => {
  test('backfills the row key and removes the element with its row', () => {
    const ul = document.createElement('ul')
    document.body.appendChild(ul)
    const [items, setItems] = createSignal<Item[]>([
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ])
    mountPortalLoop(items, ul)

    const buttons = () => [...document.body.querySelectorAll(':scope > button[bf="s3"]')]
    expect(buttons().map(b => b.getAttribute('data-key'))).toEqual(['a', 'b'])
    expect(ul.querySelectorAll('button')).toHaveLength(0)

    setItems([{ id: 'b', label: 'B' }])
    expect(buttons().map(b => b.textContent)).toEqual(['B'])

    setItems([])
    expect(buttons()).toHaveLength(0)
  })

  test('qsaItem reaches the portaled element from its row', () => {
    const ul = document.createElement('ul')
    document.body.appendChild(ul)
    mountPortalLoop(() => [{ id: 'a', label: 'A' }], ul)

    const row = ul.querySelector('li')!
    expect(qsaItem(row, '[bf="s3"]')?.textContent).toBe('A')
    expect(row.contains(qsaItem(row, '[bf="s3"]'))).toBe(false)
  })
})

describe('relayRowPortalEvents / isRowPortalOf', () => {
  test('relays to elements adopted before and after, until disposal', () => {
    const ul = document.createElement('ul')
    const other = document.createElement('ul')
    document.body.append(ul, other)
    const seen: string[] = []

    let disposeFirst!: () => void
    const first = document.createElement('button')
    createRoot(dispose => {
      disposeFirst = dispose
      adoptRowPortal(document.createElement('li'), first, ul)
    })
    document.body.appendChild(first)

    relayRowPortalEvents(ul, 'click', e => seen.push((e.currentTarget as Element).textContent ?? ''))

    const second = document.createElement('button')
    const inner = document.createElement('span')
    second.appendChild(inner)
    createRoot(() => adoptRowPortal(document.createElement('li'), second, ul))
    document.body.appendChild(second)

    first.textContent = 'first'
    second.firstChild!.textContent = 'second'
    first.click()
    inner.click()
    expect(seen).toEqual(['first', 'second'])

    expect(isRowPortalOf(inner, ul)).toBe(true)
    expect(isRowPortalOf(first, ul)).toBe(true)
    expect(isRowPortalOf(first, other)).toBe(false)
    expect(isRowPortalOf(document.body, ul)).toBe(false)

    disposeFirst()
    expect(first.isConnected).toBe(false)
    expect(isRowPortalOf(first, ul)).toBe(false)
    first.click()
    expect(seen).toEqual(['first', 'second'])
  })
})

describe('claimRowPortals (hydration)', () => {
  test('pairs each row with the outlet element carrying its key', () => {
    document.body.innerHTML =
      '<ul id="list"><li data-key="a"></li><li data-key="b"></li></ul>' +
      '<button bf="s3" bf-po="List_1" data-key="b">B</button>' +
      '<button bf="s3" bf-po="Other_1" data-key="a">other owner</button>'
    const ul = document.getElementById('list')!
    const [rowA, rowB] = [...ul.querySelectorAll('li')]

    createRoot(() => {
      claimRowPortals(rowA, 'List_1', ['s3'], ul)
      claimRowPortals(rowB, 'List_1', ['s3'], ul)
    })

    expect(relocatedRowElements(rowA)).toHaveLength(0)
    expect(relocatedRowElements(rowB).map(el => el.textContent)).toEqual(['B'])
  })

  test('adopts nothing for a row without a key', () => {
    document.body.innerHTML =
      '<ul id="list"><li></li></ul><button bf="s3" bf-po="List_1" data-key="">B</button>'
    const ul = document.getElementById('list')!
    const row = ul.querySelector('li')!
    createRoot(() => claimRowPortals(row, 'List_1', ['s3'], ul))
    expect(relocatedRowElements(row)).toHaveLength(0)
  })

  test('the claim-plan marker scan finds a text slot inside the relocated element', () => {
    document.body.innerHTML =
      '<ul id="list"><li data-key="a"></li></ul>' +
      '<button bf="s3" bf-po="List_1" data-key="a"><!--bf:s4-->old<!--/--></button>'
    const ul = document.getElementById('list')!
    const row = ul.querySelector('li')!
    createRoot(() => claimRowPortals(row, 'List_1', ['s3'], ul))

    const slots = claimSlots(row, [{ id: 's4', kind: 'text', path: [] }])
    slots.write('s4', 'new')
    expect(document.querySelector('button')!.textContent).toBe('new')
  })
})

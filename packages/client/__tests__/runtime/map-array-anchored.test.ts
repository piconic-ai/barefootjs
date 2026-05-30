/**
 * Unit tests for `mapArrayAnchored` (#1665) — the empty-item-tolerant list
 * renderer for whole-item loop conditionals.
 *
 * Each item is identified by a `<!--bf-loop-i:KEY-->` anchor comment that is
 * ALWAYS present (even when the item's conditional renders nothing). Content
 * lives between the anchor and the next anchor / loop end and is derived from
 * the live DOM range each pass (never cached). These tests drive the runtime
 * directly with a hand-written renderItem so the reconciler is validated in
 * isolation, before the compiler emits calls to it.
 */
import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { createSignal, createRoot } from '../../src/reactive'
import { mapArrayAnchored } from '../../src/runtime/map-array'
import { insert } from '../../src/runtime/insert'
import { loopItemMarker, loopStartMarker, loopEndMarker, BF_SCOPE } from '@barefootjs/shared'

beforeAll(() => {
  if (typeof window === 'undefined') GlobalRegistrator.register()
})

/** Build a container pre-seeded with scoped loop start/end markers. */
function makeContainer(markerId: string): HTMLElement {
  const host = document.createElement('div')
  host.setAttribute(BF_SCOPE, 'c0')
  host.appendChild(document.createComment(loopStartMarker(markerId)))
  host.appendChild(document.createComment(loopEndMarker(markerId)))
  document.body.appendChild(host)
  return host
}

/**
 * A renderItem matching the compiler's anchored contract: returns a fragment
 * `[anchor, cond-start, cond-end]` for new (CSR) items and seeds the
 * conditional via `insert()`. `cond` decides whether a `<li>` shows.
 */
function makeRenderItem(slotId: string, cond: (id: string) => boolean) {
  return (itemAccessor: () => { id: string }, _index: number, existing?: Comment) => {
    const id = itemAccessor().id
    let anchor: Comment
    let frag: DocumentFragment | null = null
    if (existing) {
      anchor = existing
    } else {
      anchor = document.createComment(loopItemMarker(id))
      frag = document.createDocumentFragment()
      frag.appendChild(anchor)
      frag.appendChild(document.createComment(`bf-cond-start:${slotId}`))
      frag.appendChild(document.createComment(`bf-cond-end:${slotId}`))
    }
    insert(
      anchor,
      slotId,
      () => cond(itemAccessor().id),
      { template: () => `<li bf-c="${slotId}">${itemAccessor().id}</li>`, bindEvents: () => {} },
      { template: () => `<!--bf-cond-start:${slotId}--><!--bf-cond-end:${slotId}-->`, bindEvents: () => {} },
    )
    return frag ?? anchor
  }
}

const liTexts = (host: HTMLElement) =>
  Array.from(host.querySelectorAll('li')).map((n) => n.textContent)
const anchorKeys = (host: HTMLElement) =>
  Array.from(host.childNodes)
    .filter((n) => n.nodeType === Node.COMMENT_NODE && (n as Comment).nodeValue?.startsWith('bf-loop-i:'))
    .map((n) => (n as Comment).nodeValue!.slice('bf-loop-i:'.length))

describe('mapArrayAnchored — CSR creation & per-item toggle', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  test('renders only items whose condition is true, anchors always present', () => {
    const host = makeContainer('l0')
    const [items] = createSignal([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    const [sel] = createSignal('b')
    createRoot(() => {
      mapArrayAnchored(
        () => items(),
        host,
        (it) => String(it.id),
        makeRenderItem('s1', (id) => sel() === id),
        'l0',
      )
    })
    // Every item has an anchor; only 'b' renders a <li>.
    expect(anchorKeys(host)).toEqual(['a', 'b', 'c'])
    expect(liTexts(host)).toEqual(['b'])
  })

  test('flipping the shared condition signal moves the rendered item', () => {
    const host = makeContainer('l0')
    const [items] = createSignal([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    const [sel, setSel] = createSignal('a')
    createRoot(() => {
      mapArrayAnchored(
        () => items(),
        host,
        (it) => String(it.id),
        makeRenderItem('s1', (id) => sel() === id),
        'l0',
      )
    })
    expect(liTexts(host)).toEqual(['a'])
    setSel('c')
    expect(liTexts(host)).toEqual(['c'])
    expect(anchorKeys(host)).toEqual(['a', 'b', 'c'])
  })
})

describe('mapArrayAnchored — array add / remove / reorder', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  test('adding and removing array items adds/removes their anchors', () => {
    const host = makeContainer('l0')
    const [items, setItems] = createSignal([{ id: 'a' }, { id: 'b' }])
    const [sel] = createSignal('a')
    createRoot(() => {
      mapArrayAnchored(
        () => items(),
        host,
        (it) => String(it.id),
        makeRenderItem('s1', (id) => sel() === id),
        'l0',
      )
    })
    expect(anchorKeys(host)).toEqual(['a', 'b'])
    expect(liTexts(host)).toEqual(['a'])
    setItems([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    expect(anchorKeys(host)).toEqual(['a', 'b', 'c'])
    setItems([{ id: 'b' }, { id: 'c' }])
    expect(anchorKeys(host)).toEqual(['b', 'c'])
    expect(liTexts(host)).toEqual([])
  })

  test('reordering array keys reorders anchors and their content', () => {
    const host = makeContainer('l0')
    const [items, setItems] = createSignal([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    const [sel] = createSignal('a')
    createRoot(() => {
      mapArrayAnchored(
        () => items(),
        host,
        (it) => String(it.id),
        makeRenderItem('s1', (id) => sel() === id),
        'l0',
      )
    })
    expect(anchorKeys(host)).toEqual(['a', 'b', 'c'])
    expect(liTexts(host)).toEqual(['a'])
    setItems([{ id: 'c' }, { id: 'a' }, { id: 'b' }])
    expect(anchorKeys(host)).toEqual(['c', 'a', 'b'])
    // The rendered <li> still belongs to 'a', now in the middle.
    expect(liTexts(host)).toEqual(['a'])
  })
})

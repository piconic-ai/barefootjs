/**
 * A `__slot()` marker — `initChild`'s getter value for a JSX prop whose
 * element holds a component (`header={<span><Badge /></span>}`) — through
 * the value wrappers in front of the content-slot writers. The reactive
 * wrappers (`escapeTextOrNode`, `textOrNode`) hand the marker to the writer
 * intact so the server-rendered element and its hydrated component stay in
 * place; the template splices (`escapeTextOrMarkup`, `__bfSlot`) take the
 * marker's markup raw, like a `bfMarkup()` value.
 */
import { describe, test, expect, beforeAll } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register()
  }
})

const { __slot, isSlotMarker } = await import('../../src/slot.ts')
const { escapeTextOrMarkup, escapeTextOrNode } = await import('../../src/runtime/component.ts')
const { claimSlots, textOrNode } = await import('../../src/runtime/claim-slots.ts')
const { __bfSlot } = await import('../../src/runtime/branch-slot.ts')

const html = '<span>head<em bf-s="P_s0">badge</em></span>'

function mount(markup: string): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = markup
  return host
}

describe('isSlotMarker', () => {
  test('answers only for a __slot() marker', () => {
    expect(isSlotMarker(__slot(() => html))).toBe(true)
    expect(isSlotMarker(html)).toBe(false)
    expect(isSlotMarker(null)).toBe(false)
    expect(isSlotMarker({ __isSlot: 'yes' })).toBe(false)
  })
})

describe('reactive wrappers pass the marker through', () => {
  test('escapeTextOrNode', () => {
    const marker = __slot(() => html)
    expect(escapeTextOrNode(marker)).toBe(marker)
  })

  test('textOrNode', () => {
    const marker = __slot(() => html)
    expect(textOrNode(marker)).toBe(marker)
  })

  test('a markup slot written through escapeTextOrNode keeps the server-rendered element', () => {
    const host = mount(`<header><!--bf:s0-->${html}<!--/--></header>`)
    const em = host.querySelector('em')
    const slots = claimSlots(host, [{ id: 's0', kind: 'markup', path: [] }])
    slots.write('s0', escapeTextOrNode(__slot(() => html)))
    expect(host.querySelector('em')).toBe(em)
    expect(host.querySelector('header')!.innerHTML).toBe(`<!--bf:s0-->${html}<!--/-->`)
  })

  test('a text slot written through textOrNode keeps its content', () => {
    const host = mount('<p><!--bf:s0-->kept<!--/--></p>')
    const slots = claimSlots(host, [{ id: 's0', kind: 'text', path: [] }])
    slots.write('s0', textOrNode(__slot(() => html)))
    expect(host.querySelector('p')!.textContent).toBe('kept')
  })
})

describe('template splices take the marker markup raw', () => {
  test('escapeTextOrMarkup', () => {
    expect(escapeTextOrMarkup(__slot(() => html))).toBe(html)
  })

  test('__bfSlot', () => {
    expect(__bfSlot(__slot(() => html), [])).toBe(html)
  })

  test('__bfSlot still escapes a plain string', () => {
    expect(__bfSlot('<b>', [])).toBe('&lt;b&gt;')
  })
})

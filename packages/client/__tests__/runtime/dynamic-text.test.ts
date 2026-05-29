import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { __bfText } from '../../src/runtime/dynamic-text'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register()
  }
})

/**
 * `__bfText` updates a dynamic text/JSX slot delimited by
 * `<!--bf:sX-->…<!--/-->` (#1663). Primitive values render as text exactly
 * like the previous `nodeValue = String(...)` assignment; a live `Node`
 * (e.g. a component element from `createComponent`) is spliced into the slot
 * region by identity instead of being stringified into `"[object …]"`.
 */
describe('__bfText', () => {
  let host: HTMLElement
  let anchor: Text

  beforeEach(() => {
    document.body.innerHTML = ''
    host = document.createElement('div')
    // Slot region: <!--bf:s0--><text/><!--/-->, mirroring $t's resolution.
    host.appendChild(document.createComment('bf:s0'))
    anchor = document.createTextNode('')
    host.appendChild(anchor)
    host.appendChild(document.createComment('/'))
    document.body.appendChild(host)
  })

  test('renders a primitive value as text', () => {
    const result = __bfText(anchor, 'hello')
    expect(result).toBe(anchor)
    expect(anchor.nodeValue).toBe('hello')
    expect(host.textContent).toBe('hello')
  })

  test('renders nullish as empty string, not "undefined"/"null"', () => {
    __bfText(anchor, undefined)
    expect(anchor.nodeValue).toBe('')
    __bfText(anchor, null)
    expect(anchor.nodeValue).toBe('')
  })

  test('splices a live Node into the slot by identity', () => {
    const el = document.createElement('span')
    el.className = 'logo'
    el.textContent = 'piconic'

    const result = __bfText(anchor, el)

    // Returned node is the element itself (so callers track it across runs).
    expect(result).toBe(el)
    // The element is in the slot region, between the markers.
    expect(host.querySelector('.logo')).toBe(el)
    expect(host.textContent).toBe('piconic')
    // The original text anchor was removed (no "[object …]" leftover).
    expect(anchor.parentNode).toBeNull()
    expect(host.innerHTML).not.toContain('[object')
  })

  test('replaces a previously-spliced Node on the next run', () => {
    const first = document.createElement('span')
    first.textContent = 'a'
    const next = __bfText(anchor, first)

    const second = document.createElement('span')
    second.textContent = 'b'
    const result = __bfText(next, second)

    expect(result).toBe(second)
    expect(host.contains(first)).toBe(false)
    expect(host.contains(second)).toBe(true)
    expect(host.textContent).toBe('b')
    // Exactly one element occupies the slot.
    expect(host.querySelectorAll('span').length).toBe(1)
  })

  test('switches back from a Node value to text', () => {
    const el = document.createElement('span')
    el.textContent = 'node'
    const afterNode = __bfText(anchor, el)

    const afterText = __bfText(afterNode, 'plain')
    expect(afterText.nodeType).toBe(Node.TEXT_NODE)
    expect(host.contains(el)).toBe(false)
    expect(host.textContent).toBe('plain')
    expect(host.querySelector('span')).toBeNull()
  })

  test('preserves server-rendered DOM for __isSlot markers', () => {
    const slotMarker = { __isSlot: true } as unknown
    anchor.nodeValue = 'ssr'
    const result = __bfText(anchor, slotMarker)
    expect(result).toBe(anchor)
    expect(anchor.nodeValue).toBe('ssr')
  })

  test('is a no-op when the anchor is null', () => {
    expect(__bfText(null, 'x')).toBeNull()
  })
})

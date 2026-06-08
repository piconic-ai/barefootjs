import { describe, test, expect, beforeAll, beforeEach, afterEach } from 'bun:test'
import { __bfText } from '../../src/runtime/dynamic-text'
import {
  createSignal,
  createEffect,
  setProfilerSink,
  type ProfilerEventSink,
} from '../../src/reactive'
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

  test('clears a stale Node when a re-resolved text anchor is written (conditional slot)', () => {
    // Reproduces the conditional-slot path: a previous run spliced a live
    // element into the slot; the next run re-resolves the anchor via $t(),
    // which inserts a fresh text node *before* that stale element. Writing a
    // primitive through that new anchor must remove the leftover element so
    // the slot doesn't render both.
    const el = document.createElement('span')
    el.textContent = 'node'
    const start = host.firstChild! // <!--bf:s0-->
    start.parentNode!.insertBefore(el, start.nextSibling)
    // Simulate $t() handing back a brand-new text node placed before `el`.
    const reResolved = document.createTextNode('')
    start.parentNode!.insertBefore(reResolved, start.nextSibling)

    const result = __bfText(reResolved, 'plain')

    expect(result).toBe(reResolved)
    expect(host.contains(el)).toBe(false)
    expect(host.querySelector('span')).toBeNull()
    expect(host.textContent).toBe('plain')
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

/**
 * Output fingerprint (#1690, §4.2.2). A text binding wrapped in `createEffect`
 * reports whether the slot actually changed; a re-run that writes the same text
 * is a *wasted* re-run the profiler can flag. Verified end-to-end here: the
 * runtime sink sees one `effectOutput` per run, with the right `changed` flag.
 */
describe('__bfText output fingerprint (profiler)', () => {
  let host: HTMLElement
  let anchor: Text

  const outputs = (events: [string, ...unknown[]][], id: string): boolean[] =>
    events.filter(e => e[0] === 'effectOutput' && e[1] === id).map(e => e[2] as boolean)

  beforeEach(() => {
    document.body.innerHTML = ''
    host = document.createElement('div')
    host.appendChild(document.createComment('bf:s0'))
    anchor = document.createTextNode('')
    host.appendChild(anchor)
    host.appendChild(document.createComment('/'))
    document.body.appendChild(host)
  })

  afterEach(() => setProfilerSink(null))

  test('reports changed on a new value and unchanged on an identical re-write', () => {
    const events: [string, ...unknown[]][] = []
    const sink = {
      signalSet: () => {}, subscribeAdd: () => {}, subscribeRemove: () => {},
      effectCreate: (id: string) => events.push(['effectCreate', id]),
      effectEnter: () => {}, effectExit: () => {},
      effectOutput: (id: string, changed: boolean) => events.push(['effectOutput', id, changed]),
      effectDispose: () => {}, batchBegin: () => {}, batchFlush: () => {},
      turnBegin: () => {}, turnEnd: () => {},
    } satisfies ProfilerEventSink
    setProfilerSink(sink)

    // A price label that formats only the dollars of a cents signal: changing
    // cents within the same dollar re-runs the binding but renders identical text.
    const [cents, setCents] = createSignal(500)
    let current: Node | null = anchor
    createEffect(() => {
      current = __bfText(current, `$${Math.floor(cents() / 100)}`)
    })
    const id = events.find(e => e[0] === 'effectCreate')![1] as string

    setCents(550) // still "$5" → wasted
    setCents(640) // "$6" → real change
    setCents(660) // still "$6" → wasted

    expect(host.textContent).toBe('$6')
    // mount(true), 550(false), 640(true), 660(false)
    expect(outputs(events, id)).toEqual([true, false, true, false])
  })
})

/**
 * applyRestAttrs / spreadAttrs runtime contract (#135).
 *
 * When a user-defined component spreads `...props` onto its underlying
 * element, the `style` prop may arrive as a JS object literal
 * (`<Card style={{'--stat-c': 'red'}}>`). Both the reactive DOM helper
 * (`applyRestAttrs`) and the SSR-string helper (`spreadAttrs`) must
 * route the object through `styleToCss` instead of falling back to
 * `String(value)` — otherwise the DOM ends up with the literal
 * `style="[object Object]"`. Surfaced by the analytics demo's
 * per-source stat cards (#135 Concrete Additions), which set
 * `style={{'--stat-c': sourceColors[s]}}` inside a `.map()` body and
 * pass it through Card's `{...props}` spread.
 */
import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { applyRestAttrs } from '../../src/runtime/apply-rest-attrs'
import { spreadAttrs } from '../../src/runtime/spread-attrs'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register()
  }
})

describe('applyRestAttrs', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('object-valued `style` prop is rendered as a CSS string', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)

    applyRestAttrs(el, { style: { '--stat-c': 'hsl(142 71% 45%)' } }, [])

    const attr = el.getAttribute('style') ?? ''
    expect(attr).toContain('--stat-c')
    expect(attr).toContain('hsl(142 71% 45%)')
    expect(attr).not.toContain('[object Object]')
  })

  test('dangerouslySetInnerHTML from a rest object sets innerHTML, not an attribute', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)

    applyRestAttrs(
      el,
      { class: 'y', dangerouslySetInnerHTML: { __html: '<b>x</b> & <i>z</i>' } },
      [],
    )

    // Raw HTML becomes real child elements (the escape hatch)…
    expect(el.querySelector('b')?.textContent).toBe('x')
    expect(el.querySelector('i')?.textContent).toBe('z')
    expect(el.getAttribute('class')).toBe('y')
    // …never a bogus `dangerouslySetInnerHTML="[object Object]"` attribute.
    expect(el.hasAttribute('dangerouslySetInnerHTML')).toBe(false)
  })

  test('multi-property style object is serialized with kebab-case keys', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)

    applyRestAttrs(
      el,
      { style: { backgroundColor: 'red', '--err': '210' } },
      [],
    )

    const attr = el.getAttribute('style') ?? ''
    expect(attr).toContain('background-color:red')
    expect(attr).toContain('--err:210')
  })

  test('string `style` prop is preserved verbatim', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)

    applyRestAttrs(el, { style: 'color:red;font-size:12px' }, [])
    expect(el.getAttribute('style')).toBe('color:red;font-size:12px')
  })

  test('null style removes the attribute', () => {
    const el = document.createElement('div')
    el.setAttribute('style', 'color:red')
    document.body.appendChild(el)

    applyRestAttrs(el, { style: null }, [])
    expect(el.hasAttribute('style')).toBe(false)
  })

  test('`children` is never written as a DOM attribute', () => {
    // Without this exclusion, parent components that pass `children`
    // through `{...props}` end up with `children="<p>...</p>"` on the
    // wrapper element — surfaced by the admin analytics demo's
    // per-source Stat cards where CardContent was getting fresh children
    // strings from a reactive `.map()` but the DOM kept the SSR text.
    const el = document.createElement('div')
    document.body.appendChild(el)

    applyRestAttrs(el, { children: '<p>hi</p>', 'data-x': 'y' }, [])

    expect(el.hasAttribute('children')).toBe(false)
    expect(el.getAttribute('data-x')).toBe('y')
  })

  test('keys in excludeKeys are not applied', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)

    applyRestAttrs(
      el,
      { style: { color: 'red' }, 'data-x': 'y' },
      ['style'],
    )

    expect(el.hasAttribute('style')).toBe(false)
    expect(el.getAttribute('data-x')).toBe('y')
  })
})

describe('spreadAttrs', () => {
  test('dangerouslySetInnerHTML is skipped (never a bogus attribute)', () => {
    const out = spreadAttrs({
      class: 'y',
      dangerouslySetInnerHTML: { __html: '<b>x</b>' },
    })
    // Emitted as an attribute string, it can't carry content — so it must
    // be dropped, not serialised as `dangerouslySetInnerHTML="[object Object]"`.
    expect(out).toBe('class="y"')
    expect(out).not.toContain('dangerouslySetInnerHTML')
    expect(out).not.toContain('[object Object]')
  })

  test('object-valued `style` becomes a CSS string attribute', () => {
    const out = spreadAttrs({ style: { '--stat-c': 'hsl(142 71% 45%)' } })
    expect(out).toContain('style="--stat-c:hsl(142 71% 45%)"')
    expect(out).not.toContain('[object Object]')
  })

  test('string `style` is passed through unchanged', () => {
    const out = spreadAttrs({ style: 'color:red' })
    expect(out).toBe('style="color:red"')
  })

  // #1244: SVG XML attribute names are case-sensitive. Lower-casing
  // `viewBox` to `view-box` makes the browser treat it as an unknown
  // attribute, so the SVG no longer scales / hit-tests — surfaced as
  // the Form Builder e2e regression when the merge-emit path started
  // routing `viewBox` through `spreadAttrs`.
  //
  // CSS-style SVG presentation attrs (`strokeWidth`, `clipPath`, …) are
  // NOT case-sensitive — they lower to kebab-case to match how the
  // compile-time `SVG_CAMEL_TO_KEBAB` table writes them on the explicit-
  // attr path. Mixing the two would diverge: `<svg clipPath={...} />`
  // emits `clip-path="..."` while `<svg {...{ clipPath: ... }} />` would
  // emit `clipPath="..."`. The allowlist therefore covers only XML attr
  // names that have no kebab-case mirror (`viewBox`, `clipPathUnits`).
  test('SVG XML camelCase preserved; CSS-style presentation attrs kebab-case', () => {
    const out = spreadAttrs({
      viewBox: '0 0 24 24',
      preserveAspectRatio: 'xMidYMid meet',
      clipPathUnits: 'objectBoundingBox',
      clipPath: 'url(#c)',
      strokeWidth: 2,
      strokeLinecap: 'round',
    })
    expect(out).toContain('viewBox="0 0 24 24"')
    expect(out).toContain('preserveAspectRatio="xMidYMid meet"')
    expect(out).toContain('clipPathUnits="objectBoundingBox"')
    // Presentation attrs share the kebab-case spelling of the compile-
    // time `SVG_CAMEL_TO_KEBAB` table so spread vs explicit-attr paths
    // produce the same DOM attribute.
    expect(out).toContain('clip-path="url(#c)"')
    expect(out).toContain('stroke-width="2"')
    expect(out).toContain('stroke-linecap="round"')
    expect(out).not.toContain('view-box')
    expect(out).not.toContain('clip-path-units')
  })
})

describe('applyRestAttrs profile-mode turn attribution (#3376)', () => {
  // The same module instance `applyRestAttrs` imports its turn markers from.
  let reactive: typeof import('@barefootjs/client/reactive')
  beforeAll(async () => {
    reactive = await import('@barefootjs/client/reactive')
  })
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  function record(): string[] {
    const events: string[] = []
    const noop = () => {}
    reactive.setProfilerSink({
      signalSet: noop, subscribeAdd: noop, subscribeRemove: noop, effectCreate: noop,
      effectEnter: noop, effectExit: noop, effectDispose: noop, batchBegin: noop, batchFlush: noop,
      turnBegin: (id: string) => events.push(`begin ${id}`),
      turnEnd: () => events.push('end'),
    })
    return events
  }

  /** Listeners `addEventListener` receives on `el`, in order. */
  function captureListeners(el: Element): unknown[] {
    const added: unknown[] = []
    const orig = el.addEventListener.bind(el)
    el.addEventListener = ((type: string, listener: EventListener) => {
      added.push(listener)
      orig(type, listener)
    }) as typeof el.addEventListener
    return added
  }

  test('with a turn site, a forwarded handler runs inside its own turn', () => {
    const events = record()
    try {
      const el = document.createElement('button')
      document.body.appendChild(el)
      const calls: unknown[] = []
      applyRestAttrs(el, {
        onClick: (e: Event) => { calls.push(e.type); events.push('handler') },
        onDoubleClick: () => events.push('dbl'),
      }, [], 'SpreadButton#handler:s0')
      el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
      el.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }))
      // The callback still runs with the event, between the turn markers, and
      // the turn id carries the DOM event name the listener was wired for.
      expect(calls).toEqual(['click'])
      expect(events).toEqual([
        'begin SpreadButton#handler:s0:click', 'handler', 'end',
        'begin SpreadButton#handler:s0:dblclick', 'dbl', 'end',
      ])
    } finally {
      reactive.setProfilerSink(null)
    }
  })

  test('a throwing forwarded handler still closes its turn', () => {
    const events = record()
    try {
      const el = document.createElement('button')
      const added = captureListeners(el)
      const boom = new Error('boom')
      applyRestAttrs(el, { onClick: () => { throw boom } }, [], 'B#handler:s0')
      // Call the wired listener directly: a dispatched event would have the
      // DOM swallow and report the throw. The point is that `endTurn()` runs.
      expect(() => (added[0] as (e: Event) => void)(new window.MouseEvent('click'))).toThrow(boom)
      expect(events).toEqual(['begin B#handler:s0:click', 'end'])
    } finally {
      reactive.setProfilerSink(null)
    }
  })

  test('without a turn site (production), the handler is attached bare', () => {
    const el = document.createElement('button')
    const handler = () => {}
    const added = captureListeners(el)
    applyRestAttrs(el, { onClick: handler }, [])
    expect(added).toEqual([handler])
  })
})

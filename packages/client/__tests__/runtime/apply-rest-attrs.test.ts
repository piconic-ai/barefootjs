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
  test('object-valued `style` becomes a CSS string attribute', () => {
    const out = spreadAttrs({ style: { '--stat-c': 'hsl(142 71% 45%)' } })
    expect(out).toContain('style="--stat-c:hsl(142 71% 45%)"')
    expect(out).not.toContain('[object Object]')
  })

  test('string `style` is passed through unchanged', () => {
    const out = spreadAttrs({ style: 'color:red' })
    expect(out).toBe('style="color:red"')
  })
})

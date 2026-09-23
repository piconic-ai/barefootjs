/**
 * `setTextPreservingMarkers` (#3160): a `ComboboxValue`/`SelectValue`-style
 * `ref` effect needs to overwrite a JSX text position imperatively without
 * destroying the `<!--bf:sN-->…<!--/-->` slot markers SSR (and the
 * compiler's own hydration writer) leave around it.
 */
import { describe, test, expect, beforeAll } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { setTextPreservingMarkers } from '../set-text-preserving-markers'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register()
  }
})

function span(innerHtml: string): HTMLSpanElement {
  const el = document.createElement('span')
  el.innerHTML = innerHtml
  return el
}

describe('setTextPreservingMarkers', () => {
  test('updates the text node between existing markers, leaving them intact', () => {
    const el = span('<!--bf:s0-->Select framework...<!--/-->')
    setTextPreservingMarkers(el, 'SvelteKit')
    expect(el.innerHTML).toBe('<!--bf:s0-->SvelteKit<!--/-->')
    expect(el.childNodes).toHaveLength(3)
    expect(el.childNodes[0].nodeType).toBe(Node.COMMENT_NODE)
    expect(el.childNodes[2].nodeType).toBe(Node.COMMENT_NODE)
  })

  test('repeated writes reuse the same text node (idempotent)', () => {
    const el = span('<!--bf:s0-->Select framework...<!--/-->')
    setTextPreservingMarkers(el, 'SvelteKit')
    const textNode = el.childNodes[1]
    setTextPreservingMarkers(el, 'Next.js')
    expect(el.childNodes[1]).toBe(textNode)
    expect(el.innerHTML).toBe('<!--bf:s0-->Next.js<!--/-->')
  })

  test('inserts a text node between markers when SSR rendered an empty value', () => {
    const el = span('<!--bf:s0--><!--/-->')
    setTextPreservingMarkers(el, 'Astro')
    expect(el.innerHTML).toBe('<!--bf:s0-->Astro<!--/-->')
  })

  test('writing empty text clears the node without removing the markers', () => {
    const el = span('<!--bf:s0-->Astro<!--/-->')
    setTextPreservingMarkers(el, '')
    expect(el.innerHTML).toBe('<!--bf:s0--><!--/-->')
  })

  test('writing empty text against an already-empty position stays a no-op', () => {
    const el = span('<!--bf:s0--><!--/-->')
    setTextPreservingMarkers(el, '')
    expect(el.innerHTML).toBe('<!--bf:s0--><!--/-->')
  })

  test('works with no markers at all (plain text child)', () => {
    const el = span('Select framework...')
    setTextPreservingMarkers(el, 'SvelteKit')
    expect(el.innerHTML).toBe('SvelteKit')
  })

  test('falls back to a plain replace for an unexpected non-text child', () => {
    const el = span('<!--bf:s0--><b>unexpected</b><!--/-->')
    setTextPreservingMarkers(el, 'Astro')
    expect(el.innerHTML).toBe('Astro')
  })
})

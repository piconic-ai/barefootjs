/**
 * Unit tests for `patchLeaf` — the in-place update primitive for flatMap
 * leaf elements (descriptor-based `mapArray` loops). The contract:
 *
 *   - the element's IDENTITY is preserved (mapArray holds the node in its
 *     keyed scope map — patching must never swap it),
 *   - attributes sync to the new HTML (added / changed / removed),
 *   - `data-key` is never touched (reconciliation identity is stamped by
 *     mapArray, not leaf content),
 *   - children are replaced wholesale from the new HTML,
 *   - a root-tag mismatch warns and still patches attrs/children.
 */

import { describe, test, expect, beforeAll } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register()
  }
})

const { patchLeaf } = await import('../../src/runtime/patch-leaf.ts')

function mount(html: string): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = html
  return host.firstElementChild as HTMLElement
}

describe('patchLeaf', () => {
  test('updates text content in place, preserving element identity', () => {
    const el = mount('<li data-tag="a">old</li>')
    const before = el
    patchLeaf(el, '<li data-tag="a">new</li>')
    expect(el).toBe(before)
    expect(el.textContent).toBe('new')
  })

  test('syncs attributes: adds, changes, removes', () => {
    const el = mount('<li class="x" data-old="1">t</li>')
    patchLeaf(el, '<li class="y" data-new="2">t</li>')
    expect(el.getAttribute('class')).toBe('y')
    expect(el.hasAttribute('data-old')).toBe(false)
    expect(el.getAttribute('data-new')).toBe('2')
  })

  test('never touches data-key (mapArray owns identity)', () => {
    const el = mount('<li data-key="1:a">t</li>')
    patchLeaf(el, '<li>t2</li>')
    expect(el.getAttribute('data-key')).toBe('1:a')
    expect(el.textContent).toBe('t2')
  })

  test('replaces nested children wholesale', () => {
    const el = mount('<li><b>bold</b> tail</li>')
    patchLeaf(el, '<li><i>italic</i> other</li>')
    expect(el.innerHTML).toBe('<i>italic</i> other')
  })

  test('special characters land as text, not markup', () => {
    const el = mount('<li>plain</li>')
    patchLeaf(el, '<li>&lt;b&gt;bold&lt;/b&gt; &amp; &quot;quoted&quot;</li>')
    expect(el.textContent).toBe('<b>bold</b> & "quoted"')
    expect(el.querySelector('b')).toBeNull()
  })

  test('empty html is a no-op', () => {
    const el = mount('<li class="keep">t</li>')
    patchLeaf(el, '')
    expect(el.getAttribute('class')).toBe('keep')
    expect(el.textContent).toBe('t')
  })

  test('root-tag mismatch warns but still patches content', () => {
    const el = mount('<li>old</li>')
    const warnings: string[] = []
    const orig = console.warn
    console.warn = (msg: string) => { warnings.push(String(msg)) }
    try {
      patchLeaf(el, '<span class="c">new</span>')
    } finally {
      console.warn = orig
    }
    expect(warnings.some(w => w.includes('flatMap leaf root tag changed'))).toBe(true)
    expect(el.tagName).toBe('LI')
    expect(el.textContent).toBe('new')
    expect(el.getAttribute('class')).toBe('c')
  })
})

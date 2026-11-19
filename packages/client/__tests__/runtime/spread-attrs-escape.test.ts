import { beforeAll, describe, expect, test } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { spreadAttrs } from '../../src/runtime/spread-attrs'

beforeAll(() => {
  if (typeof window === 'undefined') GlobalRegistrator.register()
})

const HOSTILE = `"><img src=x onerror=alert(1)>&amp; 'q'`

/** Parse `<span ${attrs}>` the way a template's `innerHTML` does. */
function parse(attrs: string): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = `<span ${attrs}>x</span>`
  return host
}

describe('spreadAttrs escapes caller values (#3917)', () => {
  test('a hostile value stays one literal attribute value', () => {
    const host = parse(spreadAttrs({ title: HOSTILE, id: 'I' }))
    expect(host.querySelectorAll('img').length).toBe(0)
    expect(host.children.length).toBe(1)
    const span = host.firstElementChild!
    expect(span.getAttribute('title')).toBe(HOSTILE)
    expect(span.getAttribute('id')).toBe('I')
  })

  test('a hostile style value cannot close the attribute', () => {
    const host = parse(spreadAttrs({ style: { color: `red"><img src=x onerror=1>` } }))
    expect(host.querySelectorAll('img').length).toBe(0)
  })

  test('a key that is not one attribute name is dropped', () => {
    const host = parse(spreadAttrs({ [`x"><img src=x onerror=1>`]: 'v', title: 'T' }))
    expect(host.querySelectorAll('img').length).toBe(0)
    expect(host.firstElementChild!.getAttribute('title')).toBe('T')
  })

  test('ordinary values are unchanged', () => {
    expect(spreadAttrs({ title: 'T', hidden: true, id: 'I', gone: null })).toBe('title="T" hidden id="I"')
  })
})

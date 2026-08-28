/**
 * `renderChild`'s attribute splicing must handle every legal tag name,
 * not just `[A-Za-z0-9_]+`.
 *
 * `custom-element-tag` (adapter-tests fixtures) already pins hyphenated
 * custom elements as a supported feature, but only as a component's
 * TOP-LEVEL root — that shape never reaches `renderChild`, which is the
 * pure-CSR path a parent's own template uses to render a child inline.
 * There the tag name was matched with `\w+`, so `<my-widget>` matched only
 * `<my` and the splice landed mid-name: `<my bf-s="…"-widget>`. SSR emits
 * the same attributes structurally (a JSX spread placed by the compiler),
 * so the two legs disagreed with no diagnostic — a silent divergence, and
 * the `data-key` a keyed row depends on never became a real attribute.
 */
import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (typeof window === 'undefined') GlobalRegistrator.register()
})

describe('renderChild with a hyphenated tag name', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('splices attributes after the whole tag name on the element-root path', async () => {
    const { registerTemplate, renderChild } = await import('../../src/runtime')
    registerTemplate('WidgetRow', () => '<my-widget class="row">x</my-widget>')

    const html = renderChild('WidgetRow', {}, 7)

    expect(html).toContain('<my-widget ')
    expect(html).not.toContain('<my ')
    expect(html).toContain('data-key="7"')
  })

  test('splices data-key after the whole tag name on the fragment-root path', async () => {
    const { registerTemplate, hydrate, renderChild } = await import('../../src/runtime')
    registerTemplate('FragWidgetRow', () => '<my-widget class="row">x</my-widget>')
    hydrate('FragWidgetRow', { init: () => {}, fragmentRoot: true })

    const html = renderChild('FragWidgetRow', {}, 3)

    expect(html).toContain('<my-widget ')
    expect(html).not.toContain('<my ')
    expect(html).toContain('data-key="3"')
  })

  test('parses back to a single element carrying the key', async () => {
    const { registerTemplate, hydrate, renderChild } = await import('../../src/runtime')
    registerTemplate('ParsedWidgetRow', () => '<my-widget class="row">x</my-widget>')
    hydrate('ParsedWidgetRow', { init: () => {}, fragmentRoot: true })

    const host = document.createElement('div')
    host.innerHTML = renderChild('ParsedWidgetRow', {}, 5)

    const el = host.querySelector('my-widget')
    expect(el).not.toBeNull()
    expect(el?.getAttribute('data-key')).toBe('5')
  })
})

/**
 * Regression tests for #2833.
 *
 * `renderChild`'s 5th argument (`loopItemRoot`) marks a keyed-loop row root:
 * it keeps `(bf-h, bf-m)` slot identity (so the static init's
 * `qsaChildScopes` selector can find it on a pure CSR mount) but does NOT
 * derive its `bf-s` scope id from the parent slot — it gets its own
 * `Name_<random>` id, matching Hono's `__bfParent`/`__bfMount` stamping.
 */
import { describe, test, expect, beforeAll, beforeEach } from 'bun:test'
import { render } from '../../src/runtime/render'
import { renderChild, withParentScope } from '../../src/runtime/component'
import type { ComponentDef } from '../../src/runtime/types'
import { GlobalRegistrator } from '@happy-dom/global-registrator'

beforeAll(() => {
  if (typeof window === 'undefined') {
    GlobalRegistrator.register()
  }
})

describe('renderChild loopItemRoot parameter (#2833)', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  test('a loop item root gets (bf-h, bf-m) slot identity but its OWN scope id, not derived from the parent slot', () => {
    const parent: ComponentDef = {
      name: 'Issue2833Parent',
      init: () => {},
      template: () => `<div>${renderChild('Issue2833Row', { }, 'row-key', 's0', true)}</div>`,
    }

    const container = document.createElement('div')
    document.body.appendChild(container)
    render(container, parent, {})

    const parentEl = container.firstElementChild as HTMLElement
    const parentScope = parentEl.getAttribute('bf-s') ?? ''

    const rowEl = parentEl.firstElementChild as HTMLElement
    const rowScope = rowEl.getAttribute('bf-s') ?? ''
    expect(rowScope.startsWith('Issue2833Row_')).toBe(true)
    // Does NOT derive from the parent — no `_s0` suffix (the rejected "C
    // 案" fallback shape, fable's design §2.3).
    expect(rowScope.endsWith('_s0')).toBe(false)
    expect(rowScope.startsWith(parentScope)).toBe(false)

    // Still carries slot identity so the static init selector can find it.
    expect(rowEl.getAttribute('bf-h')).toBe(parentScope)
    expect(rowEl.getAttribute('bf-m')).toBe('s0')
    expect(rowEl.getAttribute('data-key')).toBe('row-key')
  })

  test('a top-level renderChild (no parent scope) with loopItemRoot omits (bf-h, bf-m) entirely', () => {
    const el = renderChild('Issue2833TopLevel', {}, undefined, 's0', true)
    const container = document.createElement('div')
    container.innerHTML = el
    const rowEl = container.firstElementChild as HTMLElement
    expect(rowEl.getAttribute('bf-h')).toBeNull()
    expect(rowEl.getAttribute('bf-m')).toBeNull()
    expect(rowEl.getAttribute('bf-s') ?? '').toMatch(/^Issue2833TopLevel_/)
  })

  test('omitting loopItemRoot keeps the pre-#2833 behaviour byte-identical (derives from parent slot)', () => {
    const parent: ComponentDef = {
      name: 'Issue2833NonRootParent',
      init: () => {},
      template: () => `<div>${renderChild('Issue2833NonRoot', {}, undefined, 's0')}</div>`,
    }

    const container = document.createElement('div')
    document.body.appendChild(container)
    render(container, parent, {})

    const parentEl = container.firstElementChild as HTMLElement
    const parentScope = parentEl.getAttribute('bf-s') ?? ''
    const childEl = parentEl.firstElementChild as HTMLElement
    expect(childEl.getAttribute('bf-s')).toBe(`${parentScope}_s0`)
    expect(childEl.getAttribute('bf-h')).toBe(parentScope)
    expect(childEl.getAttribute('bf-m')).toBe('s0')
  })

  test('withParentScope restores the previous ambient value, including when nested', () => {
    const outerHtml = withParentScope('outer-scope', () => {
      const innerHtml = withParentScope('inner-scope', () => renderChild('Issue2833Inner', {}, undefined, 's1'))
      const innerContainer = document.createElement('div')
      innerContainer.innerHTML = innerHtml
      expect((innerContainer.firstElementChild as HTMLElement).getAttribute('bf-s')).toBe('inner-scope_s1')
      // Back to 'outer-scope' after the nested call returns.
      return renderChild('Issue2833Outer', {}, undefined, 's2')
    })
    const outerContainer = document.createElement('div')
    outerContainer.innerHTML = outerHtml
    expect((outerContainer.firstElementChild as HTMLElement).getAttribute('bf-s')).toBe('outer-scope_s2')
  })

  test('withParentScope restores the previous value even if fn throws', () => {
    expect(() => withParentScope('will-not-stick', () => {
      throw new Error('boom')
    })).toThrow('boom')

    // No ambient scope leaked from the thrown call — behaves like top-level.
    const el = renderChild('Issue2833AfterThrow', {}, undefined, 's0')
    const container = document.createElement('div')
    container.innerHTML = el
    expect((container.firstElementChild as HTMLElement).getAttribute('bf-s') ?? '').toMatch(/^Issue2833AfterThrow_/)
  })
})

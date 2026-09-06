/**
 * Codegen-routing tests for whole-item loop conditionals (#1665).
 *
 * Two concerns:
 *  1. Detection boundary — which `.map()` body shapes route to the anchored
 *     `mapArrayAnchored` path (an item may render 0-or-1 element) vs. stay on
 *     the legacy element-tracking `mapArray` path (always exactly one element).
 *  2. Keyless robustness — a whole-item conditional without a key is a BF023
 *     error, but the emitted client JS must still be syntactically valid (an
 *     empty key once produced `createComment(`bf-loop-i:${}`)`, a SyntaxError
 *     that breaks the whole bundle).
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import { ErrorCodes } from '../errors'

const adapter = new TestAdapter()

function clientJsFor(body: string, withKey = true): { js: string; errorCodes: string[] } {
  const key = withKey ? ' key={t.id}' : ''
  const source = `
    'use client'
    import { createSignal } from '@barefootjs/client'
    export function C() {
      const [items] = createSignal([{ id: 'a', on: true }])
      const [sel] = createSignal('a')
      return <ul>{items().map(t => ${body.replace('KEY', key)})}</ul>
    }
  `
  const result = compileJSX(source, 'C.tsx', { adapter })
  return {
    js: result.files.find((f) => f.type === 'clientJs')?.content ?? '',
    errorCodes: result.errors.map((e) => e.code),
  }
}

const usesAnchored = (js: string) => js.includes('mapArrayAnchored(')
const usesLegacy = (js: string) => js.includes('mapArray(') && !js.includes('mapArrayAnchored(')

describe('#1665 — anchored-vs-legacy routing for .map() bodies', () => {
  test('logical && JSX body routes to mapArrayAnchored', () => {
    expect(usesAnchored(clientJsFor('sel() === t.id && <li KEY>{t.id}</li>').js)).toBe(true)
  })

  test('ternary with a null branch routes to mapArrayAnchored', () => {
    expect(usesAnchored(clientJsFor('sel() === t.id ? <li KEY>{t.id}</li> : null').js)).toBe(true)
  })

  test('logical || JSX body routes to mapArrayAnchored', () => {
    expect(usesAnchored(clientJsFor('t.on || <li KEY>{t.id}</li>').js)).toBe(true)
  })

  test('ternary with a scalar branch routes to mapArrayAnchored', () => {
    // The element-less side renders text, never a tracked element, so the item
    // is still 0-or-1 element across states — anchored, not legacy.
    expect(usesAnchored(clientJsFor("sel() === t.id ? <li KEY>{t.id}</li> : 'none'").js)).toBe(true)
  })

  test('ternary with two element branches stays on the legacy mapArray path', () => {
    // Always exactly one element, so element tracking is sufficient — must NOT
    // pay the anchored-emission cost.
    const { js } = clientJsFor('sel() === t.id ? <li KEY>A</li> : <span KEY>B</span>')
    expect(usesLegacy(js)).toBe(true)
    expect(usesAnchored(js)).toBe(false)
  })
})

describe('#1665 — keyless whole-item conditional emits valid JS (BF023)', () => {
  test('logical && without a key raises BF023 but still emits parseable JS', () => {
    const { js, errorCodes } = clientJsFor('sel() === t.id && <li>{t.id}</li>', /* withKey */ false)
    expect(errorCodes).toContain(ErrorCodes.MISSING_KEY_IN_LIST)
    // No empty template-literal interpolation, and the anchor falls back to the
    // iteration index so the comment value is well-formed. `__idx` is bound to
    // an index ACCESSOR at runtime (#2859), so the fallback calls it like
    // every other reference to the loop's index parameter.
    expect(js).not.toContain('${}')
    expect(js).toContain('bf-loop-i:${__idx()}')
    // The whole client module must parse.
    const body = js.replace(/^import[^\n]*\n/gm, '').replace(/^export /gm, '')
    expect(() => new Function(body)).not.toThrow()
  })
})

/**
 * BarefootJS Compiler - Reactive CSS custom properties via `style={{}}` (#135).
 *
 * The Concrete Additions section of the Phase 9 issue calls for landing
 * `style={{'--foo': signalOrMemo()}}` patterns across the gallery. The
 * runtime path goes through `styleToCss` so the inline object literal is
 * converted to a CSS string at both SSR and hydration time, and the
 * compiler must keep the two outputs aligned even when the property value
 * references a signal or memo.
 *
 * Two related guarantees this file locks down:
 *
 *   1. A dynamic CSS custom property fires a `createEffect` that calls
 *      `setAttribute('style', styleToCss({...}))`. The custom property
 *      name (`--foo`) survives the camelCase → kebab-case pass.
 *
 *   2. The SSR template substitutes a `createMemo`'s computation for the
 *      property value so the initial paint matches hydration. Plain
 *      arrow constants (`const f = () => sig()`) are NOT substituted by
 *      design — this test pins the canonical `createMemo` path that
 *      validation-demo's async demo relies on.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('reactive CSS custom properties (#135)', () => {
  test('signal-driven CSS var fires setAttribute("style", styleToCss(...))', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Bar() {
        const [pct, setPct] = createSignal('25%')
        return <div style={{ '--w': pct() }}>x</div>
      }
    `
    const result = compileJSX(source, 'Bar.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find((f) => f.type === 'clientJs')
    const content = clientJs!.content

    // Reactive update path uses styleToCss + setAttribute('style', ...).
    expect(content).toContain('createEffect')
    expect(content).toContain("setAttribute('style'")
    expect(content).toContain('styleToCss({')
    expect(content).toContain("'--w'")
    // The custom property name must NOT be converted to camelCase.
    expect(content).not.toContain('"--W"')
    expect(content).not.toContain("'--W'")
  })

  test('createMemo body is inlined into the SSR style template', () => {
    const source = `
      'use client'
      import { createSignal, createMemo } from '@barefootjs/client'

      export function H() {
        const [level, setLevel] = createSignal(0)
        const hue = createMemo(() => {
          const lvl = level()
          if (lvl === 1) return '140'
          if (lvl === 2) return '40'
          if (lvl === 3) return '0'
          return '210'
        })
        return <p style={{ '--err': hue() }}>msg</p>
      }
    `
    const result = compileJSX(source, 'H.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find((f) => f.type === 'clientJs')
    const content = clientJs!.content

    // SSR template inlines the memo as an IIFE with the signal's initial
    // value substituted so the server-rendered `style` attribute is
    // identical to what hydration would write.
    expect(content).toContain("template: (_p) => `<p")
    expect(content).toContain("styleToCss({ '--err': ((() => {")
    expect(content).toContain('const lvl = (0)')
    expect(content).toContain("return '210'")
  })

  test('reactive `aria-busy` and `disabled` on the same component re-emit independently', () => {
    // Locks the Async demo's three-signal-flips-together pattern at the
    // compiler level: both attribute bindings must be emitted as
    // independent reactive updates that respond to the shared
    // `validating()` setter.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function W() {
        const [busy, setBusy] = createSignal(false)
        return (
          <button
            disabled={busy()}
            aria-busy={busy() ? 'true' : 'false'}
          >ok</button>
        )
      }
    `
    const result = compileJSX(source, 'W.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find((f) => f.type === 'clientJs')
    const content = clientJs!.content

    // Both reactive sinks live in the init body — one assigning the DOM
    // `disabled` property, the other writing the `aria-busy` attribute.
    expect(content).toMatch(/\.disabled\s*=\s*!!\(busy\(\)\)/)
    expect(content).toContain("setAttribute('aria-busy'")
  })
})

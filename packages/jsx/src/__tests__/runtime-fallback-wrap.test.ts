/**
 * Regression tests for #937: Solid-style wrap-by-default fallback for JSX
 * text interpolation.
 *
 * Before this pilot, `collect-elements.ts` gated `dynamicElements` on
 * `node.reactive && node.slotId`. Any expression the analyzer couldn't
 * statically prove reactive silently flowed through as a static text node —
 * its SSR value was frozen in the DOM and never updated. That silent-drop
 * path is the architectural gap behind #931 / #932 / and various
 * factory-wrapping regressions.
 *
 * The fix widens the gate to also wrap expressions whose AST carries
 * `hasFunctionCalls` or `callsReactiveGetters`. Over-wrapping a pure call
 * that subscribes to nothing is harmless (one extra closure); under-wrapping
 * a reactive read is the bug class we're closing. Pure literals and bare
 * identifiers without calls stay un-wrapped so the optimisation the flag was
 * originally computed for is preserved.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSXSync } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function getClientJs(source: string, filename: string): string {
  const result = compileJSXSync(source, filename, { adapter })
  expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  const clientJs = result.files.find(f => f.type === 'clientJs')
  expect(clientJs).toBeDefined()
  return clientJs!.content
}

describe('Solid-style wrap-by-default fallback (#937)', () => {
  test('known signal getter still wraps (regression guard)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Counter() {
        const [count, setCount] = createSignal(0)
        return <button onClick={() => setCount(count() + 1)}>{count()}</button>
      }
    `

    const clientJs = getClientJs(source, 'Counter.tsx')
    expect(clientJs).toContain('createEffect')
    expect(clientJs).toContain('count()')
  })

  test('unrecognised call inside interpolation now wraps in createEffect', () => {
    // `format(...)` is an imported helper the analyzer can't prove reactive.
    // `count()` is a recognised signal getter, so the interpolation already
    // had reactive=true. We also assert the new behaviour: even when the
    // outer call is unrecognised, the expression is wrapped because
    // `hasFunctionCalls` is true.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { format } from './fmt'

      export function Counter() {
        const [count, setCount] = createSignal(0)
        return <button onClick={() => setCount(count() + 1)}>{format(count())}</button>
      }
    `

    const clientJs = getClientJs(source, 'Counter.tsx')
    expect(clientJs).toContain('createEffect')
    expect(clientJs).toContain('format(count())')
  })

  test('call expression with no known reactive source still wraps (new behaviour)', () => {
    // `Date.now()` is not reactive, but the analyzer cannot prove it
    // non-reactive either. Under wrap-by-default, we emit a createEffect
    // rather than freeze the SSR value in the DOM. Over-wrapping here is
    // harmless: the effect subscribes to nothing and runs exactly once.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Clock() {
        const [_, setNow] = createSignal(0)
        return <button onClick={() => setNow(Date.now())}>{Date.now()}</button>
      }
    `

    const clientJs = getClientJs(source, 'Clock.tsx')
    expect(clientJs).toContain('createEffect')
    expect(clientJs).toContain('Date.now()')
  })

  test('static string literal stays un-wrapped (optimisation preserved)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Greeting() {
        const [, setFoo] = createSignal(0)
        return <button onClick={() => setFoo(1)}>{'hello'}</button>
      }
    `

    const clientJs = getClientJs(source, 'Greeting.tsx')
    // A pure literal has no slotId and no dynamic binding — nothing to
    // update at runtime. The only signal in this component is read-only in
    // the event handler, so no createEffect should be emitted at all.
    expect(clientJs).not.toContain('createEffect')
  })

  test('bare identifier (no calls) stays un-wrapped', () => {
    // A local constant that is not a signal and contains no function calls
    // keeps its value frozen at SSR — there is nothing for a client-side
    // effect to track.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Label() {
        const [, setFoo] = createSignal(0)
        const label = 'hi'
        return <button onClick={() => setFoo(1)}>{label}</button>
      }
    `

    const clientJs = getClientJs(source, 'Label.tsx')
    // Guard against the identifier being dropped entirely from the module —
    // an over-eager regression could satisfy the negative assertion below by
    // removing `label` altogether. We assert presence in the init scope too.
    expect(clientJs).toContain('label')
    // No text-update createEffect should be emitted for a static bare ident.
    expect(clientJs).not.toMatch(/nodeValue\s*=\s*String\(label/)
  })

  test('method chain on props wraps (already reactive, but exercises the gate)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Joined(props: { items: string[] }) {
        const [, setFoo] = createSignal(0)
        return <button onClick={() => setFoo(1)}>{props.items.join(',')}</button>
      }
    `

    const clientJs = getClientJs(source, 'Joined.tsx')
    expect(clientJs).toContain('createEffect')
    expect(clientJs).toContain('.items.join')
  })
})

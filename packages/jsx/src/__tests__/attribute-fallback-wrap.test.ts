/**
 * Regression tests for #940: Solid-style wrap-by-default fallback for JSX
 * attribute bindings. Follow-up to #937 (architecture) and #939 (text
 * interpolation pilot).
 *
 * Before this change, `collect-elements.ts` gated `reactiveAttrs` on
 * `needsEffectWrapper(...)`, an allow-list that only recognises known signal
 * getters, memos, and props. Any attribute expression the analyzer couldn't
 * statically prove reactive — e.g. `class={format(label)}` where `format`
 * is imported — was silently dropped from `reactiveAttrs`. At SSR the
 * attribute was evaluated once; the client never re-evaluated it, so the
 * attribute stayed frozen.
 *
 * The fix widens the gate to also wrap when the expanded expression contains
 * a function call (`/\b\w+\s*\(/`). Over-wrapping a pure call that
 * subscribes to nothing is harmless (one closure at init time, no rerun);
 * under-wrapping a reactive read is the bug class we're closing. Pure static
 * literals and bare identifiers without calls stay un-wrapped.
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

describe('Solid-style wrap-by-default fallback for attributes (#940)', () => {
  test('known signal getter in attribute still wraps (regression guard)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function classFor(n) { return n % 2 === 0 ? 'even' : 'odd' }

      export function Counter() {
        const [count, setCount] = createSignal(0)
        return <button class={classFor(count())} onClick={() => setCount(c => c + 1)}>x</button>
      }
    `

    const clientJs = getClientJs(source, 'Counter.tsx')
    expect(clientJs).toContain('createEffect')
    expect(clientJs).toContain('classFor(count())')
  })

  test('unrecognised call in attribute now wraps in createEffect', () => {
    // `format` is an imported helper the analyzer can't prove reactive;
    // `label` is a local const, not a signal/memo/prop. Before the fix, this
    // expression produced no entry in reactiveAttrs (silent drop). With
    // wrap-by-default, the function-call shape alone is enough to wrap.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { format } from './fmt'

      export function Tag() {
        const [, setFoo] = createSignal(0)
        const label = 'hi'
        return <button class={format(label)} onClick={() => setFoo(1)}>x</button>
      }
    `

    const clientJs = getClientJs(source, 'Tag.tsx')
    expect(clientJs).toContain('createEffect')
    expect(clientJs).toContain('format(')
  })

  test('call with no reactive source still wraps (harmless over-wrap)', () => {
    // `Date.now()` isn't reactive, but the analyzer can't prove it
    // non-reactive either. Under wrap-by-default we emit a createEffect
    // rather than freeze the SSR value. The effect subscribes to nothing
    // and runs exactly once at init.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Clock() {
        const [, setFoo] = createSignal(0)
        return <button data-x={Date.now()} onClick={() => setFoo(1)}>x</button>
      }
    `

    const clientJs = getClientJs(source, 'Clock.tsx')
    expect(clientJs).toContain('createEffect')
    expect(clientJs).toContain('Date.now()')
  })

  test('static string literal attribute stays un-wrapped (optimisation preserved)', () => {
    // Static literals have attr.dynamic === false, so they never reach the
    // reactive-attr path. The component's only signal is read-only in the
    // event handler, so no createEffect should be emitted at all.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Greeting() {
        const [, setFoo] = createSignal(0)
        return <button class="static" onClick={() => setFoo(1)}>x</button>
      }
    `

    const clientJs = getClientJs(source, 'Greeting.tsx')
    expect(clientJs).not.toContain('createEffect')
  })

  test('bare identifier attribute (no calls) stays un-wrapped', () => {
    // A local const without function calls expands to a string with no call
    // shape (`\`btn-\${size}\``). Neither needsEffectWrapper nor the
    // regex-based fallback fires, so the attribute value is left frozen in
    // SSR output — which is correct, nothing to track.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Label() {
        const [, setFoo] = createSignal(0)
        const size = 'md'
        const cls = \`btn-\${size}\`
        return <button class={cls} onClick={() => setFoo(1)}>x</button>
      }
    `

    const clientJs = getClientJs(source, 'Label.tsx')
    // No attribute-update createEffect. Guard against over-wrap regression.
    expect(clientJs).not.toMatch(/setAttribute\(\s*['"]class['"]/)
    expect(clientJs).not.toMatch(/className\s*=\s*[^;]*cls/)
  })

  test('spread-expanded prop whose expansion contains a call wraps', () => {
    // `classes` is a local const whose value contains a call
    // (`format(variant)`). expandConstantForReactivity inlines the reference
    // before the gate runs, so the expanded string matches the call regex
    // and the attribute wraps. This protects the same silent-drop case for
    // code that factors class construction into a local variable.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { format } from './fmt'

      export function Tag() {
        const [, setFoo] = createSignal(0)
        const base = 'btn'
        const variant = 'primary'
        const classes = \`\${base} \${format(variant)}\`
        return <button class={classes} onClick={() => setFoo(1)}>x</button>
      }
    `

    const clientJs = getClientJs(source, 'Tag.tsx')
    expect(clientJs).toContain('createEffect')
    expect(clientJs).toContain('format(')
  })
})

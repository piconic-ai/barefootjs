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
 * #940 originally closed this by adding a regex fallback
 * (`/\b\w+\s*\(/`) with quote-strip on the expanded value. The DRY
 * consolidation (follow-up to #952 for `IRProp`) replaced that
 * post-expansion regex with AST flags computed Phase 1 on the source
 * JSX expression — matching the shape #939 / #941 / #942 / #943 already
 * use. Over-wrap (extra createEffect that subscribes to nothing) stays
 * harmless; under-wrap (silent drop of a reactive attribute read) stays
 * the class of bug we're closing.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function getClientJs(source: string, filename: string): string {
  const result = compileJSX(source, filename, { adapter })
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

  test('local-const identifier attribute stays un-wrapped (#953 source-level vs post-expansion guard)', () => {
    // DRY consolidation replaced the post-expansion regex gate with AST
    // flags computed on the attribute's source expression. This changes
    // behaviour for a specific shape: a local-const identifier whose
    // initializer contains a call, used as an attribute value.
    //
    // Source: `class={classes}` where
    // `const classes = \`\${base} \${format(variant)}\``. The old regex
    // expanded `classes` first, then matched `format(` on the expansion
    // — forcing wrap. The AST flags see only the source identifier
    // `classes` (no CallExpression), so `hasFunctionCalls` is false.
    // `needsEffectWrapper` on the expanded text also stays false
    // because `base`, `format`, and `variant` aren't registered as
    // reactive (no signals/memos/props match). The attribute stays
    // un-wrapped.
    //
    // That is the correct semantic under #937: wrap based on what the
    // attribute's source expression *does*, not on what its transitive
    // inlining happens to contain. The SSR-rendered attribute is
    // already frozen into the DOM and none of the transitive reads are
    // reactive, so the previous wrap was dead weight.
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
    // Narrowed from `not.toContain('createEffect')` so a future optimisation
    // that happens to wrap something else in this component doesn't fail
    // this test for the wrong reason. The thing we actually pin is that
    // the `class` attribute is not re-bound via a reactive-attrs entry:
    // `// Reactive attributes` is the emitter-stable section header for
    // that block in collect-elements.ts, and `class` is the only
    // attribute in `Tag` that could regress into it.
    expect(clientJs).not.toContain('Reactive attributes')
    expect(clientJs).not.toMatch(/setAttribute\(\s*['"]class['"]/)
    expect(clientJs).not.toMatch(/\.className\s*=/)
  })

  test('string-literal-only function-like pattern stays un-wrapped (#953 AST-flag structural check)', () => {
    // Before DRY consolidation, collect-elements.ts scanned the expanded
    // attribute value with /\b\w+\s*\(/ after stripping quoted strings.
    // A structural regex over stripped text is still a regex — any future
    // regression in the strip step would silently re-introduce hsl / rgb
    // / url / etc. false positives. The AST flag approach can't be fooled
    // this way: `{ color: 'hsl(221 83% 53%)' }` is an object literal with
    // a StringLiteral value, not a CallExpression, so `hasFunctionCalls`
    // is structurally false.
    //
    // The enclosing expression has no reactive source (no signal, no
    // memo, no \`props.\`), so the attribute must NOT appear in
    // reactiveAttrs.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Palette() {
        const [, setFoo] = createSignal(0)
        return <div style={{ color: 'hsl(221 83% 53%)' }} onClick={() => setFoo(1)}>x</div>
      }
    `

    const clientJs = getClientJs(source, 'Palette.tsx')
    // Pin the `style` attribute specifically, not the whole module — see
    // the comment on the previous test for the rationale. Palette has no
    // other attribute that could regress into reactive-attrs, so this is
    // a tight structural guard.
    expect(clientJs).not.toContain('Reactive attributes')
    expect(clientJs).not.toMatch(/setAttribute\(\s*['"]style['"]/)
  })

  test('a wrapped attribute on an element with no other dynamic content gets a slot (#3266)', () => {
    // `v()` reads a store the analyzer can't see into (an untyped prop
    // holding a class instance), so only the call shape marks
    // `hidden={v().hide}` for wrapping. The <p> has no event, ref or
    // dynamic child, so before #3266 it got no slot id: the wrapped effect
    // had no element to address and `hidden` was never applied on the
    // client, not even initially.
    const source = `
      'use client'

      export function Card(props: any) {
        const s = props.data.s
        const v = () => s.get()
        return <div><p className="h" hidden={v().hide}>x</p></div>
      }
    `

    const clientJs = getClientJs(source, 'Card.tsx')
    const slot = clientJs.match(/<p class="h" [^>]*bf="(s\d+)"/)?.[1]
    expect(slot).toBeDefined()
    expect(clientJs).toContain(`_${slot}.hidden = !!(__x)`)
    expect(clientJs).toContain('const __x = v().hide')
  })
})

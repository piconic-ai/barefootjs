/**
 * Regression tests for #941: Solid-style wrap-by-default fallback for JSX
 * conditional expressions used as children — `{cond ? a : b}`,
 * `{cond && b}`, `{a ?? b}`, `{a || b}`. Follow-up to #937 (architecture)
 * and #939 (text interpolation pilot).
 *
 * Before this change, `jsx-to-ir.ts` gated `IRConditional.slotId` on
 * `isReactiveExpression(...)` (an allow-list of known signal getters,
 * memos, and props). Any condition the analyzer couldn't statically prove
 * reactive — e.g. `{isVisible(x) ? <A/> : <B/>}` where `isVisible` is an
 * imported helper — was allocated no slotId. At SSR the branch was chosen
 * once based on the condition's initial value; the client never
 * re-evaluated it, so the rendered branch stayed frozen.
 *
 * The fix computes `exprHasFunctionCalls` / `exprCallsReactiveGetters` on
 * the condition AST at each of the three sites and includes those flags
 * in both the `needsSlot` decision and the `IRConditional` node. The
 * collector in `collect-elements.ts` then wraps on the widened gate.
 * Over-wrap is harmless; under-wrap is the silent-drop bug we're closing.
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

describe('Solid-style wrap-by-default fallback for conditionals (#941)', () => {
  test('known signal in ternary still wraps (regression guard)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Gate() {
        const [count, setCount] = createSignal(0)
        return (
          <button onClick={() => setCount(c => c + 1)}>
            {count() > 0 ? <span>pos</span> : <span>zero</span>}
          </button>
        )
      }
    `

    const clientJs = getClientJs(source, 'Gate.tsx')
    // A reactive ternary emits an insert(...) call for branch switching.
    expect(clientJs).toContain('insert')
    expect(clientJs).toContain('count()')
  })

  test('unrecognised call in ternary now wraps in insert (new behaviour)', () => {
    // `isVisible` is an imported helper the analyzer can't prove reactive.
    // Before the fix, no slotId was allocated, and the branch stayed frozen
    // at its SSR value. With wrap-by-default the call shape alone allocates
    // a slotId and the collector emits an insert() for branch switching.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { isVisible } from './visibility'

      export function Gate() {
        const [, setFoo] = createSignal(0)
        const x = 1
        return (
          <button onClick={() => setFoo(1)}>
            {isVisible(x) ? <span>yes</span> : <span>no</span>}
          </button>
        )
      }
    `

    const clientJs = getClientJs(source, 'Gate.tsx')
    expect(clientJs).toContain('insert')
    expect(clientJs).toContain('isVisible(')
  })

  test('logical-AND with method-call condition wraps', () => {
    // `flags.enabled()` is a method call — neither signal, memo, nor prop.
    // Under the old gate this was dropped; under wrap-by-default the
    // function-call shape alone triggers the fallback.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Banner() {
        const [, setFoo] = createSignal(0)
        const flags = { enabled: () => true }
        return (
          <div onClick={() => setFoo(1)}>
            {flags.enabled() && <span>on</span>}
          </div>
        )
      }
    `

    const clientJs = getClientJs(source, 'Banner.tsx')
    expect(clientJs).toContain('insert')
    expect(clientJs).toContain('flags.enabled()')
  })

  test('static literal-derived condition stays un-wrapped', () => {
    // `staticValue` is a bare local const with no function calls; neither
    // the old gate nor the new fallback fires. No insert() — the branch
    // baked into SSR output stays as-is on the client.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Banner() {
        const [, setFoo] = createSignal(0)
        const staticValue = true
        return (
          <div onClick={() => setFoo(1)}>
            {staticValue ? <span>a</span> : <span>b</span>}
          </div>
        )
      }
    `

    const clientJs = getClientJs(source, 'Banner.tsx')
    expect(clientJs).not.toContain('insert')
  })

  test('bare identifier in nullish coalescing stays un-wrapped', () => {
    // `a` is a bare local const with no calls. `a ?? <Fallback/>` has
    // nothing to re-evaluate on the client. No insert() emitted.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Message() {
        const [, setFoo] = createSignal(0)
        const a = 'hello'
        return (
          <div onClick={() => setFoo(1)}>
            {a ?? <span>fallback</span>}
          </div>
        )
      }
    `

    const clientJs = getClientJs(source, 'Message.tsx')
    expect(clientJs).not.toContain('insert')
  })

  test('nested ternaries with unrecognised calls wrap at both levels', () => {
    // `outer()` and `inner()` are imported helpers the analyzer can't
    // prove reactive. Both conditionals must wrap so that a signal update
    // in either layer triggers a re-render, not just the outermost.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { outer, inner } from './checks'

      export function Nested() {
        const [, setFoo] = createSignal(0)
        return (
          <button onClick={() => setFoo(1)}>
            {outer() ? (inner() ? <span>A</span> : <span>B</span>) : <span>C</span>}
          </button>
        )
      }
    `

    const clientJs = getClientJs(source, 'Nested.tsx')
    expect(clientJs).toContain('outer()')
    expect(clientJs).toContain('inner()')
    // Both conditionals produce insert() call sites. Two insert(...) calls
    // for the outer + the nested inner.
    const insertCount = (clientJs.match(/\binsert\s*\(/g) ?? []).length
    expect(insertCount).toBeGreaterThanOrEqual(2)
  })
})

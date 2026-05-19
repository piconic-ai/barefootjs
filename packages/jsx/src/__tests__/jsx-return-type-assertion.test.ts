/**
 * Regression tests for #1405: a `'use client'` component whose JSX
 * return is wrapped in a TypeScript type assertion (`as X`, `<T>expr`,
 * `expr satisfies X`, `expr!`) was treated as if it had no JSX return.
 *
 * For multi-return bodies that meant the early `if (cond) return
 * <jsx/> as X` branch never registered as a conditional return —
 * `findJsxReturnInBlock` only unwrapped parentheses. The if-statement
 * then fell into the "preserve top-level imperative statement"
 * branch, emitting the raw JSX (`<div ref={attachHost}>...</div>`)
 * verbatim into the client JS init body → `SyntaxError: Unexpected
 * token '<'` at module load.
 *
 * For trailing returns the same gap meant `ctx.jsxReturn` held the
 * outer `AsExpression`, which `transformNode` in
 * `buildIfStatementChain` couldn't lower → the if-statement's
 * `alternate` was `null` and the template only rendered the early
 * branch.
 *
 * The fix routes every return-position capture site through a single
 * `unwrapJsxTransparent` helper that strips the same set of wrappers
 * the IR dispatcher (`transformJsxExpression`) already handles:
 * parentheses, `as`, `satisfies`, `!`, `<T>`, partially-emitted.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function findHydrate(content: string): string {
  const line = content.split('\n').find(l => l.includes('hydrate('))
  if (!line) throw new Error('no hydrate() call in client JS')
  return line
}

describe("JSX return through TypeScript type assertion (#1405)", () => {
  test('issue exact repro: multi-return + ref={fn} + `as X` cast compiles cleanly', () => {
    const source = `
      'use client'
      import { createSignal, onCleanup } from '@barefootjs/client'

      export function RawJsxLeak(props: { width: number }): HTMLElement {
        const [count] = createSignal(0)
        const isSmall = props.width < 100

        function attachHost(host: HTMLElement) {
          onCleanup(() => host.removeAttribute('data-attached'))
          host.setAttribute('data-attached', 'true')
        }

        if (isSmall) {
          return (
            <div ref={attachHost}>
              <div>small: {count()}</div>
            </div>
          ) as unknown as HTMLElement
        }
        return (
          <div ref={attachHost}>
            <div>large: {count()}</div>
          </div>
        ) as unknown as HTMLElement
      }
    `
    const result = compileJSX(source, 'RawJsxLeak.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')!
    // No raw JSX leaks into the init body.
    expect(clientJs.content).not.toMatch(/return \(\s*<div\s+ref=/)

    // Init body wires both branches' refs through the slot binding.
    // Pre-fix only the trailing branch had a slot/ref wiring.
    const refCalls = clientJs.content.match(/\(attachHost\)\(/g) ?? []
    expect(refCalls.length).toBe(2)

    // The hydrate template lowers to a ternary covering both branches.
    const hydrate = findHydrate(clientJs.content)
    expect(hydrate).toContain('template:')
    expect(hydrate).toMatch(/_p\.width < 100\) \?/)
    expect(hydrate).toContain('small:')
    expect(hydrate).toContain('large:')
  })

  test('`satisfies` on early-return JSX is also detected as a conditional return', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function SatisfiesWrap(props: { kind: 'a' | 'b' }) {
        const [n] = createSignal(0)
        if (props.kind === 'a') {
          return (<span>A: {n()}</span>) satisfies unknown
        }
        return <button>B: {n()}</button>
      }
    `
    const result = compileJSX(source, 'SatisfiesWrap.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')!
    const hydrate = findHydrate(clientJs.content)
    expect(hydrate).toContain('template:')
    expect(hydrate).toContain('<span')
    expect(hydrate).toContain('<button')
  })

  test('`!` non-null assertion on JSX return preserves analysis', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function NonNullWrap(props: { flag: boolean }) {
        const [n] = createSignal(0)
        if (props.flag) {
          return <span>T: {n()}</span>!
        }
        return <em>F: {n()}</em>
      }
    `
    const result = compileJSX(source, 'NonNullWrap.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')!
    const hydrate = findHydrate(clientJs.content)
    expect(hydrate).toContain('template:')
    expect(hydrate).toContain('<span')
    expect(hydrate).toContain('<em')
  })

  test('arrow-shorthand component body with `as X` cast still works', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export const Shorthand = (props: { label: string }) => (
        <button>{props.label}</button>
      ) as unknown as HTMLElement
    `
    const result = compileJSX(source, 'Shorthand.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')
    // No reactive primitives → no client JS needed. The point of this
    // test is that compilation reaches a clean end without producing
    // an empty / broken template fallback.
    expect(clientJs).toBeDefined()
  })
})

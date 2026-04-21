/**
 * Regression tests for #931: user-authored reactive-factory helpers.
 *
 * Context: wrapping `createSignal` / `createMemo` in a same-file helper
 * used to silently break — the analyzer only matched the literal
 * `createSignal` callee, so `const [x, setX] = myHelper(0)` produced
 * client JS without any signal declaration. Fix: inline the factory
 * body at the destructured call site so downstream signal/memo
 * collection sees ordinary `createSignal(...)` calls, and emit BF110
 * for destructures of non-recognised factory shapes.
 */

import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { compileJSXSync } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('Reactive factory inlining (#931)', () => {
  test('function-declaration factory: single signal [get, set] is inlined', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function createCounter(initial: number) {
        const [c, s] = createSignal(initial)
        return [c, s] as const
      }

      export function Counter() {
        const [count, setCount] = createCounter(0)
        return <button onClick={() => setCount(count() + 1)}>{count()}</button>
      }
    `

    const ctx = analyzeComponent(source, 'Counter.tsx')
    // Inlining rewrites the destructure into an ordinary signal declaration
    // whose getter is `count` and setter is `setCount`.
    expect(ctx.signals.length).toBe(1)
    expect(ctx.signals[0].getter).toBe('count')
    expect(ctx.signals[0].setter).toBe('setCount')

    const result = compileJSXSync(source, 'Counter.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    expect(clientJs!.content).toContain('createSignal')
    expect(clientJs!.content).toContain('count')
    expect(clientJs!.content).toContain('setCount')
  })

  test('factory with custom setter wrapper is inlined verbatim', () => {
    // Matches the createPersistentSignal shape from PR #930.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function createStoredSignal(key: string, initial: string) {
        const [v, setV] = createSignal(initial)
        const setAndStore = (next: string) => {
          setV(next)
          localStorage.setItem(key, next)
        }
        return [v, setAndStore] as const
      }

      export function Store() {
        const [value, setValue] = createStoredSignal('k', 'hello')
        return <button onClick={() => setValue('world')}>{value()}</button>
      }
    `

    const ctx = analyzeComponent(source, 'Store.tsx')
    expect(ctx.signals.length).toBe(1)
    expect(ctx.signals[0].getter).toBe('value')

    const result = compileJSXSync(source, 'Store.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')!.content
    // The body's custom setter should be emitted as a regular constant
    // inside the init function (suffix-renamed to avoid collisions).
    expect(clientJs).toContain('createSignal')
    expect(clientJs).toContain("localStorage.setItem('k'")
  })

  test('factory called twice in the same component — identifier hygiene', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function createCounter(initial: number) {
        const [c, s] = createSignal(initial)
        return [c, s] as const
      }

      export function Pair() {
        const [a, setA] = createCounter(0)
        const [b, setB] = createCounter(10)
        return <p>{a()} {b()}</p>
      }
    `

    const ctx = analyzeComponent(source, 'Pair.tsx')
    expect(ctx.signals.length).toBe(2)
    const getters = ctx.signals.map(s => s.getter).sort()
    expect(getters).toEqual(['a', 'b'])

    const result = compileJSXSync(source, 'Pair.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')!.content
    // Both destructures should resolve to independent signals.
    expect(clientJs.match(/createSignal\(/g)?.length).toBe(2)
  })

  test('factory parameters are substituted at the call site', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function createCounter(initial: number) {
        const [c, s] = createSignal(initial)
        return [c, s] as const
      }

      export function Counter() {
        const [count, setCount] = createCounter(42)
        return <span>{count()}</span>
      }
    `

    const result = compileJSXSync(source, 'Counter.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')!.content
    // The argument expression must flow into the createSignal call.
    expect(clientJs).toMatch(/createSignal\(\s*42\s*\)/)
  })

  test('BF110: tuple destructure of an unknown callee emits a diagnostic', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { useExternal } from './external'

      export function Gadget() {
        const [value, setValue] = useExternal('key', 'hello')
        return <button onClick={() => setValue('x')}>{value()}</button>
      }
    `

    const result = compileJSXSync(source, 'Gadget.tsx', { adapter })
    const bf110 = result.errors.find(e => e.code === 'BF110')
    expect(bf110).toBeDefined()
    expect(bf110!.message).toContain('useExternal')
  })

  test('BF110 is NOT emitted when the factory shape is recognised and inlined', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function createCounter(initial: number) {
        const [c, s] = createSignal(initial)
        return [c, s] as const
      }

      export function Counter() {
        const [count, setCount] = createCounter(0)
        return <button onClick={() => setCount(count() + 1)}>{count()}</button>
      }
    `

    const result = compileJSXSync(source, 'Counter.tsx', { adapter })
    const bf110 = result.errors.find(e => e.code === 'BF110')
    expect(bf110).toBeUndefined()
  })

  test('non-tuple single-value destructure is NOT treated as a factory call', () => {
    // Guard against false positives: `const { x } = obj()` should be left alone.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Comp() {
        const [count, setCount] = createSignal(0)
        return <p>{count()}</p>
      }
    `

    const result = compileJSXSync(source, 'Comp.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const bf110 = result.errors.find(e => e.code === 'BF110')
    expect(bf110).toBeUndefined()
  })
})

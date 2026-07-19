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
import { compileJSX } from '../compiler'
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

    const result = compileJSX(source, 'Counter.tsx', { adapter })
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

    const result = compileJSX(source, 'Store.tsx', { adapter })
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

    const result = compileJSX(source, 'Pair.tsx', { adapter })
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

    const result = compileJSX(source, 'Counter.tsx', { adapter })
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

    const result = compileJSX(source, 'Gadget.tsx', { adapter })
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

    const result = compileJSX(source, 'Counter.tsx', { adapter })
    const bf110 = result.errors.find(e => e.code === 'BF110')
    expect(bf110).toBeUndefined()
  })

  test('non-tuple single-value destructure is NOT treated as a factory call', () => {
    // Guard against false positives: `const { x } = obj()` should be left
    // alone when `obj` is an ordinary (non-reactive) function.
    //
    // Correction (#2325): this fixture previously destructured `createSignal`
    // itself with a TUPLE pattern (`const [count, setCount] = createSignal(0)`),
    // which never exercised an object destructure at all — it was already
    // covered by the `callee === 'createSignal'` skip in
    // `validateReactiveFactoryCalls`. Rewritten to genuinely exercise the
    // object-destructure path now that it performs real factory-shape
    // dispatch (#2325 §4c).
    const source = `
      'use client'

      function getConfig() {
        return { x: 1 }
      }

      export function Comp() {
        const { x } = getConfig()
        return <p>{x}</p>
      }
    `

    const result = compileJSX(source, 'Comp.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const bf110 = result.errors.find(e => e.code === 'BF110')
    expect(bf110).toBeUndefined()
  })
})

describe('Object-return reactive factories (#2325)', () => {
  test('object-return factory: full destructure { count, setCount }', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function createCounter(initial: number) {
        const [count, setCount] = createSignal(initial)
        return { count, setCount }
      }

      export function Counter() {
        const { count, setCount } = createCounter(0)
        return <button onClick={() => setCount(count() + 1)}>{count()}</button>
      }
    `

    const ctx = analyzeComponent(source, 'Counter.tsx')
    expect(ctx.signals.length).toBe(1)
    expect(ctx.signals[0].getter).toBe('count')
    expect(ctx.signals[0].setter).toBe('setCount')

    const result = compileJSX(source, 'Counter.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    expect(clientJs!.content).toContain('createSignal')
  })

  test('object-return factory: subset destructure suffix-renames the undestructured setter (C4)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function createCounter(initial: number) {
        const [count, setCount] = createSignal(initial)
        return { count, setCount }
      }

      export function Display() {
        const { count } = createCounter(0)
        return <p>{count()}</p>
      }
    `

    const ctx = analyzeComponent(source, 'Display.tsx')
    expect(ctx.signals.length).toBe(1)
    expect(ctx.signals[0].getter).toBe('count')

    const result = compileJSX(source, 'Display.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')!.content
    // The setter was never destructured — it must still be suffix-renamed
    // (not left as a bare, unresolved `setCount`).
    expect(clientJs).toMatch(/setCount_\w+/)
  })

  test('object-return factory: custom setter wrapper (localStorage-backed signal)', () => {
    // Matches the createPersistentSignal shape from PR #930.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function createPersistentSignal(key: string, initial: string) {
        const [v, setV] = createSignal(initial)
        const setAndStore = (next: string) => {
          setV(next)
          localStorage.setItem(key, next)
        }
        return { v, setAndStore }
      }

      export function Store() {
        const { v, setAndStore } = createPersistentSignal('k', 'hello')
        return <button onClick={() => setAndStore('world')}>{v()}</button>
      }
    `

    const ctx = analyzeComponent(source, 'Store.tsx')
    expect(ctx.signals.length).toBe(1)
    expect(ctx.signals[0].getter).toBe('v')

    const result = compileJSX(source, 'Store.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')!.content
    expect(clientJs).toContain('createSignal')
    expect(clientJs).toContain("localStorage.setItem('k'")
  })

  test('object-return factory: two subset-destructure call sites stay hygienic (C4)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function createPair(initial: number) {
        const [count, setCount] = createSignal(initial)
        return { count, setCount }
      }

      export function Two() {
        const { count } = createPair(0)
        const { setCount } = createPair(10)
        return <p>{count()}</p>
      }
    `

    const result = compileJSX(source, 'Two.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')!.content
    expect(clientJs.match(/createSignal\(/g)?.length).toBe(2)
    // Per-call-site-unique suffixed internal names: the first call site
    // suffix-renames its undestructured `setCount`, the second suffix-
    // renames its undestructured `count` — distinct call sites must not
    // collide on either name.
    expect(clientJs).toMatch(/setCount_bf\d+/)
    expect(clientJs).toMatch(/count_bf\d+/)
  })

  test('object-return factory: mixed signal + memo body', () => {
    const source = `
      'use client'
      import { createSignal, createMemo } from '@barefootjs/client'

      function createCounter(initial: number) {
        const [count, setCount] = createSignal(initial)
        const double = createMemo(() => count() * 2)
        return { count, setCount, double }
      }

      export function Counter() {
        const { count, setCount, double } = createCounter(0)
        return <button onClick={() => setCount(count() + 1)}>{double()}</button>
      }
    `

    const ctx = analyzeComponent(source, 'Counter.tsx')
    expect(ctx.signals.length).toBe(1)
    expect(ctx.memos.length).toBe(1)
    expect(ctx.memos[0].name).toBe('double')

    const result = compileJSX(source, 'Counter.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  })
})

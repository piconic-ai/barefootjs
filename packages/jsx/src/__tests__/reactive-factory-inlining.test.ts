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

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
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

  test('BF110: object destructure of an unknown imported callee emits a diagnostic', () => {
    // Regression-locks the closed silent-failure hole: an unresolvable
    // relative import whose name looks reactive-factory-shaped.
    const source = `
      'use client'
      import { useExternal } from './external'

      export function Gadget() {
        const { value, setValue } = useExternal('key')
        return <button onClick={() => setValue('x')}>{value()}</button>
      }
    `

    const result = compileJSX(source, 'Gadget.tsx', { adapter })
    const bf110 = result.errors.find(e => e.code === 'BF110')
    expect(bf110).toBeDefined()
    expect(bf110!.message).toContain('useExternal')
  })

  test('BF111: non-shorthand factory return emits a diagnostic, no inlining', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function createCounter(initial: number) {
        const [count, setCount] = createSignal(initial)
        return { count: count, setCount }
      }

      export function Counter() {
        const { count, setCount } = createCounter(0)
        return <button onClick={() => setCount(count() + 1)}>{count()}</button>
      }
    `

    const ctx = analyzeComponent(source, 'Counter.tsx')
    expect(ctx.signals.length).toBe(0)

    const result = compileJSX(source, 'Counter.tsx', { adapter })
    const bf111 = result.errors.find(e => e.code === 'BF111')
    expect(bf111).toBeDefined()
  })

  test('BF111: non-shorthand call-site destructure of a shorthand factory emits a diagnostic, no inlining', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function createCounter(initial: number) {
        const [count, setCount] = createSignal(initial)
        return { count, setCount }
      }

      export function Counter() {
        const { count: c, setCount } = createCounter(0)
        return <button onClick={() => setCount(c() + 1)}>{c()}</button>
      }
    `

    const ctx = analyzeComponent(source, 'Counter.tsx')
    expect(ctx.signals.length).toBe(0)

    const result = compileJSX(source, 'Counter.tsx', { adapter })
    const bf111 = result.errors.find(e => e.code === 'BF111')
    expect(bf111).toBeDefined()
  })

  test('BF110 (not BF111): object destructure with a rename of a TUPLE-return factory reports the tuple mismatch', () => {
    // A tuple-return factory destructured as an object is never valid,
    // regardless of whether the object pattern is shorthand or uses a
    // rename/default/rest element — it should always get the "this
    // factory returns a tuple" BF110 message, not the shorthand-only
    // BF111 guidance (which only makes sense for object-return factories).
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function createCounter(initial: number) {
        const [count, setCount] = createSignal(initial)
        return [count, setCount] as const
      }

      export function Counter() {
        const { count: c, setCount } = createCounter(0)
        return <button onClick={() => setCount(c() + 1)}>{c()}</button>
      }
    `

    const ctx = analyzeComponent(source, 'Counter.tsx')
    expect(ctx.signals.length).toBe(0)

    const result = compileJSX(source, 'Counter.tsx', { adapter })
    const bf110 = result.errors.find(e => e.code === 'BF110')
    expect(bf110).toBeDefined()
    expect(bf110!.message).toContain('returns a tuple')
    expect(result.errors.find(e => e.code === 'BF111')).toBeUndefined()
  })

  test('guard: plain-function object destructure is not flagged (false-positive guard)', () => {
    const source = `
      'use client'

      function parseConfig() {
        return { data: 42 }
      }

      export function Comp() {
        const { data } = parseConfig()
        return <p>{data}</p>
      }
    `

    const result = compileJSX(source, 'Comp.tsx', { adapter })
    expect(result.errors.find(e => e.code === 'BF110')).toBeUndefined()
    expect(result.errors.find(e => e.code === 'BF111')).toBeUndefined()
  })

  test('guard: object destructure of a @barefootjs-scoped import is not flagged (false-positive guard)', () => {
    const source = `
      'use client'
      import { loadItems } from '@barefootjs/something'

      export function Comp() {
        const { items } = loadItems()
        return <p>{items}</p>
      }
    `

    const result = compileJSX(source, 'Comp.tsx', { adapter })
    expect(result.errors.find(e => e.code === 'BF110')).toBeUndefined()
  })
})

describe('Guard-clause / nested-return factories decline (#2341 BUG-3)', () => {
  test('T1: if-guard return declines with BF110, no inert splice (issue repro)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      function useBounded(initial: number, max: number) {
        const [n, setN] = createSignal(initial)
        const bump = () => setN(Math.min(n() + 1, max))
        if (initial > max) {
          return { n, bump }
        }
        return { n, bump }
      }
      export function Bounded() {
        const { n, bump } = useBounded(0, 10)
        return <button onClick={bump}>{n()}</button>
      }
    `

    const ctx = analyzeComponent(source, 'Bounded.tsx')
    expect(ctx.signals.length).toBe(0)

    const result = compileJSX(source, 'Bounded.tsx', { adapter })
    const bf110 = result.errors.find(e => e.code === 'BF110')
    expect(bf110).toBeDefined()
    expect(bf110!.message).toContain('useBounded')
    const clientJs = result.files.find(f => f.type === 'clientJs')
    if (clientJs) {
      expect(clientJs.content).not.toContain('if (0 > 10)')
    }
  })

  test('T2: return inside try/catch declines', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      function useBounded(initial: number, max: number) {
        const [n, setN] = createSignal(initial)
        const bump = () => setN(Math.min(n() + 1, max))
        try {
          return { n, bump }
        } catch {}
        return { n, bump }
      }
      export function Bounded() {
        const { n, bump } = useBounded(0, 10)
        return <button onClick={bump}>{n()}</button>
      }
    `

    const ctx = analyzeComponent(source, 'Bounded.tsx')
    expect(ctx.signals.length).toBe(0)

    const result = compileJSX(source, 'Bounded.tsx', { adapter })
    const bf110 = result.errors.find(e => e.code === 'BF110')
    expect(bf110).toBeDefined()
  })

  test('T3: return inside a for-loop declines', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      function useBounded(initial: number, max: number, seed: number[]) {
        const [n, setN] = createSignal(initial)
        const bump = () => setN(Math.min(n() + 1, max))
        for (const x of seed) {
          if (x < 0) return { n, bump }
        }
        return { n, bump }
      }
      export function Bounded() {
        const { n, bump } = useBounded(0, 10, [1, 2, 3])
        return <button onClick={bump}>{n()}</button>
      }
    `

    const ctx = analyzeComponent(source, 'Bounded.tsx')
    expect(ctx.signals.length).toBe(0)

    const result = compileJSX(source, 'Bounded.tsx', { adapter })
    const bf110 = result.errors.find(e => e.code === 'BF110')
    expect(bf110).toBeDefined()
  })

  test('T4: braced-arrow-callback returns do NOT decline (false-positive guard)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      function createCounter(initial: number) {
        const [n, setN] = createSignal(initial)
        const bump = () => { return setN(n() + 1) }
        return { n, bump }
      }
      export function Counter() {
        const { n, bump } = createCounter(0)
        return <button onClick={bump}>{n()}</button>
      }
    `

    const result = compileJSX(source, 'Counter.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const ctx = analyzeComponent(source, 'Counter.tsx')
    expect(ctx.signals.length).toBe(1)
    const clientJs = result.files.find(f => f.type === 'clientJs')!.content
    expect(clientJs).toContain('createSignal')
  })

  describe('T5: cross-file guard-clause factory', () => {
    let fixtureDir: string

    beforeAll(() => {
      fixtureDir = mkdtempSync(path.join(tmpdir(), 'bf-factory-guard-clause-'))
    })

    afterAll(() => {
      rmSync(fixtureDir, { recursive: true, force: true })
    })

    function writeFixture(name: string, content: string): string {
      const p = path.join(fixtureDir, name)
      mkdirSync(path.dirname(p), { recursive: true })
      writeFileSync(p, content, 'utf8')
      return p
    }

    test('guard-clause factory in an imported helper declines with BF110 (reactive-shaped path)', () => {
      writeFixture('hooks-bounded.tsx', `'use client'
import { createSignal } from '@barefootjs/client'

export function useBounded(initial: number, max: number) {
  const [n, setN] = createSignal(initial)
  const bump = () => setN(Math.min(n() + 1, max))
  if (initial > max) {
    return { n, bump }
  }
  return { n, bump }
}
`)
      const consumerSource = `'use client'
import { useBounded } from './hooks-bounded'

export function Bounded() {
  const { n, bump } = useBounded(0, 10)
  return <button onClick={bump}>{n()}</button>
}
`
      const consumerPath = writeFixture('bounded-consumer.tsx', consumerSource)

      const result = compileJSX(consumerSource, consumerPath, { adapter })
      const bf110 = result.errors.find(e => e.code === 'BF110')
      expect(bf110).toBeDefined()
      expect(bf110!.message).toContain('does not match the inlinable factory shape')
    })
  })
})

describe('Real-world factory matrix (#2341)', () => {
  test('M1: onMount/onCleanup inside a factory body', () => {
    const source = `
      'use client'
      import { createSignal, onMount, onCleanup } from '@barefootjs/client'

      function useTick() {
        const [tick, setTick] = createSignal(0)
        onMount(() => setTick(1))
        onCleanup(() => setTick(0))
        return { tick, setTick }
      }

      export function Ticker() {
        const { tick, setTick } = useTick()
        return <button onClick={() => setTick(tick() + 1)}>{tick()}</button>
      }
    `

    const ctx = analyzeComponent(source, 'Ticker.tsx')
    expect(ctx.signals.length).toBe(1)

    const result = compileJSX(source, 'Ticker.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')!.content
    expect(clientJs).toContain('onMount(')
    expect(clientJs).toContain('onCleanup(')
  })

  test('M2: createEffect inside a factory body', () => {
    const source = `
      'use client'
      import { createSignal, createEffect } from '@barefootjs/client'

      function useTitle(initial: number) {
        const [count, setCount] = createSignal(initial)
        createEffect(() => { document.title = String(count()) })
        return [count, setCount] as const
      }

      export function TitleUpdater() {
        const [count, setCount] = useTitle(0)
        return <button onClick={() => setCount(count() + 1)}>{count()}</button>
      }
    `

    const result = compileJSX(source, 'TitleUpdater.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')!.content
    expect(clientJs).toContain('createEffect')
  })

  test('M3: createDisposableEffect inside a factory body', () => {
    const source = `
      'use client'
      import { createSignal, createDisposableEffect } from '@barefootjs/client'

      function useDisposableTitle(initial: number) {
        const [count, setCount] = createSignal(initial)
        createDisposableEffect(() => { document.title = String(count()) })
        return [count, setCount] as const
      }

      export function DisposableTitleUpdater() {
        const [count, setCount] = useDisposableTitle(0)
        return <button onClick={() => setCount(count() + 1)}>{count()}</button>
      }
    `

    const result = compileJSX(source, 'DisposableTitleUpdater.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')!.content
    expect(clientJs).toContain('createDisposableEffect')
  })

  test('M4: realistic store (Sora useListStore scale) — 3 signals + 2 memos', () => {
    const source = `
      'use client'
      import { createSignal, createMemo } from '@barefootjs/client'

      function useListStore(initial: string[]) {
        const [items, setItems] = createSignal(initial)
        const [filter, setFilter] = createSignal('')
        const [editing, setEditing] = createSignal('')
        const visible = createMemo(() => items().filter(i => i.includes(filter())))
        const count = createMemo(() => visible().length)
        const clear = () => setItems([])
        return { items, setItems, filter, setFilter, editing, setEditing, visible, count, clear }
      }

      export function ListView() {
        const { items, setItems, filter, setFilter, editing, setEditing, visible, count, clear } = useListStore([])
        return (
          <div onClick={() => { setItems([...items(), 'x']); setFilter('a'); setEditing('x'); clear() }}>
            {visible().length} / {count()} / {editing()}
          </div>
        )
      }
    `

    const ctx = analyzeComponent(source, 'ListView.tsx')
    expect(ctx.signals.length).toBe(3)
    expect(ctx.memos.length).toBe(2)

    const result = compileJSX(source, 'ListView.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  })

  test('M5: identifier hygiene across 3 call sites of the same factory', () => {
    // Each call site inlines a fresh copy of the factory body; the
    // undestructured internal `setValue` must be suffix-renamed uniquely
    // per call site (_bf0/_bf1/_bf2) while `value`/`bump` are renamed
    // directly to each call site's own tuple names.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function createPair(initial: number) {
        const [value, setValue] = createSignal(initial)
        const bump = () => setValue(value() + 1)
        return [value, bump] as const
      }

      export function Triple() {
        const [a, bumpA] = createPair(1)
        const [b, bumpB] = createPair(2)
        const [c, bumpC] = createPair(3)
        return <button onClick={() => { bumpA(); bumpB(); bumpC() }}>{a()} {b()} {c()}</button>
      }
    `

    const result = compileJSX(source, 'Triple.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')!.content
    expect(clientJs.match(/createSignal\(/g)?.length).toBe(3)
    expect(clientJs).toContain('_bf0')
    expect(clientJs).toContain('_bf1')
    expect(clientJs).toContain('_bf2')
  })

  test('M6: generic factory — type arguments do not disturb inlining', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function createBox<T>(initial: T) {
        const [v, setV] = createSignal<T>(initial)
        return { v, setV }
      }

      export function Box() {
        const { v, setV } = createBox<string>('x')
        return <button onClick={() => setV('y')}>{v()}</button>
      }
    `

    const ctx = analyzeComponent(source, 'Box.tsx')
    expect(ctx.signals.length).toBe(1)

    const result = compileJSX(source, 'Box.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  })

  test('M7: mixed reactive/non-reactive body — plain locals are also renamed correctly', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function createSession(initial: number) {
        const startedAt = Date.now()
        const label = \`session-\${startedAt}\`
        const [count, setCount] = createSignal(initial)
        const bump = () => { setCount(count() + 1); console.log(label) }
        return [count, bump] as const
      }

      export function Session() {
        const [count, bump] = createSession(0)
        return <button onClick={bump}>{count()}</button>
      }
    `

    const result = compileJSX(source, 'Session.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')!.content
    expect(clientJs).toContain('Date.now()')
    expect(clientJs).toMatch(/startedAt_bf\d+/)
  })

  test('M8: default-value destructure of an object-return factory declines with BF111', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function createCounter(initial: number) {
        const [count, setCount] = createSignal(initial)
        return { count, setCount }
      }

      export function Counter() {
        const { count = 5 } = createCounter(0)
        return <p>{count}</p>
      }
    `

    const result = compileJSX(source, 'Counter.tsx', { adapter })
    const bf111 = result.errors.find(e => e.code === 'BF111')
    expect(bf111).toBeDefined()
  })

  test('M9: unknown destructured property declines with BF110', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function createCounter(initial: number) {
        const [count, setCount] = createSignal(initial)
        return { count, setCount }
      }

      export function Counter() {
        const { missing } = createCounter(0)
        return <p>{missing}</p>
      }
    `

    const result = compileJSX(source, 'Counter.tsx', { adapter })
    const bf110 = result.errors.find(e => e.code === 'BF110')
    expect(bf110).toBeDefined()
    expect(bf110!.message).toContain('missing')
    expect(bf110!.message).toContain('not present in its return')
  })

  test('M10: whole-store (non-destructured) call is left untouched', () => {
    // Pins the current fallback posture — a non-destructured factory call
    // is not inlined at all, so none of the factory diagnostics apply.
    // Whether it should eventually be double-invocation-safe is out of
    // scope for #2341 (tracked separately in the issue).
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function createCounter(initial: number) {
        const [count, setCount] = createSignal(initial)
        return { count, setCount }
      }

      export function Counter() {
        const store = createCounter(0)
        return <p>{store.count}</p>
      }
    `

    const result = compileJSX(source, 'Counter.tsx', { adapter })
    expect(result.errors.find(e => e.code?.startsWith('BF11'))).toBeUndefined()
  })

  test('M11: 3-element tuple return', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function createResettable(initial: number) {
        const [value, setValue] = createSignal(initial)
        const reset = () => setValue(initial)
        return [value, setValue, reset] as const
      }

      export function Resettable() {
        const [count, setCount, resetCount] = createResettable(0)
        return <button onClick={() => { setCount(count() + 1); resetCount() }}>{count()}</button>
      }
    `

    const ctx = analyzeComponent(source, 'Resettable.tsx')
    expect(ctx.signals.length).toBe(1)

    const result = compileJSX(source, 'Resettable.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')!.content
    expect(clientJs).toContain('count')
    expect(clientJs).toContain('setCount')
    expect(clientJs).toContain('resetCount')
  })

  test('M12: a complex (non-atomic) argument expression keeps its parens at the splice site', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function createCounter(initial: number) {
        const [count, setCount] = createSignal(initial)
        return [count, setCount] as const
      }

      export function Counter() {
        const a = 1
        const [count, setCount] = createCounter(a > 0 ? a : 0)
        return <button onClick={() => setCount(count() + 1)}>{count()}</button>
      }
    `

    const result = compileJSX(source, 'Counter.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')!.content
    expect(clientJs).toContain('(a > 0 ? a : 0)')
  })

  test('M13: SSR seed value flows through the inlined factory', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function createCounter(initial: number) {
        const [count, setCount] = createSignal(initial)
        return [count, setCount] as const
      }

      export function Counter() {
        const [count, setCount] = createCounter(42)
        return <button onClick={() => setCount(count() + 1)}>{count()}</button>
      }
    `

    const result = compileJSX(source, 'Counter.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const template = result.files.find(f => f.type === 'markedTemplate')
    expect(template).toBeDefined()
    expect(template!.content).toContain('42')
  })
})

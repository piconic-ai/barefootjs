/**
 * Cross-file reactive-factory resolution (#931 round 2, #2325).
 *
 * Context: `reactive-factory-inlining.test.ts` covers same-file factory
 * helpers (`function createCounter() { ... }` defined in the same module as
 * the component that calls it). Real-world factory helpers usually live in
 * their own file (e.g. Sora's `useListStore`) and are imported — until this
 * round, that shape silently fell through to the generic BF110 unrecognised-
 * callee path (or worse, produced client JS with a dangling reference).
 *
 * This file pins `prescanImportedReactiveFactories`: resolving a factory
 * defined in a relative-imported helper file, inlining its body at the
 * call site exactly as a same-file factory would be, and provisioning the
 * `createSignal` import from usage (not from the consumer's own imports —
 * see C1 in the #2325 spec) so the consumer file never needs to import
 * `@barefootjs/client` itself just to destructure a factory's result.
 *
 * Harness: `mkdtempSync`/`beforeAll`/`afterAll`/fixture-writing pattern from
 * `cross-file-client-signal.test.ts`, combined with `analyzeComponent` /
 * `compileJSX` / `TestAdapter` from `reactive-factory-inlining.test.ts` —
 * cross-file resolution requires the consumer's real on-disk path so
 * `resolveRelativeImportToFile` can find the helper file.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { analyzeComponent } from '../analyzer'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

let fixtureDir: string

beforeAll(() => {
  fixtureDir = mkdtempSync(path.join(tmpdir(), 'bf-factory-cross-file-'))
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

describe('Cross-file reactive factories (#2325)', () => {
  test('cross-file tuple factory inlines and provisions the createSignal import (C1)', () => {
    writeFixture('hooks-tuple.tsx', `'use client'
import { createSignal } from '@barefootjs/client'

export function createCounter(initial: number) {
  const [count, setCount] = createSignal(initial)
  return [count, setCount] as const
}
`)
    // The consumer never imports @barefootjs/client itself — only the
    // factory. Import provisioning must come from usage in the generated
    // code, not from the consumer's own source-level imports.
    const consumerSource = `'use client'
import { createCounter } from './hooks-tuple'

export function Counter() {
  const [count, setCount] = createCounter(0)
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>
}
`
    const consumerPath = writeFixture('counter-tuple.tsx', consumerSource)

    const ctx = analyzeComponent(consumerSource, consumerPath, 'Counter')
    expect(ctx.signals.length).toBe(1)
    expect(ctx.signals[0].getter).toBe('count')
    expect(ctx.signals[0].setter).toBe('setCount')

    const result = compileJSX(consumerSource, consumerPath, { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    expect(clientJs!.content).toMatch(/import\s*\{[^}]*createSignal[^}]*\}\s*from\s*'@barefootjs\/client\/runtime'/)
    // The helper's own relative path must not leak into the output — its
    // body was inlined, not imported.
    expect(clientJs!.content).not.toContain('./hooks-tuple')
  })

  test('cross-file object-return factory + subset destructure (Sora useListStore shape)', () => {
    writeFixture('hooks-object.tsx', `'use client'
import { createSignal, createMemo } from '@barefootjs/client'

export function useListStore(initial: string[]) {
  const [items, setItems] = createSignal(initial)
  const count = createMemo(() => items().length)
  return { items, setItems, count }
}
`)
    const consumerSource = `'use client'
import { useListStore } from './hooks-object'

export function ListSummary() {
  const { items, count } = useListStore([])
  return <p>{items().length} / {count()}</p>
}
`
    const consumerPath = writeFixture('list-summary.tsx', consumerSource)

    const ctx = analyzeComponent(consumerSource, consumerPath, 'ListSummary')
    expect(ctx.signals.length).toBe(1)
    expect(ctx.signals[0].getter).toBe('items')
    expect(ctx.memos.length).toBe(1)
    expect(ctx.memos[0].name).toBe('count')

    const result = compileJSX(consumerSource, consumerPath, { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    expect(clientJs!.content).toContain('createSignal')
  })

  test('aliased cross-file factory import inlines under the local alias', () => {
    writeFixture('hooks-alias.tsx', `'use client'
import { createSignal } from '@barefootjs/client'

export function useCounter(initial: number) {
  const [count, setCount] = createSignal(initial)
  return [count, setCount] as const
}
`)
    const consumerSource = `'use client'
import { useCounter as useC } from './hooks-alias'

export function Counter() {
  const [count, setCount] = useC(0)
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>
}
`
    const consumerPath = writeFixture('counter-alias.tsx', consumerSource)

    const ctx = analyzeComponent(consumerSource, consumerPath, 'Counter')
    expect(ctx.signals.length).toBe(1)
    expect(ctx.signals[0].getter).toBe('count')

    const result = compileJSX(consumerSource, consumerPath, { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  })

  test('non-relative import object-destructure emits BF110 (uninspectable-import heuristic)', () => {
    const consumerSource = `'use client'
import { useStore } from '@app/hooks'

export function Comp() {
  const { value, setValue } = useStore(0)
  return <button onClick={() => setValue(value() + 1)}>{value()}</button>
}
`
    const consumerPath = writeFixture('non-relative-consumer.tsx', consumerSource)

    const result = compileJSX(consumerSource, consumerPath, { adapter })
    const bf110 = result.errors.find(e => e.code === 'BF110')
    expect(bf110).toBeDefined()
    expect(bf110!.message).toContain('useStore')
  })

  test('module-scope capture → BF112: helper-local function reference blocks inlining', () => {
    writeFixture('hooks-capture.tsx', `'use client'
import { createSignal } from '@barefootjs/client'

const KEY = 'stored-value'

function readStored() {
  return KEY.length
}

export function useStoredCounter() {
  const [count, setCount] = createSignal(readStored())
  return { count, setCount }
}
`)
    const consumerSource = `'use client'
import { useStoredCounter } from './hooks-capture'

export function Counter() {
  const { count, setCount } = useStoredCounter()
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>
}
`
    const consumerPath = writeFixture('counter-capture.tsx', consumerSource)

    const ctx = analyzeComponent(consumerSource, consumerPath, 'Counter')
    expect(ctx.signals.length).toBe(0)

    const result = compileJSX(consumerSource, consumerPath, { adapter })
    const bf112 = result.errors.find(e => e.code === 'BF112')
    expect(bf112).toBeDefined()
    expect(bf112!.message).toContain('readStored')
    const clientJs = result.files.find(f => f.type === 'clientJs')
    if (clientJs) {
      expect(clientJs.content).not.toContain('readStored')
    }
  })

  test('reactive-primitive-free helper: tuple destructure gets BF110, object destructure stays silent (cleanFactoryImports)', () => {
    writeFixture('hooks-clean.tsx', `
export function makePair(a: number, b: number) {
  return [a, b] as const
}
export function makeConfig(a: number, b: number) {
  return { a, b }
}
`)
    const tupleConsumerSource = `'use client'
import { makePair } from './hooks-clean'

export function Pair() {
  const [x, y] = makePair(1, 2)
  return <p>{x} {y}</p>
}
`
    const tupleConsumerPath = writeFixture('pair-consumer.tsx', tupleConsumerSource)
    const tupleResult = compileJSX(tupleConsumerSource, tupleConsumerPath, { adapter })
    expect(tupleResult.errors.find(e => e.code === 'BF110')).toBeDefined()

    const objectConsumerSource = `'use client'
import { makeConfig } from './hooks-clean'

export function Config() {
  const { a, b } = makeConfig(1, 2)
  return <p>{a} {b}</p>
}
`
    const objectConsumerPath = writeFixture('config-consumer.tsx', objectConsumerSource)
    const objectResult = compileJSX(objectConsumerSource, objectConsumerPath, { adapter })
    expect(objectResult.errors.find(e => e.code === 'BF110')).toBeUndefined()
    expect(objectResult.errors.find(e => e.code === 'BF111')).toBeUndefined()
  })
})

describe('Cross-file factory import re-provisioning (#2332)', () => {
  beforeAll(() => {
    // lib/mathmod.ts — the third module, deliberately .ts and in a different
    // directory than both hook and component so the relative-path math is real.
    writeFixture('lib/mathmod.ts', `export function doubleIt(x: number): number {
  return x * 2
}
`)
    // hooks/useDouble.tsx — the helper: factory body calls an import.
    writeFixture('hooks/useDouble.tsx', `'use client'
import { createSignal } from '@barefootjs/client'
import { doubleIt } from '../lib/mathmod'

export function useDouble(initial: number) {
  const [value, setValue] = createSignal(doubleIt(initial))
  const bump = () => setValue(doubleIt(value()))
  return { value, bump }
}
`)
  })

  test('matrix 1: re-provisioned import, different directory depths', () => {
    const consumerSource = `'use client'
import { useDouble } from '../hooks/useDouble'

export function Doubler() {
  const { value, bump } = useDouble(21)
  return <button onClick={bump}>{value()}</button>
}
`
    const consumerPath = writeFixture('components/Doubler.tsx', consumerSource)
    const ctx = analyzeComponent(consumerSource, consumerPath, 'Doubler')
    expect(ctx.signals.length).toBe(1)
    expect(ctx.signals[0].getter).toBe('value')

    const result = compileJSX(consumerSource, consumerPath, { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    // Specifier rewritten relative to components/, not hooks/ — the off-by-one trap.
    expect(clientJs!.content).toMatch(/import\s*\{\s*doubleIt\s*\}\s*from\s*'\.\.\/lib\/mathmod'/)
    expect(clientJs!.content).not.toContain('../hooks/useDouble') // factory inlined, not imported
  })

  test('matrix 2: bare specifier passes through unchanged', () => {
    writeFixture('hooks/useClamped.tsx', `'use client'
import { createSignal } from '@barefootjs/client'
import { clamp } from 'tiny-clamp'

export function useClamped(initial: number) {
  const [value, setValue] = createSignal(clamp(initial))
  const bump = () => setValue(clamp(value() + 1))
  return { value, bump }
}
`)
    const consumerSource = `'use client'
import { useClamped } from '../hooks/useClamped'

export function Clamped() {
  const { value, bump } = useClamped(21)
  return <button onClick={bump}>{value()}</button>
}
`
    const consumerPath = writeFixture('components/Clamped.tsx', consumerSource)
    const result = compileJSX(consumerSource, consumerPath, { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    // Bare specifiers skip resolution entirely, so the package need not exist on disk.
    expect(clientJs!.content).toMatch(/import\s*\{\s*clamp\s*\}\s*from\s*'tiny-clamp'/)
  })

  test('matrix 3: dedupe across two factories sharing the same helper import', () => {
    writeFixture('hooks/pair.tsx', `'use client'
import { createSignal } from '@barefootjs/client'
import { doubleIt } from '../lib/mathmod'

export function useA(initial: number) {
  const [value, setValue] = createSignal(doubleIt(initial))
  const bump = () => setValue(doubleIt(value()))
  return { value, bump }
}

export function useB(initial: number) {
  const [other, setOther] = createSignal(doubleIt(initial))
  const bumpOther = () => setOther(doubleIt(other()))
  return { other, bumpOther }
}
`)
    const consumerSource = `'use client'
import { useA, useB } from '../hooks/pair'

export function Pair() {
  const { value, bump } = useA(1)
  const { other, bumpOther } = useB(2)
  return <button onClick={() => { bump(); bumpOther() }}>{value()} / {other()}</button>
}
`
    const consumerPath = writeFixture('components/Pair.tsx', consumerSource)
    const result = compileJSX(consumerSource, consumerPath, { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    expect((clientJs!.content.match(/from '\.\.\/lib\/mathmod'/g) ?? []).length).toBe(1)
  })

  test('matrix 4: local-name collision with a re-provisioned import declines with BF113', () => {
    const consumerSource = `'use client'
import { useDouble } from '../hooks/useDouble'

function doubleIt(): number {
  return 1
}

export function Collide() {
  const { value, bump } = useDouble(21)
  return <button onClick={bump}>{value()} {doubleIt()}</button>
}
`
    const consumerPath = writeFixture('components/Collide.tsx', consumerSource)
    const ctx = analyzeComponent(consumerSource, consumerPath, 'Collide')
    expect(ctx.signals.length).toBe(0)

    const result = compileJSX(consumerSource, consumerPath, { adapter })
    const bf113 = result.errors.find(e => e.code === 'BF113')
    expect(bf113).toBeDefined()
    expect(bf113!.message).toContain('doubleIt')
    expect(bf113!.message).toContain('../lib/mathmod')
    const clientJs = result.files.find(f => f.type === 'clientJs')
    if (clientJs) {
      expect(clientJs.content).not.toContain(`from '../lib/mathmod'`)
    }
  })

  test('matrix 5b: default-import reference stays BF112, not re-provisioned', () => {
    writeFixture('lib/mathmod-default.ts', `export default {
  doubleIt(x: number): number {
    return x * 2
  },
}
`)
    writeFixture('hooks/useDefault.tsx', `'use client'
import { createSignal } from '@barefootjs/client'
import mathmod from '../lib/mathmod-default'

export function useDefault(initial: number) {
  const [value, setValue] = createSignal(mathmod.doubleIt(initial))
  const bump = () => setValue(mathmod.doubleIt(value()))
  return { value, bump }
}
`)
    const consumerSource = `'use client'
import { useDefault } from '../hooks/useDefault'

export function Defaulter() {
  const { value, bump } = useDefault(21)
  return <button onClick={bump}>{value()}</button>
}
`
    const consumerPath = writeFixture('components/Defaulter.tsx', consumerSource)
    const result = compileJSX(consumerSource, consumerPath, { adapter })
    const bf112 = result.errors.find(e => e.code === 'BF112')
    expect(bf112).toBeDefined()
    expect(bf112!.message).toContain('mathmod')
    expect(result.errors.find(e => e.code === 'BF113')).toBeUndefined()
  })

  test('matrix 6: SSR output reflects the re-provisioned import', () => {
    const consumerSource = `'use client'
import { useDouble } from '../hooks/useDouble'

export function DoublerSSR() {
  const { value, bump } = useDouble(21)
  return <button onClick={bump}>{value()}</button>
}
`
    const consumerPath = writeFixture('components/DoublerSSR.tsx', consumerSource)
    const result = compileJSX(consumerSource, consumerPath, { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const template = result.files.find(f => f.type === 'markedTemplate')
    expect(template).toBeDefined()
    // The injected import is part of the same rewritten source both passes read:
    // the adapter re-emits it via metadata.templateImports…
    expect(template!.content).toMatch(/import\s*\{\s*doubleIt\s*\}\s*from\s*'\.\.\/lib\/mathmod'/)
    // …and the inlined signal initializer calls it at SSR render.
    expect(template!.content).toContain('doubleIt(')
  })

  test('already-satisfied import dedupes: no BF113, no duplicate declaration', () => {
    const consumerSource = `'use client'
import { useDouble } from '../hooks/useDouble'
import { doubleIt } from '../lib/mathmod'

export function DoublerSelfImporting() {
  const { value, bump } = useDouble(21)
  return <button onClick={() => { bump(); doubleIt(value()) }}>{value()}</button>
}
`
    const consumerPath = writeFixture('components/DoublerSelfImporting.tsx', consumerSource)
    const result = compileJSX(consumerSource, consumerPath, { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    expect(result.errors.find(e => e.code === 'BF113')).toBeUndefined()
    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    expect((clientJs!.content.match(/from '\.\.\/lib\/mathmod'/g) ?? []).length).toBe(1)
  })
})

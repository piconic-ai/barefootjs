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

  test('re-provisioned imports are emitted in sorted order regardless of inlining order (Copilot review, PR #2338)', () => {
    // `importsBySpecifier`/`inlinedFactories` are populated in AST-traversal/
    // insertion order — deliberately adversarial here: the component calls
    // the factory needing '../lib/zmod' BEFORE the one needing
    // '../lib/amod', so insertion order is z-then-a. Emission must still be
    // alphabetical (a-then-z), or the generated import block would be
    // order-unstable across unrelated analyzer refactors.
    writeFixture('lib/zmod.ts', `export function zHelper(x: number): number {
  return x
}
`)
    writeFixture('lib/amod.ts', `export function aHelper(x: number): number {
  return x
}
`)
    writeFixture('hooks/useZFactory.tsx', `'use client'
import { createSignal } from '@barefootjs/client'
import { zHelper } from '../lib/zmod'

export function useZFactory(initial: number) {
  const [zValue, setZValue] = createSignal(zHelper(initial))
  return { zValue, setZValue }
}
`)
    writeFixture('hooks/useAFactory.tsx', `'use client'
import { createSignal } from '@barefootjs/client'
import { aHelper } from '../lib/amod'

export function useAFactory(initial: number) {
  const [aValue, setAValue] = createSignal(aHelper(initial))
  return { aValue, setAValue }
}
`)
    const consumerSource = `'use client'
import { useZFactory } from '../hooks/useZFactory'
import { useAFactory } from '../hooks/useAFactory'

export function Ordered() {
  const { zValue } = useZFactory(1)
  const { aValue } = useAFactory(2)
  return <p>{zValue()} / {aValue()}</p>
}
`
    const consumerPath = writeFixture('components/Ordered.tsx', consumerSource)
    const result = compileJSX(consumerSource, consumerPath, { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const amodIndex = clientJs!.content.indexOf("from '../lib/amod'")
    const zmodIndex = clientJs!.content.indexOf("from '../lib/zmod'")
    expect(amodIndex).toBeGreaterThan(-1)
    expect(zmodIndex).toBeGreaterThan(-1)
    expect(amodIndex).toBeLessThan(zmodIndex)
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

describe('Barrel re-exports (#2341 BUG-2)', () => {
  beforeAll(() => {
    writeFixture('barrel/useToggle.tsx', `'use client'
import { createSignal } from '@barefootjs/client'

export function useToggle(initial: boolean) {
  const [on, setOn] = createSignal(initial)
  return [on, setOn] as const
}
`)
    writeFixture('barrel/index.ts', `export { useToggle } from './useToggle'
`)
  })

  test('B1: factory reached through a barrel index.ts inlines (issue repro)', () => {
    // `../barrel` has no extension and is not itself a file — this also
    // exercises directory-index resolution (`./hooks` -> `hooks/index.ts`),
    // already supported by `resolveRelativeImportToFile`.
    const consumerSource = `'use client'
import { useToggle } from '../barrel'

export function Switch() {
  const [on, setOn] = useToggle(false)
  return <button onClick={() => setOn(!on())}>{on() ? 'on' : 'off'}</button>
}
`
    const consumerPath = writeFixture('barrel-consumer/Switch.tsx', consumerSource)

    const ctx = analyzeComponent(consumerSource, consumerPath, 'Switch')
    expect(ctx.signals.length).toBe(1)
    expect(ctx.signals[0].getter).toBe('on')

    const result = compileJSX(consumerSource, consumerPath, { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    expect(clientJs!.content).toContain('createSignal')
    expect(clientJs!.content).not.toContain('../barrel')
    expect(clientJs!.content).toMatch(/import\s*\{[^}]*createSignal[^}]*\}\s*from\s*'@barefootjs\/client\/runtime'/)
  })

  test('B2: barrel alias (export { useToggle as useFlip } from) inlines', () => {
    writeFixture('barrel-alias/index.ts', `export { useToggle as useFlip } from '../barrel/useToggle'
`)
    const consumerSource = `'use client'
import { useFlip } from '../barrel-alias'

export function FlipSwitch() {
  const [on, setOn] = useFlip(false)
  return <button onClick={() => setOn(!on())}>{on() ? 'on' : 'off'}</button>
}
`
    const consumerPath = writeFixture('barrel-consumer/FlipSwitch.tsx', consumerSource)

    const ctx = analyzeComponent(consumerSource, consumerPath, 'FlipSwitch')
    expect(ctx.signals.length).toBe(1)

    const result = compileJSX(consumerSource, consumerPath, { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  })

  test('B3: barrel alias + consumer alias both resolve through the hop', () => {
    const consumerSource = `'use client'
import { useFlip as flip } from '../barrel-alias'

export function FlipSwitch2() {
  const [on, setOn] = flip(false)
  return <button onClick={() => setOn(!on())}>{on() ? 'on' : 'off'}</button>
}
`
    const consumerPath = writeFixture('barrel-consumer/FlipSwitch2.tsx', consumerSource)

    const result = compileJSX(consumerSource, consumerPath, { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    expect(clientJs!.content).toContain('createSignal')
  })

  test('B4: export * from stays loud (BF110), never silently marked clean', () => {
    writeFixture('barrel-star/index.ts', `export * from '../barrel/useToggle'
`)
    const consumerSource = `'use client'
import { useToggle } from '../barrel-star'

export function StarConsumer() {
  const [on, setOn] = useToggle(false)
  return <button onClick={() => setOn(!on())}>{on() ? 'on' : 'off'}</button>
}
`
    const consumerPath = writeFixture('barrel-consumer/StarConsumer.tsx', consumerSource)

    const result = compileJSX(consumerSource, consumerPath, { adapter })
    const bf110 = result.errors.find(e => e.code === 'BF110')
    expect(bf110).toBeDefined()
    expect(bf110!.message).toContain('useToggle')
  })

  test('B5: self-referential barrel does not loop', () => {
    writeFixture('loop/index.ts', `export { useToggle } from './index'
`)
    const consumerSource = `'use client'
import { useToggle } from '../loop'

export function LoopConsumer() {
  const [on, setOn] = useToggle(false)
  return <button onClick={() => setOn(!on())}>{on() ? 'on' : 'off'}</button>
}
`
    const consumerPath = writeFixture('barrel-consumer/LoopConsumer.tsx', consumerSource)

    const result = compileJSX(consumerSource, consumerPath, { adapter })
    const bf110 = result.errors.find(e => e.code === 'BF110')
    expect(bf110).toBeDefined()
  })

  test('B6: unresolvable re-export target stays loud, never cleanFactoryImports-silenced', () => {
    writeFixture('barrel-missing/index.ts', `export { useToggle } from './missing'
`)
    const consumerSource = `'use client'
import { useToggle } from '../barrel-missing'

export function MissingConsumer() {
  const [on, setOn] = useToggle(false)
  return <button onClick={() => setOn(!on())}>{on() ? 'on' : 'off'}</button>
}
`
    const consumerPath = writeFixture('barrel-consumer/MissingConsumer.tsx', consumerSource)

    const result = compileJSX(consumerSource, consumerPath, { adapter })
    const bf110 = result.errors.find(e => e.code === 'BF110')
    expect(bf110).toBeDefined()
  })

  test('B7: module-scope capture through a barrel still declines with BF112 (defining-file anchor)', () => {
    // If the capture check were (incorrectly) anchored to the barrel file
    // instead of the file that actually DEFINES the factory, `readStored`/
    // `KEY` (declared only in useStoredCounter.tsx, not in the barrel's
    // index.ts) would never be found as a capture, and the factory would
    // wrongly inline with a dangling `readStored()` reference (#2341 BUG-2).
    writeFixture('barrel-capture/useStoredCounter.tsx', `'use client'
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
    writeFixture('barrel-capture/index.ts', `export { useStoredCounter } from './useStoredCounter'
`)
    const consumerSource = `'use client'
import { useStoredCounter } from '../barrel-capture'

export function CaptureConsumer() {
  const { count, setCount } = useStoredCounter()
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>
}
`
    const consumerPath = writeFixture('barrel-consumer/CaptureConsumer.tsx', consumerSource)

    const ctx = analyzeComponent(consumerSource, consumerPath, 'CaptureConsumer')
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

  test('B8: re-provisioned helper import is anchored to the defining file, not the barrel', () => {
    // The barrel (`hooks2barrel/nested/index.ts`) and the file that
    // actually defines `useDouble` (`hooks2/useDouble.tsx`) live at
    // DIFFERENT depths — anchoring the re-provisioned `doubleIt` import to
    // the barrel's directory instead of the defining file's directory
    // would resolve to a nonexistent path (#2341 BUG-2).
    writeFixture('lib2/mathmod.ts', `export function doubleIt(x: number): number {
  return x * 2
}
`)
    writeFixture('hooks2/useDouble.tsx', `'use client'
import { createSignal } from '@barefootjs/client'
import { doubleIt } from '../lib2/mathmod'

export function useDouble(initial: number) {
  const [value, setValue] = createSignal(doubleIt(initial))
  const bump = () => setValue(doubleIt(value()))
  return { value, bump }
}
`)
    writeFixture('hooks2barrel/nested/index.ts', `export { useDouble } from '../../hooks2/useDouble'
`)
    const consumerSource = `'use client'
import { useDouble } from '../../hooks2barrel/nested'

export function DoubleViaBarrel() {
  const { value, bump } = useDouble(21)
  return <button onClick={bump}>{value()}</button>
}
`
    const consumerPath = writeFixture('components/deep/DoubleViaBarrel.tsx', consumerSource)

    const result = compileJSX(consumerSource, consumerPath, { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    expect(clientJs!.content).toMatch(/from\s*'\.\.\/\.\.\/lib2\/mathmod'/)
    expect(clientJs!.content).not.toContain('hooks2barrel')
  })

  test('B9: two barrel hops exceed MAX_REEXPORT_HOPS and stay loud', () => {
    writeFixture('twohop-b/useToggle.tsx', `'use client'
import { createSignal } from '@barefootjs/client'

export function useToggle(initial: boolean) {
  const [on, setOn] = createSignal(initial)
  return [on, setOn] as const
}
`)
    writeFixture('twohop-b/index.ts', `export { useToggle } from './useToggle'
`)
    writeFixture('twohop-a/index.ts', `export { useToggle } from '../twohop-b'
`)
    const consumerSource = `'use client'
import { useToggle } from '../twohop-a'

export function TwoHopConsumer() {
  const [on, setOn] = useToggle(false)
  return <button onClick={() => setOn(!on())}>{on() ? 'on' : 'off'}</button>
}
`
    const consumerPath = writeFixture('barrel-consumer/TwoHopConsumer.tsx', consumerSource)

    const result = compileJSX(consumerSource, consumerPath, { adapter })
    const bf110 = result.errors.find(e => e.code === 'BF110')
    expect(bf110).toBeDefined()
  })

  test('B10: mixed barrel (own factory + re-export) inlines both', () => {
    // Pins exportedFns-before-reexports lookup order: `useLocal` is defined
    // directly in index.ts, `useToggle` only reaches it via a re-export.
    writeFixture('mixed/useToggle.tsx', `'use client'
import { createSignal } from '@barefootjs/client'

export function useToggle(initial: boolean) {
  const [on, setOn] = createSignal(initial)
  return [on, setOn] as const
}
`)
    writeFixture('mixed/index.ts', `'use client'
import { createSignal } from '@barefootjs/client'

export function useLocal(initial: number) {
  const [count, setCount] = createSignal(initial)
  return [count, setCount] as const
}

export { useToggle } from './useToggle'
`)
    const consumerSource = `'use client'
import { useLocal, useToggle } from '../mixed'

export function MixedConsumer() {
  const [count, setCount] = useLocal(0)
  const [on, setOn] = useToggle(false)
  return <button onClick={() => { setCount(count() + 1); setOn(!on()) }}>{count()} {on() ? 'on' : 'off'}</button>
}
`
    const consumerPath = writeFixture('barrel-consumer/MixedConsumer.tsx', consumerSource)

    const ctx = analyzeComponent(consumerSource, consumerPath, 'MixedConsumer')
    expect(ctx.signals.length).toBe(2)

    const result = compileJSX(consumerSource, consumerPath, { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  })
})

describe('Real-world factory matrix, cross-file (#2341)', () => {
  test('M15: deep relative paths resolve and inline', () => {
    writeFixture('deep/hooks/state/useCounter.tsx', `'use client'
import { createSignal } from '@barefootjs/client'

export function useCounter(initial: number) {
  const [count, setCount] = createSignal(initial)
  return [count, setCount] as const
}
`)
    const consumerSource = `'use client'
import { useCounter } from '../../hooks/state/useCounter'

export function Counter() {
  const [count, setCount] = useCounter(0)
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>
}
`
    const consumerPath = writeFixture('deep/components/pages/Counter.tsx', consumerSource)

    const result = compileJSX(consumerSource, consumerPath, { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    expect(clientJs!.content).toContain('createSignal')
  })

  test('M16: two factories from two different modules compose in one component', () => {
    writeFixture('compose/useA.tsx', `'use client'
import { createSignal } from '@barefootjs/client'

export function useA(initial: number) {
  const [a, setA] = createSignal(initial)
  return [a, setA] as const
}
`)
    writeFixture('compose/useB.tsx', `'use client'
import { createSignal } from '@barefootjs/client'

export function useB(initial: number) {
  const [b, setB] = createSignal(initial)
  return [b, setB] as const
}
`)
    const consumerSource = `'use client'
import { useA } from './useA'
import { useB } from './useB'

export function Composed() {
  const [a, setA] = useA(1)
  const [b, setB] = useB(2)
  return <button onClick={() => { setA(a() + 1); setB(b() + 1) }}>{a()} {b()}</button>
}
`
    const consumerPath = writeFixture('compose/Composed.tsx', consumerSource)

    const result = compileJSX(consumerSource, consumerPath, { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    expect(clientJs!.content.match(/createSignal\(/g)?.length).toBe(2)
  })

  test('M17: onMount is provisioned from usage for a cross-file factory', () => {
    writeFixture('matrix17/useTick.tsx', `'use client'
import { createSignal, onMount } from '@barefootjs/client'

export function useTick(initial: number) {
  const [tick, setTick] = createSignal(initial)
  onMount(() => setTick(initial))
  return [tick, setTick] as const
}
`)
    const consumerSource = `'use client'
import { useTick } from './useTick'

export function Ticker() {
  const [tick, setTick] = useTick(0)
  return <button onClick={() => setTick(tick() + 1)}>{tick()}</button>
}
`
    const consumerPath = writeFixture('matrix17/Ticker.tsx', consumerSource)

    const result = compileJSX(consumerSource, consumerPath, { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    expect(clientJs!.content).toMatch(/import\s*\{[^}]*onMount[^}]*\}\s*from\s*'@barefootjs\/client\/runtime'/)
  })

  test('M18: a type-only helper import does not trigger BF112 and is re-provisioned as `import type` (#2350)', () => {
    writeFixture('matrix18/todo-types.ts', `export interface Todo {
  id: number
  text: string
}
`)
    writeFixture('matrix18/useTodos.tsx', `'use client'
import { createSignal } from '@barefootjs/client'
import type { Todo } from './todo-types'

export function useTodos(initial: Todo[]) {
  const [todos, setTodos] = createSignal<Todo[]>(initial)
  return [todos, setTodos] as const
}
`)
    const consumerSource = `'use client'
import { useTodos } from './useTodos'

export function TodoList() {
  const [todos, setTodos] = useTodos([])
  return <button onClick={() => setTodos([])}>{todos().length}</button>
}
`
    const consumerPath = writeFixture('matrix18/TodoList.tsx', consumerSource)

    const result = compileJSX(consumerSource, consumerPath, { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    expect(result.errors.find(e => e.code === 'BF112')).toBeUndefined()
    // Re-provisioned into the still-typed rewritten source (#2350) so tsc on
    // the compiled output can resolve `Todo` in the inlined `createSignal<Todo[]>` —
    // otherwise this is exactly Sora's SavedList gap (see App.tsx's #2350 comment).
    const template = result.files.find(f => f.type === 'markedTemplate')
    expect(template).toBeDefined()
    expect(template!.content).toMatch(/import\s+type\s*\{\s*Todo\s*\}\s*from\s*'\.\/todo-types'/)
    // But never reaches the runtime bundle — type-only imports are erased
    // before clientJs, same as any other TypeScript type annotation.
    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    expect(clientJs!.content).not.toContain('./todo-types')
  })

  test('M18b: an already-imported type at the call site is not re-provisioned a second time (#2350)', () => {
    // Mirrors Sora's App.tsx: the compiler doesn't re-provision a factory
    // body's TYPE-only references on its own (extractFreeIdentifiersFromNode
    // stops at type nodes), so Sora's App.tsx carries a manual
    // `import type { SavedList }` for exactly this reason. Once #2350 adds
    // re-provisioning, that manual import must dedupe against it, not
    // produce a second, colliding `import type { SavedList }` line.
    writeFixture('matrix18b/schema.ts', `export interface SavedList {
  id: string
}
`)
    writeFixture('matrix18b/useListStore.tsx', `'use client'
import { createSignal } from '@barefootjs/client'
import type { SavedList } from './schema'

export function useListStore() {
  function emptyCard(): SavedList {
    return { id: 'x' }
  }
  const [lists, setLists] = createSignal<SavedList[]>([emptyCard()])
  return { lists, setLists }
}
`)
    const consumerSource = `'use client'
import { useListStore } from './useListStore'
import type { SavedList } from './schema'

export function App() {
  const { lists, setLists } = useListStore()
  return <button onClick={() => setLists([])}>{lists().length}</button>
}
`
    const consumerPath = writeFixture('matrix18b/App.tsx', consumerSource)

    const result = compileJSX(consumerSource, consumerPath, { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    expect(result.errors.find(e => e.code === 'BF113')).toBeUndefined()
    const template = result.files.find(f => f.type === 'markedTemplate')
    expect(template).toBeDefined()
    const matches = template!.content.match(/import\s+type\s*\{\s*SavedList\s*\}/g) ?? []
    expect(matches).toHaveLength(1)
  })

  test('M18c: a value need is never satisfied by an existing type-only import of the same name (#2350)', () => {
    // The inverse of M18b: the entry file's own `import type { Shared }`
    // has no runtime binding, so a factory needing `Shared` as a VALUE must
    // still decline (BF113) rather than silently treat the type-only import
    // as satisfying it — that would compile clean and crash at hydration
    // (the same dangling-reference direction as #2341 BUG-2), the one
    // failure mode this whole feature exists to avoid.
    writeFixture('matrix18c/shared.ts', `export class Shared {
  static make(): Shared { return new Shared() }
}
`)
    writeFixture('matrix18c/useShared.tsx', `'use client'
import { createSignal } from '@barefootjs/client'
import { Shared } from './shared'

export function useShared() {
  const [value, setValue] = createSignal(Shared.make())
  return { value, setValue }
}
`)
    const consumerSource = `'use client'
import { useShared } from './useShared'
import type { Shared } from './shared'

export function App() {
  const { value, setValue } = useShared()
  return <button onClick={() => setValue(null as unknown as Shared)}>{String(value())}</button>
}
`
    const consumerPath = writeFixture('matrix18c/App.tsx', consumerSource)

    const result = compileJSX(consumerSource, consumerPath, { adapter })
    const bf113 = result.errors.find(e => e.code === 'BF113')
    expect(bf113).toBeDefined()
    expect(bf113!.message).toContain('Shared')
  })

  test('M18d: a helper VALUE import used only in type position is still re-provisioned (Copilot review, PR #2351)', () => {
    // `Shape` is a plain value import in the helper file — never wrapped in
    // `type`/`import type` — but the factory body only ever uses it as a
    // type annotation. The type-position walk must still find it via
    // moduleBindings.imported (not just importedTypes), or this regresses
    // to the exact #2350 gap for names that happen not to be type-only
    // imports in their OWN file.
    writeFixture('matrix18d/shape.ts', `export class Shape {
  area(): number { return 0 }
}
`)
    writeFixture('matrix18d/useShape.tsx', `'use client'
import { createSignal } from '@barefootjs/client'
import { Shape } from './shape'

export function useShape() {
  function makeDefault(): Shape {
    return new Shape()
  }
  const [shape, setShape] = createSignal<Shape>(makeDefault())
  return { shape, setShape }
}
`)
    const consumerSource = `'use client'
import { useShape } from './useShape'

export function App() {
  const { shape, setShape } = useShape()
  return <button onClick={() => setShape(shape())}>{String(shape())}</button>
}
`
    const consumerPath = writeFixture('matrix18d/App.tsx', consumerSource)

    const result = compileJSX(consumerSource, consumerPath, { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const template = result.files.find(f => f.type === 'markedTemplate')
    expect(template).toBeDefined()
    // Re-provisioned as a normal VALUE import (not `import type`) — a value
    // import already brings the type into scope, and the value form is what
    // the helper file itself declared.
    expect(template!.content).toMatch(/import\s*\{\s*Shape\s*\}\s*from\s*'\.\/shape'/)
    expect(template!.content).not.toMatch(/import\s+type\s*\{\s*Shape\s*\}/)
  })

  test('M18e: a generic type parameter is not misclassified as a module-scope type reference (Copilot review, PR #2351)', () => {
    // The factory's own <Item> type parameter shadows an unrelated
    // module-scope `Item` type import — referencing the PARAMETER inside
    // the factory body must not trigger re-provisioning of the import (it
    // isn't actually referenced at all).
    writeFixture('matrix18e/item-types.ts', `export interface Item {
  id: string
}
`)
    writeFixture('matrix18e/useBox.tsx', `'use client'
import { createSignal } from '@barefootjs/client'
import type { Item } from './item-types'

export function useBox<Item>(initial: Item) {
  const [value, setValue] = createSignal<Item>(initial)
  return { value, setValue }
}
`)
    const consumerSource = `'use client'
import { useBox } from './useBox'

export function App() {
  const { value, setValue } = useBox(0)
  return <button onClick={() => setValue(1)}>{String(value())}</button>
}
`
    const consumerPath = writeFixture('matrix18e/App.tsx', consumerSource)

    const result = compileJSX(consumerSource, consumerPath, { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const template = result.files.find(f => f.type === 'markedTemplate')
    expect(template).toBeDefined()
    expect(template!.content).not.toContain('./item-types')
  })

  test('M19: a colliding binding nested inside a JSX callback still triggers BF113', () => {
    // Pins collectEntryBindingNames's depth: the ONLY `doubleIt` binding in
    // the consumer file is declared inside an onClick callback, not at any
    // top level, yet the re-provisioning collision check must still find it
    // (an over-broad scan is required — a narrower one would silently
    // shadow the injected import at runtime instead of declining loudly).
    writeFixture('matrix19/lib/mathmod.ts', `export function doubleIt(x: number): number {
  return x * 2
}
`)
    writeFixture('matrix19/hooks/useDouble.tsx', `'use client'
import { createSignal } from '@barefootjs/client'
import { doubleIt } from '../lib/mathmod'

export function useDouble(initial: number) {
  const [value, setValue] = createSignal(doubleIt(initial))
  const bump = () => setValue(doubleIt(value()))
  return { value, bump }
}
`)
    const consumerSource = `'use client'
import { useDouble } from '../hooks/useDouble'

export function Collide() {
  const { value, bump } = useDouble(21)
  return <button onClick={() => { const doubleIt = 1; bump(); console.log(doubleIt) }}>{value()}</button>
}
`
    const consumerPath = writeFixture('matrix19/components/Collide.tsx', consumerSource)

    const result = compileJSX(consumerSource, consumerPath, { adapter })
    const bf113 = result.errors.find(e => e.code === 'BF113')
    expect(bf113).toBeDefined()
    expect(bf113!.message).toContain('doubleIt')
  })

  test('M20: 3 call sites of one imported factory with distinct tuple caller names', () => {
    writeFixture('matrix20/useCounter.tsx', `'use client'
import { createSignal } from '@barefootjs/client'

export function useCounter(initial: number) {
  const [count, setCount] = createSignal(initial)
  return [count, setCount] as const
}
`)
    const consumerSource = `'use client'
import { useCounter } from './useCounter'

export function Triple() {
  const [a, setA] = useCounter(1)
  const [b, setB] = useCounter(2)
  const [c, setC] = useCounter(3)
  return <button onClick={() => { setA(a() + 1); setB(b() + 1); setC(c() + 1) }}>{a()} {b()} {c()}</button>
}
`
    const consumerPath = writeFixture('matrix20/Triple.tsx', consumerSource)

    const result = compileJSX(consumerSource, consumerPath, { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    expect(clientJs!.content.match(/createSignal\(/g)?.length).toBe(3)
    for (const name of ['a', 'setA', 'b', 'setB', 'c', 'setC']) {
      expect(clientJs!.content).toContain(name)
    }
  })

  test('M21: SSR through a barrel reflects the re-provisioned import (mirrors matrix 6)', () => {
    writeFixture('matrix21/lib2/mathmod.ts', `export function doubleIt(x: number): number {
  return x * 2
}
`)
    writeFixture('matrix21/hooks2/useDouble.tsx', `'use client'
import { createSignal } from '@barefootjs/client'
import { doubleIt } from '../lib2/mathmod'

export function useDouble(initial: number) {
  const [value, setValue] = createSignal(doubleIt(initial))
  const bump = () => setValue(doubleIt(value()))
  return { value, bump }
}
`)
    writeFixture('matrix21/hooks2barrel/index.ts', `export { useDouble } from '../hooks2/useDouble'
`)
    const consumerSource = `'use client'
import { useDouble } from '../hooks2barrel'

export function DoublerSSR() {
  const { value, bump } = useDouble(21)
  return <button onClick={bump}>{value()}</button>
}
`
    const consumerPath = writeFixture('matrix21/components/DoublerSSR.tsx', consumerSource)

    const result = compileJSX(consumerSource, consumerPath, { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const template = result.files.find(f => f.type === 'markedTemplate')
    expect(template).toBeDefined()
    expect(template!.content).toMatch(/import\s*\{\s*doubleIt\s*\}\s*from\s*'\.\.\/lib2\/mathmod'/)
    expect(template!.content).toContain('doubleIt(')
  })

  test('M22: aliased factory import + aliased helper import both resolve correctly', () => {
    writeFixture('matrix22/lib/mathmod.ts', `export function doubleIt(x: number): number {
  return x * 2
}
`)
    writeFixture('matrix22/hooks/useDouble.tsx', `'use client'
import { createSignal } from '@barefootjs/client'
import { doubleIt as dbl } from '../lib/mathmod'

export function useDouble(initial: number) {
  const [value, setValue] = createSignal(dbl(initial))
  const bump = () => setValue(dbl(value()))
  return { value, bump }
}
`)
    const consumerSource = `'use client'
import { useDouble as useDoubleAliased } from '../hooks/useDouble'

export function Doubler() {
  const { value, bump } = useDoubleAliased(21)
  return <button onClick={bump}>{value()}</button>
}
`
    const consumerPath = writeFixture('matrix22/components/Doubler.tsx', consumerSource)

    const result = compileJSX(consumerSource, consumerPath, { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    // The re-provisioned import preserves the HELPER file's own local alias.
    expect(clientJs!.content).toMatch(/import\s*\{\s*doubleIt as dbl\s*\}/)
  })

  test('M23: an already-satisfied import through a barrel dedupes (no BF113, one occurrence)', () => {
    writeFixture('matrix23/lib/mathmod.ts', `export function doubleIt(x: number): number {
  return x * 2
}
`)
    writeFixture('matrix23/hooks/useDouble.tsx', `'use client'
import { createSignal } from '@barefootjs/client'
import { doubleIt } from '../lib/mathmod'

export function useDouble(initial: number) {
  const [value, setValue] = createSignal(doubleIt(initial))
  const bump = () => setValue(doubleIt(value()))
  return { value, bump }
}
`)
    writeFixture('matrix23/hooks/index.ts', `export { useDouble } from './useDouble'
`)
    const consumerSource = `'use client'
import { useDouble } from '../hooks'
import { doubleIt } from '../lib/mathmod'

export function DoublerSelfImporting() {
  const { value, bump } = useDouble(21)
  return <button onClick={() => { bump(); doubleIt(value()) }}>{value()}</button>
}
`
    const consumerPath = writeFixture('matrix23/components/DoublerSelfImporting.tsx', consumerSource)

    const result = compileJSX(consumerSource, consumerPath, { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    expect(result.errors.find(e => e.code === 'BF113')).toBeUndefined()
    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    expect((clientJs!.content.match(/from '\.\.\/lib\/mathmod'/g) ?? []).length).toBe(1)
  })
})

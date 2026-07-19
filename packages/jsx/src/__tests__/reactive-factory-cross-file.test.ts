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
})

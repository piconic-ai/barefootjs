/**
 * Module-level `createSignal` / `createMemo` — BF011 enforcement.
 *
 * Today these declarations are silently dropped by the codegen and
 * every reference to the resulting binding becomes a ReferenceError at
 * SSR and at hydrate. The diagnostic surfaces the bug at compile time
 * for every shape `visitComponentBody` would normally route through a
 * signal collector.
 *
 * A `/* @client *​/` opt-in for client-only module-scope state is
 * planned (Phase 2) but intentionally not recognized here — partial
 * support (suppress the diagnostic, no codegen) would re-introduce the
 * silent-bug shape this PR exists to surface.
 */

import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { compileJSX } from '../compiler'
import { HonoAdapter } from '../../../../packages/adapter-hono/src/adapter/hono-adapter'
import { ErrorCodes } from '../errors'

const adapter = new HonoAdapter()

function compile(source: string) {
  return compileJSX(source, 'Counter.tsx', { adapter })
}

function bf011(errors: { code: string }[]) {
  return errors.filter(e => e.code === ErrorCodes.SIGNAL_OUTSIDE_COMPONENT)
}

describe('module-level reactive declarations — BF011', () => {
  test('tuple destructure: `const [c, sc] = createSignal(0)`', () => {
    const src = `'use client'
import { createSignal } from '@barefootjs/client'
const [count, setCount] = createSignal(0)
export function Counter() {
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>
}
`
    const ctx = analyzeComponent(src, '/tmp/c.tsx', 'Counter')
    expect(bf011(ctx.errors)).toHaveLength(1)
  })

  test('identifier tuple-ref: `const t = createSignal(0); const v = t[0]`', () => {
    const src = `'use client'
import { createSignal } from '@barefootjs/client'
const tuple = createSignal(0)
const count = tuple[0]
const setCount = tuple[1]
export function Counter() {
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>
}
`
    const ctx = analyzeComponent(src, '/tmp/c.tsx', 'Counter')
    // One BF011 per reactive declaration. `tuple` is the createSignal
    // call; `count` / `setCount` are signal-index-access derivatives
    // which the detector also catches.
    expect(bf011(ctx.errors).length).toBeGreaterThanOrEqual(1)
  })

  test('index access: `const c = createSignal(0)[0]`', () => {
    const src = `'use client'
import { createSignal } from '@barefootjs/client'
const count = createSignal(0)[0]
export function Counter() {
  return <span>{count()}</span>
}
`
    const ctx = analyzeComponent(src, '/tmp/c.tsx', 'Counter')
    expect(bf011(ctx.errors)).toHaveLength(1)
  })

  test('createMemo: `const m = createMemo(() => ...)`', () => {
    const src = `'use client'
import { createMemo } from '@barefootjs/client'
const total = createMemo(() => 1 + 1)
export function Display() {
  return <span>{total()}</span>
}
`
    const ctx = analyzeComponent(src, '/tmp/d.tsx', 'Display')
    expect(bf011(ctx.errors)).toHaveLength(1)
  })

  test('`let` declaration is treated the same as `const`', () => {
    const src = `'use client'
import { createSignal } from '@barefootjs/client'
let [count, setCount] = createSignal(0)
export function Counter() {
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>
}
`
    const ctx = analyzeComponent(src, '/tmp/c.tsx', 'Counter')
    expect(bf011(ctx.errors)).toHaveLength(1)
  })

  test('file without `use client`: BF011 still fires', () => {
    const src = `import { createSignal } from '@barefootjs/client'
const [count, setCount] = createSignal(0)
export function Counter() {
  return <span>{count()}</span>
}
`
    const ctx = analyzeComponent(src, '/tmp/c.tsx', 'Counter')
    expect(bf011(ctx.errors)).toHaveLength(1)
  })

  test('full compile surfaces BF011 in `result.errors`', () => {
    const src = `'use client'
import { createSignal } from '@barefootjs/client'
const [count, setCount] = createSignal(0)
export function Counter() {
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>
}
`
    expect(bf011(compile(src).errors)).toHaveLength(1)
  })

  test('`/* @client */` suppresses BF011 and collects the signal', () => {
    const src = `'use client'
import { createSignal } from '@barefootjs/client'
/* @client */
const [count, setCount] = createSignal(0)
export function Counter() {
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>
}
`
    const ctx = analyzeComponent(src, '/tmp/c.tsx', 'Counter')
    expect(bf011(ctx.errors)).toHaveLength(0)
    const moduleSigs = ctx.signals.filter(s => s.isModule)
    expect(moduleSigs).toHaveLength(1)
    expect(moduleSigs[0].getter).toBe('count')
    expect(moduleSigs[0].setter).toBe('setCount')
  })

  test('`/* @client */` on createMemo suppresses BF011', () => {
    const src = `'use client'
import { createMemo } from '@barefootjs/client'
/* @client */
const total = createMemo(() => 1 + 1)
export function Display() {
  return <span>{total()}</span>
}
`
    const ctx = analyzeComponent(src, '/tmp/d.tsx', 'Display')
    expect(bf011(ctx.errors)).toHaveLength(0)
    const moduleMemos = ctx.memos.filter(m => m.isModule)
    expect(moduleMemos).toHaveLength(1)
    expect(moduleMemos[0].name).toBe('total')
  })

  test('`export /* @client */` marks signal as exported', () => {
    const src = `'use client'
import { createSignal } from '@barefootjs/client'
/* @client */
export const [count, setCount] = createSignal(0)
export function Counter() {
  return <span>{count()}</span>
}
`
    const ctx = analyzeComponent(src, '/tmp/c.tsx', 'Counter')
    expect(bf011(ctx.errors)).toHaveLength(0)
    const moduleSigs = ctx.signals.filter(s => s.isModule)
    expect(moduleSigs).toHaveLength(1)
    expect(moduleSigs[0].isExported).toBe(true)
  })

  test('control: in-component signal compiles cleanly', () => {
    const src = `'use client'
import { createSignal } from '@barefootjs/client'
export function Counter() {
  const [count, setCount] = createSignal(0)
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>
}
`
    const r = compile(src)
    expect(r.errors).toEqual([])
    const files = Object.fromEntries(r.files.map(f => [f.path, f.content]))
    expect(files['Counter.client.js']).toContain('createSignal(0)')
  })
})

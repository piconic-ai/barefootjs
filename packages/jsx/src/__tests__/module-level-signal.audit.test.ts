/**
 * Module-level `createSignal` — pinned current (broken) behavior.
 *
 * The ErrorCodes table reserves a slot for "signal outside component"
 * but grep confirms no production emission. This test pins what the
 * compiler actually does today when a user writes a module-scope
 * `createSignal` call.
 *
 * Observed silent failure:
 *   - The analyzer reports zero errors.
 *   - The codegen silently drops the module-level declaration.
 *   - Every reference to the resulting binding in the emitted SSR
 *     template AND client init becomes an undeclared identifier,
 *     producing `ReferenceError` at first render and at hydrate.
 *
 * The pinned assertions document the broken output exactly so a future
 * fix (either implementing a real diagnostic or preserving the
 * declaration) flips the test loudly.
 */

import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { compileJSX } from '../compiler'
import { HonoAdapter } from '../../../../packages/adapter-hono/src/adapter/hono-adapter'

const adapter = new HonoAdapter()

function compile(source: string) {
  return compileJSX(source, 'Counter.tsx', { adapter })
}

function filesByPath(r: ReturnType<typeof compile>) {
  return Object.fromEntries(r.files.map(f => [f.path, f.content]))
}

const MODULE_LEVEL_SIGNAL_SRC = `'use client'
import { createSignal } from '@barefootjs/client'

const [count, setCount] = createSignal(0)

export function Counter() {
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>
}
`

describe('module-level createSignal — pinned broken output', () => {
  test('analyzer surfaces no diagnostic', () => {
    const ctx = analyzeComponent(MODULE_LEVEL_SIGNAL_SRC, '/tmp/counter.tsx', 'Counter')
    expect(ctx.errors).toEqual([])
  })

  test('compile reports no errors', () => {
    const r = compile(MODULE_LEVEL_SIGNAL_SRC)
    expect(r.errors).toEqual([])
  })

  test('emitted SSR template strips the declaration and leaves references undeclared', () => {
    const r = compile(MODULE_LEVEL_SIGNAL_SRC)
    const ssr = filesByPath(r)['Counter.tsx']
    expect(ssr).toBeDefined()
    expect(ssr).not.toContain('const [count')
    expect(ssr).not.toContain('createSignal(0)')
    expect(ssr).toContain('count()')
  })

  test('emitted client JS strips the declaration and leaves references undeclared', () => {
    const r = compile(MODULE_LEVEL_SIGNAL_SRC)
    const clientJs = filesByPath(r)['Counter.client.js']
    expect(clientJs).toBeDefined()
    expect(clientJs).not.toContain('const [count')
    expect(clientJs).not.toContain('createSignal(0)')
    expect(clientJs).toContain('count()')
    expect(clientJs).toContain('setCount(')
  })

  test('control: in-component signal compiles cleanly', () => {
    const inComponent = `'use client'
import { createSignal } from '@barefootjs/client'

export function Counter() {
  const [count, setCount] = createSignal(0)
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>
}
`
    const r = compile(inComponent)
    expect(r.errors).toEqual([])
    const clientJs = filesByPath(r)['Counter.client.js']
    expect(clientJs).toContain('createSignal(0)')
  })
})

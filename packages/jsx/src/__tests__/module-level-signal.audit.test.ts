/**
 * Module-level `createSignal` / `createMemo` — BF011 enforcement.
 *
 * The default SSR path cannot host a module-scope reactive declaration
 * (the binding would leak across requests and the codegen silently
 * drops it). Authors opt into client-only module-scope state by
 * prefixing the statement with `/* @client *​/`.
 *
 * Phase 1 of the BF011 work (this PR): emit the diagnostic when the
 * directive is absent. Phase 2/3 (follow-up): wire the working
 * module-scope path through codegen + cross-file export/import.
 *
 * The directive-present tests below pin the *current* behavior so that
 * when codegen flips to "actually preserve the declaration", the
 * inversions are loud and intentional.
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

const NO_DIRECTIVE_SRC = `'use client'
import { createSignal } from '@barefootjs/client'

const [count, setCount] = createSignal(0)

export function Counter() {
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>
}
`

const WITH_DIRECTIVE_SRC = `'use client'
import { createSignal } from '@barefootjs/client'

/* @client */
const [count, setCount] = createSignal(0)

export function Counter() {
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>
}
`

const MEMO_NO_DIRECTIVE_SRC = `'use client'
import { createMemo } from '@barefootjs/client'

const total = createMemo(() => 1 + 1)

export function Display() {
  return <span>{total()}</span>
}
`

describe('module-level reactive declarations — BF011', () => {
  test('createSignal without /* @client */: BF011 fires at the declaration', () => {
    const ctx = analyzeComponent(NO_DIRECTIVE_SRC, '/tmp/counter.tsx', 'Counter')
    const errs = bf011(ctx.errors)
    expect(errs).toHaveLength(1)
    expect(errs[0].message).toContain('/* @client */')
  })

  test('createMemo without /* @client */: BF011 fires at the declaration', () => {
    const ctx = analyzeComponent(MEMO_NO_DIRECTIVE_SRC, '/tmp/display.tsx', 'Display')
    const errs = bf011(ctx.errors)
    expect(errs).toHaveLength(1)
  })

  test('full compile surfaces BF011 in the result.errors list', () => {
    const r = compile(NO_DIRECTIVE_SRC)
    expect(bf011(r.errors)).toHaveLength(1)
  })

  test('createSignal WITH /* @client */: BF011 does NOT fire', () => {
    const ctx = analyzeComponent(WITH_DIRECTIVE_SRC, '/tmp/counter.tsx', 'Counter')
    expect(bf011(ctx.errors)).toEqual([])
  })

  test('Phase 2/3 pending: WITH /* @client */, codegen still drops the declaration', () => {
    // Pinned current shape — when the working module-scope path lands,
    // this test should flip (assert the declaration survives into the
    // client JS and that SSR uses a placeholder for the reference).
    const r = compile(WITH_DIRECTIVE_SRC)
    expect(bf011(r.errors)).toEqual([])
    const files = Object.fromEntries(r.files.map(f => [f.path, f.content]))
    const clientJs = files['Counter.client.js']
    expect(clientJs).toBeDefined()
    expect(clientJs).not.toContain('const [count')
  })

  test('control: in-component signal compiles cleanly, no BF011', () => {
    const inComponent = `'use client'
import { createSignal } from '@barefootjs/client'

export function Counter() {
  const [count, setCount] = createSignal(0)
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>
}
`
    const r = compile(inComponent)
    expect(r.errors).toEqual([])
    const files = Object.fromEntries(r.files.map(f => [f.path, f.content]))
    expect(files['Counter.client.js']).toContain('createSignal(0)')
  })
})

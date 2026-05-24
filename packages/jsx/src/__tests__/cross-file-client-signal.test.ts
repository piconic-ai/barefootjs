/**
 * Cross-file `@client` signal import — Phase 3.
 *
 * Verifies that a file importing `@client`-exported signals from a
 * relative module gets the correct compiler output:
 *   - SSR template: placeholder for signal references
 *   - Client JS: import preserved
 *   - State-only file: standalone client JS emitted
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { analyzeComponent } from '../analyzer'
import { compileJSX } from '../compiler'
import { HonoAdapter } from '../../../../packages/adapter-hono/src/adapter/hono-adapter'

const adapter = new HonoAdapter()

let fixtureDir: string

beforeAll(() => {
  fixtureDir = mkdtempSync(path.join(tmpdir(), 'bf-phase3-'))
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

describe('cross-file @client signal import', () => {
  test('analyzer detects imported @client signal names', () => {
    writeFixture('state.tsx', `'use client'
import { createSignal } from '@barefootjs/client'
/* @client */
export const [count, setCount] = createSignal(0)
`)
    const consumerPath = writeFixture('counter.tsx', `'use client'
import { count, setCount } from './state'

export function Counter() {
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>
}
`)
    const consumerSource = `'use client'
import { count, setCount } from './state'

export function Counter() {
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>
}
`
    const ctx = analyzeComponent(consumerSource, consumerPath, 'Counter')
    expect(ctx.importedClientSignalNames).toContain('count')
    expect(ctx.importedClientSignalNames).toContain('setCount')
  })

  test('imported @client memo is detected', () => {
    writeFixture('derived.tsx', `'use client'
import { createMemo } from '@barefootjs/client'
/* @client */
export const total = createMemo(() => 42)
`)
    const consumerPath = writeFixture('display.tsx', `'use client'
import { total } from './derived'
export function Display() {
  return <span>{total()}</span>
}
`)
    const ctx = analyzeComponent(`'use client'
import { total } from './derived'
export function Display() {
  return <span>{total()}</span>
}
`, consumerPath, 'Display')
    expect(ctx.importedClientSignalNames).toContain('total')
  })

  test('full compile: SSR uses placeholder for imported signal ref', () => {
    writeFixture('shared.tsx', `'use client'
import { createSignal } from '@barefootjs/client'
/* @client */
export const [val, setVal] = createSignal('hello')
`)
    const consumerPath = writeFixture('viewer.tsx', `'use client'
import { val } from './shared'
export function Viewer() {
  return <span>{val()}</span>
}
`)
    const r = compileJSX(`'use client'
import { val } from './shared'
export function Viewer() {
  return <span>{val()}</span>
}
`, consumerPath, { adapter })
    expect(r.errors.filter(e => e.code === 'BF011')).toHaveLength(0)
    const files = Object.fromEntries(r.files.map(f => [f.path, f.content]))
    const ssr = Object.values(files).find(c => c.includes('export function Viewer'))
    expect(ssr).toBeDefined()
    expect(ssr).toContain('client:s')
    expect(ssr).not.toContain("const val = () =>")
  })

  test('state-only file produces standalone client JS', () => {
    const statePath = writeFixture('store.tsx', `'use client'
import { createSignal } from '@barefootjs/client'
/* @client */
export const [items, setItems] = createSignal([])
`)
    const stateSource = `'use client'
import { createSignal } from '@barefootjs/client'
/* @client */
export const [items, setItems] = createSignal([])
`
    const r = compileJSX(stateSource, statePath, { adapter })
    expect(r.errors.filter(e => e.severity === 'error')).toEqual([])
    const clientJs = r.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    expect(clientJs!.content).toContain('export const [items, setItems] = createSignal([])')
    expect(clientJs!.content).toContain('createSignal')
  })

  test('non-relative import is ignored (no cross-file scan)', () => {
    const consumerPath = writeFixture('external.tsx', `'use client'
import { count } from '@some-package/state'
export function Counter() {
  return <span>{count()}</span>
}
`)
    const ctx = analyzeComponent(`'use client'
import { count } from '@some-package/state'
export function Counter() {
  return <span>{count()}</span>
}
`, consumerPath, 'Counter')
    expect(ctx.importedClientSignalNames.size).toBe(0)
  })
})

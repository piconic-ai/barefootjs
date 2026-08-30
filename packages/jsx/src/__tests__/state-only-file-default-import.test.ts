/**
 * #2767 follow-up: the state-only-file client-JS path (a `.tsx` with no
 * JSX return but an exported `/* @client *\/` module signal) used to filter
 * OUT every default- or namespace-imported specifier when deciding which
 * external imports to preserve (`s => !s.isDefault && !s.isNamespace`,
 * `compiler.ts`'s single-component early return) — not just render them
 * wrong, but drop them entirely. A signal initializer that references a
 * default- or namespace-imported helper compiled with zero diagnostics
 * into client JS that throws `ReferenceError` in the browser, since the
 * import never made it into the bundle at all.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('state-only file: default/namespace imports feeding a @client signal', () => {
  test('preserves a default-imported helper referenced by the signal initializer', () => {
    const source = `'use client'
import defaults from './defaults.json' with { type: 'json' }
import { createSignal } from '@barefootjs/client'
/* @client */
export const [count, setCount] = createSignal(defaults.start)
`
    const result = compileJSX(source, 'store.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    expect(clientJs!.content).toContain("import defaults from './defaults.json'")
    expect(clientJs!.content).not.toContain('import { defaults }')
  })

  test('preserves a namespace-imported helper referenced by the signal initializer', () => {
    const source = `'use client'
import * as util from './util'
import { createSignal } from '@barefootjs/client'
/* @client */
export const [count, setCount] = createSignal(util.base())
`
    const result = compileJSX(source, 'store2.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    expect(clientJs!.content).toContain("import * as util from './util'")
  })
})

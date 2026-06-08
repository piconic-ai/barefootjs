/**
 * Profile-mode `__bfId` emission (#1690, SR3).
 *
 * In profile mode the client-JS codegen appends IR-aligned id arguments at
 * reactive creation sites so a profiling run can join runtime events to IR
 * nodes. Off by default the emitted code is byte-for-byte unchanged (SR8).
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

const source = `
  'use client'
  import { createSignal, createMemo, createEffect } from '@barefootjs/client'

  export function Counter() {
    const [count, setCount] = createSignal(0)
    const doubled = createMemo(() => count() * 2)
    createEffect(() => { console.log(doubled()) })
    return <button onClick={() => setCount(n => n + 1)}>{doubled()}</button>
  }
`

function clientJs(profile: boolean): string {
  const result = compileJSX(source, 'Counter.tsx', { adapter, profile })
  const file = result.files.find(f => f.type === 'clientJs')
  expect(file).toBeDefined()
  return file!.content
}

describe('profile mode off (default, SR8)', () => {
  test('emits no __bfId arguments — output is unchanged', () => {
    const off = clientJs(false)
    expect(off).toContain('createSignal(0)')
    expect(off).not.toContain('#signal:')
    expect(off).not.toContain('#memo:')
    expect(off).not.toContain('#effect:')
  })

  test('omitting the flag matches profile:false byte-for-byte', () => {
    const implicit = compileJSX(source, 'Counter.tsx', { adapter })
      .files.find(f => f.type === 'clientJs')!.content
    expect(implicit).toBe(clientJs(false))
  })
})

describe('profile mode on (SR3)', () => {
  test('appends IR-aligned ids to createSignal / createMemo / createEffect', () => {
    const on = clientJs(true)
    expect(on).toContain('createSignal(0, "Counter#signal:count")')
    expect(on).toContain('createMemo(() => count() * 2, "Counter#memo:doubled")')
    expect(on).toMatch(/createEffect\(.*"Counter#effect:/)
  })

  test('does not change the signal/memo initial expressions', () => {
    // The id is purely additive — the first argument is identical to off mode.
    const on = clientJs(true)
    expect(on).toContain('createMemo(() => count() * 2,')
  })
})

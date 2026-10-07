/**
 * Profile-mode turn-boundary markers (#1690, SR3).
 *
 * In profile mode each event handler is bracketed with `beginTurn`/`endTurn`
 * so a profiling run attributes the reactive work the handler triggers to one
 * turn. Off by default the emitted code is unchanged (SR8).
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

const source = `
  'use client'
  import { createSignal } from '@barefootjs/client'

  export function Counter() {
    const [count, setCount] = createSignal(0)
    return <button onClick={() => setCount(n => n + 1)}>{count()}</button>
  }
`

function clientJs(profile: boolean): string {
  return compileJSX(source, 'Counter.tsx', { adapter, profile })
    .files.find(f => f.type === 'clientJs')!.content
}

describe('profile mode off (default, SR8)', () => {
  test('emits no turn markers and no turn imports', () => {
    const off = clientJs(false)
    expect(off).not.toContain('beginTurn')
    expect(off).not.toContain('endTurn')
  })
})

describe('profile mode on (SR3)', () => {
  test('brackets the handler with beginTurn/endTurn carrying an IR-aligned id', () => {
    const on = clientJs(true)
    expect(on).toContain('beginTurn("Counter#handler:')
    expect(on).toContain('endTurn()')
    // The original handler is still invoked verbatim with forwarded args.
    expect(on).toContain('(() => setCount(n => n + 1))(...__bfa)')
  })

  test('auto-wires the beginTurn/endTurn runtime import', () => {
    const on = clientJs(true)
    const importLine = on.split('\n').find(l => l.includes('@barefootjs/client/runtime'))
    expect(importLine).toBeDefined()
    expect(importLine).toContain('beginTurn')
    expect(importLine).toContain('endTurn')
  })
})

describe('rest-spread event forwarding (#3376)', () => {
  const spread = `
    'use client'
    interface Props { onClick?: () => void }
    export function SpreadButton(props: Props) {
      return <button {...props}>Increment</button>
    }
  `
  const compile = (profile: boolean) =>
    compileJSX(spread, 'SpreadButton.tsx', { adapter, profile }).files.find(f => f.type === 'clientJs')!.content

  test('profile mode names the spread site so the runtime can open a turn per handler', () => {
    expect(compile(true)).toContain('applyRestAttrs(_s0, _p, [], "SpreadButton#handler:s0")')
  })

  test('profile mode off passes no site (zero instrumentation in production)', () => {
    const off = compile(false)
    expect(off).toContain('applyRestAttrs(_s0, _p, [])')
    expect(off).not.toContain('#handler:')
  })
})

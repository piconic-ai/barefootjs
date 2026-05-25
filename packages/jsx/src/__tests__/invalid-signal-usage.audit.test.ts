/**
 * BF012 `INVALID_SIGNAL_USAGE` deletion audit.
 *
 * BF012 was reserved for "Invalid signal usage" — a vague placeholder
 * with no defined scenario and no emission site.  Every concrete
 * signal-misuse pattern already has a dedicated diagnostic:
 *
 *   - BF011: module-level createSignal / createMemo
 *   - BF044: signal getter passed without calling it
 *   - BF060: reactive binding in template scope
 *
 * This file proves the compiler handles signal-related edge cases
 * without needing BF012.
 */

import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { jsxToIR } from '../jsx-to-ir'
import { ErrorCodes } from '../errors'

function compileToIR(source: string) {
  const ctx = analyzeComponent(source, '/tmp/Test.tsx')
  const ir = jsxToIR(ctx)
  return { ctx, ir, errors: ctx.errors }
}

describe('BF012 INVALID_SIGNAL_USAGE — deletion audit', () => {
  test('valid signal usage produces no errors', () => {
    const src = `'use client'
import { createSignal } from '@barefootjs/client'
export function Counter() {
  const [count, setCount] = createSignal(0)
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>
}
`
    const { errors } = compileToIR(src)
    expect(errors).toHaveLength(0)
  })

  test('module-level signal is caught by BF011, not BF012', () => {
    const src = `'use client'
import { createSignal } from '@barefootjs/client'
const [count, setCount] = createSignal(0)
export function Counter() {
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>
}
`
    const ctx = analyzeComponent(src, '/tmp/Counter.tsx', 'Counter')
    const codes = ctx.errors.map(e => e.code)
    expect(codes).toContain(ErrorCodes.SIGNAL_OUTSIDE_COMPONENT)
    expect(codes).not.toContain('BF012')
  })

  test('signal getter passed without calling is caught by BF044, not BF012', () => {
    const src = `'use client'
import { createSignal } from '@barefootjs/client'
export function Counter() {
  const [count, setCount] = createSignal(0)
  return <div value={count} />
}
`
    const { errors } = compileToIR(src)
    const codes = errors.map(e => e.code)
    expect(codes).toContain(ErrorCodes.SIGNAL_GETTER_NOT_CALLED)
    expect(codes).not.toContain('BF012')
  })

  test('BF012 code no longer exists in ErrorCodes', () => {
    const allCodes = Object.values(ErrorCodes)
    expect(allCodes).not.toContain('BF012')
  })
})

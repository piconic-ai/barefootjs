/**
 * `'use client'` directive position — observable behavior.
 *
 * The analyzer's directive detector (analyzer.ts:328) treats a
 * `'use client'` string-literal ExpressionStatement at *any* tree
 * position as the file-level directive. The comment at
 * analyzer.ts:2862-2867 spells out why this is deliberate: BF003's
 * cross-file client classification consults the same shape, so the
 * detector here must match it exactly.
 *
 * This test pins the consequences of that permissive detection.
 * Findings:
 *   - Top, after-import, after-statement placements: compile output
 *     is byte-identical to a canonical top-of-file placement.
 *   - In-function-body placement: same SSR template, but the literal
 *     `'use client'` leaks into the emitted client JS as a no-op
 *     expression statement. Runtime behavior is unaffected.
 */

import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { compileJSX } from '../compiler'
import { HonoAdapter } from '../../../../packages/adapter-hono/src/adapter/hono-adapter'

const adapter = new HonoAdapter()

const COUNTER_BODY = `export function Counter() {
  const [n, setN] = createSignal(0)
  return <button onClick={() => setN(n() + 1)}>{n()}</button>
}
`

function compile(source: string) {
  return compileJSX(source, 'Counter.tsx', { adapter })
}

function filesByPath(r: ReturnType<typeof compile>) {
  return Object.fromEntries(r.files.map(f => [f.path, f.content]))
}

describe('`use client` directive position', () => {
  test('canonical top-of-file: directive recognized, no errors', () => {
    const source = `'use client'
import { createSignal } from '@barefootjs/client'

${COUNTER_BODY}`
    const ctx = analyzeComponent(source, '/tmp/counter.tsx', 'Counter')
    expect(ctx.hasUseClientDirective).toBe(true)
    expect(ctx.errors.filter(e => e.severity === 'error')).toEqual([])
  })

  test('after import: detector still flips hasUseClientDirective', () => {
    const source = `import { createSignal } from '@barefootjs/client'
'use client'

${COUNTER_BODY}`
    const ctx = analyzeComponent(source, '/tmp/counter.tsx', 'Counter')
    expect(ctx.hasUseClientDirective).toBe(true)
  })

  test('after a non-import statement: detector still flips', () => {
    const source = `const X = 1
'use client'
import { createSignal } from '@barefootjs/client'

${COUNTER_BODY}`
    const ctx = analyzeComponent(source, '/tmp/counter.tsx', 'Counter')
    expect(ctx.hasUseClientDirective).toBe(true)
  })

  test('inside function body: detector matches and suppresses BF001', () => {
    const source = `import { createSignal } from '@barefootjs/client'

export function Counter() {
  'use client'
  const [n, setN] = createSignal(0)
  return <button onClick={() => setN(n() + 1)}>{n()}</button>
}
`
    const ctx = analyzeComponent(source, '/tmp/counter.tsx', 'Counter')
    // A directive nested inside a function body has no spec meaning, yet
    // flips the file flag and suppresses BF001 — pinned here so any future
    // tightening of the detector is a deliberate, observed change.
    expect(ctx.hasUseClientDirective).toBe(true)
    expect(ctx.errors.filter(e => e.code === 'BF001')).toEqual([])
  })

  test('after-import placement: output byte-identical to top placement', () => {
    const top = `'use client'
import { createSignal } from '@barefootjs/client'

${COUNTER_BODY}`
    const misplaced = `import { createSignal } from '@barefootjs/client'
'use client'

${COUNTER_BODY}`
    const r1 = compile(top)
    const r2 = compile(misplaced)
    expect(r1.errors).toEqual([])
    expect(r2.errors).toEqual([])
    expect(filesByPath(r2)).toEqual(filesByPath(r1))
  })

  test('in-function-body placement leaks the literal into emitted client JS', () => {
    const top = `'use client'
import { createSignal } from '@barefootjs/client'

${COUNTER_BODY}`
    const inBody = `import { createSignal } from '@barefootjs/client'

export function Counter() {
  'use client'
  const [n, setN] = createSignal(0)
  return <button onClick={() => setN(n() + 1)}>{n()}</button>
}
`
    const r1 = compile(top)
    const r2 = compile(inBody)
    expect(r1.errors).toEqual([])
    expect(r2.errors).toEqual([])
    const clientPath = 'Counter.client.js'
    expect(filesByPath(r1)[clientPath]).not.toContain("'use client'")
    expect(filesByPath(r2)[clientPath]).toContain("'use client'")
  })

  test('no directive + reactive APIs: BF001 fires (sanity)', () => {
    const source = `import { createSignal } from '@barefootjs/client'

${COUNTER_BODY}`
    const ctx = analyzeComponent(source, '/tmp/counter.tsx', 'Counter')
    expect(ctx.errors.filter(e => e.code === 'BF001').length).toBeGreaterThan(0)
  })
})

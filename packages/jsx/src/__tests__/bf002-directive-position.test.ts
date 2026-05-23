/**
 * BF002 — INVALID_DIRECTIVE_POSITION audit.
 *
 * The error code is defined in `errors.ts` but never emitted. The analyzer's
 * `'use client'` detector (analyzer.ts:328) matches a string-literal
 * ExpressionStatement at *any* tree position — see the explicit comment at
 * analyzer.ts:2862-2867 noting this is deliberate so BF003's cross-file
 * client-detection stays consistent with the analyzer's own classification.
 *
 * These tests pin the observable consequences of that permissive detection
 * so the BF002 keep / delete / implement decision can be made on evidence.
 *
 * Findings (May 2026):
 *   - Top, after-import, after-statement placements: byte-identical output.
 *   - Inside function body: same SSR template, but the literal string
 *     leaks into the emitted client JS as a no-op expression statement.
 *     Runtime behavior is correct; output contains a stray `'use client'`.
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

describe('BF002 audit — `use client` directive position', () => {
  test('control: directive at top is recognized as client', () => {
    const source = `'use client'
import { createSignal } from '@barefootjs/client'

${COUNTER_BODY}`
    const ctx = analyzeComponent(source, '/tmp/counter.tsx', 'Counter')
    expect(ctx.hasUseClientDirective).toBe(true)
    expect(ctx.errors.filter(e => e.severity === 'error')).toEqual([])
  })

  test('after import: detector still flips hasUseClientDirective; no BF002', () => {
    const source = `import { createSignal } from '@barefootjs/client'
'use client'

${COUNTER_BODY}`
    const ctx = analyzeComponent(source, '/tmp/counter.tsx', 'Counter')
    expect(ctx.hasUseClientDirective).toBe(true)
    expect(ctx.errors.filter(e => e.code === 'BF002')).toEqual([])
  })

  test('after a non-import statement: detector still flips', () => {
    const source = `const X = 1
'use client'
import { createSignal } from '@barefootjs/client'

${COUNTER_BODY}`
    const ctx = analyzeComponent(source, '/tmp/counter.tsx', 'Counter')
    expect(ctx.hasUseClientDirective).toBe(true)
  })

  test('inside function body: detector matches (most permissive case)', () => {
    const source = `import { createSignal } from '@barefootjs/client'

export function Counter() {
  'use client'
  const [n, setN] = createSignal(0)
  return <button onClick={() => setN(n() + 1)}>{n()}</button>
}
`
    const ctx = analyzeComponent(source, '/tmp/counter.tsx', 'Counter')
    // Deliberate snapshot of the surprising behavior. A directive nested
    // inside a function body has no spec meaning, yet flips the file flag
    // and suppresses BF001 — which masks the misplacement.
    expect(ctx.hasUseClientDirective).toBe(true)
    expect(ctx.errors.filter(e => e.code === 'BF001')).toEqual([])
  })

  test('after-import placement produces output byte-identical to top placement', () => {
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
    const f1 = filesByPath(r1)
    const f2 = filesByPath(r2)
    const clientPath = 'Counter.client.js'
    // Top placement: directive does NOT appear in the emitted runtime body.
    expect(f1[clientPath]).not.toContain("'use client'")
    // In-body placement: directive survives as a no-op statement in the
    // initCounter body — cosmetic, but a real output divergence.
    expect(f2[clientPath]).toContain("'use client'")
  })

  test('no directive + reactive APIs: BF001 fires (sanity)', () => {
    const source = `import { createSignal } from '@barefootjs/client'

${COUNTER_BODY}`
    const ctx = analyzeComponent(source, '/tmp/counter.tsx', 'Counter')
    expect(ctx.errors.filter(e => e.code === 'BF001').length).toBeGreaterThan(0)
  })
})

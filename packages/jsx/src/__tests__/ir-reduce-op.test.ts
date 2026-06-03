import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { jsxToIR } from '../jsx-to-ir'
import { parseExpression } from '../expression-parser'

/**
 * IR-level verification for `.reduce(fn, init)` (#1448 Tier C). The
 * parser intercepts the arithmetic-fold catalogue into a structured
 * `array-method` + `ReduceOp` node — this test pins the source-string
 * that survives through `jsxToIR` to an `IRExpression`, then re-parses
 * it to confirm the structured fold shape adapters consume.
 *
 * Hydration and template-emit correctness are pinned at the adapter
 * conformance layer (`reduce-*` fixtures in `packages/adapter-tests/
 * fixtures/methods/`).
 */
describe('reduce(fn, init) IR shape', () => {
  test('sum over a struct field re-parses to a numeric ReduceOp', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Total() {
        const [items] = createSignal<{ duration: number }[]>([])
        return <div>{items().reduce((sum, t) => sum + t.duration, 0)}</div>
      }
    `

    const ctx = analyzeComponent(source, 'Total.tsx')
    const ir = jsxToIR(ctx)

    expect(ir).not.toBeNull()
    if (ir!.type !== 'element') return
    const exprNode = ir!.children.find(c => c.type === 'expression')
    expect(exprNode?.type).toBe('expression')
    if (exprNode?.type !== 'expression') return

    // The IR carries the expression as a source string (the same shape
    // adapters re-parse at emit time). Round-trip it to confirm the
    // ReduceOp catalogue match survives the analyzer → IR boundary.
    const parsed = parseExpression(exprNode.expr)
    expect(parsed.kind).toBe('array-method')
    if (parsed.kind !== 'array-method') return
    expect(parsed.method).toBe('reduce')
    if (parsed.method !== 'reduce') return
    expect(parsed.reduceOp.op).toBe('+')
    expect(parsed.reduceOp.key).toEqual({ kind: 'field', field: 'duration' })
    expect(parsed.reduceOp.type).toBe('numeric')
    expect(parsed.reduceOp.init).toBe('0')
  })
})

import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { jsxToIR } from '../jsx-to-ir'
import { parseExpression, asCallbackMethodCall } from '../expression-parser'

/**
 * IR-level verification for `.reduce(fn, init)` (#2018 P5). The parser no
 * longer folds the reducer into a structured `ReduceOp`; `.reduce` arrives as a
 * generic `call` whose callee is `<recv>.reduce` and whose args are the
 * comparator `arrow` + the init literal. The adapter serializes the arrow body
 * to the runtime evaluator. This test pins that the generic callback shape
 * survives the analyzer → IR boundary.
 *
 * Hydration / template-emit / Go==Perl==JS fold correctness are pinned at the
 * adapter conformance + eval-vectors layers.
 */
describe('reduce(fn, init) IR shape', () => {
  test('sum over a struct field parses to a generic reduce callback', () => {
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

    const parsed = parseExpression(exprNode.expr)
    const cb = asCallbackMethodCall(parsed)
    expect(cb).not.toBeNull()
    expect(cb!.method).toBe('reduce')
    expect(cb!.arrow.params).toEqual(['sum', 't'])
    // Reducer body: `sum + t.duration`.
    expect(cb!.arrow.body.kind).toBe('binary')
    // The init literal travels as the trailing argument.
    expect(cb!.args).toEqual([{ kind: 'literal', value: 0, literalType: 'number', raw: '0' }])
  })
})

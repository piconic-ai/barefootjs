/**
 * A binary node renders each operand subtree once (#3824 step 8 review).
 *
 * The strict-equality spelling reads its operands as values; before this
 * pin the emitters rendered both subtrees for the operator's own form and
 * then again as values, for every operator, so a nested chain did work
 * exponential in its depth (a depth-18 subtraction chain read its one leaf
 * 262,144 times). The count of `identifier` calls is the work measure: it is
 * linear in the depth when each subtree is rendered once.
 */

import { describe, test, expect, spyOn } from 'bun:test'
import { compileJSX, emitParsedExpr, parseExpression } from '@barefootjs/jsx'
import { XslateAdapter } from '../adapter/xslate-adapter'
import { XslateFilterEmitter, XslateTopLevelEmitter } from '../adapter/expr/emitters'

const DEPTH = 18

/** `x <op> 1 <op> 1 …`, left-associated, `depth` operators deep. */
function chain(op: string, depth: number): string {
  return ['x', ...Array(depth).fill('1')].join(` ${op} `)
}

/** `((x === x) === x) === …`: every level is a strict equality with a leaf read. */
function equalityChain(depth: number): string {
  let expr = 'x'
  for (let i = 0; i < depth; i++) expr = `(${expr}) === x`
  return expr
}

function filterReads(source: string): number {
  const emitter = new XslateFilterEmitter('x', new Map())
  const identifier = spyOn(emitter, 'identifier')
  emitParsedExpr(parseExpression(source), emitter)
  return identifier.mock.calls.length
}

function topLevelReads(expression: string): number {
  const identifier = spyOn(XslateTopLevelEmitter.prototype, 'identifier')
  try {
    const result = compileJSX(
      `export function Probe({ x }: { x: unknown }) { return <p>{String(${expression})}</p> }`,
      'Probe.tsx',
      { adapter: new XslateAdapter() },
    )
    expect(result.errors).toEqual([])
    return identifier.mock.calls.filter(([name]) => name === 'x').length
  } finally {
    identifier.mockRestore()
  }
}

describe('Xslate binary emission renders each operand once', () => {
  for (const op of ['-', '+', '*', '<']) {
    test(`filter emitter: a depth-${DEPTH} \`${op}\` chain reads its leaf once`, () => {
      expect(filterReads(chain(op, DEPTH))).toBe(1)
    })
  }

  test(`filter emitter: a depth-${DEPTH} strict-equality chain reads each leaf once`, () => {
    expect(filterReads(equalityChain(DEPTH))).toBe(DEPTH + 1)
  })

  test('top-level emitter: the reads grow linearly with the chain depth', () => {
    for (const make of [(d: number) => chain('-', d), (d: number) => chain('+', d), equalityChain]) {
      const shallow = topLevelReads(make(DEPTH / 2))
      const deep = topLevelReads(make(DEPTH))
      expect(deep).toBeLessThanOrEqual(2 * shallow + 2)
    }
  })
})

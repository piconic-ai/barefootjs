import { describe, expect, test } from 'bun:test'
import { parseExpression, serializeParsedExpr, freeVarsInBody } from '../expression-parser'

/**
 * `serializeParsedExpr` emits the minimal JSON the runtime evaluator (Go
 * `eval.go` `EvalNode` / Perl `Evaluator.pm` `evaluate`) reads. These tests pin
 * the field contract (only evaluator-read fields per kind) and the purity gate
 * (folded / non-expression kinds → null). `freeVarsInBody` pins the captured
 * free-var set used to build the evaluator's `base_env`. (#2018)
 */

/** Parse a callback-body source and serialize it to the evaluator JSON object. */
function evalJSON(src: string): unknown {
  const s = serializeParsedExpr(parseExpression(src))
  return s === null ? null : JSON.parse(s)
}

describe('serializeParsedExpr', () => {
  test('literal carries only `value` (no literalType / raw)', () => {
    expect(evalJSON('42')).toEqual({ kind: 'literal', value: 42 })
    expect(evalJSON("'hi'")).toEqual({ kind: 'literal', value: 'hi' })
    expect(evalJSON('true')).toEqual({ kind: 'literal', value: true })
    expect(evalJSON('null')).toEqual({ kind: 'literal', value: null })
  })

  test('identifier carries `name`', () => {
    expect(evalJSON('acc')).toEqual({ kind: 'identifier', name: 'acc' })
  })

  test('reducer body: binary over member projection', () => {
    expect(evalJSON('acc + item.price')).toEqual({
      kind: 'binary',
      op: '+',
      left: { kind: 'identifier', name: 'acc' },
      // member carries object + property only (no `computed`).
      right: {
        kind: 'member',
        object: { kind: 'identifier', name: 'item' },
        property: 'price',
      },
    })
  })

  test('comparator body: 3-way ternary', () => {
    expect(evalJSON('a > b ? 1 : a < b ? -1 : 0')).toEqual({
      kind: 'conditional',
      test: { kind: 'binary', op: '>', left: { kind: 'identifier', name: 'a' }, right: { kind: 'identifier', name: 'b' } },
      consequent: { kind: 'literal', value: 1 },
      alternate: {
        kind: 'conditional',
        test: { kind: 'binary', op: '<', left: { kind: 'identifier', name: 'a' }, right: { kind: 'identifier', name: 'b' } },
        consequent: { kind: 'unary', op: '-', argument: { kind: 'literal', value: 1 } },
        alternate: { kind: 'literal', value: 0 },
      },
    })
  })

  test('filter body: logical over member access', () => {
    expect(evalJSON('item.done && item.priority > 3')).toEqual({
      kind: 'logical',
      op: '&&',
      left: { kind: 'member', object: { kind: 'identifier', name: 'item' }, property: 'done' },
      right: {
        kind: 'binary',
        op: '>',
        left: { kind: 'member', object: { kind: 'identifier', name: 'item' }, property: 'priority' },
        right: { kind: 'literal', value: 3 },
      },
    })
  })

  test('index-access carries object + index', () => {
    expect(evalJSON('item[i]')).toEqual({
      kind: 'index-access',
      object: { kind: 'identifier', name: 'item' },
      index: { kind: 'identifier', name: 'i' },
    })
  })

  test('builtin call carries callee + args', () => {
    expect(evalJSON('Math.max(a, b)')).toEqual({
      kind: 'call',
      callee: { kind: 'member', object: { kind: 'identifier', name: 'Math' }, property: 'max' },
      args: [
        { kind: 'identifier', name: 'a' },
        { kind: 'identifier', name: 'b' },
      ],
    })
  })

  test('template literal: string + expression parts', () => {
    expect(evalJSON('`n=${acc + 1}`')).toEqual({
      kind: 'template-literal',
      parts: [
        { type: 'string', value: 'n=' },
        { type: 'expression', expr: { kind: 'binary', op: '+', left: { kind: 'identifier', name: 'acc' }, right: { kind: 'literal', value: 1 } } },
      ],
    })
  })

  test('map body: object literal carries key + value (no keyKind / shorthand)', () => {
    expect(evalJSON('({ id: item.id, n: item.n })')).toEqual({
      kind: 'object-literal',
      properties: [
        { key: 'id', value: { kind: 'member', object: { kind: 'identifier', name: 'item' }, property: 'id' } },
        { key: 'n', value: { kind: 'member', object: { kind: 'identifier', name: 'item' }, property: 'n' } },
      ],
    })
  })

  test('array literal', () => {
    expect(evalJSON('[item.a, item.b]')).toEqual({
      kind: 'array-literal',
      elements: [
        { kind: 'member', object: { kind: 'identifier', name: 'item' }, property: 'a' },
        { kind: 'member', object: { kind: 'identifier', name: 'item' }, property: 'b' },
      ],
    })
  })

  test('purity gate: a folded method call in the body → null', () => {
    // `.toUpperCase()` folds to `array-method`, outside the evaluator surface.
    expect(serializeParsedExpr(parseExpression('item.name.toUpperCase()'))).toBeNull()
    // A higher-order call (`.filter`) likewise.
    expect(serializeParsedExpr(parseExpression('item.tags.filter(t => t)'))).toBeNull()
    // An unsupported shape.
    expect(serializeParsedExpr(parseExpression('a instanceof B'))).toBeNull()
  })

  test('purity gate: a folded subtree anywhere poisons the whole body', () => {
    expect(serializeParsedExpr(parseExpression('acc + item.name.toUpperCase()'))).toBeNull()
  })
})

describe('freeVarsInBody', () => {
  test('collects refs minus the callback params, sorted & deduped', () => {
    const body = parseExpression('acc + item.price + acc')
    expect(freeVarsInBody(body, new Set(['acc', 'item']))).toEqual([])
    expect(freeVarsInBody(body, new Set(['acc']))).toEqual(['item'])
    expect(freeVarsInBody(body, new Set())).toEqual(['acc', 'item'])
  })

  test('captures an outer free var referenced in the body (base_env source)', () => {
    // `taxRate` is neither param — it must travel as a captured free var.
    const body = parseExpression('acc + item.price * taxRate')
    expect(freeVarsInBody(body, new Set(['acc', 'item']))).toEqual(['taxRate'])
  })

  test('member property names are not references; object-literal values are', () => {
    // `price` (property) is not a free var; `item` and `factor` are.
    const body = parseExpression('({ total: item.price * factor })')
    expect(freeVarsInBody(body, new Set()).sort()).toEqual(['factor', 'item'])
  })

  test('template + index + call cover their value positions', () => {
    const body = parseExpression('`${row[k]}-${Math.abs(n)}`')
    expect(freeVarsInBody(body, new Set())).toEqual(['Math', 'k', 'n', 'row'])
  })
})

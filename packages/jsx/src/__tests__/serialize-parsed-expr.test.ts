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

  test('purity gate: a non-builtin call is refused (evaluator would read it as nil)', () => {
    // Bare function call — not on the evaluator allowlist.
    expect(serializeParsedExpr(parseExpression('foo(item)'))).toBeNull()
    // Method call on a value — generic `call` with a non-Math member callee.
    expect(serializeParsedExpr(parseExpression('item.compute(2)'))).toBeNull()
    // `parseInt` etc. are not the allowlisted `Number`/`String`/`Boolean`.
    expect(serializeParsedExpr(parseExpression('parseInt(item.s)'))).toBeNull()
    // A computed builtin reference the evaluator rejects (`Math['max']`).
    expect(serializeParsedExpr(parseExpression("Math['max'](a, b)"))).toBeNull()
  })

  test('allowlisted builtins serialize (Math.* / String / Number / Boolean)', () => {
    expect(serializeParsedExpr(parseExpression('Math.floor(item.x)'))).not.toBeNull()
    expect(serializeParsedExpr(parseExpression('String(item.n)'))).not.toBeNull()
    expect(serializeParsedExpr(parseExpression('Number(item.s)'))).not.toBeNull()
    expect(serializeParsedExpr(parseExpression('Boolean(item.s)'))).not.toBeNull()
  })

  test('`.includes(x)` array-method serializes (the one array-method the evaluator executes)', () => {
    expect(evalJSON("item.tags.includes('go')")).toEqual({
      kind: 'array-method',
      method: 'includes',
      object: { kind: 'member', object: { kind: 'identifier', name: 'item' }, property: 'tags' },
      args: [{ kind: 'literal', value: 'go' }],
    })
  })

  test('every other array-method still folds outside the evaluator surface', () => {
    expect(serializeParsedExpr(parseExpression('item.tags.join(",")'))).toBeNull()
    expect(serializeParsedExpr(parseExpression('item.tags.slice(0, 1)'))).toBeNull()
  })

  test('a computed member value carries `computed: true` (plain access omits it)', () => {
    // `row['price']` folds to a computed `member`; the flag is preserved so a
    // computed member stays distinguishable. (`row.price` carries no `computed`.)
    expect(evalJSON("row['price']")).toEqual({
      kind: 'member',
      object: { kind: 'identifier', name: 'row' },
      property: 'price',
      computed: true,
    })
    expect(evalJSON('row.price')).toEqual({
      kind: 'member',
      object: { kind: 'identifier', name: 'row' },
      property: 'price',
    })
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
    // `Math` is a builtin callee resolved syntactically by the evaluator — it
    // is NOT captured (it would emit an undefined `$Math` / `.Math` base_env
    // entry). The real refs `k`, `n`, `row` are.
    const body = parseExpression('`${row[k]}-${Math.abs(n)}`')
    expect(freeVarsInBody(body, new Set())).toEqual(['k', 'n', 'row'])
  })

  test('builtin call callees (Math.<fn> / String / Number / Boolean) are not captured', () => {
    // Each builtin is resolved syntactically by the evaluator, so its
    // identifier must not enter base_env (Copilot review #2031). The
    // arguments, however, ARE real references.
    const body = parseExpression('Math.max(a, factor) + Number(label) + String(x) + Boolean(flag)')
    expect(freeVarsInBody(body, new Set(['a']))).toEqual(['factor', 'flag', 'label', 'x'])
  })

  test('`.includes(x)` array-method: both the receiver and the needle are free vars', () => {
    const body = parseExpression('!tag || p.tags.includes(tag)')
    expect(freeVarsInBody(body, new Set())).toEqual(['p', 'tag'])
  })
})

import { describe, expect, test } from 'bun:test'
import {
  type ParsedExpr,
  parseExpressionRaw,
  foldInlineHelperBody,
  stringifyParsedExpr,
} from '../expression-parser'

/**
 * `parseExpressionRaw` is the Go-adapter constructor-lowering parse (#2006): a
 * `ParsedExpr` that does NOT fold method calls into `array-method` /
 * `higher-order` (they stay generic `call` + `member`) and preserves the two
 * raw-only shapes — a multi-parameter arrow and a regex literal. These tests
 * pin that surface, which the ctor / helper / spread lowerers consume.
 */
describe('parseExpressionRaw', () => {
  test('identifier / string / number / boolean / null literals', () => {
    expect(parseExpressionRaw('count')).toEqual({ kind: 'identifier', name: 'count' })
    expect(parseExpressionRaw("'all'")).toEqual({ kind: 'literal', value: 'all', literalType: 'string' })
    // `raw` is TS's normalised NumericLiteral.text (`1e3` → `1000`), same as the folded parse.
    expect(parseExpressionRaw('1e3')).toEqual({ kind: 'literal', value: 1000, literalType: 'number', raw: '1000' })
    expect(parseExpressionRaw('42')).toEqual({ kind: 'literal', value: 42, literalType: 'number', raw: '42' })
    expect(parseExpressionRaw('true')).toEqual({ kind: 'literal', value: true, literalType: 'boolean' })
    expect(parseExpressionRaw('null')).toEqual({ kind: 'literal', value: null, literalType: 'null' })
  })

  test('no-substitution template folds to a string literal', () => {
    expect(parseExpressionRaw('`plain`')).toEqual({ kind: 'literal', value: 'plain', literalType: 'string' })
  })

  test('member access (props.X)', () => {
    expect(parseExpressionRaw('props.base')).toEqual({
      kind: 'member',
      object: { kind: 'identifier', name: 'props' },
      property: 'base',
      computed: false,
    })
  })

  test('method call modelled uniformly as call + member (not folded)', () => {
    expect(parseExpressionRaw("sp.get('tag')")).toEqual({
      kind: 'call',
      callee: { kind: 'member', object: { kind: 'identifier', name: 'sp' }, property: 'get', computed: false },
      args: [{ kind: 'literal', value: 'tag', literalType: 'string' }],
    })
  })

  test('regex literal carried as exact source text', () => {
    const r = parseExpressionRaw('/\\/+$/')
    expect(r).toEqual({ kind: 'regex', raw: '/\\/+$/' })
  })

  test('.replace(/\\/+$/, "") — the trailing-slash strip the ctor lowering recognises', () => {
    const r = parseExpressionRaw("base.replace(/\\/+$/, '')")
    expect(r.kind).toBe('call')
    if (r.kind !== 'call') return
    expect(r.callee).toEqual({
      kind: 'member',
      object: { kind: 'identifier', name: 'base' },
      property: 'replace',
      computed: false,
    })
    expect(r.args[0]).toEqual({ kind: 'regex', raw: '/\\/+$/' })
    expect(r.args[1]).toEqual({ kind: 'literal', value: '', literalType: 'string' })
  })

  test('multi-parameter arrow (helper inlining)', () => {
    const r = parseExpressionRaw('(base, path) => base + path')
    expect(r.kind).toBe('arrow-fn')
    if (r.kind !== 'arrow-fn') return
    expect(r.params).toEqual(['base', 'path'])
    expect(r.body.kind).toBe('binary')
  })

  test('single-parameter arrow normalises to params: [x]', () => {
    const r = parseExpressionRaw('x => x')
    expect(r).toEqual({
      kind: 'arrow-fn',
      params: ['x'],
      body: { kind: 'identifier', name: 'x' },
    })
  })

  test('block-body arrow is unsupported', () => {
    expect(parseExpressionRaw('(x) => { return x }').kind).toBe('unsupported')
  })

  test('logical ?? / || / && discriminated from binary', () => {
    expect((parseExpressionRaw("a ?? b") as ParsedExpr & { kind: 'logical' }).op).toBe('??')
    expect((parseExpressionRaw("a || b") as ParsedExpr & { kind: 'logical' }).op).toBe('||')
    expect((parseExpressionRaw("a && b") as ParsedExpr & { kind: 'logical' }).op).toBe('&&')
    expect((parseExpressionRaw("a === b") as ParsedExpr & { kind: 'binary' }).op).toBe('===')
  })

  test('out-of-surface binary / unary operators resolve to unsupported (not op: "unknown")', () => {
    // Operators getOperatorString/getUnaryOperatorString don't recognise must
    // opt out, not emit a node with a meaningless `op` a consumer could mishandle.
    expect(parseExpressionRaw('a instanceof B').kind).toBe('unsupported')
    expect(parseExpressionRaw('a ** b').kind).toBe('unsupported')
    expect(parseExpressionRaw('++x').kind).toBe('unsupported')
    expect(parseExpressionRaw('--x').kind).toBe('unsupported')
  })

  test('nested: base.replace(/\\/+$/, "") || "/"', () => {
    const r = parseExpressionRaw("base.replace(/\\/+$/, '') || '/'")
    expect(r.kind).toBe('logical')
    if (r.kind !== 'logical') return
    expect(r.op).toBe('||')
    expect(r.left.kind).toBe('call')
    expect(r.right).toEqual({ kind: 'literal', value: '/', literalType: 'string' })
  })

  test('unary ! and conditional', () => {
    expect(parseExpressionRaw('!open')).toEqual({
      kind: 'unary',
      op: '!',
      argument: { kind: 'identifier', name: 'open' },
    })
    const c = parseExpressionRaw("cond ? 'a' : 'b'")
    expect(c.kind).toBe('conditional')
  })

  test('string array literal', () => {
    expect(parseExpressionRaw("['a', 'b']")).toEqual({
      kind: 'array-literal',
      elements: [
        { kind: 'literal', value: 'a', literalType: 'string' },
        { kind: 'literal', value: 'b', literalType: 'string' },
      ],
    })
  })

  test('object literal with identifier / string / numeric keys', () => {
    // Object literals are paren-wrapped by the analyzer (a bare `{…}` at
    // statement position parses as a block), mirroring `parseExpression`.
    const r = parseExpressionRaw("({ align: 'start', 'data-x': 1, 2: 'two' })")
    expect(r.kind).toBe('object-literal')
    if (r.kind !== 'object-literal') return
    expect(r.properties.map(p => [p.key, p.keyKind])).toEqual([
      ['align', 'identifier'],
      ['data-x', 'string'],
      ['2', 'numeric'],
    ])
    expect(r.properties[0].value).toEqual({ kind: 'literal', value: 'start', literalType: 'string' })
  })

  test('shorthand object property', () => {
    const r = parseExpressionRaw('({ a })')
    expect(r.kind).toBe('object-literal')
    if (r.kind !== 'object-literal') return
    expect(r.properties[0]).toEqual({
      key: 'a',
      keyKind: 'identifier',
      shorthand: true,
      value: { kind: 'identifier', name: 'a' },
    })
  })

  test('spread / computed-key objects resolve to unsupported', () => {
    expect(parseExpressionRaw('({ ...rest })').kind).toBe('unsupported')
    expect(parseExpressionRaw('({ [k]: 1 })').kind).toBe('unsupported')
  })

  test('empty / non-expression input is unsupported', () => {
    expect(parseExpressionRaw('').kind).toBe('unsupported')
    expect(parseExpressionRaw('   ').kind).toBe('unsupported')
  })
})

/**
 * `foldInlineHelperBody` normalises a raw-parsed helper body into the shape the
 * Go inliner substitutes call args into, then re-stringifies the result for the
 * normal lowering (#2006). It is a faithful structural normaliser, not a
 * re-parse, so the round-trip invariant is over `stringifyParsedExpr`: the
 * result must stringify back to a source string that means the same expression.
 */
describe('foldInlineHelperBody', () => {
  test.each([
    "params().sort === k ? 'sort on' : 'sort'",
    'a || b',
    'a ?? b',
    '!open',
    'a + b * c',
    'arr[i]',
    'a.b.c',
    "f(x, 'y', 1)",
    "base.replace('x', '')",
  ])('round-trips through stringifyParsedExpr for %p', src => {
    const back = foldInlineHelperBody(parseExpressionRaw(`(${src})`))
    expect(back).not.toBeNull()
    // Re-parsing the stringified result yields the same raw tree — i.e. the
    // normaliser preserves the expression's meaning across the round-trip.
    if (back) expect(parseExpressionRaw(stringifyParsedExpr(back))).toEqual(parseExpressionRaw(src))
  })

  test('conditional helper body normalises structurally', () => {
    const back = foldInlineHelperBody(
      parseExpressionRaw("(params().sort === k ? 'sort on' : 'sort')"),
    )
    expect(back).toEqual({
      kind: 'conditional',
      test: {
        kind: 'binary',
        op: '===',
        left: {
          kind: 'member',
          object: { kind: 'call', callee: { kind: 'identifier', name: 'params' }, args: [] },
          property: 'sort',
          computed: false,
        },
        right: { kind: 'identifier', name: 'k' },
      },
      consequent: { kind: 'literal', value: 'sort on', literalType: 'string' },
      alternate: { kind: 'literal', value: 'sort', literalType: 'string' },
    })
  })

  test('arrow and regex can not be inlined → null', () => {
    expect(foldInlineHelperBody(parseExpressionRaw('(a, b) => a + b'))).toBeNull()
    expect(foldInlineHelperBody(parseExpressionRaw('/\\/+$/'))).toBeNull()
    // A nested arrow/regex anywhere in the tree poisons the whole normalise.
    expect(foldInlineHelperBody(parseExpressionRaw('xs.map(x => x)'))).toBeNull()
    expect(foldInlineHelperBody(parseExpressionRaw("base.replace(/\\/+$/, '')"))).toBeNull()
  })

  test('literal element access folds to a computed member (matches parseExpression)', () => {
    // `parseExpression` folds `obj['key']` / `arr[0]` into a computed `member`;
    // the normaliser replicates that so the lowering (keyed to `parseExpression`'s
    // shapes) treats them identically. A variable index stays `index-access`.
    expect(foldInlineHelperBody(parseExpressionRaw("(obj['key'])"))).toEqual({
      kind: 'member',
      object: { kind: 'identifier', name: 'obj' },
      property: 'key',
      computed: true,
    })
    expect(foldInlineHelperBody(parseExpressionRaw('(arr[0])'))).toEqual({
      kind: 'member',
      object: { kind: 'identifier', name: 'arr' },
      property: '0',
      computed: true,
    })
    const idx = foldInlineHelperBody(parseExpressionRaw('(rows[i])'))
    expect(idx?.kind).toBe('index-access')
  })

  test('unsupported round-trips as unsupported (the fallback sentinel)', () => {
    const u = foldInlineHelperBody({ kind: 'unsupported', raw: 'a ** b', reason: 'x' })
    expect(u).toEqual({ kind: 'unsupported', raw: 'a ** b', reason: 'x' })
  })
})

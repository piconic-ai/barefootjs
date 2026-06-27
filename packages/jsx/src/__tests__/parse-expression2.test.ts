import { describe, expect, test } from 'bun:test'
import { type ParsedExpr2, parseExpression2 } from '../expression-parser'

/**
 * `parseExpression2` is the Go-adapter constructor-lowering bridge tree
 * (#2006). These tests pin the two gap shapes it adds over `ParsedExpr`
 * (multi-parameter arrow, regex literal) plus the narrow surface the ctor /
 * helper / spread lowerers consume.
 */
describe('parseExpression2', () => {
  test('identifier / string / number / boolean / null literals', () => {
    expect(parseExpression2('count')).toEqual({ kind: 'identifier', name: 'count' })
    expect(parseExpression2("'all'")).toEqual({ kind: 'literal', value: 'all', literalType: 'string' })
    // `raw` is TS's normalised NumericLiteral.text (`1e3` → `1000`), same as ParsedExpr.
    expect(parseExpression2('1e3')).toEqual({ kind: 'literal', value: 1000, literalType: 'number', raw: '1000' })
    expect(parseExpression2('42')).toEqual({ kind: 'literal', value: 42, literalType: 'number', raw: '42' })
    expect(parseExpression2('true')).toEqual({ kind: 'literal', value: true, literalType: 'boolean' })
    expect(parseExpression2('null')).toEqual({ kind: 'literal', value: null, literalType: 'null' })
  })

  test('no-substitution template folds to a string literal', () => {
    expect(parseExpression2('`plain`')).toEqual({ kind: 'literal', value: 'plain', literalType: 'string' })
  })

  test('member access (props.X)', () => {
    expect(parseExpression2('props.base')).toEqual({
      kind: 'member',
      object: { kind: 'identifier', name: 'props' },
      property: 'base',
      computed: false,
    })
  })

  test('method call modelled uniformly as call + member', () => {
    expect(parseExpression2("sp.get('tag')")).toEqual({
      kind: 'call',
      callee: { kind: 'member', object: { kind: 'identifier', name: 'sp' }, property: 'get', computed: false },
      args: [{ kind: 'literal', value: 'tag', literalType: 'string' }],
    })
  })

  test('regex literal carried as exact source text', () => {
    const r = parseExpression2('/\\/+$/')
    expect(r).toEqual({ kind: 'regex', raw: '/\\/+$/' })
  })

  test('.replace(/\\/+$/, "") — the trailing-slash strip the ctor lowering recognises', () => {
    const r = parseExpression2("base.replace(/\\/+$/, '')")
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
    const r = parseExpression2('(base, path) => base + path')
    expect(r.kind).toBe('arrow')
    if (r.kind !== 'arrow') return
    expect(r.params).toEqual(['base', 'path'])
    expect(r.body.kind).toBe('binary')
  })

  test('single-parameter arrow normalises to params: [x]', () => {
    const r = parseExpression2('x => x')
    expect(r).toEqual({
      kind: 'arrow',
      params: ['x'],
      body: { kind: 'identifier', name: 'x' },
    })
  })

  test('block-body arrow is unsupported', () => {
    expect(parseExpression2('(x) => { return x }').kind).toBe('unsupported')
  })

  test('logical ?? / || / && discriminated from binary', () => {
    expect((parseExpression2("a ?? b") as ParsedExpr2 & { kind: 'logical' }).op).toBe('??')
    expect((parseExpression2("a || b") as ParsedExpr2 & { kind: 'logical' }).op).toBe('||')
    expect((parseExpression2("a && b") as ParsedExpr2 & { kind: 'logical' }).op).toBe('&&')
    expect((parseExpression2("a === b") as ParsedExpr2 & { kind: 'binary' }).op).toBe('===')
  })

  test('nested: base.replace(/\\/+$/, "") || "/"', () => {
    const r = parseExpression2("base.replace(/\\/+$/, '') || '/'")
    expect(r.kind).toBe('logical')
    if (r.kind !== 'logical') return
    expect(r.op).toBe('||')
    expect(r.left.kind).toBe('call')
    expect(r.right).toEqual({ kind: 'literal', value: '/', literalType: 'string' })
  })

  test('unary ! and conditional', () => {
    expect(parseExpression2('!open')).toEqual({
      kind: 'unary',
      op: '!',
      argument: { kind: 'identifier', name: 'open' },
    })
    const c = parseExpression2("cond ? 'a' : 'b'")
    expect(c.kind).toBe('conditional')
  })

  test('string array literal', () => {
    expect(parseExpression2("['a', 'b']")).toEqual({
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
    const r = parseExpression2("({ align: 'start', 'data-x': 1, 2: 'two' })")
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
    const r = parseExpression2('({ a })')
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
    expect(parseExpression2('({ ...rest })').kind).toBe('unsupported')
    expect(parseExpression2('({ [k]: 1 })').kind).toBe('unsupported')
  })

  test('empty / non-expression input is unsupported', () => {
    expect(parseExpression2('').kind).toBe('unsupported')
    expect(parseExpression2('   ').kind).toBe('unsupported')
  })
})

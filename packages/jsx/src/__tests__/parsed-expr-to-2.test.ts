import { describe, expect, test } from 'bun:test'
import { type ParsedExpr, parseExpression, parsedExprToParsedExpr2 } from '../expression-parser'

/**
 * `parsedExprToParsedExpr2` is the pure structural bridge from the shared
 * template-lowering tree (`ParsedExpr`) to the Go ctor-lowering tree
 * (`ParsedExpr2`), used by the object-returning searchParams memo path to lower
 * from the analyzer-carried `parsedBlock` instead of re-parsing `computation`
 * with `ts.createSourceFile` (#2006). These pin the object-memo value surface
 * plus the unsupported fall-through.
 */
describe('parsedExprToParsedExpr2', () => {
  test('call + member: sp.get(\'x\')', () => {
    const e = parseExpression("sp.get('x')")
    expect(parsedExprToParsedExpr2(e)).toEqual({
      kind: 'call',
      callee: {
        kind: 'member',
        object: { kind: 'identifier', name: 'sp' },
        property: 'get',
        computed: false,
      },
      args: [{ kind: 'literal', value: 'x', literalType: 'string' }],
    })
  })

  test("nullish-coalescing logical: sp.get('tag') ?? ''", () => {
    const e = parseExpression("sp.get('tag') ?? ''")
    expect(parsedExprToParsedExpr2(e)).toEqual({
      kind: 'logical',
      op: '??',
      left: {
        kind: 'call',
        callee: {
          kind: 'member',
          object: { kind: 'identifier', name: 'sp' },
          property: 'get',
          computed: false,
        },
        args: [{ kind: 'literal', value: 'tag', literalType: 'string' }],
      },
      right: { kind: 'literal', value: '', literalType: 'string' },
    })
  })

  test('object literal converts properties recursively', () => {
    const e = parseExpression("({ sort: sp.get('sort'), tag: sp.get('tag') ?? '' })")
    const out = parsedExprToParsedExpr2(e)
    expect(out.kind).toBe('object-literal')
    if (out.kind !== 'object-literal') throw new Error('expected object-literal')
    expect(out.properties.map(p => ({ key: p.key, keyKind: p.keyKind, shorthand: p.shorthand, valueKind: p.value.kind }))).toEqual([
      { key: 'sort', keyKind: 'identifier', shorthand: false, valueKind: 'call' },
      { key: 'tag', keyKind: 'identifier', shorthand: false, valueKind: 'logical' },
    ])
  })

  test('unsupported kind (template-literal) maps to unsupported carrying raw', () => {
    const e: ParsedExpr = parseExpression('`hi ${name}`')
    expect(e.kind).toBe('template-literal')
    const out = parsedExprToParsedExpr2(e)
    expect(out).toEqual({ kind: 'unsupported', raw: '', reason: 'unsupported in ParsedExpr2' })
  })

  test('an already-unsupported node preserves its original reason and raw', () => {
    // A computed object key falls through to `unsupported` at parse time with a
    // tailored reason; the converter must preserve it, not overwrite it with
    // the generic ParsedExpr2 message.
    const e: ParsedExpr = parseExpression('{ [k]: 1 }')
    expect(e.kind).toBe('unsupported')
    const out = parsedExprToParsedExpr2(e)
    expect(out.kind).toBe('unsupported')
    if (e.kind === 'unsupported' && out.kind === 'unsupported') {
      expect(out.reason).toBe(e.reason)
      expect(out.reason).not.toBe('unsupported in ParsedExpr2')
      expect(out.raw).toBe(e.raw)
    }
  })
})

/**
 * Registered-lowering recognition at ANY value position (#2843), not only
 * a call's own top-level entry point. Two independent seams share this
 * shared-layer test:
 *
 *  - the SUPPORT GATE (`isSupported`/`isSupportedValue`, `expression-parser.ts`),
 *    which must admit a matched call's own params — even an `object-literal`,
 *    normally refused at `rendered` position — wherever it's nested
 *    (a ternary branch, a template-literal interpolation, a binary operand),
 *    by re-checking the neutral node's `loweringNodeChildren` instead of the
 *    call's raw `args`;
 *  - the shared `emitParsedExpr` DISPATCHER (`parsed-expr-emitter.ts`), whose
 *    `call` case now tries an emitter's optional `lowering` seam before its
 *    ordinary `call()`/`callbackMethod` dispatch, so an adapter that adopts
 *    it renders the matched node correctly at any nesting depth too.
 *
 * Uses a standalone SAMPLE plugin (independent of `queryHref`) so these tests
 * exercise the mechanism itself, mirroring `lowering-registry.test.ts`.
 */

import { describe, test, expect, afterEach } from 'bun:test'
import {
  registerLoweringPlugin,
  getLoweringPlugins,
  prepareLoweringMatchers,
  __resetLoweringPluginsForTest,
  isSupported,
  isSupportedValue,
  emitParsedExpr,
  type LoweringPlugin,
  type LoweringEmitter,
  type ParsedExprEmitter,
  type IRMetadata,
  type ParsedExpr,
} from '../index'

// A minimal sample plugin: active only when the component imports anything
// from `@sample/pkg`, lowering `demo(base, { … })` to a neutral `guard-list`
// on the `query` helper — the exact shape `queryHref` produces, so these
// tests exercise the same object-literal-admission path #2743/#2841 needed.
const samplePlugin: LoweringPlugin = {
  name: 'sample-value-position-demo',
  prepare(metadata) {
    const active = metadata.imports.some(i => i.source === '@sample/pkg' && !i.isTypeOnly)
    if (!active) return null
    return (callee, args) => {
      if (callee.kind !== 'identifier' || callee.name !== 'demo') return null
      const [base, obj] = args
      if (!base || obj?.kind !== 'object-literal') return null
      return {
        kind: 'guard-list',
        helper: 'query',
        base,
        triples: obj.properties
          .filter((p): p is Extract<typeof p, { kind: 'prop' }> => p.kind === 'prop')
          .map(p => ({ guard: null, key: p.key, value: p.value })),
      }
    }
  },
}

function metadataImporting(source: string): IRMetadata {
  return { imports: [{ source, isTypeOnly: false, specifiers: [] }] } as unknown as IRMetadata
}

afterEach(() => {
  const remaining = getLoweringPlugins().filter(p => p.name !== 'sample-value-position-demo')
  __resetLoweringPluginsForTest(remaining)
})

const base = { kind: 'literal', value: '/x', literalType: 'string' } as ParsedExpr
const tagValue = { kind: 'literal', value: 'a', literalType: 'string' } as ParsedExpr
const paramsObj = {
  kind: 'object-literal',
  raw: '{ tag: "a" }',
  properties: [{ kind: 'prop', key: 'tag', shorthand: false, value: tagValue }],
} as ParsedExpr
const demoCall = { kind: 'call', callee: { kind: 'identifier', name: 'demo' }, args: [base, paramsObj] } as ParsedExpr

function matchers(): ReturnType<typeof prepareLoweringMatchers> {
  registerLoweringPlugin(samplePlugin)
  return prepareLoweringMatchers(metadataImporting('@sample/pkg'))
}

describe('isSupported / isSupportedValue with loweringMatchers (#2843)', () => {
  test('a matched call nested in a conditional branch is admitted at rendered position', () => {
    const ms = matchers()
    const cond: ParsedExpr = {
      kind: 'conditional',
      test: { kind: 'identifier', name: 'ok' },
      consequent: demoCall,
      alternate: { kind: 'literal', value: '/fallback', literalType: 'string' },
    }
    expect(isSupported(cond, { loweringMatchers: ms }).supported).toBe(true)
    // Without matchers, the same tree is refused (the object-literal arg).
    expect(isSupported(cond).supported).toBe(false)
  })

  test('a matched call nested in a logical operand is admitted', () => {
    const ms = matchers()
    const logical: ParsedExpr = {
      kind: 'logical',
      op: '||',
      left: demoCall,
      right: { kind: 'literal', value: '/fallback', literalType: 'string' },
    }
    expect(isSupported(logical, { loweringMatchers: ms }).supported).toBe(true)
  })

  test('a matched call nested in a template-literal interpolation is admitted', () => {
    const ms = matchers()
    const tmpl: ParsedExpr = {
      kind: 'template-literal',
      parts: [
        { type: 'string', value: 'pre ' },
        { type: 'expression', expr: demoCall },
      ],
    }
    expect(isSupported(tmpl, { loweringMatchers: ms }).supported).toBe(true)
  })

  test('an unmatched call inside the same shapes still refuses (no regression)', () => {
    const ms = matchers()
    const unmatchedCall: ParsedExpr = {
      kind: 'call',
      callee: { kind: 'identifier', name: 'other' },
      args: [base, paramsObj],
    }
    const cond: ParsedExpr = {
      kind: 'conditional',
      test: { kind: 'identifier', name: 'ok' },
      consequent: unmatchedCall,
      alternate: { kind: 'literal', value: '/fallback', literalType: 'string' },
    }
    expect(isSupported(cond, { loweringMatchers: ms }).supported).toBe(false)
  })

  test('a matched call whose own child is unsupported still refuses, loudly (sound-or-loud)', () => {
    const ms = matchers()
    // The value of the one triple is itself an unsupported node (a bare
    // arrow function) — the plugin's node still carries it as a child, so
    // it must still be checked, not silently passed through.
    const arrow: ParsedExpr = { kind: 'arrow', params: ['x'], body: { kind: 'identifier', name: 'x' } }
    const badParams = {
      kind: 'object-literal',
      raw: '{ tag: (x) => x }',
      properties: [{ kind: 'prop', key: 'tag', shorthand: false, value: arrow }],
    } as ParsedExpr
    const badCall: ParsedExpr = {
      kind: 'call',
      callee: { kind: 'identifier', name: 'demo' },
      args: [base, badParams],
    }
    expect(isSupported(badCall, { loweringMatchers: ms }).supported).toBe(false)
  })

  test('isSupportedValue behaves the same way as isSupported for a matched nested call', () => {
    const ms = matchers()
    const cond: ParsedExpr = {
      kind: 'conditional',
      test: { kind: 'identifier', name: 'ok' },
      consequent: demoCall,
      alternate: { kind: 'literal', value: '/fallback', literalType: 'string' },
    }
    expect(isSupportedValue(cond, { loweringMatchers: ms }).supported).toBe(true)
  })
})

describe('emitParsedExpr dispatch with an emitter.lowering seam (#2843)', () => {
  // A stub emitter exercising only what the `call` case needs; every other
  // method throws so an accidental fallthrough fails loudly in the test.
  function stubEmitter(lowering?: LoweringEmitter): ParsedExprEmitter {
    const unimplemented = (name: string) => () => {
      throw new Error(`unexpected emitter.${name} call in this test`)
    }
    return {
      identifier: (name: string) => `ID(${name})`,
      literal: (v) => `LIT(${JSON.stringify(v)})`,
      call: (callee, args, emit) => `CALL(${emit(callee)}, ${args.map(emit).join(', ')})`,
      member: unimplemented('member'),
      indexAccess: unimplemented('indexAccess'),
      binary: unimplemented('binary'),
      unary: unimplemented('unary'),
      logical: unimplemented('logical'),
      conditional: unimplemented('conditional'),
      templateLiteral: unimplemented('templateLiteral'),
      callbackMethod: unimplemented('callbackMethod'),
      arrow: unimplemented('arrow'),
      regex: unimplemented('regex'),
      arrayLiteral: unimplemented('arrayLiteral'),
      objectLiteral: (_props, raw) => `OBJ(${raw})`,
      arrayMethod: unimplemented('arrayMethod'),
      flatMethod: unimplemented('flatMethod'),
      unsupported: (raw) => `UNSUPPORTED(${raw})`,
      lowering,
    }
  }

  test('a matched call renders via emitter.lowering.render, not the ordinary call() dispatch', () => {
    const ms = matchers()
    const lowering: LoweringEmitter = {
      matchers: ms,
      render: (node, emit) => {
        if (node.kind !== 'guard-list') return null
        const parts = node.triples.map(t => `${t.key}=${emit(t.value)}`).join('&')
        return `QUERY(${emit(node.base)}, ${parts})`
      },
    }
    expect(emitParsedExpr(demoCall, stubEmitter(lowering))).toBe('QUERY(LIT("/x"), tag=LIT("a"))')
  })

  test('without emitter.lowering, the same call falls through to the ordinary call() dispatch', () => {
    expect(emitParsedExpr(demoCall, stubEmitter())).toBe('CALL(ID(demo), LIT("/x"), OBJ({ tag: "a" }))')
  })

  test('lowering present but the node kind/helper has no mapping falls through to call()', () => {
    const ms = matchers()
    const lowering: LoweringEmitter = { matchers: ms, render: () => null }
    expect(emitParsedExpr(demoCall, stubEmitter(lowering))).toBe('CALL(ID(demo), LIT("/x"), OBJ({ tag: "a" }))')
  })

  test('an unmatched call is unaffected by an emitter.lowering seam', () => {
    const ms = matchers()
    const lowering: LoweringEmitter = { matchers: ms, render: () => 'SHOULD NOT BE REACHED' }
    const unmatchedCall: ParsedExpr = {
      kind: 'call',
      callee: { kind: 'identifier', name: 'other' },
      args: [base],
    }
    expect(emitParsedExpr(unmatchedCall, stubEmitter(lowering))).toBe('CALL(ID(other), LIT("/x"))')
  })
})

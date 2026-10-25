/**
 * `recv.toString()` reaches an adapter's `call()` as `String(recv)` (#3621).
 * Every template adapter registers the `String` primitive; a zero-arg method
 * call otherwise falls to `call()`'s getter fallback, which reads the callee
 * `recv.toString` as a property and drops the call.
 */

import { describe, test, expect } from 'bun:test'
import { emitParsedExpr, parseExpression, type ParsedExpr, type ParsedExprEmitter } from '../index'

// Spells every node as a JS-like string so the dispatched shape is visible.
function makeEmitter(): ParsedExprEmitter {
  const callName = (callee: ParsedExpr, emit: (e: ParsedExpr) => string) =>
    callee.kind === 'identifier' ? callee.name : emit(callee)
  return {
    identifier: name => name,
    literal: value => JSON.stringify(value),
    call: (callee, args, emit) => `${callName(callee, emit)}(${args.map(emit).join(', ')})`,
    member: (object, property, _computed, optional, emit) => `${emit(object)}${optional ? '?.' : '.'}${property}`,
    indexAccess: (object, index, emit) => `${emit(object)}[${emit(index)}]`,
    binary: (op, l, r, emit) => `${emit(l)} ${op} ${emit(r)}`,
    unary: (op, a, emit) => `${op}${emit(a)}`,
    logical: (op, l, r, emit) => `${emit(l)} ${op} ${emit(r)}`,
    conditional: () => 'COND',
    templateLiteral: () => 'TPL',
    arrow: () => 'ARROW',
    regex: raw => raw,
    arrayLiteral: (els, emit) => `[${els.map(emit).join(', ')}]`,
    objectLiteral: (_p, raw) => raw,
    callbackMethod: (method, object, _arrow, _rest, emit) => `${emit(object)}.${method}(CB)`,
    arrayMethod: (method, object, args, emit) => `${emit(object)}.${method}(${args.map(emit).join(', ')})`,
    flatMethod: (object, _depth, emit) => `${emit(object)}.flat()`,
    unsupported: raw => `UNSUPPORTED(${raw})`,
  }
}

const emit = (src: string) => emitParsedExpr(parseExpression(src), makeEmitter())

describe('recv.toString() dispatches as String(recv)', () => {
  test('a row value, an index and a getter result', () => {
    expect(emit('x.toString()')).toBe('String(x)')
    expect(emit('i.toString()')).toBe('String(i)')
    expect(emit('count().toString()')).toBe('String(count())')
    expect(emit('row.meta.id.toString()')).toBe('String(row.meta.id)')
  })

  test('nested inside another expression', () => {
    expect(emit("'#' + n.toString()")).toBe("\"#\" + String(n)")
  })

  test('other shapes keep the generic call dispatch', () => {
    // A radix argument changes the result; `String` takes none.
    expect(emit('n.toString(16)')).toBe('n.toString(16)')
    // `x?.toString()` is `undefined` for a nullish receiver, `String` is not.
    expect(emit('x?.toString()')).not.toContain('String(')
    expect(emit('x.valueOf()')).toBe('x.valueOf()')
  })
})

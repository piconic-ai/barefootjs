import { describe, test, expect } from 'bun:test'
import { parseExpression, isSupported, stringifyParsedExpr } from '../expression-parser'

/**
 * `.reduce(fn, init)` arithmetic-fold catalogue (#1448 Tier C). The
 * parser intercepts the accepted shapes into a structured `ReduceOp`
 * (mirroring the `.sort` `SortComparator` precedent) and refuses
 * everything else to `unsupported` so the template adapters surface
 * BF101 with the `@client` escape hatch.
 */
describe('reduce() arithmetic-fold catalogue', () => {
  test('numeric sum over a field → field/numeric', () => {
    const r = parseExpression('items.reduce((sum, t) => sum + t.duration, 0)')
    expect(r.kind).toBe('array-method')
    if (r.kind === 'array-method' && r.method === 'reduce') {
      expect(r.reduceOp.op).toBe('+')
      expect(r.reduceOp.key).toEqual({ kind: 'field', field: 'duration' })
      expect(r.reduceOp.type).toBe('numeric')
      expect(r.reduceOp.init).toBe('0')
      expect(r.reduceOp.paramAcc).toBe('sum')
      expect(r.reduceOp.paramItem).toBe('t')
    }
    expect(isSupported(r).supported).toBe(true)
  })

  test('numeric sum over self (primitive array) → self/numeric', () => {
    const r = parseExpression('nums.reduce((a, b) => a + b, 0)')
    expect(r.kind).toBe('array-method')
    if (r.kind === 'array-method' && r.method === 'reduce') {
      expect(r.reduceOp.op).toBe('+')
      expect(r.reduceOp.key).toEqual({ kind: 'self' })
      expect(r.reduceOp.type).toBe('numeric')
    }
  })

  test('product over a field with init 1 → field/numeric/*', () => {
    const r = parseExpression('items.reduce((acc, x) => acc * x.qty, 1)')
    expect(r.kind).toBe('array-method')
    if (r.kind === 'array-method' && r.method === 'reduce') {
      expect(r.reduceOp.op).toBe('*')
      expect(r.reduceOp.key).toEqual({ kind: 'field', field: 'qty' })
      expect(r.reduceOp.type).toBe('numeric')
      expect(r.reduceOp.init).toBe('1')
    }
  })

  test('string init makes + a concatenation fold', () => {
    const r = parseExpression("items.reduce((acc, x) => acc + x.label, '')")
    expect(r.kind).toBe('array-method')
    if (r.kind === 'array-method' && r.method === 'reduce') {
      expect(r.reduceOp.op).toBe('+')
      expect(r.reduceOp.type).toBe('string')
      expect(r.reduceOp.init).toBe("''")
    }
  })

  test('single-return block body unwraps to the fold expression', () => {
    const r = parseExpression('items.reduce((sum, t) => { return sum + t.n }, 0)')
    expect(r.kind).toBe('array-method')
    if (r.kind === 'array-method' && r.method === 'reduce') {
      expect(r.reduceOp.key).toEqual({ kind: 'field', field: 'n' })
    }
  })

  test('negative numeric init is accepted', () => {
    const r = parseExpression('nums.reduce((a, b) => a + b, -1)')
    expect(r.kind).toBe('array-method')
    if (r.kind === 'array-method' && r.method === 'reduce') {
      expect(r.reduceOp.init).toBe('-1')
    }
  })

  test('round-trips back to valid JS via stringifyParsedExpr', () => {
    const src = 'items.reduce((sum, t) => sum + t.duration, 0)'
    const r = parseExpression(src)
    expect(stringifyParsedExpr(r)).toBe('items.reduce((sum,t) => sum + t.duration, 0)')
  })

  describe('refused shapes → unsupported (BF101)', () => {
    test('missing initial value', () => {
      // A no-init reduce isn't intercepted (it needs 2 args); it falls
      // through to a generic `call` that the UNSUPPORTED_METHODS gate
      // refuses — JS throws on an empty array here, so a template can't
      // mirror it cleanly.
      const r = parseExpression('items.reduce((sum, t) => sum + t.duration)')
      expect(isSupported(r).supported).toBe(false)
    })

    test('string concat with * is rejected', () => {
      const r = parseExpression("items.reduce((acc, x) => acc * x.label, '')")
      expect(r.kind).toBe('unsupported')
    })

    test('accumulator on the right operand is rejected', () => {
      const r = parseExpression('items.reduce((sum, t) => t.duration + sum, 0)')
      expect(r.kind).toBe('unsupported')
    })

    test('non-literal init is rejected', () => {
      const r = parseExpression('items.reduce((sum, t) => sum + t.n, start)')
      expect(r.kind).toBe('unsupported')
    })

    test('object-building reducer is rejected', () => {
      const r = parseExpression('items.reduce((acc, x) => ({ ...acc, [x.id]: x }), {})')
      expect(r.kind).toBe('unsupported')
    })

    test('deep field access is rejected', () => {
      const r = parseExpression('items.reduce((sum, t) => sum + t.a.b, 0)')
      expect(r.kind).toBe('unsupported')
    })

    test('reduceRight stays refused (not in the Tier C landing)', () => {
      const r = parseExpression('items.reduce((sum, t) => sum + t.n, 0)')
      expect(r.kind).toBe('array-method')
      const rr = parseExpression('items.reduceRight((sum, t) => sum + t.n, 0)')
      // reduceRight isn't intercepted; it falls through to a generic
      // call whose member callee is in UNSUPPORTED_METHODS.
      expect(isSupported(rr).supported).toBe(false)
    })
  })
})

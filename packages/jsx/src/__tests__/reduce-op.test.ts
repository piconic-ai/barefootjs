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

  test('string init makes + a concatenation fold (init is the decoded value)', () => {
    const r = parseExpression("items.reduce((acc, x) => acc + x.label, '')")
    expect(r.kind).toBe('array-method')
    if (r.kind === 'array-method' && r.method === 'reduce') {
      expect(r.reduceOp.op).toBe('+')
      expect(r.reduceOp.type).toBe('string')
      expect(r.reduceOp.init).toBe('') // decoded contents, not the `''` source
    }
  })

  test('non-empty string seed decodes to its contents', () => {
    const r = parseExpression("items.reduce((acc, x) => acc + x.label, ', ')")
    expect(r.kind).toBe('array-method')
    if (r.kind === 'array-method' && r.method === 'reduce') {
      expect(r.reduceOp.init).toBe(', ')
    }
  })

  test('numeric init normalises separators / radix to canonical decimal', () => {
    // `.text` gives TS's canonical decimal so Go ParseFloat + Perl agree
    // (#1728 review: raw `1_000` / `0x10` would mis-parse on Go).
    for (const [src, expected] of [
      ['1_000', '1000'],
      ['0x10', '16'],
      ['1e3', '1000'],
    ] as const) {
      const r = parseExpression(`nums.reduce((a, b) => a + b, ${src})`)
      expect(r.kind).toBe('array-method')
      if (r.kind === 'array-method' && r.method === 'reduce') {
        expect(r.reduceOp.init).toBe(expected)
      }
    }
  })

  test('parenthesized numeric init is unwrapped and accepted', () => {
    for (const [src, expected] of [
      ['(0)', '0'],
      ['(-1)', '-1'],
    ] as const) {
      const r = parseExpression(`nums.reduce((a, b) => a + b, ${src})`)
      expect(r.kind).toBe('array-method')
      if (r.kind === 'array-method' && r.method === 'reduce') {
        expect(r.reduceOp.init).toBe(expected)
      }
    }
  })

  test('an escape-free seed containing an apostrophe is accepted (decoded contents kept)', () => {
    // `"a'b"` is escape-free (decoded === raw inner), so it's accepted;
    // the decoded value carries the apostrophe, which the Mojo emit
    // single-quote-escapes.
    const r = parseExpression(`items.reduce((acc, x) => acc + x.l, "a'b")`)
    expect(r.kind).toBe('array-method')
    if (r.kind === 'array-method' && r.method === 'reduce') {
      expect(r.reduceOp.init).toBe("a'b")
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

  test('round-trips a numeric fold back to valid JS via stringifyParsedExpr', () => {
    const r = parseExpression('items.reduce((sum, t) => sum + t.duration, 0)')
    expect(stringifyParsedExpr(r)).toBe('items.reduce((sum,t) => sum + t.duration, 0)')
  })

  test('round-trips a string fold by re-quoting the decoded seed', () => {
    const r = parseExpression("items.reduce((a, x) => a + x.l, ', ')")
    // Decoded seed `, ` re-quoted via JSON.stringify → a valid JS string.
    expect(stringifyParsedExpr(r)).toBe('items.reduce((a,x) => a + x.l, ", ")')
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

    test('string seed carrying an escape is rejected (cross-adapter safety)', () => {
      // A seed with an escape can't be guaranteed byte-equal across the
      // Go-template / Perl string embeddings without per-target decoding,
      // so it refuses to `unsupported` rather than risk divergence.
      const r = parseExpression("items.reduce((acc, x) => acc + x.l, '\\n')")
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

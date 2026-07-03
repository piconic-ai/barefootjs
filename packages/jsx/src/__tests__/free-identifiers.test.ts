import { parseExpression, freeIdentifiers } from '../expression-parser'

/**
 * `freeIdentifiers` pins the LEXICALLY-SCOPED free-identifier walk used by the
 * Perl-family seed-scope guard (Mojo / Xslate `tryLowerToPerl` / `tryLowerToKolon`,
 *): a name bound by an arrow's own params is free
 * OUTSIDE that arrow's body but bound WITHIN it, and an `unsupported` node
 * makes the whole result unanalyzable (`null`) so callers fail safe.
 */

describe('freeIdentifiers', () => {
  test('simple identifiers are free', () => {
    const expr = parseExpression('a + b.c')
    expect(freeIdentifiers(expr)).toEqual(new Set(['a', 'b']))
  })

  test('an arrow param is bound inside its own body but free outside it', () => {
    // The `filter((p) => p.ok) && p` shape : the outer `p` is a
    // DIFFERENT (unbound) reference from the callback's own `p` param.
    const expr = parseExpression('props.items.filter((p) => p.ok) && p')
    expect(freeIdentifiers(expr)).toEqual(new Set(['props', 'p']))
  })

  test('an arrow param fully shadowed inside its body reports no free callback ref', () => {
    const expr = parseExpression('items.filter((p) => p.ok)')
    expect(freeIdentifiers(expr)).toEqual(new Set(['items']))
  })

  test('nested arrows accumulate params from every enclosing scope', () => {
    // `a` and `b` are both bound within the innermost body; only `outer` is free.
    const expr = parseExpression('items.filter((a) => other.filter((b) => a + b + outer))')
    expect(freeIdentifiers(expr)).toEqual(new Set(['items', 'other', 'outer']))
  })

  test('member property names are not references; object-literal keys are not either', () => {
    const expr = parseExpression('({ total: item.price, tax: rate })')
    expect(freeIdentifiers(expr)).toEqual(new Set(['item', 'rate']))
  })

  test('a builtin callee (Math.floor) is not reported as free; its args are', () => {
    const expr = parseExpression('Math.floor(n)')
    expect(freeIdentifiers(expr)).toEqual(new Set(['n']))
  })

  test('a non-builtin call callee IS a free reference', () => {
    const expr = parseExpression('someFn(x)')
    expect(freeIdentifiers(expr)).toEqual(new Set(['someFn', 'x']))
  })

  test('an unsupported node makes the whole tree unanalyzable', () => {
    // A block-bodied arrow with imperative statements parses as `unsupported`.
    const expr = parseExpression('(() => { for (;;) {} })()')
    expect(freeIdentifiers(expr)).toBeNull()
  })
})

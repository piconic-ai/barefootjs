/**
 * Printing a `ParsedExpr` keeps its tree (#3965). The parser drops
 * parentheses, so `exprToString` and `stringifyParsedExpr` must put back
 * the ones the tree's shape needs: `(size ? A : B).xmlns` printed as
 * `size ? A : B.xmlns` reads `.xmlns` on the last arm only.
 *
 * Each case parses a source, prints it with both printers, and re-parses
 * the printed text: the re-parsed tree must equal the original. A case also
 * pins the printed text, so a printer that adds parentheses nowhere needed
 * is caught too.
 */
import { describe, test, expect } from 'bun:test'
import { exprToString, parseExpression, stringifyParsedExpr, type ParsedExpr } from '../expression-parser'

const PRINTERS = { exprToString, stringifyParsedExpr } as const

function expectRoundTrip(source: string, printed: string = source): void {
  const tree = parseExpression(source)
  for (const [name, print] of Object.entries(PRINTERS)) {
    const text = print(tree)
    expect({ name, text }).toEqual({ name, text: printed })
    expect({ name, reparsed: parseExpression(text) }).toEqual({ name, reparsed: tree })
  }
}

/** One operand of each kind that binds looser than member access. */
const LOW_PRECEDENCE_OPERANDS = [
  'size ? A : B',
  'a && b',
  'a || b',
  'a ?? b',
  'a + b',
  'a * b',
  'a === b',
  'a < b',
  '!a',
  '-a',
  'x => x',
]

describe('a member / call / index read on a low-precedence operand', () => {
  for (const operand of LOW_PRECEDENCE_OPERANDS) {
    test(`(${operand})`, () => {
      expectRoundTrip(`(${operand}).k`)
      expectRoundTrip(`(${operand})[i]`)
      expectRoundTrip(`(${operand})(x)`)
      expectRoundTrip(`(${operand}).join(",")`)
      expectRoundTrip(`(${operand}).flat(2)`)
    })
  }

  test('a computed literal key keeps the grouping', () => {
    expect(stringifyParsedExpr(parseExpression('(a ? b : c)[0]'))).toBe('(a ? b : c)[0]')
    expect(stringifyParsedExpr(parseExpression('(a || b)["k"]'))).toBe('(a || b)["k"]')
  })

  test('a higher-order call on a logical receiver', () => {
    expectRoundTrip('(a || b).filter(x => x.on)')
  })

  test('a primary or postfix receiver needs no parentheses', () => {
    expectRoundTrip('a.b(c).d')
    expectRoundTrip('a[i].k')
    expectRoundTrip('f(x)(y)')
    expectRoundTrip('[a, b].join(",")')
    expectRoundTrip('"ab".length')
    expectRoundTrip('((a)).k', 'a.k')
  })

  test('a number literal receiver of a `.` read', () => {
    expectRoundTrip('(1).toFixed(2)')
    expectRoundTrip('(1.5).toFixed(2)')
    expect(stringifyParsedExpr(parseExpression('(1)[0]'))).toBe('1[0]')
  })

  test('the issue shape, as the inlining of a local const builds it', () => {
    // `const sizeAttrs = size ? { … } : {}` inlined into `sizeAttrs.xmlns`.
    const tree: ParsedExpr = {
      kind: 'member',
      object: {
        kind: 'conditional',
        test: { kind: 'identifier', name: 'size' },
        consequent: { kind: 'identifier', name: 'A' },
        alternate: { kind: 'identifier', name: 'B' },
      },
      property: 'xmlns',
      computed: false,
      optional: false,
    }
    expect(exprToString(tree)).toBe('(size ? A : B).xmlns')
    expect(stringifyParsedExpr(tree)).toBe('(size ? A : B).xmlns')
  })
})

describe('binary and logical operands', () => {
  test('a looser operand on either side', () => {
    expectRoundTrip('(a + b) * c')
    expectRoundTrip('c * (a + b)')
    expectRoundTrip('(a || b) && c')
    expectRoundTrip('(a ? b : c) + d')
    expectRoundTrip('d + (a ? b : c)')
    expectRoundTrip('(x => x) || y')
  })

  test('a right operand at the same level (left associativity)', () => {
    expectRoundTrip('a - (b - c)')
    expectRoundTrip('a - b - c')
    expectRoundTrip('a / (b * c)')
    expectRoundTrip('a === (b === c)')
    expectRoundTrip('a || (b || c)')
  })

  test('a tighter operand needs no parentheses', () => {
    expectRoundTrip('a + b * c')
    expectRoundTrip('a === b && c < d')
    expectRoundTrip('a || b && c')
    expectRoundTrip('a ?? b.c')
  })

  test('`??` mixed with `&&` / `||` keeps its parentheses', () => {
    expectRoundTrip('(a ?? b) || c')
    expectRoundTrip('a ?? (b || c)')
    expectRoundTrip('(a && b) ?? c')
    expectRoundTrip('a ?? (b && c)')
    expectRoundTrip('a ?? b ?? c')
  })
})

describe('unary operands', () => {
  test('a looser operand', () => {
    expectRoundTrip('!(a && b)')
    expectRoundTrip('-(a + b)')
    expectRoundTrip('!(a ? b : c)')
  })

  test('a nested sign that would print as `--` / `++`', () => {
    expectRoundTrip('-(-a)')
    expectRoundTrip('+(+a)')
    expectRoundTrip('-(+a)', '-+a')
    expectRoundTrip('!(!a)', '!!a')
  })

  test('a negative number literal', () => {
    const negative: ParsedExpr = { kind: 'literal', value: -1, literalType: 'number' }
    for (const print of Object.values(PRINTERS)) {
      expect(print({ kind: 'unary', op: '-', argument: negative })).toBe('-(-1)')
      expect(print({ kind: 'unary', op: '+', argument: negative })).toBe('+-1')
      expect(print({ kind: 'member', object: negative, property: 'k', computed: false, optional: false })).toBe('(-1).k')
    }
  })
})

describe('conditional operands', () => {
  test('a conditional or arrow test', () => {
    expectRoundTrip('(a ? b : c) ? d : e')
    expectRoundTrip('(x => x) ? a : b')
  })

  test('nested conditionals in the branches need no parentheses', () => {
    expectRoundTrip('a ? b : c ? d : e')
    expectRoundTrip('a ? (b ? c : d) : e', 'a ? b ? c : d : e')
    expectRoundTrip('a ?? b ? c : d')
    expectRoundTrip('a ? x => x : y')
  })
})

describe('arrow bodies, arguments and elements', () => {
  test('an arrow body at assignment level needs no parentheses', () => {
    expectRoundTrip('xs.map(x => x ? a : b)')
    expectRoundTrip('xs.map(x => y => x + y)')
  })

  test('an object-literal arrow body', () => {
    const tree: ParsedExpr = {
      kind: 'arrow',
      params: ['x'],
      body: { kind: 'object-literal', raw: '{ a: x }', properties: [{ kind: 'prop', key: 'a', keyKind: 'identifier', shorthand: false, value: { kind: 'identifier', name: 'x' } }] },
    }
    expect(stringifyParsedExpr(tree)).toBe('x => ({ a: x })')
  })

  test('low-precedence arguments, elements and template parts need no parentheses', () => {
    expectRoundTrip('f(a ? b : c, x => x)')
    expectRoundTrip('[a || b, a + b]')
    expectRoundTrip('`${(a ? b : c).k}`')
  })
})

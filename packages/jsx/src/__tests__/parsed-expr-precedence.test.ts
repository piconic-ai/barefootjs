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
import ts from 'typescript'
import { exprToString, parseExpression, renameFreeIdentifiers, stringifyParsedExpr, tsNodeToParsedExpr, type ParsedExpr } from '../expression-parser'

const PRINTERS = { exprToString, stringifyParsedExpr } as const

function expectRoundTrip(source: string, printed: string = source): void {
  const tree = parseExpression(source)
  for (const [name, print] of Object.entries(PRINTERS)) {
    const text = print(tree)
    expect({ name, text }).toEqual({ name, text: printed })
    expect({ name, reparsed: parseExpression(text) }).toEqual({ name, reparsed: tree })
  }
}

/**
 * `stringifyParsedExpr` prints `source` back as written and re-parses to the
 * same tree. (`exprToString` prints an object literal as a placeholder, so
 * only its text is pinned.)
 */
function expectStringifyRoundTrip(source: string): void {
  const tree = parseExpression(source)
  const text = stringifyParsedExpr(tree)
  expect(text).toBe(source)
  expect(parseExpression(text)).toEqual(tree)
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

  test('a computed literal key keeps its brackets and the grouping', () => {
    expectRoundTrip('(flag ? a : b)[0]')
    expectRoundTrip('(a || b)["k"]')
    expectRoundTrip('x[0]')
    expectRoundTrip("x['a-b']", 'x["a-b"]')
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
    // A nested object literal keeps the parentheses its source wrote, not the
    // whole expression's text, so printing does not splice the expression
    // back in and adds no second pair.
    expectStringifyRoundTrip('x => ({ a: x })')
    expectStringifyRoundTrip('xs.map(x => ({ a: x }))')
    expect(exprToString(parseExpression('x => ({ a: x })'))).toBe('x => ([UNSUPPORTED: ({ a: x })])')
  })

  test('low-precedence arguments, elements and template parts need no parentheses', () => {
    expectRoundTrip('f(a ? b : c, x => x)')
    expectRoundTrip('[a || b, a + b]')
    expectRoundTrip('`${(a ? b : c).k}`')
  })
})

describe('a nested node the parser leaves unsupported', () => {
  test('keeps its own source text and is grouped as an operand', () => {
    const tree = parseExpression('(await a).k')
    expect(stringifyParsedExpr(tree)).toBe('(await a).k')
    expect(parseExpression(stringifyParsedExpr(tree))).toEqual(tree)
    expect(exprToString(tree)).toBe('([UNSUPPORTED: await a]).k')
  })

  test('is not wrapped as an argument', () => {
    expect(stringifyParsedExpr(parseExpression('f(typeof x, y)'))).toBe('f(typeof x, y)')
  })

  test('a top-level unsupported expression keeps the text it was parsed from', () => {
    expect(stringifyParsedExpr(parseExpression('typeof (a + b)'))).toBe('typeof (a + b)')
  })
})

describe('an object literal', () => {
  // Printed from its properties, grouped only where a leading `{` would read
  // as a block: a receiver, a concise arrow body, the start of the text.
  const print = (source: string) => stringifyParsedExpr(parseExpression(source))

  test('a receiver, with one pair whether or not the source wrote extra', () => {
    expectStringifyRoundTrip('({ a: 1 }).a')
    expectStringifyRoundTrip('({ a: 1 })["a"]')
    expect(print("({ a: 1 })['a']")).toBe('({ a: 1 })["a"]')
    expect(print('(({ a: 1 })).a')).toBe('({ a: 1 }).a')
    expect(exprToString(parseExpression('({ a: 1 }).a'))).toBe('([UNSUPPORTED: ({ a: 1 })]).a')
    expect(exprToString(parseExpression("({ a: 1 })['a']"))).toBe('([UNSUPPORTED: ({ a: 1 })])["a"]')
  })

  test('a concise arrow body', () => {
    expectStringifyRoundTrip('() => ({ a: 1 }).a')
    expectStringifyRoundTrip('x => ({ a: x })')
    expectStringifyRoundTrip('xs.map(x => ({ a: x }))')
    expect(exprToString(parseExpression('() => ({ a: 1 }).a'))).toBe('() => ([UNSUPPORTED: ({ a: 1 })]).a')
  })

  test('a block body collapsed to its returned literal', () => {
    for (const source of ['() => { return { a: 1 } }', '() => { return ({ a: 1 }) }']) {
      expect(print(source)).toBe('() => ({ a: 1 })')
      expect(exprToString(parseExpression(source))).toBe('() => ([UNSUPPORTED: ({ a: 1 })])')
    }
    expect(print('f(function () { return { a: 1 } })')).toBe('f(() => ({ a: 1 }))')
    expect(print('() => { return { a: 1, b: 2 } }')).toBe('() => ({ a: 1, b: 2 })')
    // A folded block substitutes its locals into the literal's properties.
    expect(print('() => { const t = 1; return { a: t } }')).toBe('() => ({ a: 1 })')
  })

  test('the start of the printed text', () => {
    expectStringifyRoundTrip('({ a: 1 })')
    // A literal leading a longer expression groups the whole printed text.
    for (const [source, printed] of [['({ a: 1 }) === x', '({ a: 1 } === x)'], ['({ a: 1 }) ? b : c', '({ a: 1 } ? b : c)']]) {
      expect(print(source)).toBe(printed)
      expect(parseExpression(printed)).toEqual(parseExpression(source))
    }
    expectStringifyRoundTrip('({ a: 1 }).a + 1')
    expectStringifyRoundTrip('({ a: { b: 1 } })')
  })

  test('a position where bare braces read as an expression stays bare', () => {
    expectStringifyRoundTrip('f({ a: 1 })')
    expectStringifyRoundTrip('[{ a: 1 }]')
    expectStringifyRoundTrip('q(base, { tag })')
    expectStringifyRoundTrip('c ? { a: 1 } : { b: 2 }')
    expectStringifyRoundTrip('x === { a: 1 }')
  })

  test('keys, shorthand, spread and an empty literal', () => {
    expect(print("({ 'a-b': 1, 2: x, c, ...o })")).toBe('({ "a-b": 1, 2: x, c, ...o })')
    expectStringifyRoundTrip('({})')
    expectStringifyRoundTrip('({ a: (b, c) => b })')
  })

  test('a rewrite of the properties is printed, not the source text', () => {
    const renamed = renameFreeIdentifiers(parseExpression('x => ({ a: name, name })'), new Map([['name', 'alias']]))
    expect(stringifyParsedExpr(renamed)).toBe('x => ({ a: alias, name: alias })')
  })

  test('a bare literal converted from a node at the top level', () => {
    const sf = ts.createSourceFile('a.ts', 'const o = { a: 1 }', ts.ScriptTarget.Latest, true)
    const decl = (sf.statements[0] as ts.VariableStatement).declarationList.declarations[0]
    expect(stringifyParsedExpr(tsNodeToParsedExpr(decl.initializer!))).toBe('({ a: 1 })')
  })

  test('a literal with a computed key, which stays unsupported, is grouped as an arrow body', () => {
    expect(print('x => ({ [k]: 1 })')).toBe('x => ({ [k]: 1 })')
  })
})


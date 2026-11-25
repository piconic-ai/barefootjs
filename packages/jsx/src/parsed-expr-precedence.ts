/**
 * Where a printed `ParsedExpr` needs parentheses to keep its tree (#3965).
 *
 * The parser drops a `ParenthesizedExpression` and keeps only the grouping
 * the tree's shape implies, so a printer that writes each child as-is loses
 * it: `(size ? A : B).xmlns` printed as `size ? A : B.xmlns` reads `.xmlns`
 * on the last arm only. Both JS printers (`exprToString` and
 * `stringifyParsedExpr`, `expression-parser.ts`) ask this ONE module which
 * child positions need parentheses, so they cannot drift apart.
 *
 * Levels follow the ECMAScript grammar (higher binds tighter). Only the
 * levels a `ParsedExpr` can carry are listed; a `binary` op the parser does
 * not name (`'unknown'`: `**`, `,`, `=`, bitwise, …) is placed at the lowest
 * level, so it is wrapped wherever it is an operand.
 */

import type { ParsedExpr } from './expression-parser.ts'

const SEQUENCE = 1
/** Assignment level: an arrow function and a conditional expression. */
const ASSIGNMENT = 2
const PREFIX = 14
/** Member access, call, and every primary expression. */
const POSTFIX = 17

const LOGICAL_PRECEDENCE: Readonly<Record<'&&' | '||' | '??', number>> = { '??': 3, '||': 3, '&&': 4 }

const BINARY_PRECEDENCE: ReadonlyMap<string, number> = new Map([
  ['==', 8], ['!=', 8], ['===', 8], ['!==', 8],
  ['<', 9], ['>', 9], ['<=', 9], ['>=', 9],
  ['+', 11], ['-', 11],
  ['*', 12], ['/', 12], ['%', 12],
])

function isNumberLiteral(expr: ParsedExpr): expr is Extract<ParsedExpr, { kind: 'literal' }> & { value: number } {
  return expr.kind === 'literal' && expr.literalType === 'number' && typeof expr.value === 'number'
}

/** A number literal whose printed text starts with `-` (a synthesized `-1`, not the unary `-` over `1`). */
function isNegativeNumberLiteral(expr: ParsedExpr): boolean {
  return isNumberLiteral(expr) && (expr.value < 0 || Object.is(expr.value, -0))
}

/** The grammar level a printed `expr` sits at. */
export function parsedExprPrecedence(expr: ParsedExpr): number {
  switch (expr.kind) {
    case 'arrow':
    case 'conditional':
      return ASSIGNMENT
    case 'logical':
      return LOGICAL_PRECEDENCE[expr.op]
    case 'binary':
      return BINARY_PRECEDENCE.get(expr.op) ?? SEQUENCE
    case 'unary':
      return PREFIX
    case 'literal':
      return isNegativeNumberLiteral(expr) ? PREFIX : POSTFIX
    // `unsupported` prints its own source text (`await a`, `typeof x`, `new
    // C()`), whose level the tree does not record: placed at assignment level,
    // the loosest a node the parser leaves unsupported can be, so it is wrapped
    // as an operand but not as an argument or a branch.
    case 'unsupported':
      return ASSIGNMENT
    // `object-literal` prints its `raw`, which carries the parentheses its
    // source wrote (`objectLiteralRaw`, `expression-parser.ts`), so it is
    // never wrapped here.
    default:
      return POSTFIX
  }
}

/**
 * `object` is the receiver of a member read, an index read, a method call
 * or a call (`object.k`, `object[i]`, `object.m()`, `object()`). `dotted` is
 * true when a `.` follows it: an integer literal then needs parentheses too,
 * since `1.k` lexes as the number `1.` followed by `k`.
 */
export function receiverNeedsParens(object: ParsedExpr, dotted: boolean): boolean {
  if (parsedExprPrecedence(object) < POSTFIX) return true
  return dotted && isNumberLiteral(object)
}

/**
 * `argument` is the operand of the prefix `op`. Beyond precedence, a `-` or
 * `+` over an operand that itself starts with the same sign would print as
 * the `--` / `++` token (`-(-a)` → `--a`).
 */
export function unaryArgumentNeedsParens(op: string, argument: ParsedExpr): boolean {
  if (parsedExprPrecedence(argument) < PREFIX) return true
  if (op !== '-' && op !== '+') return false
  if (argument.kind === 'unary') return argument.op === op
  return op === '-' && isNegativeNumberLiteral(argument)
}

/** `??` cannot share an operand with `&&` / `||` without parentheses: `a ?? b || c` is a SyntaxError. */
function mixesNullishWithLogical(parent: ParsedExpr, operand: ParsedExpr): boolean {
  if (parent.kind !== 'logical' || operand.kind !== 'logical') return false
  return (parent.op === '??') !== (operand.op === '??')
}

/**
 * `operand` is the `side` operand of the binary or logical `parent`. Every
 * operator a `ParsedExpr` names is left-associative, so a right operand at
 * the parent's own level needs parentheses (`a - (b - c)`), a left one does
 * not (`a - b - c`).
 */
export function binaryOperandNeedsParens(parent: ParsedExpr, operand: ParsedExpr, side: 'left' | 'right'): boolean {
  if (mixesNullishWithLogical(parent, operand)) return true
  const own = parsedExprPrecedence(parent)
  const child = parsedExprPrecedence(operand)
  return side === 'left' ? child < own : child <= own
}

/** `test` is a conditional's test, which binds tighter than the conditional itself: `(a ? b : c) ? d : e`. */
export function conditionalTestNeedsParens(test: ParsedExpr): boolean {
  return parsedExprPrecedence(test) <= ASSIGNMENT
}

/**
 * `item` is a conditional's branch, a call argument or an array element: any
 * expression at assignment level or above. Only a sequence needs parentheses.
 */
export function assignmentOperandNeedsParens(item: ParsedExpr): boolean {
  return parsedExprPrecedence(item) < ASSIGNMENT
}

/**
 * `body` is an arrow's expression body: any expression at assignment level.
 * An object literal there (`x => ({ a: 1 })`) is not wrapped here: its
 * `raw` already carries the parentheses its source wrote
 * (`objectLiteralRaw`, `expression-parser.ts`), the one place that decides
 * an object literal's grouping.
 */
export function arrowBodyNeedsParens(body: ParsedExpr): boolean {
  return assignmentOperandNeedsParens(body)
}

/** `text` in parentheses when `wrap` is true. */
export function parenthesize(text: string, wrap: boolean): string {
  return wrap ? `(${text})` : text
}

/**
 * The spread elements of a module-scope array const, expanded in its parsed
 * tree (#3979): `const ALL = [...BASE, 'z']` with `const BASE = ['y']` is
 * read as `['y', 'z']` by everything that reads `ConstantInfo.parsed` (the
 * computed-const inlining of a memo or signal seed, the static evaluator,
 * the literal const member reads, Go's constructor, a loop over the const).
 *
 * A spread element has no `ParsedExpr` form: it parses to an `unsupported`
 * element, which no template lowers, so before this every read of such a
 * const rendered empty (`0` on Go) where JS renders the computed array. JS
 * copies the source's elements at the spread's position when the const is
 * declared, so the expansion is exact for a source whose elements are known
 * then. Phase 1 decides it once, here; the adapters only read the result.
 *
 * Expanded, in place, are a spread of:
 *   - a module-scope `const` declared before this one whose parsed value is
 *     an array literal with every element known (itself expanded first, so a
 *     chain of spreads resolves), and which no statement writes;
 *   - an inline array literal (`...['x']`), with its own spreads expanded the
 *     same way.
 * Anything else (a call, an import, a `let`, a member, a string, a const
 * declared later, which JS reads in its TDZ) stays `unsupported`, as before.
 *
 * Only `parsed` changes. `value`, the source text the client bundle
 * declares, keeps the spread, so the client still shares the source's
 * element objects.
 */

import ts from 'typescript'
import { parseExpression, type ParsedExpr } from './expression-parser.ts'
import type { ConstantInfo } from './types.ts'

/** A module-scope const whose array literal initializer has a spread element. */
export interface ModuleArraySpread {
  constant: ConstantInfo
  literal: ts.ArrayLiteralExpression
}

/** Spreads of spreads past this depth are left unexpanded (an inline nesting this deep is not a realistic const). */
const MAX_INLINE_DEPTH = 8

/** Record `constant` in `spreads` when it is a module const whose initializer is an array literal with a spread element. */
export function recordModuleArraySpread(
  constant: ConstantInfo,
  initializer: ts.Expression | undefined,
  spreads: ModuleArraySpread[],
): void {
  const literal = constant.isModule ? arrayLiteralWithSpread(initializer) : null
  if (literal) spreads.push({ constant, literal })
}

/** The array literal `initializer` is, under parentheses and type assertions, when it has a spread element. */
function arrayLiteralWithSpread(initializer: ts.Expression | undefined): ts.ArrayLiteralExpression | null {
  const literal = initializer ? unwrap(initializer) : null
  return literal && ts.isArrayLiteralExpression(literal) && literal.elements.some(ts.isSpreadElement) ? literal : null
}

/**
 * Expand the spreads of each const in `spreads`, in declaration order, so a
 * const spreading an earlier one reads that one's expanded elements.
 * `constants` is every collected const; `getJS` gives a node's JS text.
 */
export function expandModuleArraySpreads(
  spreads: readonly ModuleArraySpread[],
  constants: readonly ConstantInfo[],
  getJS: (node: ts.Node) => string,
): void {
  for (const { constant, literal } of spreads) {
    if (constant.parsed?.kind !== 'array-literal') continue
    const declaredBefore = constants.filter(c => c.isModule).slice(0, moduleIndex(constant, constants))
    const elements = expandElements(literal, constant.parsed.elements, { declaredBefore, getJS }, 0)
    if (elements) constant.parsed = { kind: 'array-literal', elements }
  }
}

interface ExpandContext {
  /** The module consts declared before the one being expanded: the only ones its initializer can read. */
  declaredBefore: readonly ConstantInfo[]
  getJS: (node: ts.Node) => string
}

function moduleIndex(constant: ConstantInfo, constants: readonly ConstantInfo[]): number {
  return constants.filter(c => c.isModule).indexOf(constant)
}

/**
 * `parsed` (the elements `literal` parses to, one per element) with each
 * spread this can resolve replaced by the source's elements. `null` when
 * the two do not line up, so the caller keeps the tree it has.
 */
function expandElements(
  literal: ts.ArrayLiteralExpression,
  parsed: readonly ParsedExpr[],
  ctx: ExpandContext,
  depth: number,
): ParsedExpr[] | null {
  if (parsed.length !== literal.elements.length) return null
  const out: ParsedExpr[] = []
  literal.elements.forEach((element, i) => {
    const source = ts.isSpreadElement(element) ? spreadElements(element.expression, ctx, depth) : null
    if (source) out.push(...source)
    else out.push(parsed[i])
  })
  return out
}

/** The elements a spread of `expr` contributes, or `null` when they are not known at compile time. */
function spreadElements(expr: ts.Expression, ctx: ExpandContext, depth: number): readonly ParsedExpr[] | null {
  const source = unwrap(expr)
  if (ts.isIdentifier(source)) {
    const constant = ctx.declaredBefore.find(c => c.name === source.text)
    if (!constant || constant.declarationKind !== 'const' || constant.mutatedAfterDeclaration) return null
    return knownElements(constant.parsed)
  }
  if (ts.isArrayLiteralExpression(source) && depth < MAX_INLINE_DEPTH) {
    const parsed = parseExpression(`(${ctx.getJS(source)})`)
    if (parsed.kind !== 'array-literal') return null
    return knownElements({ kind: 'array-literal', elements: expandElements(source, parsed.elements, ctx, depth + 1) ?? parsed.elements })
  }
  return null
}

/** The elements of an array literal whose every element is known (no spread or hole left). */
function knownElements(value: ParsedExpr | undefined): readonly ParsedExpr[] | null {
  if (value?.kind !== 'array-literal' || value.elements.some(e => e.kind === 'unsupported')) return null
  return value.elements
}

function unwrap(expr: ts.Expression): ts.Expression {
  let e = expr
  while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isNonNullExpression(e)) {
    e = e.expression
  }
  return e
}

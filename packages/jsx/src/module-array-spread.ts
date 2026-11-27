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
 * The expansion is bounded: a spread whose elements would take an array past
 * {@link MAX_EXPANDED_ELEMENTS}, or the module's expansions together past
 * {@link MAX_EXPANDED_WEIGHT} parsed nodes, stays `unsupported` too. A chain
 * that spreads each array twice doubles the element count per declaration,
 * and every declaration is expanded whether or not a component reads it, so
 * without the bound a short file could exhaust the compiler.
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

/** The most elements one expanded array may hold; a spread that would go past it is left unexpanded. */
export const MAX_EXPANDED_ELEMENTS = 1024

/** The most parsed nodes the expansions of one module may copy in all; a spread that would go past it is left unexpanded. */
export const MAX_EXPANDED_WEIGHT = 16384

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
  if (spreads.length === 0) return
  const moduleConsts = constants.filter(c => c.isModule)
  const budget: ExpandBudget = { weight: MAX_EXPANDED_WEIGHT, sizes: new WeakMap(), weights: new WeakMap(), inline: new Map() }
  for (const { constant, literal } of spreads) {
    if (constant.parsed?.kind !== 'array-literal') continue
    const declaredBefore = moduleConsts.slice(0, moduleConsts.indexOf(constant))
    const elements = expandElements(literal, constant.parsed.elements, { declaredBefore, getJS, budget }, 0)
    if (elements) constant.parsed = { kind: 'array-literal', elements }
  }
}

/** What the expansions of one module may still copy, in parsed nodes, with the measures taken so far. */
interface ExpandBudget {
  weight: number
  /** Each parsed node's size, measured once. */
  sizes: WeakMap<object, number>
  /** Each known const's elements' total size, measured once. */
  weights: WeakMap<readonly ParsedExpr[], number>
  /** Each inline array literal's parse, done once. */
  inline: Map<ts.Node, ParsedExpr>
}

interface ExpandContext {
  /** The module consts declared before the one being expanded: the only ones its initializer can read. */
  declaredBefore: readonly ConstantInfo[]
  getJS: (node: ts.Node) => string
  budget: ExpandBudget
}

/**
 * What a spread would contribute if it were copied: its element count and
 * its weight in parsed nodes. Measuring copies nothing and takes nothing
 * from the budget, so looking at a spread the expansion then leaves alone
 * costs the module nothing.
 */
interface SpreadMeasure {
  count: number
  weight: number
}

/**
 * `parsed` (the elements `literal` parses to, one per element) with each
 * spread this can resolve replaced by the source's elements. `null` when
 * the two do not line up, so the caller keeps the tree it has.
 *
 * Every spread is measured first. A spread is copied only when the array
 * stays within {@link MAX_EXPANDED_ELEMENTS}, counting the elements before it
 * and the ones after it as many as they contribute (a known spread its
 * count, anything else one), and its weight fits what the module has left;
 * only then is the weight taken. A spread that does not fit keeps its
 * `unsupported` element, so the array is read as one with an unexpanded
 * spread.
 */
function expandElements(
  literal: ts.ArrayLiteralExpression,
  parsed: readonly ParsedExpr[],
  ctx: ExpandContext,
  depth: number,
): ParsedExpr[] | null {
  if (parsed.length !== literal.elements.length) return null
  const measures = literal.elements.map(element => ts.isSpreadElement(element) ? measureSpread(element.expression, ctx, depth) : null)
  let rest = measures.reduce((n, m) => n + (m ? m.count : 1), 0)
  const out: ParsedExpr[] = []
  literal.elements.forEach((element, i) => {
    const m = measures[i]
    // The elements after this one, as many as they contribute.
    rest -= m ? m.count : 1
    if (m && ts.isSpreadElement(element) && out.length + rest + m.count <= MAX_EXPANDED_ELEMENTS && m.weight <= ctx.budget.weight) {
      ctx.budget.weight -= m.weight
      copySpread(element.expression, ctx, out)
    } else {
      out.push(parsed[i])
    }
  })
  return out
}

/**
 * The count and weight a spread of `expr` would contribute, or `null` when
 * its elements are not known at compile time. A known const's elements are
 * already expanded (or left with an `unsupported` element), so it is read,
 * not walked again; an inline array literal is walked once per element,
 * and a count past the bound stops the walk.
 */
function measureSpread(expr: ts.Expression, ctx: ExpandContext, depth: number): SpreadMeasure | null {
  const source = unwrap(expr)
  if (ts.isIdentifier(source)) {
    const elements = constElements(source, ctx)
    return elements ? { count: elements.length, weight: elementsWeight(elements, ctx.budget) } : null
  }
  const literal = inlineLiteral(source, ctx, depth)
  if (!literal) return null
  const total: SpreadMeasure = { count: 0, weight: 0 }
  for (let i = 0; i < literal.node.elements.length; i++) {
    const element = literal.node.elements[i]
    const m = ts.isSpreadElement(element)
      ? measureSpread(element.expression, ctx, depth + 1)
      : knownElement(literal.parsed[i], ctx.budget)
    if (!m) return null
    total.count += m.count
    total.weight += m.weight
    if (total.count > MAX_EXPANDED_ELEMENTS) return total
  }
  return total
}

/** Append the elements a spread of `expr` contributes to `out`; `measureSpread` has found them known. */
function copySpread(expr: ts.Expression, ctx: ExpandContext, out: ParsedExpr[]): void {
  const source = unwrap(expr)
  if (ts.isIdentifier(source)) {
    for (const e of constElements(source, ctx) ?? []) out.push(e)
    return
  }
  const literal = ts.isArrayLiteralExpression(source) ? ctx.budget.inline.get(source) : undefined
  if (!literal || literal.kind !== 'array-literal' || !ts.isArrayLiteralExpression(source)) return
  source.elements.forEach((element, i) => {
    if (ts.isSpreadElement(element)) copySpread(element.expression, ctx, out)
    else out.push(literal.elements[i])
  })
}

/** The known elements of the const `name` reads, when it is one a spread of it can expand. */
function constElements(name: ts.Identifier, ctx: ExpandContext): readonly ParsedExpr[] | null {
  const constant = ctx.declaredBefore.find(c => c.name === name.text)
  if (!constant || constant.declarationKind !== 'const' || constant.mutatedAfterDeclaration) return null
  return knownElements(constant.parsed)
}

/** `source` as an inline array literal with its parse (one element per element), or `null`. */
function inlineLiteral(
  source: ts.Expression,
  ctx: ExpandContext,
  depth: number,
): { node: ts.ArrayLiteralExpression; parsed: readonly ParsedExpr[] } | null {
  if (!ts.isArrayLiteralExpression(source) || depth >= MAX_INLINE_DEPTH) return null
  let parsed = ctx.budget.inline.get(source)
  if (!parsed) {
    parsed = parseExpression(`(${ctx.getJS(source)})`)
    ctx.budget.inline.set(source, parsed)
  }
  if (parsed.kind !== 'array-literal' || parsed.elements.length !== source.elements.length) return null
  return { node: source, parsed: parsed.elements }
}

/** A plain element of an inline literal measured as one element, or `null` for a hole. */
function knownElement(element: ParsedExpr, budget: ExpandBudget): SpreadMeasure | null {
  return element.kind === 'unsupported' ? null : { count: 1, weight: nodeSize(element, budget.sizes) }
}

/** The total size of `elements`, measured once per array. */
function elementsWeight(elements: readonly ParsedExpr[], budget: ExpandBudget): number {
  const known = budget.weights.get(elements)
  if (known !== undefined) return known
  let weight = 0
  for (const e of elements) weight += nodeSize(e, budget.sizes)
  budget.weights.set(elements, weight)
  return weight
}

/** The number of parsed nodes under `node` (itself included), measured once per node object. */
function nodeSize(node: unknown, sizes: WeakMap<object, number>): number {
  if (node === null || typeof node !== 'object') return 0
  const known = sizes.get(node)
  if (known !== undefined) return known
  let size = 1
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) for (const v of value) size += nodeSize(v, sizes)
    else size += nodeSize(value, sizes)
  }
  sizes.set(node, size)
  return size
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

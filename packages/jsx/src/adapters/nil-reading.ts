/**
 * The nil-reading rewrite (`spec/js-primitive-semantics.md`, "Nil reading is
 * a tree rewrite"; #3824 step 4a in `spec/js-undefined-value.md`).
 *
 * Every runtime holds JS `null` and `undefined` as one nil, and its
 * primitive helpers (`to_number`, `to_string`, `plus`, the relational ones)
 * read that nil as `null`. Where Phase-1 types say which value a nil stands
 * for, and the consumer's coercion is known statically, the operand is
 * rewritten before planning so that it is never nil:
 *
 * | Consumer | nil reads as `null` | nil reads as `undefined` |
 * | --- | --- | --- |
 * | numeric (`- * / %`, unary `-` / `+`, relational, numeric `+`) | `x ?? 0` | `x ?? NaN` |
 * | string (`+` concatenation, template-literal part) | `x ?? 'null'` | `x ?? 'undefined'` |
 *
 * After the rewrite the operand is non-nil, so the plan can name the native
 * operator (`(n ?? NaN) * 2` stays native) and the helpers never need to
 * know about `undefined`.
 *
 * A `+` whose present branch concatenates and whose nil branch adds
 * (`o.id + 1` with `id?: string`) is split on nil by the numeric row:
 * `(o.id ?? NaN) + 1` is `NaN` for an omitted field and `'o1'` for a present
 * one, because the operand is then a string or a number and the plan takes
 * the runtime's `plus`, which decides per value. With a `null` reading the
 * nil branch is `0 + 1`, as JS's `null + 1`.
 *
 * What the rewrite leaves alone (`spec/js-undefined-value.md` §7 (4)):
 *
 * - A numeric operand whose nil may be either (`n?: number | null`): the
 *   template adapters refuse it with BF101 (#3700) where the coercion is
 *   static, and keep today's output elsewhere.
 * - A `+` whose other operand is neither a proven number nor a proven
 *   string: numeric addition or concatenation is decided at run time, and a
 *   nil reading as `undefined` cannot be told from `null` there. It keeps
 *   today's output (the runtime's `plus` reads the nil as `null`) until the
 *   runtimes carry `undefined` (#3848).
 * - A string operand whose nil may be either (`c?: string | null`): it keeps
 *   today's display reading, the empty string, until the runtimes carry
 *   `undefined` (#3848).
 * - A nil Phase 1 cannot type (an index read, an untyped value): the
 *   runtime's helpers read it as `null`.
 */

import type { ParsedExpr, TemplatePart } from '../expression-parser.ts'
import { operandFacts } from './primitive-plan.ts'
import type { NilReading, OperandFacts, ScopedOperandTyping } from './operand-typing.ts'

const NUMERIC_BINARY_OPS: ReadonlySet<string> = new Set(['-', '*', '/', '%', '**', '<', '<=', '>', '>='])

/** The literal `NaN`, which every emitter spells through its runtime's `number('NaN')`. */
export const NAN_LITERAL: ParsedExpr = { kind: 'literal', value: Number.NaN, literalType: 'number', raw: 'NaN' }

const ZERO_LITERAL: ParsedExpr = { kind: 'literal', value: 0, literalType: 'number', raw: '0' }

function stringLiteral(value: string): ParsedExpr {
  return { kind: 'literal', value, literalType: 'string' }
}

/** The reading of `facts`' nil, or null when the value is never nil or Phase 1 proves nothing about it. */
function readingOf(facts: OperandFacts): NilReading | null {
  if (facts.types.has('unknown') || !facts.types.has('nil')) return null
  return facts.nil ?? null
}

/** The types `facts` allow besides nil. */
function presentTypes(facts: OperandFacts): Set<string> {
  const types = new Set<string>(facts.types)
  types.delete('nil')
  return types
}

/** The `??` nodes the rewrite builds, so a target can check their left operand can hold nil. */
const NIL_READINGS = new WeakSet<ParsedExpr>()

/**
 * Whether `l ?? r` was built by the rewrite (its right operand is the
 * rewrite's fallback). A target whose host types an absent value as a
 * concrete zero (Go) must give `l` a nillable representation, or refuse:
 * the nil test would see a present `''` / `0` / `false` as absent.
 */
export function isNilReadingFallback(right: ParsedExpr): boolean {
  return NIL_READINGS.has(right)
}

/** `operand ?? fallback`; the fallback alone when the operand can only be nil. */
function coalesce(operand: ParsedExpr, facts: OperandFacts, fallback: ParsedExpr): ParsedExpr {
  if (presentTypes(facts).size === 0) return fallback
  const right: ParsedExpr = { ...fallback }
  NIL_READINGS.add(right)
  return { kind: 'logical', op: '??', left: operand, right }
}

/** An operand of a numeric consumer: its nil as `0` (`null`) or `NaN` (`undefined`). */
function numericOperand(operand: ParsedExpr, facts: OperandFacts): ParsedExpr {
  const reading = readingOf(facts)
  if (reading === 'null') return coalesce(operand, facts, ZERO_LITERAL)
  if (reading === 'undefined') return coalesce(operand, facts, NAN_LITERAL)
  return operand
}

/**
 * An operand of a string consumer: its nil as `'null'` / `'undefined'`, and
 * an `either` nil as today's display reading, the empty string (#3848).
 */
function stringOperand(operand: ParsedExpr, facts: OperandFacts): ParsedExpr {
  const reading = readingOf(facts)
  if (reading === null) return operand
  return coalesce(operand, facts, stringLiteral(reading === 'either' ? '' : reading))
}

const PRIMITIVE_TYPES: ReadonlySet<string> = new Set(['number', 'string', 'boolean'])

/** Whether `facts` prove exactly the one type `type`, never nil. */
function isExactly(facts: OperandFacts, type: string): boolean {
  return facts.types.size === 1 && facts.types.has(type as never)
}

/**
 * One operand of a `+` whose other operand has `other` facts: a string
 * consumer when the other is a proven string; a numeric consumer (the nil
 * split, for a string operand) when the other is a proven number and this
 * one is a primitive; left alone otherwise.
 */
function plusOperand(operand: ParsedExpr, facts: OperandFacts, other: OperandFacts): ParsedExpr {
  if (isExactly(other, 'string')) return stringOperand(operand, facts)
  if (!isExactly(other, 'number')) return operand
  const present = presentTypes(facts)
  return [...present].every(t => PRIMITIVE_TYPES.has(t)) ? numericOperand(operand, facts) : operand
}

function rewriteBinary(expr: Extract<ParsedExpr, { kind: 'binary' }>, typing: ScopedOperandTyping): ParsedExpr {
  const lf = operandFacts(expr.left, typing)
  const rf = operandFacts(expr.right, typing)
  let left = expr.left
  let right = expr.right
  if (NUMERIC_BINARY_OPS.has(expr.op)) {
    left = numericOperand(expr.left, lf)
    right = numericOperand(expr.right, rf)
  } else if (expr.op === '+') {
    left = plusOperand(expr.left, lf, rf)
    right = plusOperand(expr.right, rf, lf)
  }
  return left === expr.left && right === expr.right ? expr : { ...expr, left, right }
}

function rewriteTemplateLiteral(expr: Extract<ParsedExpr, { kind: 'template-literal' }>, typing: ScopedOperandTyping): ParsedExpr {
  let changed = false
  const parts: TemplatePart[] = expr.parts.map(part => {
    if (part.type !== 'expression') return part
    const rewritten = stringOperand(part.expr, operandFacts(part.expr, typing))
    if (rewritten === part.expr) return part
    changed = true
    return { ...part, expr: rewritten }
  })
  return changed ? { ...expr, parts } : expr
}

/**
 * `expr` with the operands of its own coercion rewritten by their nil
 * reading in `typing`'s scope; `expr` itself when nothing changes. Shallow:
 * only `expr`'s direct operands are rewritten, as `emitParsedExpr` calls it
 * at every node it dispatches. Idempotent: a rewritten operand is never nil.
 */
export function rewriteNilReadings(expr: ParsedExpr, typing: ScopedOperandTyping): ParsedExpr {
  switch (expr.kind) {
    case 'binary':
      return rewriteBinary(expr, typing)
    case 'unary': {
      if (expr.op !== '-' && expr.op !== '+') return expr
      const argument = numericOperand(expr.argument, operandFacts(expr.argument, typing))
      return argument === expr.argument ? expr : { ...expr, argument }
    }
    case 'template-literal':
      return rewriteTemplateLiteral(expr, typing)
    default:
      return expr
  }
}

/**
 * {@link rewriteNilReadings} at every node of `expr`, children first, for a
 * tree a template adapter hands to the runtime evaluator or to its own
 * walker instead of `emitParsedExpr` (a callback body, a memo body). An
 * arrow's params shadow outer names within its body.
 */
export function rewriteNilReadingsDeep(expr: ParsedExpr, typing: ScopedOperandTyping): ParsedExpr {
  const walk = (e: ParsedExpr, at: ScopedOperandTyping): ParsedExpr => {
    if (e.kind === 'arrow') {
      const body = walk(e.body, at.enterCallback(e.params))
      return body === e.body ? e : { ...e, body }
    }
    return rewriteNilReadings(mapChildren(e, child => walk(child, at)), at)
  }
  return walk(expr, typing)
}

/** `items` mapped by `f`, or `items` itself when no item changes. */
function mapList(items: readonly ParsedExpr[], f: (child: ParsedExpr) => ParsedExpr): ParsedExpr[] | null {
  let changed = false
  const out = items.map(item => {
    const next = f(item)
    if (next !== item) changed = true
    return next
  })
  return changed ? out : null
}

function mapTemplateParts(parts: readonly TemplatePart[], f: (child: ParsedExpr) => ParsedExpr): TemplatePart[] | null {
  let changed = false
  const out = parts.map(p => {
    if (p.type !== 'expression') return p
    const expr = f(p.expr)
    if (expr === p.expr) return p
    changed = true
    return { ...p, expr }
  })
  return changed ? out : null
}

type ObjectLiteral = Extract<ParsedExpr, { kind: 'object-literal' }>

function mapProperties(properties: ObjectLiteral['properties'], f: (child: ParsedExpr) => ParsedExpr): ObjectLiteral['properties'] | null {
  let changed = false
  const out = properties.map(p => {
    const value = p.kind === 'spread' ? p.expr : p.value
    const next = f(value)
    if (next === value) return p
    changed = true
    return p.kind === 'spread' ? { ...p, expr: next } : { ...p, value: next }
  })
  return changed ? out : null
}

/** `e` with each operand child replaced by `f(child)`; `e` itself when none changes. */
function mapOperands(e: ParsedExpr, f: (child: ParsedExpr) => ParsedExpr): ParsedExpr | undefined {
  switch (e.kind) {
    case 'binary':
    case 'logical': {
      const left = f(e.left)
      const right = f(e.right)
      return left === e.left && right === e.right ? e : ({ ...e, left, right } as ParsedExpr)
    }
    case 'unary': {
      const argument = f(e.argument)
      return argument === e.argument ? e : { ...e, argument }
    }
    case 'conditional': {
      const test = f(e.test)
      const consequent = f(e.consequent)
      const alternate = f(e.alternate)
      return test === e.test && consequent === e.consequent && alternate === e.alternate ? e : { ...e, test, consequent, alternate }
    }
    default:
      return undefined
  }
}

/** `e` with each value-position child replaced by `f(child)`; `e` itself when none changes. */
function mapChildren(e: ParsedExpr, f: (child: ParsedExpr) => ParsedExpr): ParsedExpr {
  const operands = mapOperands(e, f)
  if (operands !== undefined) return operands
  switch (e.kind) {
    case 'call': {
      const callee = f(e.callee)
      const args = mapList(e.args, f)
      return callee === e.callee && !args ? e : { ...e, callee, args: args ?? e.args }
    }
    case 'member': {
      const object = f(e.object)
      return object === e.object ? e : { ...e, object }
    }
    case 'index-access': {
      const object = f(e.object)
      const index = f(e.index)
      return object === e.object && index === e.index ? e : { ...e, object, index }
    }
    case 'template-literal': {
      const parts = mapTemplateParts(e.parts, f)
      return parts ? { ...e, parts } : e
    }
    case 'array-literal': {
      const elements = mapList(e.elements, f)
      return elements ? { ...e, elements } : e
    }
    case 'array-method': {
      const object = f(e.object)
      const args = mapList(e.args, f)
      return object === e.object && !args ? e : ({ ...e, object, args: args ?? e.args } as ParsedExpr)
    }
    case 'object-literal': {
      const properties = mapProperties(e.properties, f)
      return properties ? { ...e, properties } : e
    }
    default:
      return e
  }
}

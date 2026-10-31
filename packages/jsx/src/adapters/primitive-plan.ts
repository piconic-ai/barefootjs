/**
 * The JS primitive plan (`spec/js-primitive-semantics.md`, "Decision
 * point"): one pure decision per primitive operation — ToBoolean, ToNumber,
 * `+`, `===`, relational, unary `-`, number literal, nullish, index read —
 * whether a target may spell its native operator (Phase-1 types prove the
 * operands are in a range where native and JS agree, and the target's
 * {@link NativeSafeTable} claims that proof) or must call the runtime
 * helper.
 *
 * `emitParsedExpr` computes the plan for every operator node and hands it to
 * the emitter as the method's last parameter; the emitter only spells it.
 * Step 0 of #3824 fills each adapter's table so that the plans describe
 * today's output; each rollout step narrows a table to what the
 * `primitives/` vectors pin and makes the emitters spell the plan.
 */

import type { ParsedExpr } from '../expression-parser.ts'
import { PROPS_OBJECT_IDENTIFIER, type BindingScope } from '../scope/binding-scope.ts'
import {
  UNKNOWN_FACTS,
  factsOf,
  isExactly,
  isNeverNil,
  nilFacts,
  provenPrimitive,
  unionFacts,
  withoutNil,
  type OperandFacts,
  type OperandType,
  type OperandTyping,
  type ScopedOperandTyping,
} from './operand-typing.ts'

export type PrimitiveOp =
  | 'to-boolean'
  | 'to-number'
  | 'to-string'
  | 'boolean-value'
  | 'get'
  | 'strict-eq'
  | 'relational'
  | 'plus'
  | 'neg'
  | 'number-literal'
  | 'nullish'

/**
 * What Phase 1 proved about the operands of one operation.
 *
 * `unproven` is not in the design note's sketch: it is the proof of an
 * operation whose operands Phase 1 proves nothing about. A target that
 * spells its native operator for EVERY operand today (an "N" cell of the
 * note's status table) claims it, so the step-0 table can describe today's
 * output; each rollout step removes it from the table it graduates.
 */
export type Proof =
  | 'boolean'
  | 'number'
  | 'string'
  | 'number-pair'
  | 'string-pair'
  | 'boolean-pair'
  | 'array-index'
  | 'safe-integer'
  | 'non-nil'
  | 'unproven'

/** The (op, proof) pairs a target's native operators are pinned for. */
export type NativeSafeTable = Readonly<Partial<Record<PrimitiveOp, readonly Proof[]>>>

/**
 * The runtime helper a plan names, by its catalogue id
 * (`spec/template-helpers.md`); each runtime keeps its own spelling (Perl's
 * `subtract`, Go's `bf_eq`, PHP's `index` for `get`).
 */
export type PrimitiveHelper =
  | 'truthy'
  | 'to_number'
  | 'add'
  | 'sub'
  | 'mul'
  | 'div'
  | 'mod'
  | 'plus'
  | 'strict_eq'
  | 'lt'
  | 'le'
  | 'gt'
  | 'ge'
  | 'neg'
  | 'number'
  | 'coalesce'
  | 'get'

export type PrimitivePlan =
  | { readonly mode: 'native'; readonly op: PrimitiveOp; readonly proof: Proof }
  | { readonly mode: 'helper'; readonly op: PrimitiveOp; readonly helper: PrimitiveHelper; readonly proof: Proof }
  /** `===` / `!==` across operands proven of different primitive types. */
  | { readonly mode: 'const'; readonly op: PrimitiveOp; readonly value: boolean }
  /** A BF101 refusal (e.g. a nil reading `either` under a numeric operator). */
  | { readonly mode: 'refuse'; readonly op: PrimitiveOp; readonly reason: string }

// ---------------------------------------------------------------------------
// operandFacts — the single classifier
// ---------------------------------------------------------------------------

const COMPARISON_OPS: ReadonlySet<string> = new Set(['<', '>', '<=', '>=', '==', '===', '!=', '!=='])
const NUMERIC_BINARY_OPS: ReadonlySet<string> = new Set(['-', '*', '/', '%', '**'])

/** `row.id.label` as its root name and field path; null for any other shape. */
function memberChain(expr: Extract<ParsedExpr, { kind: 'member' }>): { root: string; path: string[] } | null {
  const path: string[] = []
  let current: ParsedExpr = expr
  while (current.kind === 'member' && !current.computed) {
    path.unshift(current.property)
    current = current.object
  }
  return current.kind === 'identifier' ? { root: current.name, path } : null
}

function memberFacts(expr: Extract<ParsedExpr, { kind: 'member' }>, typing: ScopedOperandTyping): OperandFacts {
  if (expr.computed) return UNKNOWN_FACTS
  if (expr.object.kind === 'identifier' && expr.object.name === PROPS_OBJECT_IDENTIFIER) return typing.prop(expr.property)
  const chain = memberChain(expr)
  return chain ? typing.path(chain.root, chain.path) : UNKNOWN_FACTS
}

/** The facts of a JS `+`: a string when either side is a proven string, a number when neither can be one. */
function plusFacts(left: OperandFacts, right: OperandFacts): OperandFacts {
  if (isExactly(left, 'string') || isExactly(right, 'string')) return factsOf('string')
  const numeric = (f: OperandFacts) => [...f.types].every(t => t === 'number' || t === 'boolean' || t === 'nil')
  return numeric(left) && numeric(right) ? factsOf('number') : UNKNOWN_FACTS
}

function binaryFacts(expr: Extract<ParsedExpr, { kind: 'binary' }>, typing: ScopedOperandTyping): OperandFacts {
  if (COMPARISON_OPS.has(expr.op)) return factsOf('boolean')
  if (NUMERIC_BINARY_OPS.has(expr.op)) return factsOf('number')
  if (expr.op === '+') return plusFacts(operandFacts(expr.left, typing), operandFacts(expr.right, typing))
  return UNKNOWN_FACTS
}

function unaryFacts(op: string): OperandFacts {
  if (op === '!') return factsOf('boolean')
  return op === '-' || op === '+' ? factsOf('number') : UNKNOWN_FACTS
}

function logicalFacts(expr: Extract<ParsedExpr, { kind: 'logical' }>, typing: ScopedOperandTyping): OperandFacts {
  const left = operandFacts(expr.left, typing)
  const right = operandFacts(expr.right, typing)
  // `l ?? r` yields `l` only when it is not nil.
  return unionFacts(expr.op === '??' ? withoutNil(left) : left, right)
}

function literalFacts(expr: Extract<ParsedExpr, { kind: 'literal' }>): OperandFacts {
  return expr.literalType === 'null' ? nilFacts('null') : factsOf(expr.literalType)
}

function callFacts(expr: Extract<ParsedExpr, { kind: 'call' }>, typing: ScopedOperandTyping): OperandFacts {
  return expr.callee.kind === 'identifier' && expr.args.length === 0 ? typing.name(expr.callee.name) : UNKNOWN_FACTS
}

const ARRAY_FACTS: OperandFacts = { types: new Set<OperandType>(['object']), array: true }

/**
 * What Phase-1 types prove about `expr` at its read in `typing`'s scope: the
 * single classifier the primitive plan, and the legacy predicates that wrap
 * it, read.
 *
 * Step 0 deliberately types no call other than a getter read and no method
 * result (`.includes()` is a boolean in JS, `.join()` a string), so that
 * `isBooleanResultParsed`, which wraps this, stays byte-identical.
 */
export function operandFacts(expr: ParsedExpr, typing: ScopedOperandTyping): OperandFacts {
  switch (expr.kind) {
    case 'literal':
      return literalFacts(expr)
    case 'identifier':
      return expr.name === 'undefined' && !typing.scope.isBound('undefined') ? nilFacts('undefined') : typing.name(expr.name)
    case 'template-literal':
      return factsOf('string')
    case 'call':
      return callFacts(expr, typing)
    case 'member':
      return memberFacts(expr, typing)
    case 'binary':
      return binaryFacts(expr, typing)
    case 'unary':
      return unaryFacts(expr.op)
    case 'logical':
      return logicalFacts(expr, typing)
    case 'conditional':
      return unionFacts(operandFacts(expr.consequent, typing), operandFacts(expr.alternate, typing))
    case 'array-literal':
      return ARRAY_FACTS
    case 'object-literal':
      return factsOf('object')
    default:
      return UNKNOWN_FACTS
  }
}

// ---------------------------------------------------------------------------
// planPrimitive — the decision
// ---------------------------------------------------------------------------

function decide(op: PrimitiveOp, proof: Proof, target: NativeSafeTable, helper: PrimitiveHelper): PrimitivePlan {
  return target[op]?.includes(proof) ? { mode: 'native', op, proof } : { mode: 'helper', op, helper, proof }
}

/** A pair proof when both operands are proven the same non-nil primitive. */
function pairProof(left: OperandFacts, right: OperandFacts): Proof {
  const l = provenPrimitive(left)
  return l !== null && l === provenPrimitive(right) ? (`${l}-pair` as Proof) : 'unproven'
}

const RELATIONAL_HELPERS: Readonly<Record<string, PrimitiveHelper>> = { '<': 'lt', '<=': 'le', '>': 'gt', '>=': 'ge' }

function planStrictEq(op: string, left: OperandFacts, right: OperandFacts, target: NativeSafeTable): PrimitivePlan {
  const l = provenPrimitive(left)
  const r = provenPrimitive(right)
  // Operands proven of different primitive types are never `===`.
  if (l !== null && r !== null && l !== r) return { mode: 'const', op: 'strict-eq', value: op === '!==' }
  return decide('strict-eq', pairProof(left, right), target, 'strict_eq')
}

function planPlus(left: OperandFacts, right: OperandFacts, target: NativeSafeTable): PrimitivePlan {
  if (isExactly(left, 'number') && isExactly(right, 'number')) return decide('plus', 'number-pair', target, 'add')
  if (isExactly(left, 'string') || isExactly(right, 'string')) return decide('plus', 'string', target, 'plus')
  return decide('plus', 'unproven', target, 'plus')
}

function planNumericBinary(op: string, left: OperandFacts, right: OperandFacts, target: NativeSafeTable): PrimitivePlan {
  // `/` and `%` have no native spelling on any target (`arithmeticHelper`).
  if (op === '/') return { mode: 'helper', op: 'to-number', helper: 'div', proof: pairProof(left, right) }
  if (op === '%') return { mode: 'helper', op: 'to-number', helper: 'mod', proof: pairProof(left, right) }
  const proof: Proof = isExactly(left, 'number') && isExactly(right, 'number') ? 'number-pair' : 'unproven'
  return decide('to-number', proof, target, op === '-' ? 'sub' : 'mul')
}

function planBinary(expr: Extract<ParsedExpr, { kind: 'binary' }>, typing: ScopedOperandTyping, target: NativeSafeTable): PrimitivePlan | null {
  const { op } = expr
  const isPrimitiveOp = op === '===' || op === '!==' || op === '+' || op in RELATIONAL_HELPERS || op === '-' || op === '*' || op === '/' || op === '%'
  if (!isPrimitiveOp) return null
  const left = operandFacts(expr.left, typing)
  const right = operandFacts(expr.right, typing)
  if (op === '===' || op === '!==') return planStrictEq(op, left, right, target)
  if (op === '+') return planPlus(left, right, target)
  const relational = RELATIONAL_HELPERS[op]
  if (relational) {
    const proof: Proof = isExactly(left, 'number') && isExactly(right, 'number') ? 'number-pair' : 'unproven'
    return decide('relational', proof, target, relational)
  }
  return planNumericBinary(op, left, right, target)
}

/** A test position: ToBoolean of `test`. */
function planToBoolean(test: ParsedExpr, typing: ScopedOperandTyping, target: NativeSafeTable): PrimitivePlan {
  return decide('to-boolean', isExactly(operandFacts(test, typing), 'boolean') ? 'boolean' : 'unproven', target, 'truthy')
}

/**
 * The ToBoolean plan of a test position whose node `emitParsedExpr` does not
 * plan, because the position, not an operator node, applies the conversion:
 * an `if` condition (a JSX conditional, a conditional return), a `.filter()`
 * / `.every()` / `.some()` predicate body, a loop filter's guard, an
 * attribute's presence test. The `!`, `&&`, `||` and `?:` nodes receive the
 * same plan from the dispatcher.
 */
export function planTest(test: ParsedExpr, typing: ScopedOperandTyping, target: NativeSafeTable): PrimitivePlan {
  return planToBoolean(test, typing, target)
}

/**
 * Spell a ToBoolean plan over a rendered test: the test itself when the plan
 * is native, `helper(rendered)` otherwise. A null plan (an emitter method
 * reached outside `emitParsedExpr`) takes the helper, which is never wrong.
 */
export function spellTest(plan: PrimitivePlan | null, rendered: string, helper: (rendered: string) => string): string {
  return plan?.mode === 'native' && plan.op === 'to-boolean' ? rendered : helper(rendered)
}

function isNonZeroNumberLiteral(expr: ParsedExpr): boolean {
  return expr.kind === 'literal' && expr.literalType === 'number' && expr.value !== 0
}

function planUnary(expr: Extract<ParsedExpr, { kind: 'unary' }>, typing: ScopedOperandTyping, target: NativeSafeTable): PrimitivePlan | null {
  if (expr.op === '!') return planToBoolean(expr.argument, typing, target)
  // Only a non-zero number literal keeps its sign through a host integer.
  if (expr.op === '-') return decide('neg', isNonZeroNumberLiteral(expr.argument) ? 'number' : 'unproven', target, 'neg')
  if (expr.op === '+') {
    return decide('to-number', isExactly(operandFacts(expr.argument, typing), 'number') ? 'number' : 'unproven', target, 'to_number')
  }
  return null
}

function planLogical(expr: Extract<ParsedExpr, { kind: 'logical' }>, typing: ScopedOperandTyping, target: NativeSafeTable): PrimitivePlan {
  if (expr.op !== '??') return planToBoolean(expr.left, typing, target)
  return decide('nullish', isNeverNil(operandFacts(expr.left, typing)) ? 'non-nil' : 'unproven', target, 'coalesce')
}

/** An index read: native only for a proven array read by a proven non-negative integer. */
function planGet(object: ParsedExpr, key: OperandFacts, typing: ScopedOperandTyping, target: NativeSafeTable): PrimitivePlan {
  const receiver = operandFacts(object, typing)
  const proof: Proof = receiver.array && isNeverNil(receiver) && key.index ? 'array-index' : 'unproven'
  return decide('get', proof, target, 'get')
}

function planNumberLiteral(value: number, target: NativeSafeTable): PrimitivePlan {
  const safe = Number.isSafeInteger(value) && !Object.is(value, -0)
  return decide('number-literal', safe ? 'safe-integer' : 'unproven', target, 'number')
}

/**
 * The plan for `node` in `typing`'s scope on a target whose native operators
 * are pinned for `target`'s (op, proof) pairs, or null when `node` is not a
 * primitive operation (a non-number literal, loose `==`, `in`, a
 * non-computed member, …).
 *
 * Planned kinds: `binary` (`===` `!==` `<` `<=` `>` `>=` `+` `-` `*` `/`
 * `%`), `unary` (`!` `-` `+`), `logical` (its left operand's test, or `??`),
 * `conditional` (its test), `index-access`, computed `member` and number
 * `literal`.
 */
export function planPrimitive(node: ParsedExpr, typing: ScopedOperandTyping, target: NativeSafeTable): PrimitivePlan | null {
  switch (node.kind) {
    case 'binary':
      return planBinary(node, typing, target)
    case 'unary':
      return planUnary(node, typing, target)
    case 'logical':
      return planLogical(node, typing, target)
    case 'conditional':
      return planToBoolean(node.test, typing, target)
    case 'index-access':
      return planGet(node.object, operandFacts(node.index, typing), typing, target)
    case 'member':
      // A literal key is never a proven index (the note: only a loop index binding is).
      return node.computed ? planGet(node.object, UNKNOWN_FACTS, typing, target) : null
    case 'literal':
      return node.literalType === 'number' && typeof node.value === 'number' ? planNumberLiteral(node.value, target) : null
    default:
      return null
  }
}

/** The inputs an emitter supplies for the plans it receives (`ParsedExprEmitter.primitives`). */
export interface PrimitiveInputs {
  /** The operand typing at the emission site (`typing.at(scope)`). */
  typing(): ScopedOperandTyping
  /** The target's native-safe (op, proof) pairs. */
  readonly nativeSafe: NativeSafeTable
}

/**
 * {@link PrimitiveInputs} reading `typing` at `scope`. An emitter that is
 * built for one fixed scope (a filter predicate's) supplies this; one that
 * follows the adapter's current scope supplies its own `typing()`.
 */
export function primitivesAt(typing: OperandTyping, scope: BindingScope, nativeSafe: NativeSafeTable): PrimitiveInputs {
  return { typing: () => typing.at(scope), nativeSafe }
}

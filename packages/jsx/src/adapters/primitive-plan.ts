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
  | 'to_string'
  | 'strict_eq'
  | 'lt'
  | 'le'
  | 'gt'
  | 'ge'
  | 'neg'
  | 'number'
  | 'coalesce'
  | 'get'
  | 'boolean'

export type PrimitivePlan =
  | {
      readonly mode: 'native'
      readonly op: PrimitiveOp
      readonly proof: Proof
      /**
       * A native string `+` (`plus` over the `string` proof): which operand
       * the emitter spells through the runtime's `to_string` before the
       * host's concatenation, `[left, right]`. A proven string operand is
       * concatenated as it is (#3824 step 4).
       */
      readonly stringify?: readonly [boolean, boolean]
    }
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
  // `props['n']` reads the prop `n` as `props.n` does (#3750).
  if (expr.object.kind === 'identifier' && expr.object.name === PROPS_OBJECT_IDENTIFIER) return typing.prop(expr.property)
  if (expr.computed) return UNKNOWN_FACTS
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

/** The literal `null`, or an unbound `undefined`: the operand of a nullish test. */
export function isNilLiteralOperand(expr: ParsedExpr, typing?: ScopedOperandTyping): boolean {
  if (expr.kind === 'literal') return expr.literalType === 'null'
  return expr.kind === 'identifier' && expr.name === 'undefined' && !typing?.scope.isBound('undefined')
}

/** A `===` / `!==` / `==` / `!=` with a nil literal on one side: a nullish test, not a strict equality. */
export function isNullishTest(op: string, left: ParsedExpr, right: ParsedExpr, typing?: ScopedOperandTyping): boolean {
  return (op === '===' || op === '!==' || op === '==' || op === '!=') &&
    (isNilLiteralOperand(left, typing) || isNilLiteralOperand(right, typing))
}

/** The array element reads whose value is one element of their receiver. */
const ELEMENT_READ_METHODS: ReadonlySet<string> = new Set(['at', 'find', 'findLast'])

/** The receiver of an element read (`a[i]`, `a.at(i)`, `a.find(p)`), or null. */
function elementReadReceiver(expr: ParsedExpr): ParsedExpr | null {
  if (expr.kind === 'index-access') return expr.object
  if (expr.kind === 'member' && expr.computed) return expr.object
  if (expr.kind === 'array-method' && ELEMENT_READ_METHODS.has(expr.method)) return expr.object
  return null
}

/**
 * Whether `expr` may hold an object or array at its read
 * (`spec/js-primitive-semantics.md`, "Decisions" (4)): its facts admit
 * `object` (an object, array or interface type, an object or array
 * literal), or it is an element read of an array whose declared element
 * type or array-literal seed admits one (`rows().at(0)` over
 * `createSignal([{ id: 1 }])`, typed `unknown[]`). An operand Phase 1
 * proves nothing else about (an untyped row field, a call result) is not
 * refused: the runtime's `strict_eq` compares it. A named type reference
 * (`Row`, `Tone`) counts only when `isObjectTypeName` resolves it to an
 * object shape; by default it does not.
 */
export function mayHoldObject(
  expr: ParsedExpr,
  typing: ScopedOperandTyping,
  isObjectTypeName: (name: string) => boolean = () => false,
): boolean {
  const holdsObject = (facts: OperandFacts): boolean =>
    facts.types.has('object') && (!facts.namedObjects || facts.namedObjects.some(isObjectTypeName))
  if (holdsObject(operandFacts(expr, typing))) return true
  const receiver = elementReadReceiver(expr)
  if (!receiver) return false
  const facts = operandFacts(receiver, typing)
  // `element` alone, not `array`: a nullable or union-typed array
  // (`rows?: Row[]`) keeps its element evidence without being proven an array.
  return facts.element !== undefined && holdsObject(facts.element)
}

/** The BF101 reason of a `===` / `!==` over an operand that may be an object (#3774). */
export const NON_PRIMITIVE_EQUALITY_REASON = 'non-primitive-strict-equality'

/**
 * How an emitter spells a `===` / `!==` under its plan (#3824 step 8):
 *
 * - `native`: the target's own operator for the proven pair (`proof`).
 * - `helper`: the runtime's `strict_eq`, negated for `!==`. A refused plan
 *   spells it too: the refusal itself is recorded once per component by
 *   `refuseNonPrimitiveStrictEquality`.
 * - `const`: the folded answer for operands proven of different types.
 * - `nullish`: a nullish test (`x === null`), which keeps the target's nil
 *   test.
 *
 * Null for any other operator (loose `==` keeps its own lowering). A null
 * plan takes the helper, which is never wrong.
 */
export type StrictEqSpelling =
  | { readonly kind: 'native'; readonly proof: Proof; readonly negated: boolean }
  | { readonly kind: 'helper'; readonly negated: boolean }
  | { readonly kind: 'const'; readonly value: boolean }
  | { readonly kind: 'nullish' }

export function strictEqSpelling(op: string, left: ParsedExpr, right: ParsedExpr, plan: PrimitivePlan | null): StrictEqSpelling | null {
  if (op !== '===' && op !== '!==') return null
  if (isNilLiteralOperand(left) || isNilLiteralOperand(right)) return { kind: 'nullish' }
  const negated = op === '!=='
  if (plan?.op === 'strict-eq' && plan.mode === 'const') return { kind: 'const', value: plan.value }
  if (plan?.op === 'strict-eq' && plan.mode === 'native') return { kind: 'native', proof: plan.proof, negated }
  return { kind: 'helper', negated }
}

/**
 * A binary `+` (#3824 step 4): the host's `+` over two proven non-nil
 * numbers (`add` on a target that does not claim it); the host's
 * concatenation when one operand is a proven non-nil string, with the other
 * through `to_string` unless it is a proven string too; the runtime's JS `+`
 * (`plus`) otherwise. The nil-reading rewrite runs first, so a typed
 * nil-capable operand is already non-nil here.
 */
function planPlus(left: OperandFacts, right: OperandFacts, target: NativeSafeTable): PrimitivePlan {
  if (isExactly(left, 'number') && isExactly(right, 'number')) return decide('plus', 'number-pair', target, 'add')
  const ls = isExactly(left, 'string')
  const rs = isExactly(right, 'string')
  if (ls || rs) {
    const plan = decide('plus', 'string', target, 'plus')
    return plan.mode === 'native' ? { ...plan, stringify: [!ls, !rs] } : plan
  }
  return decide('plus', 'unproven', target, 'plus')
}

/**
 * How an emitter spells a `+` under its plan (#3824 step 4):
 *
 * - `add`: the host's numeric `+` (`native`), or the runtime's numbers-only
 *   `add` helper (`helper`, Perl and Go).
 * - `concat`: the host's string concatenation, each operand whose
 *   `stringify` flag is set through the runtime's `to_string`.
 * - `plus`: the runtime's JS `+`.
 *
 * A null plan (an emitter method reached outside `emitParsedExpr`) takes
 * `plus`, which is never wrong.
 */
export type PlusSpelling =
  | { readonly kind: 'add'; readonly native: boolean }
  | { readonly kind: 'concat'; readonly stringify: readonly [boolean, boolean] }
  | { readonly kind: 'plus' }

export function plusSpelling(plan: PrimitivePlan | null): PlusSpelling {
  if (plan?.op !== 'plus') return { kind: 'plus' }
  if (plan.mode === 'native') {
    return plan.proof === 'number-pair' ? { kind: 'add', native: true } : { kind: 'concat', stringify: plan.stringify ?? [true, true] }
  }
  return plan.mode === 'helper' && plan.helper === 'add' ? { kind: 'add', native: false } : { kind: 'plus' }
}

/**
 * The ToString plan of a template-literal part (#3824 step 4): the part
 * itself when it is a proven non-nil string and the target claims the
 * `string` proof for `to-string`, the runtime's `to_string` otherwise. The
 * nil-reading rewrite has already turned a typed nil-capable part into a
 * non-nil one.
 */
export function planToString(part: ParsedExpr, typing: ScopedOperandTyping, target: NativeSafeTable): PrimitivePlan {
  return decide('to-string', isExactly(operandFacts(part, typing), 'string') ? 'string' : 'unproven', target, 'to_string')
}

/** Whether a ToString plan names the runtime's `to_string`; a null plan does. */
export function needsToString(plan: PrimitivePlan | null): boolean {
  return !isNativePlan(plan, 'to-string')
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
  if (op === '===' || op === '!==') {
    // `x === null` is a nullish test, lowered by each target's nil test.
    if (isNullishTest(op, expr.left, expr.right, typing)) return null
    if (mayHoldObject(expr.left, typing) || mayHoldObject(expr.right, typing)) {
      return { mode: 'refuse', op: 'strict-eq', reason: NON_PRIMITIVE_EQUALITY_REASON }
    }
    return planStrictEq(op, left, right, target)
  }
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

type NumberLiteral = Extract<ParsedExpr, { kind: 'literal' }> & { value: number }

/**
 * A unary `-` over a non-zero number literal, folded into the literal it
 * denotes (`-1.5` is the literal `-1.5`); null for any other node
 * (`spec/js-primitive-semantics.md`, "Unary `-` and number literals"). The
 * fold is the only native-safe unary minus: any other operand can be an
 * integer zero in a host whose integer and float types differ, and the sign
 * of `-0` would be lost, so it takes the `neg` helper. `-0` itself is not
 * folded: a zero operand is exactly that case.
 */
export function foldNegatedNumberLiteral(expr: ParsedExpr): NumberLiteral | null {
  if (expr.kind !== 'unary' || expr.op !== '-') return null
  const arg = expr.argument
  if (arg.kind !== 'literal' || arg.literalType !== 'number' || typeof arg.value !== 'number' || arg.value === 0) return null
  return { kind: 'literal', value: -arg.value, literalType: 'number', raw: String(-arg.value) }
}

function planUnary(expr: Extract<ParsedExpr, { kind: 'unary' }>, typing: ScopedOperandTyping, target: NativeSafeTable): PrimitivePlan | null {
  if (expr.op === '!') return planToBoolean(expr.argument, typing, target)
  if (expr.op === '-') {
    const folded = foldNegatedNumberLiteral(expr)
    return folded ? planNumberLiteral(folded.value, target) : decide('neg', 'unproven', target, 'neg')
  }
  if (expr.op === '+') {
    // A unary `+` is ToNumber itself, and no target's native `+x` converts a
    // string (Python, Ruby and Java raise; Perl, Go and the PHP engines drop
    // it), so only a proven number is a claimable proof (#3824 step 3). The
    // table's `unproven` claim for `to-number` describes binary `-` / `*`
    // over unproven operands, which keep their native operator until step 4.
    return isExactly(operandFacts(expr.argument, typing), 'number')
      ? decide('to-number', 'number', target, 'to_number')
      : { mode: 'helper', op: 'to-number', helper: 'to_number', proof: 'unproven' }
  }
  return null
}

/**
 * The helper a relational plan names for `op` (`<` → `lt`, …), or null when
 * the plan names the native operator (both operands proven non-nil numbers
 * and the target claims `number-pair`; #3824 step 3). A null plan (an
 * emitter method reached outside `emitParsedExpr`) takes the helper, which
 * is never wrong. Null too for an `op` that is not relational.
 */
export function relationalHelper(op: string, plan: PrimitivePlan | null): PrimitiveHelper | null {
  const helper = RELATIONAL_HELPERS[op]
  if (!helper) return null
  return isNativePlan(plan, 'relational') ? null : helper
}

/**
 * Whether a unary-`+` plan names the native spelling (the operand itself, a
 * proven number); otherwise the emitter spells the runtime's `to_number`
 * (#3824 step 3). A null plan takes the helper.
 */
export function isNativeToNumber(plan: PrimitivePlan | null): boolean {
  return isNativePlan(plan, 'to-number')
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

/**
 * Whether `plan` names the native operator of `op`. A null plan (an emitter
 * method reached outside `emitParsedExpr`) is never native: the helper is
 * never wrong.
 */
export function isNativePlan(plan: PrimitivePlan | null, op: PrimitiveOp): boolean {
  return plan?.mode === 'native' && plan.op === op
}

function planNumberLiteral(value: number, target: NativeSafeTable): PrimitivePlan {
  // `-0` is spelled `neg(0)`: no host parses a negative-zero literal.
  if (Object.is(value, -0)) return { mode: 'helper', op: 'number-literal', helper: 'neg', proof: 'unproven' }
  return decide('number-literal', Number.isSafeInteger(value) ? 'safe-integer' : 'unproven', target, 'number')
}

/**
 * Whether `expr` is a number literal that no target spells as a host literal
 * (anything but a safe integer, so `-0` too): its value comes from the
 * runtime's `number` / `neg` and prints in the host's own notation (Perl
 * `1e-07`, Go `1e+20`) unless the text sink routes it through the runtime's
 * JS `Number::toString`.
 */
export function isRuntimeNumberLiteral(expr: ParsedExpr): boolean {
  return expr.kind === 'literal' && expr.literalType === 'number' && typeof expr.value === 'number' &&
    (!Number.isSafeInteger(expr.value) || Object.is(expr.value, -0))
}

/** The number-literal claim every target makes: a safe integer is spelled as a host literal. */
const SAFE_INTEGER_LITERALS: NativeSafeTable = { 'number-literal': ['safe-integer'] }

/**
 * How an emitter spells a number literal of `value` under its plan:
 *
 * - `native`: the host literal `text` (a safe integer, `String(value)`).
 * - `parse`: the runtime's `number` helper over the string `text`, the JS
 *   spelling `String(value)` (`1e+21`, `1e-7`, `0.1`,
 *   `100000000000000000000`), which every runtime's `number` parses, so no
 *   target needs an exponent or big-integer literal syntax.
 * - `negative-zero`: the runtime's `neg` helper over `0`.
 *
 * A null plan (an emitter method reached outside `emitParsedExpr`) gets the
 * plan of a target that claims only safe integers natively, which every
 * target's table does.
 */
export type NumberLiteralSpelling =
  | { readonly kind: 'native'; readonly text: string }
  | { readonly kind: 'parse'; readonly text: string }
  | { readonly kind: 'negative-zero' }

export function numberLiteralSpelling(value: number, plan: PrimitivePlan | null): NumberLiteralSpelling {
  const decided = plan?.op === 'number-literal' ? plan : planNumberLiteral(value, SAFE_INTEGER_LITERALS)
  if (decided.mode === 'native') return { kind: 'native', text: String(value) }
  if (decided.mode === 'helper' && decided.helper === 'neg') return { kind: 'negative-zero' }
  return { kind: 'parse', text: String(value) }
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

// ---------------------------------------------------------------------------
// Boolean values (#3824 step 5)
// ---------------------------------------------------------------------------

/**
 * Whether `node` itself produces a boolean (a comparison, `!`, a boolean
 * literal): the nodes whose host value is not a boolean on a target without
 * a boolean type (Perl holds `1` / `''` / `0`). A read of a name never is: a
 * stored value was materialized where it was stored.
 */
function producesBoolean(node: ParsedExpr): boolean {
  if (node.kind === 'literal') return node.literalType === 'boolean'
  if (node.kind === 'unary') return node.op === '!'
  return node.kind === 'binary' && COMPARISON_OPS.has(node.op)
}

function collectBooleanValueSites(node: ParsedExpr, target: NativeSafeTable, sites: Map<ParsedExpr, PrimitivePlan>): void {
  if (producesBoolean(node)) {
    sites.set(node, decide('boolean-value', 'boolean', target, 'boolean'))
    return
  }
  switch (node.kind) {
    case 'logical':
      // `l && r` / `l || r` / `l ?? r` yield either operand.
      collectBooleanValueSites(node.left, target, sites)
      collectBooleanValueSites(node.right, target, sites)
      return
    case 'conditional':
      // The test is a test position; only the branches are values.
      collectBooleanValueSites(node.consequent, target, sites)
      collectBooleanValueSites(node.alternate, target, sites)
      return
    case 'array-literal':
      for (const element of node.elements) collectBooleanValueSites(element, target, sites)
      return
    case 'object-literal':
      for (const property of node.properties) if (property.kind === 'prop') collectBooleanValueSites(property.value, target, sites)
      return
    default:
      return
  }
}

/**
 * The boolean-value plan of every node of `expr` whose value leaves the
 * expression when `expr` itself does (`spec/js-primitive-semantics.md`,
 * "Boolean values"): `expr` read as a value — a child prop, a stored signal
 * seed / memo / local, a `JSON.stringify` argument, a rendered value — and,
 * through it, an operand `&&` / `||` / `??` returns, a ternary branch and an
 * array or object literal element. A test (a ternary's test, the operand of
 * `!`, an `if` condition) is not a value: it keeps the target's native
 * truthiness. A target with a boolean type claims `boolean-value` natively
 * and spells nothing; Perl materializes each site with its runtime's
 * `boolean`.
 */
export function booleanValueSites(expr: ParsedExpr, target: NativeSafeTable): ReadonlyMap<ParsedExpr, PrimitivePlan> {
  const sites = new Map<ParsedExpr, PrimitivePlan>()
  collectBooleanValueSites(expr, target, sites)
  return sites
}

/**
 * How a JSX text child displays its value (`spec/js-primitive-semantics.md`,
 * "ToString and boolean values"): JSX renders nothing for `true`, `false`,
 * `null` and `undefined`.
 *
 * - `empty`: Phase 1 proves the value is a boolean or nil, so the child
 *   renders nothing (its markers stay).
 * - `display`: the value may be a boolean among other types, so the runtime's
 *   `display` helper blanks a boolean at render time.
 * - `plain`: the value is never a boolean (or Phase 1 proves nothing), so the
 *   target's text sink prints it as before.
 */
export type TextDisplay = 'empty' | 'display' | 'plain'

export function planTextDisplay(expr: ParsedExpr, typing: ScopedOperandTyping): TextDisplay {
  const { types } = operandFacts(expr, typing)
  if (types.has('unknown') || !types.has('boolean')) return 'plain'
  return [...types].every(t => t === 'boolean' || t === 'nil') ? 'empty' : 'display'
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

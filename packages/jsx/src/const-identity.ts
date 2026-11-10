/**
 * Which consts a read site must reference as the binding itself rather than
 * re-evaluate from the initializer (#3868).
 *
 * The client emitter passes a child component's props as getters, and for a
 * prop whose value is a bare const it used to splice the const's initializer
 * text into the getter (`get token() { return { n: 1 } }`). Each read then
 * evaluated the initializer again. For a value that is a primitive this is
 * invisible, and for one that reads a signal, a memo or a prop it is what
 * keeps the prop live. For an initializer that allocates (an object or array
 * literal, `new X()`, a call, a function expression) and reads nothing
 * reactive it only breaks identity: two reads of the prop see two objects,
 * where the source and the SSR render pass the one object the declaration
 * created.
 *
 * The decision is made here, in Phase 1, from the initializer's AST and the
 * component's bindings, and carried as `ConstantInfo.identityBound`. The
 * emitter only reads the flag.
 */

import ts from 'typescript'
import type { AnalyzerContext } from './analyzer-context.ts'
import type { ConstantInfo } from './types.ts'
import { containsReactiveExpression } from './reactivity-checker.ts'
import { signalSecondBinding } from './signal-initializer.ts'

function unwrapTransparent(node: ts.Expression): ts.Expression {
  let current = node
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression
  }
  return current
}

function isAllocatingNode(node: ts.Expression): boolean {
  return (
    ts.isObjectLiteralExpression(node) ||
    ts.isArrayLiteralExpression(node) ||
    ts.isNewExpression(node) ||
    ts.isCallExpression(node) ||
    ts.isTaggedTemplateExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node) ||
    ts.isClassExpression(node) ||
    ts.isRegularExpressionLiteral(node)
  )
}

const VALUE_SELECTING_OPERATORS: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.CommaToken,
])

/**
 * Can evaluating `initializer` a second time yield a different object than
 * the first evaluation did? True when the value it produces may be one it
 * creates: an allocating expression itself, or a ternary / `??` / `||` /
 * `&&` / comma whose result may be such an operand.
 */
export function initializerAllocates(initializer: ts.Expression): boolean {
  const node = unwrapTransparent(initializer)
  if (isAllocatingNode(node)) return true
  if (ts.isConditionalExpression(node)) {
    return initializerAllocates(node.whenTrue) || initializerAllocates(node.whenFalse)
  }
  if (ts.isBinaryExpression(node) && VALUE_SELECTING_OPERATORS.has(node.operatorToken.kind)) {
    return initializerAllocates(node.left) || initializerAllocates(node.right)
  }
  return false
}

/** Is `initializer` an arrow or function expression (evaluating it reads nothing)? */
function isFunctionExpressionNode(initializer: ts.Expression): boolean {
  const node = unwrapTransparent(initializer)
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node)
}

interface IdentityCandidate {
  readsReactiveBrand: boolean
  isFunctionExpression: boolean
}

/**
 * The per-declaration half of the decision, recorded while the declaration's
 * AST is at hand: only consts whose initializer allocates are candidates, and
 * whether the initializer reads a `Reactive<T>`-branded value needs the type
 * checker (a component compiled without one reads none). Kept off
 * `ConstantInfo`: `markIdentityBoundConstants` turns it into
 * `identityBound` once the whole body has been walked.
 */
const candidates: WeakMap<ConstantInfo, IdentityCandidate> = new WeakMap()

export function recordIdentityCandidate(
  constant: ConstantInfo,
  initializer: ts.Expression | undefined,
  checker: ts.TypeChecker | null,
): void {
  if (!initializer || !initializerAllocates(initializer)) return
  if (isFunctionExpressionNode(initializer)) {
    // Evaluating a function expression reads none of the names its body
    // reads, so re-evaluating it never made the prop reactive.
    candidates.set(constant, { readsReactiveBrand: false, isFunctionExpression: true })
    return
  }
  const readsReactiveBrand = checker ? containsReactiveExpression(initializer, checker) : false
  candidates.set(constant, { readsReactiveBrand, isFunctionExpression: false })
}

/**
 * The component's bindings whose read, re-evaluated at each prop read, can
 * see a new value: signal accessors (and their setters / actions), memos,
 * props, the body-destructure aliases of props (rewritten to live prop
 * reads), and component-scope functions, whose call may read any of those.
 */
function reactiveSourceNames(ctx: AnalyzerContext): Set<string> {
  const names = new Set<string>()
  for (const s of ctx.signals) {
    names.add(s.getter)
    const second = signalSecondBinding(s)
    if (second) names.add(second)
  }
  for (const m of ctx.memos) names.add(m.name)
  for (const p of ctx.propsParams) names.add(p.name)
  if (ctx.propsObjectName) names.add(ctx.propsObjectName)
  if (ctx.restPropsName) names.add(ctx.restPropsName)
  for (const f of ctx.localFunctions) {
    if (!f.isModule) names.add(f.name)
  }
  for (const c of ctx.localConstants) {
    if (c.isModule) continue
    if (c.propsDestructure || c.isFunctionValue) names.add(c.name)
  }
  return names
}

/**
 * Set `identityBound` on every const whose initializer allocates and reads
 * nothing reactive (see the module comment). A const written after its
 * declaration is left alone: `mutatedAfterDeclaration` already keeps it a
 * reference.
 */
export function markIdentityBoundConstants(ctx: AnalyzerContext): void {
  const pending = ctx.localConstants.filter(c => candidates.has(c) && !c.isJsx && !c.isJsxFunction)
  if (pending.length === 0) return
  const reactive = reactiveSourceNames(ctx)
  for (const constant of pending) {
    const candidate = candidates.get(constant)!
    if (candidate.readsReactiveBrand) continue
    if (!candidate.isFunctionExpression && readsAny(constant.freeIdentifiers, reactive)) continue
    constant.identityBound = true
  }
}

function readsAny(names: ReadonlySet<string> | undefined, of: ReadonlySet<string>): boolean {
  if (!names) return false
  for (const name of names) {
    if (of.has(name)) return true
  }
  return false
}

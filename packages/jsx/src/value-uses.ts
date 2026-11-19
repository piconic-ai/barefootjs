/**
 * How evaluating an initializer uses each name it mentions (#3719).
 *
 * `freeIdentifiers` says which names an initializer mentions. It does not
 * say what evaluating the initializer does with them, and a write to a
 * binding elsewhere in the component body is only observed by some uses:
 *
 *   const handlers = { read: () => local.length }   // 'deferred': read on call
 *   const alias = local                             // 'alias':    holds the object
 *   const copy = [...local]                         // 'copy':     a new array of its elements
 *   const n = local.length                          // 'read':     a primitive computed now
 *   const first = pick(local)                       // 'opaque':   anything else
 *   const label = format()                          // 'call':     runs the function now
 *
 * Decided here, in Phase 1, from the initializer's AST, and carried on the
 * declaration (`ConstantInfo.valueUses`, `SignalInfo.valueUses`,
 * `MemoInfo.valueUses`). `checkStatementWrites` reads it.
 *
 * Needs a tree built with parent pointers (`setParentNodes`).
 */

import ts from 'typescript'
import { runsInPlace } from './in-place-function.ts'
import { walkWithScope } from './scope/lexical-scope-walk.ts'

/**
 * What evaluating an initializer does with one mention of a name:
 *
 * - `deferred` — inside a function the initializer only creates: nothing is
 *   read until that function is called.
 * - `alias` — the value is, or holds, the named object itself (the
 *   initializer's own value, an array element, a property value, a branch
 *   of a conditional or of `||` / `??`).
 * - `copy` — a new array or object with the named one's elements or own
 *   properties: a spread, `slice` / `map` / `filter` / `concat`,
 *   `Array.from`. Its elements are the same objects.
 * - `read` — a primitive computed from it: `.length`, an operand of an
 *   arithmetic, comparison or unary operator or of a template string, a
 *   condition, `join` / `includes` / `indexOf` / `some` / `every`,
 *   `String()` / `Number()` / `Boolean()`.
 * - `call` — the name is called. Paired with `opaque` unless what the call
 *   returns is only computed into a primitive (`count() + 1`).
 * - `opaque` — any other use: a member read, an argument of a call.
 */
export type ValueUse = 'deferred' | 'alias' | 'copy' | 'read' | 'call' | 'opaque'

/** Methods that return a primitive whatever they are called on. */
const READ_METHODS: ReadonlySet<string> = new Set(['join', 'includes', 'indexOf', 'lastIndexOf', 'some', 'every', 'toString'])
/** Array methods that return a new array of the receiver's elements. */
const COPY_METHODS: ReadonlySet<string> = new Set(['slice', 'map', 'filter', 'concat', 'toSorted', 'toReversed', 'toSpliced'])
/** Global conversions that return a primitive. */
const READ_CONVERSIONS: ReadonlySet<string> = new Set(['String', 'Number', 'Boolean'])

/**
 * The uses of every free name in `root`, an initializer expression or a
 * memo's computation function (whose body is what is evaluated). A name a
 * binding inside `root` shadows is that binding, not the outer one.
 * `undefined` for a declaration with no initializer.
 */
export function classifyValueUses(root: ts.Node | undefined): Map<string, Set<ValueUse>> | undefined {
  if (!root) return undefined
  const uses = new Map<string, Set<ValueUse>>()
  walkWithScope(root, (ident, _parent, shadowed) => {
    if (shadowed || !isValueReference(ident)) return
    const known = uses.get(ident.text) ?? new Set<ValueUse>()
    uses.set(ident.text, known)
    if (!runsInPlace(ident, root)) {
      known.add('deferred')
      return
    }
    const use = useOf(ident, root)
    known.add(use)
    // What the call returns is used in turn: computed into a primitive, it
    // leaves nothing behind; anything else may be what the function read.
    if (use === 'call' && resultUse(ident, root) !== 'read') known.add('opaque')
  })
  return uses
}

/** Whether `id` reads a binding (as opposed to naming a member, a key or a declaration). */
function isValueReference(id: ts.Identifier): boolean {
  const p = id.parent
  if (ts.isPropertyAccessExpression(p)) return p.expression === id
  if (ts.isPropertyAssignment(p)) return p.initializer === id
  if (ts.isShorthandPropertyAssignment(p)) return true
  if (ts.isBindingElement(p) || ts.isParameter(p) || ts.isVariableDeclaration(p)) return p.initializer === id
  if (ts.isJsxAttribute(p) || ts.isMethodDeclaration(p) || ts.isPropertySignature(p)) return false
  return !ts.isTypeNode(p) && !ts.isQualifiedName(p)
}

/** The use of the value the call of `callee` returns. */
function resultUse(callee: ts.Identifier, root: ts.Node): ValueUse {
  let call: ts.Node = callee
  while (!ts.isCallExpression(call)) call = call.parent
  return useOfValue(call, root)
}

/** Wrappers that pass their operand's value on unchanged. */
function isTransparent(n: ts.Node): boolean {
  return (
    ts.isParenthesizedExpression(n) ||
    ts.isNonNullExpression(n) ||
    ts.isAsExpression(n) ||
    ts.isSatisfiesExpression(n) ||
    ts.isTypeAssertionExpression(n)
  )
}

/** The use of `id`, which is evaluated when `root` is: follow its value up to what consumes it. */
function useOf(id: ts.Identifier, root: ts.Node): ValueUse {
  return useOfValue(id, root)
}

/** The use of the value `node` evaluates to, inside `root`. */
function useOfValue(node: ts.Node, root: ts.Node): ValueUse {
  let value: ts.Node = node
  for (;;) {
    if (value === root) return 'alias'
    const next = consumerOf(value, value.parent, root)
    if (typeof next === 'string') return next
    value = next
  }
}

/**
 * What `parent` does with `value`: the use, or the node that carries the
 * value on (`parent` itself, or the object literal a property sits in).
 */
function consumerOf(value: ts.Node, parent: ts.Node, root: ts.Node): ValueUse | ts.Node {
  if (isTransparent(parent)) return parent
  if (ts.isPropertyAccessExpression(parent)) return memberUse(parent)
  if (ts.isCallExpression(parent)) return parent.expression === value ? 'call' : argumentUse(parent, value)
  if (ts.isSpreadElement(parent)) return ts.isArrayLiteralExpression(parent.parent) ? 'copy' : 'opaque'
  if (ts.isSpreadAssignment(parent)) return 'copy'
  if (ts.isArrayLiteralExpression(parent)) return parent
  if (ts.isShorthandPropertyAssignment(parent) || ts.isPropertyAssignment(parent)) return parent.parent
  if (ts.isConditionalExpression(parent)) return parent.condition === value ? 'read' : parent
  if (ts.isBinaryExpression(parent)) return binaryUse(parent, value)
  if (isPrimitiveOperator(parent)) return 'read'
  // The value a memo's computation returns is the memo's value.
  if (ts.isReturnStatement(parent)) return enclosingFunction(parent) === root ? 'alias' : 'opaque'
  if (ts.isArrowFunction(parent) && parent.body === value) return parent === root ? 'alias' : 'opaque'
  return 'opaque'
}

function isPrimitiveOperator(n: ts.Node): boolean {
  return (
    ts.isPrefixUnaryExpression(n) ||
    ts.isPostfixUnaryExpression(n) ||
    ts.isTypeOfExpression(n) ||
    ts.isVoidExpression(n) ||
    ts.isTemplateSpan(n)
  )
}

/** `value.<name>`: `.length` and the calls of {@link READ_METHODS} / {@link COPY_METHODS}; any other member is opaque. */
function memberUse(access: ts.PropertyAccessExpression): ValueUse {
  const name = access.name.text
  const called = ts.isCallExpression(access.parent) && access.parent.expression === access
  if (!called) return name === 'length' ? 'read' : 'opaque'
  if (READ_METHODS.has(name)) return 'read'
  return COPY_METHODS.has(name) ? 'copy' : 'opaque'
}

/** `f(value)`: a primitive conversion reads it, `Array.from(value)` copies it; any other call may do anything with it. */
function argumentUse(call: ts.CallExpression, value: ts.Node): ValueUse {
  const callee = call.expression
  if (ts.isIdentifier(callee) && READ_CONVERSIONS.has(callee.text)) return 'read'
  const isArrayFrom =
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === 'Array' &&
    callee.name.text === 'from'
  return isArrayFrom && call.arguments[0] === value ? 'copy' : 'opaque'
}

/**
 * `value <op> other`: `||`, `??` and the right of `&&` or of a comma may be
 * the result (the binary carries the value on); an assignment stores it
 * somewhere else; every other operator computes a primitive from it.
 */
function binaryUse(binary: ts.BinaryExpression, value: ts.Node): ValueUse | ts.Node {
  const op = binary.operatorToken.kind
  if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) return binary
  if (op === ts.SyntaxKind.AmpersandAmpersandToken || op === ts.SyntaxKind.CommaToken) return binary.right === value ? binary : 'read'
  if (op >= ts.SyntaxKind.FirstAssignment && op <= ts.SyntaxKind.LastAssignment) return 'opaque'
  return 'read'
}

function enclosingFunction(node: ts.Node): ts.Node | undefined {
  for (let n = node.parent; n; n = n.parent) {
    if (ts.isFunctionLike(n)) return n
  }
  return undefined
}

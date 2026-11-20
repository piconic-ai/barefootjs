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
 * ## When a function the initializer creates is `deferred`
 *
 * A read inside a function literal happens when the function is called. It
 * is `deferred` only when evaluating the initializer can do nothing with
 * that function but CREATE, STORE or COPY it. That is one definition over
 * expression forms, used in both directions (`staysUncalled` follows a
 * function's value outwards through them; `createsOnly` checks a whole
 * expression). The NON-INVOKING forms, exhaustively:
 *
 *   - a function, arrow or class expression as a value; a method,
 *     constructor or accessor as a member of an object literal or class
 *     expression; an instance field's initializer (it runs on `new`);
 *   - an object or array literal that holds it: a property value, a
 *     shorthand, an element, at any depth;
 *   - a `static` field that stores it, in a class whose other creation-time
 *     parts (its `extends`, computed names and other `static` initializers)
 *     create only, and which has no `static { … }` block;
 *   - a spread of an ARRAY LITERAL into an array literal (the built-in array
 *     iterator runs no user code), and a spread of an OBJECT LITERAL into an
 *     object literal, for anything but an accessor of that literal;
 *   - a member read (`.name`, `[literal]`) on a literal or class expression
 *     built in the same expression, for anything but an accessor of it,
 *     yielding the function without calling it;
 *   - parentheses, `as`, `satisfies`, `!` and type assertions;
 *   - `?:`, `||`, `&&`, `??` and the comma operator (a value they select, or
 *     only test, is not called);
 *   - an assignment to a plain name nothing else in the initializer
 *     mentions.
 *
 * EVERYTHING ELSE MAY INVOKE it, and the function's body then counts as
 * evaluated with the initializer: a call or `new` it is the callee or an
 * argument of, a tagged template, a spread or member read of anything that
 * is not such a literal, a read or spread that reaches an accessor, any
 * other operator (a coercion may call into user code), an assignment to a
 * member or to a name used elsewhere, `await` / `yield`, a function or class
 * DECLARATION (later statements of the same body may call it). The parts of
 * a function or class that are not deferred at all (a computed member name,
 * a `static` initializer or block, `extends`) are `runsInPlace`'s to say.
 *
 * Needs a tree built with parent pointers (`setParentNodes`).
 */

import ts from 'typescript'
import { runsInPlace } from './in-place-function.ts'
import { walkWithScope } from './scope/lexical-scope-walk.ts'

/**
 * What evaluating an initializer does with one mention of a name:
 *
 * - `deferred` — inside a function the initializer can only create, store
 *   or copy (the file header lists the forms): nothing is read until that
 *   function is called.
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
    if (!runsInPlace(ident, root, scope => staysUncalled(scope, root))) {
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

/** A function value on its way out of the initializer: the node that holds it, and whether it is an accessor of that node. */
interface Carried {
  node: ts.Node
  /** The function is a getter or setter of `node` (an object literal or class): reading or spreading `node` may run it. */
  accessor: boolean
}

/**
 * Whether a deferred scope inside an initializer (a function literal's
 * parameters and body, an instance field's initializer) is certain not to
 * run while the initializer is evaluated: every form between it and `root`
 * is one of the header's non-invoking forms.
 */
function staysUncalled(scope: ts.Node, root: ts.Node): boolean {
  let carried = createdAs(scope)
  while (carried && carried.node !== root) carried = carriedBy(carried, root)
  return carried !== null
}

/** Where the function of a deferred scope first lives: itself, or the object literal or class expression it is a member of. */
function createdAs(scope: ts.Node): Carried | null {
  if (ts.isArrowFunction(scope) || ts.isFunctionExpression(scope)) return { node: scope, accessor: false }
  const holder = scope.parent
  if (ts.isClassExpression(holder)) return classCreatesOnly(holder, scope) ? { node: holder, accessor: ts.isAccessor(scope) } : null
  // A function or class declaration: a later statement may call it.
  return ts.isObjectLiteralExpression(holder) ? { node: holder, accessor: ts.isAccessor(scope) } : null
}

/**
 * One step outwards: what the parent of the node holding the function does
 * with it. The holder that carries it on, or `null` when the parent may
 * invoke it.
 */
function carriedBy(carried: Carried, root: ts.Node): Carried | null {
  const { node, accessor } = carried
  const parent = node.parent
  if (isTransparent(parent) || ts.isConditionalExpression(parent)) return { node: parent, accessor }
  if (ts.isBinaryExpression(parent)) return isSelectingOrStoring(parent, node, root) ? { node: parent, accessor } : null
  // Held by a literal: no longer a member of the thing being read or spread.
  if (ts.isArrayLiteralExpression(parent)) return { node: parent, accessor: false }
  if (ts.isPropertyAssignment(parent) || ts.isShorthandPropertyAssignment(parent)) return { node: parent.parent, accessor: false }
  if (ts.isPropertyDeclaration(parent)) return storedInClass(parent, node)
  if (accessor) return null
  if (ts.isSpreadElement(parent)) return isLiteralSpread(parent, ts.isArrayLiteralExpression) ? { node: parent.parent, accessor: false } : null
  if (ts.isSpreadAssignment(parent)) return isLiteralSpread(parent, ts.isObjectLiteralExpression) ? { node: parent.parent, accessor: false } : null
  return isLiteralMemberRead(parent, node) ? { node: parent, accessor: false } : null
}

/** `?:` aside, the operators that select or only test an operand (`||`, `&&`, `??`, `,`), and an assignment that stores it under a name nothing else mentions. */
function isSelectingOrStoring(binary: ts.BinaryExpression, operand: ts.Node, root: ts.Node): boolean {
  const op = binary.operatorToken.kind
  if (SELECTING_OPERATORS.has(op)) return true
  if (op !== ts.SyntaxKind.EqualsToken || binary.right !== operand || !ts.isIdentifier(binary.left)) return false
  return mentions(root, binary.left.text) === 1
}

const SELECTING_OPERATORS: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.CommaToken,
])

/** How many identifiers named `name` there are under `root`. */
function mentions(root: ts.Node, name: string): number {
  let count = 0
  const visit = (n: ts.Node): void => {
    if (ts.isIdentifier(n) && n.text === name) count++
    ts.forEachChild(n, visit)
  }
  visit(root)
  return count
}

/** A field initializer's value is stored on the class (`static`) or on each instance: carried by the class expression. */
function storedInClass(field: ts.PropertyDeclaration, value: ts.Node): Carried | null {
  const cls = field.parent
  if (field.initializer !== value || !ts.isClassExpression(cls)) return null
  return classCreatesOnly(cls, field) ? { node: cls, accessor: false } : null
}

/** A spread whose operand is a literal of the kind `isLiteral` tests, into a literal of the same kind. */
function isLiteralSpread(spread: ts.SpreadElement | ts.SpreadAssignment, isLiteral: (n: ts.Node) => boolean): boolean {
  return isLiteral(unwrap(spread.expression)) && isLiteral(spread.parent)
}

/** `<literal or class expression>.name` / `<literal>[<literal key>]`, read and not written. */
function isLiteralMemberRead(access: ts.Node, object: ts.Node): boolean {
  if (ts.isElementAccessExpression(access)) {
    if (access.expression !== object || !ts.isLiteralExpression(access.argumentExpression)) return false
  } else if (!ts.isPropertyAccessExpression(access) || access.expression !== object) {
    return false
  }
  const built = unwrap(object as ts.Expression)
  return ts.isObjectLiteralExpression(built) || ts.isArrayLiteralExpression(built) || ts.isClassExpression(built)
}

function unwrap(expr: ts.Expression): ts.Expression {
  let current = expr
  while (isTransparent(current)) current = (current as ts.ParenthesizedExpression).expression
  return current
}

/**
 * Whether creating `cls` can only create and store: no `static { … }` block
 * (its statements may call a function a `static` field stores), and every
 * creation-time expression other than `through` (the member the function
 * being followed came from) creates only: its `extends` expression, its
 * computed member names and its other `static` initializers.
 */
function classCreatesOnly(cls: ts.ClassExpression, through: ts.Node): boolean {
  const heritage = cls.heritageClauses?.flatMap(clause => clause.types.map(type => type.expression)) ?? []
  if (!heritage.every(createsOnly)) return false
  return cls.members.every(member => member === through || memberCreatesOnly(member))
}

function memberCreatesOnly(member: ts.ClassElement): boolean {
  if (ts.isClassStaticBlockDeclaration(member)) return false
  if (member.name && ts.isComputedPropertyName(member.name) && !createsOnly(member.name.expression)) return false
  if (!ts.isPropertyDeclaration(member) || !member.initializer) return true
  const isStatic = member.modifiers?.some(m => m.kind === ts.SyntaxKind.StaticKeyword) ?? false
  return !isStatic || createsOnly(member.initializer)
}

/**
 * Whether evaluating `expr` can only create, store or copy function values:
 * the header's non-invoking forms, top-down. A literal, a name read and
 * `this`-free primitives create nothing; `this` may be the class under
 * construction, whose stored functions a caller could then reach.
 */
function createsOnly(expr: ts.Expression): boolean {
  const e = unwrap(expr)
  if (ts.isIdentifier(e) || ts.isLiteralExpression(e) || isKeywordLiteral(e)) return true
  if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) return true
  if (ts.isClassExpression(e)) return classCreatesOnly(e, e)
  if (ts.isArrayLiteralExpression(e)) return e.elements.every(elementCreatesOnly)
  if (ts.isObjectLiteralExpression(e)) return e.properties.every(propertyCreatesOnly)
  if (ts.isConditionalExpression(e)) return createsOnly(e.condition) && createsOnly(e.whenTrue) && createsOnly(e.whenFalse)
  if (ts.isBinaryExpression(e)) return SELECTING_OPERATORS.has(e.operatorToken.kind) && createsOnly(e.left) && createsOnly(e.right)
  return false
}

function isKeywordLiteral(e: ts.Expression): boolean {
  const kind = e.kind
  return kind === ts.SyntaxKind.TrueKeyword || kind === ts.SyntaxKind.FalseKeyword || kind === ts.SyntaxKind.NullKeyword
}

function elementCreatesOnly(element: ts.Expression): boolean {
  if (ts.isOmittedExpression(element)) return true
  if (!ts.isSpreadElement(element)) return createsOnly(element)
  const operand = unwrap(element.expression)
  return ts.isArrayLiteralExpression(operand) && createsOnly(operand)
}

function propertyCreatesOnly(property: ts.ObjectLiteralElementLike): boolean {
  if (property.name && ts.isComputedPropertyName(property.name) && !createsOnly(property.name.expression)) return false
  if (ts.isPropertyAssignment(property)) return createsOnly(property.initializer)
  if (ts.isSpreadAssignment(property)) {
    const operand = unwrap(property.expression)
    // Spreading a literal runs its getters.
    return ts.isObjectLiteralExpression(operand) && createsOnly(operand) && !operand.properties.some(ts.isGetAccessor)
  }
  // A shorthand reads a name; a method or accessor is created, not run.
  return true
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

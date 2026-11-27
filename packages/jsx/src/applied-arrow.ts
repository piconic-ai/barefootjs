/**
 * `(() => body)()`: a zero-param, synchronous arrow literal with an
 * expression body, called with no arguments where it is written. Evaluating
 * the call evaluates `body` in the scope it is written in, so one evaluation
 * of the call and one of `body` are the same.
 *
 * Two places ask about this shape, and both get their answer here:
 *
 *   - the CSR template check (`relocate.ts`), which accepts the call in a
 *     const it splices at every read site (#3975);
 *   - the analyzer (`analyzer.ts`), which records a const initialized by the
 *     call as initialized by its body (`repeatableAppliedArrowValue`, #4022),
 *     so every consumer of the const decides on the body it would decide on
 *     for `const B = body`, and flags a const whose recorded initializer still
 *     calls a function literal in place (`callsFunctionLiteralInPlace`), which
 *     no template evaluates.
 *
 * Both splice or substitute the body where the source evaluated the call
 * once, so a body is accepted only when evaluating it again gives the same
 * value and changes nothing (`isRepeatableBody`): no call that samples
 * (`Math.random()`, `new Date()`), no write (`delete o.k`, `n++`).
 */

import ts from 'typescript'
import { isArrayIterationCallee } from './in-place-function.ts'
import { extractFreeIdentifiersFromNode } from './free-identifiers.ts'

/**
 * `node` without the wrappers that change nothing about its value:
 * parentheses, `as T`, `satisfies T`, `<T>x` and the non-null assertion `x!`.
 * `ConstantInfo.value` is the type-stripped JS, and `typedValue` keeps the
 * source as written. Every recognizer here looks through the same set, at the
 * callee and at the result alike.
 */
function unwrapValueWrappers(node: ts.Expression): ts.Expression {
  let inner = node
  while (
    ts.isParenthesizedExpression(inner) || ts.isAsExpression(inner) || ts.isSatisfiesExpression(inner)
    || ts.isTypeAssertionExpression(inner) || ts.isNonNullExpression(inner)
  ) inner = inner.expression
  return inner
}

/** The function literal `call` calls where it stands (an arrow or a function expression), else null. */
function calledFunctionLiteral(call: ts.CallExpression): ts.ArrowFunction | ts.FunctionExpression | null {
  const callee = unwrapValueWrappers(call.expression)
  return ts.isArrowFunction(callee) || ts.isFunctionExpression(callee) ? callee : null
}

/** The expression body of `call` when it is `(() => body)()` with a synchronous arrow, else null. */
function appliedZeroParamArrowBody(call: ts.CallExpression): ts.Expression | null {
  if (call.arguments.length !== 0 || call.questionDotToken) return null
  const callee = calledFunctionLiteral(call)
  if (!callee || !ts.isArrowFunction(callee) || callee.parameters.length !== 0 || ts.isBlock(callee.body)) return null
  if (callee.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)) return null
  return callee.body
}

/**
 * Verdicts per call node. The walks that ask (`hasZeroArgCall`,
 * `hasCallWithBridgedArg` in `relocate.ts`) also descend into an accepted
 * call's body and ask again for each nested applied arrow, so without this a
 * chain of helpers spliced into one another (`h2 = () => h1()`, …) re-walked
 * every inner body once per enclosing call. Keyed weakly by the parsed node:
 * a fresh parse starts fresh.
 */
const appliedArrowVerdicts = new WeakMap<ts.CallExpression, boolean>()

/**
 * `(() => body)()` whose body evaluates to the same value each time
 * (`isRepeatableBody`). Accepting the call does not vouch for `body`'s own
 * reads: the caller still resolves them as it would in `body` written in
 * place.
 */
export function isAppliedZeroParamArrow(call: ts.CallExpression): boolean {
  const cached = appliedArrowVerdicts.get(call)
  if (cached !== undefined) return cached
  const body = appliedZeroParamArrowBody(call)
  const verdict = body !== null && isRepeatableBody(body)
  appliedArrowVerdicts.set(call, verdict)
  return verdict
}

const UPDATE_OPERATORS: ReadonlySet<ts.SyntaxKind> = new Set([ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken])

/** Whether `node` writes: an assignment (plain or compound), `delete`, or `++` / `--`. */
function isWrite(node: ts.Node): boolean {
  if (ts.isDeleteExpression(node)) return true
  if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind
    return op >= ts.SyntaxKind.FirstAssignment && op <= ts.SyntaxKind.LastAssignment
  }
  return (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) && UPDATE_OPERATORS.has(node.operator)
}

/**
 * Whether `node` reads a binding of the function it is evaluated in (`this`,
 * `super`, `arguments`, `new.target`) or suspends it (`await`, `yield`): the
 * body spliced elsewhere would read another function's.
 */
function readsEnclosingFunction(node: ts.Node): boolean {
  if (node.kind === ts.SyntaxKind.ThisKeyword || node.kind === ts.SyntaxKind.SuperKeyword) return true
  if (ts.isMetaProperty(node) || ts.isAwaitExpression(node) || ts.isYieldExpression(node)) return true
  return ts.isIdentifier(node) && node.text === 'arguments'
}

/**
 * Whether evaluating `node` again yields the same value and changes nothing:
 * it calls nothing but another applied zero-param arrow of the same kind,
 * constructs nothing (`new`), runs no tag function, builds no JSX, writes
 * nothing (`isWrite`), and reads no binding of the function it runs in
 * (`readsEnclosingFunction`). Reads, other operators and literals repeat.
 * Each node is visited once: an accepted call's verdict already covers its
 * body, so the walk does not descend into it again.
 */
function isRepeatableBody(node: ts.Node): boolean {
  if (ts.isNewExpression(node) || ts.isTaggedTemplateExpression(node)) return false
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) return false
  if (isWrite(node) || readsEnclosingFunction(node)) return false
  if (ts.isCallExpression(node)) return isAppliedZeroParamArrow(node)
  return ts.forEachChild(node, child => (isRepeatableBody(child) ? undefined : true)) !== true
}

/** Whether `node` holds a function or class literal anywhere (an arrow, a function expression, a method, a class). */
function containsFunctionLiteral(node: ts.Node): boolean {
  if (ts.isFunctionLike(node) || ts.isClassLike(node)) return true
  return ts.forEachChild(node, child => (containsFunctionLiteral(child) ? true : undefined)) === true
}

/**
 * Names the file declares with `let` or `var`, anywhere: a read of one may
 * see a value assigned after its declaration, which the consumers of a
 * const's initializer do not follow (they read the declared initializer).
 * Collected once per file.
 */
const mutableNamesByFile = new WeakMap<ts.SourceFile, ReadonlySet<string>>()

function mutableBindingNames(sourceFile: ts.SourceFile): ReadonlySet<string> {
  const cached = mutableNamesByFile.get(sourceFile)
  if (cached) return cached
  const names = new Set<string>()
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclarationList(node) && (node.flags & ts.NodeFlags.Const) === 0) {
      for (const d of node.declarations) collectBindingNames(d.name, names)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  mutableNamesByFile.set(sourceFile, names)
  return names
}

function collectBindingNames(name: ts.BindingName, out: Set<string>): void {
  if (ts.isIdentifier(name)) {
    out.add(name.text)
    return
  }
  for (const el of name.elements) {
    if (!ts.isOmittedExpression(el)) collectBindingNames(el.name, out)
  }
}

/** Whether `body` reads a name the file declares with `let` or `var` (`mutableBindingNames`). */
function readsMutableBinding(body: ts.Expression, sourceFile: ts.SourceFile): boolean {
  const mutable = mutableBindingNames(sourceFile)
  if (mutable.size === 0) return false
  for (const name of extractFreeIdentifiersFromNode(body)) {
    if (mutable.has(name)) return true
  }
  return false
}

/** At most this many applied arrows are peeled off one initializer. */
const MAX_APPLIED_ARROW_DEPTH = 16

/**
 * The expression a const initialized by `init` holds when `init` is an
 * applied zero-param arrow with a repeatable body (`(() => ({ k: V }))()`,
 * also under the wrappers `unwrapValueWrappers` removes, or nested, `(() =>
 * (() => V)())()`): its innermost body. Null for every other initializer: an
 * arrow with a block body, parameters, `async`, a body that does not repeat,
 * a body that reads a `let` or `var` of the file (whose value at the call may
 * be one assigned after its declaration), and a body that still holds a
 * function literal once the chain is peeled. The last keeps the call where substituting would change what the program
 * sees, or would leave a call no template evaluates: a returned anonymous
 * arrow takes the const's name (`const B = () => 1` names it `B`; the arrow
 * the call returns has an empty name), and an applied arrow left under an
 * operator (`(() => 1)() + 2`) is still a call.
 *
 * A `const` evaluates its initializer once, and so does a `const` of the
 * body, so the two hold the same value.
 */
export function repeatableAppliedArrowValue(init: ts.Expression, sourceFile: ts.SourceFile): ts.Expression | null {
  let value: ts.Expression | null = null
  let current = unwrapValueWrappers(init)
  for (let depth = 0; depth < MAX_APPLIED_ARROW_DEPTH; depth++) {
    if (!ts.isCallExpression(current) || !isAppliedZeroParamArrow(current)) break
    value = appliedZeroParamArrowBody(current)
    if (value === null) break
    current = unwrapValueWrappers(value)
  }
  if (value === null || containsFunctionLiteral(value) || readsMutableBinding(value, sourceFile)) return null
  return value
}

/**
 * Whether evaluating `init` calls a function literal where it stands, at any
 * depth: an arrow or a function expression as the callee of a call
 * (`(() => { … })()`, `((x) => x)(v)`, `c ? (() => 1)() : 2`,
 * `` `${(() => 'v')()}` ``, `[(() => 1)()]`). A function stored in the value
 * is not entered, since it runs only when called; the callback of an array
 * iteration method (`xs.map(cb)`) is, since the method calls it in place.
 * Each node is visited once.
 */
export function callsFunctionLiteralInPlace(init: ts.Expression): boolean {
  const visit = (node: ts.Node): boolean => {
    if (ts.isCallExpression(node)) {
      if (calledFunctionLiteral(node)) return true
      if (visit(node.expression)) return true
      const runsCallback = isArrayIterationCallee(unwrapValueWrappers(node.expression))
      return node.arguments.some((arg, i) => (i === 0 && runsCallback ? visitBody(arg) : visit(arg)))
    }
    if (ts.isFunctionLike(node) || ts.isClassLike(node)) return false
    return ts.forEachChild(node, child => (visit(child) ? true : undefined)) === true
  }
  // An array iteration method's callback runs in place: walk its body.
  const visitBody = (arg: ts.Expression): boolean => {
    const fn = unwrapValueWrappers(arg)
    if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) return visit(arg)
    return visit(fn.body)
  }
  return visit(init)
}

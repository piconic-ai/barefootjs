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
import { isAssignmentTargetIdentifier } from './assignment-target.ts'

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
 * body spliced elsewhere would read another function's. Only a node in an
 * evaluated position reaches here (`forEachEvaluatedChild`): `o.arguments`
 * and `{ arguments: 1 }` read no `arguments`, and the keywords are their own
 * node kinds, never a property name.
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
  return forEachEvaluatedChild(node, child => (isRepeatableBody(child) ? undefined : true)) !== true
}

/**
 * `ts.forEachChild` over the children of `node` that are evaluated as
 * expressions: a property name (`o.arguments`, `{ arguments: 1 }`, a non-computed
 * key) and a type are not, so an identifier there reads no binding.
 */
function forEachEvaluatedChild<T>(node: ts.Node, cb: (child: ts.Node) => T | undefined): T | undefined {
  if (ts.isPropertyAccessExpression(node)) return cb(node.expression)
  if (ts.isPropertyAssignment(node)) {
    return (ts.isComputedPropertyName(node.name) ? cb(node.name) : undefined) ?? cb(node.initializer)
  }
  return ts.forEachChild(node, child => (ts.isTypeNode(child) ? undefined : cb(child)))
}

/** Whether `node` holds a function or class literal anywhere (an arrow, a function expression, a method, a class). */
function containsFunctionLiteral(node: ts.Node): boolean {
  if (ts.isFunctionLike(node) || ts.isClassLike(node)) return true
  return ts.forEachChild(node, child => (containsFunctionLiteral(child) ? true : undefined)) === true
}

function isMutableDeclarationList(list: ts.VariableDeclarationList): boolean {
  return (list.flags & ts.NodeFlags.Const) === 0
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

/** Each identifier `body` reads as a binding (not a property name or a type), shorthand values included. */
function forEachReadIdentifier(body: ts.Node, cb: (id: ts.Identifier) => boolean): boolean {
  const visit = (node: ts.Node): boolean => {
    if (ts.isIdentifier(node)) return cb(node)
    if (ts.isShorthandPropertyAssignment(node)) return cb(node.name)
    return forEachEvaluatedChild(node, child => (visit(child) ? true : undefined)) === true
  }
  return visit(body)
}

type Mutability = 'mutable' | 'immutable'

/** The names each scope node declares, by mutability (`scopeDeclarations`). */
const declarationsByScope = new WeakMap<ts.Node, ReadonlyMap<string, Mutability>>()

function recordBindingNames(name: ts.BindingName, kind: Mutability, out: Map<string, Mutability>): void {
  const names = new Set<string>()
  collectBindingNames(name, names)
  for (const n of names) if (!out.has(n)) out.set(n, kind)
}

function recordDeclarationList(list: ts.VariableDeclarationList, out: Map<string, Mutability>): void {
  const kind: Mutability = isMutableDeclarationList(list) ? 'mutable' : 'immutable'
  for (const d of list.declarations) recordBindingNames(d.name, kind, out)
}

/** The `var` declarations a function body or a file holds, not those of a nested function. */
function recordHoistedVars(root: ts.Node, out: Map<string, Mutability>): void {
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionLike(node) || ts.isClassLike(node)) return
    if (ts.isVariableDeclarationList(node) && (node.flags & ts.NodeFlags.BlockScoped) === 0) recordDeclarationList(node, out)
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(root, visit)
}

/** A statement's own block-scoped or hoisted-name declaration (`let` / `const`, a function, a class, an import). */
function recordStatement(stmt: ts.Statement, out: Map<string, Mutability>): void {
  if (ts.isVariableStatement(stmt) && (stmt.declarationList.flags & ts.NodeFlags.BlockScoped) !== 0) {
    recordDeclarationList(stmt.declarationList, out)
  } else if ((ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt) || ts.isEnumDeclaration(stmt)) && stmt.name) {
    if (!out.has(stmt.name.text)) out.set(stmt.name.text, 'immutable')
  } else if (ts.isImportDeclaration(stmt) && stmt.importClause) {
    const clause = stmt.importClause
    if (clause.name) out.set(clause.name.text, 'immutable')
    const bindings = clause.namedBindings
    if (bindings && ts.isNamespaceImport(bindings)) out.set(bindings.name.text, 'immutable')
    if (bindings && ts.isNamedImports(bindings)) for (const el of bindings.elements) out.set(el.name.text, 'immutable')
  }
}

/** Whether `scope` holds statements (a file, a block, a `switch` body), whose declarations it records. */
function recordStatementScope(scope: ts.Node, out: Map<string, Mutability>): boolean {
  if (ts.isCaseBlock(scope)) {
    // The clauses of a `switch` share one lexical scope.
    for (const clause of scope.clauses) for (const stmt of clause.statements) recordStatement(stmt, out)
    return true
  }
  if (!(ts.isSourceFile(scope) || ts.isBlock(scope) || ts.isModuleBlock(scope))) return false
  for (const stmt of scope.statements) recordStatement(stmt, out)
  if (ts.isSourceFile(scope) || (ts.isBlock(scope) && ts.isFunctionLike(scope.parent))) recordHoistedVars(scope, out)
  return true
}

/** Whether `scope` is a function, a `for` or a `catch`, whose own bindings it records. */
function recordBindingScope(scope: ts.Node, out: Map<string, Mutability>): boolean {
  if (ts.isFunctionLike(scope)) {
    for (const param of scope.parameters) recordBindingNames(param.name, 'immutable', out)
    if ((ts.isFunctionExpression(scope) || ts.isClassExpression(scope)) && scope.name) out.set(scope.name.text, 'immutable')
    return true
  }
  if (ts.isForStatement(scope) || ts.isForInStatement(scope) || ts.isForOfStatement(scope)) {
    if (scope.initializer && ts.isVariableDeclarationList(scope.initializer)) recordDeclarationList(scope.initializer, out)
    return true
  }
  if (!ts.isCatchClause(scope)) return false
  if (scope.variableDeclaration) recordBindingNames(scope.variableDeclaration.name, 'mutable', out)
  return true
}

/** The names `scope` itself declares, or null for a node that opens no scope. */
function scopeDeclarations(scope: ts.Node): ReadonlyMap<string, Mutability> | null {
  const cached = declarationsByScope.get(scope)
  if (cached) return cached
  const out = new Map<string, Mutability>()
  if (!recordStatementScope(scope, out) && !recordBindingScope(scope, out)) return null
  declarationsByScope.set(scope, out)
  return out
}

/**
 * The declaration `id` refers to, resolved lexically: the nearest enclosing
 * scope that declares the name decides. A name no scope declares is a
 * global (`immutable`). Only reads are resolved; writes go by spelling
 * (`writtenNames`). Null for a node with no parent chain
 * (a re-parse without parents), which the caller treats as mutable.
 */
function resolveDeclaration(id: ts.Identifier): { kind: Mutability } | null {
  for (let node: ts.Node | undefined = id.parent; node; node = node.parent) {
    const kind = scopeDeclarations(node)?.get(id.text)
    if (kind) return { kind }
    if (ts.isSourceFile(node)) return { kind: 'immutable' }
  }
  return null
}

/**
 * The names some statement of the file writes, by spelling only: an
 * assignment (plain or compound), `++` / `--`, a destructuring-assignment
 * target (`({ label } = x)`, `[label] = y`) or a `for (x of …)` / `for (x in
 * …)` head (`isAssignmentTargetIdentifier`), wherever it sits (a nested
 * function, a method, a computed key, a `switch` case). Writes are
 * deliberately not resolved to a declaration: a sound over-approximation,
 * so no scope rule can attribute a write to the wrong binding. A read of a
 * name written anywhere keeps the call (BF101) even when the write targets
 * another binding of that spelling. Collected once per file.
 */
const writtenNamesByFile = new WeakMap<ts.SourceFile, ReadonlySet<string>>()

function writtenNames(sourceFile: ts.SourceFile): ReadonlySet<string> {
  const cached = writtenNamesByFile.get(sourceFile)
  if (cached) return cached
  const names = new Set<string>()
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && isAssignmentTargetIdentifier(node)) names.add(node.text)
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  writtenNamesByFile.set(sourceFile, names)
  return names
}

/**
 * Whether a read of `id` may see a value assigned after its declaration: it
 * resolves to a `let` / `var` / `catch` binding (`resolveDeclaration`), or a
 * name of its spelling is written anywhere in the file (`writtenNames`), a
 * parameter, a prop or a `const` alike.
 */
function isMutableRead(id: ts.Identifier, sourceFile: ts.SourceFile): boolean {
  if (writtenNames(sourceFile).has(id.text)) return true
  const resolved = resolveDeclaration(id)
  return !resolved || resolved.kind === 'mutable'
}

/**
 * Whether `body` reads a binding whose value at the call may be one assigned
 * after its declaration, which the consumers of a const's initializer do not
 * follow (they read the declared initializer, or a prop as passed): a `let`
 * or `var`, or any binding a statement writes, a parameter or prop included
 * (`label = 'updated'` after `const B = (() => ({ label }))()`). Each read is
 * resolved to the declaration it sees (`resolveDeclaration`), so a `const`
 * or an unwritten prop named like an unrelated `let` is not one; a write of
 * the same spelling anywhere makes it one (`writtenNames`).
 */
function readsMutableBinding(body: ts.Expression, sourceFile: ts.SourceFile): boolean {
  return forEachReadIdentifier(body, id => isMutableRead(id, sourceFile))
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
 * iteration method (`xs.map(cb)`) is, parameter defaults included
 * (`xs.map((x = (() => 1)()) => x)`), since the method calls it in place.
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
  // An array iteration method's callback runs in place: walk its parameters'
  // defaults (destructured ones included) and its body.
  const visitBody = (arg: ts.Expression): boolean => {
    const fn = unwrapValueWrappers(arg)
    if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) return visit(arg)
    return fn.parameters.some(param => visit(param)) || visit(fn.body)
  }
  return visit(init)
}

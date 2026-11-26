/**
 * Whether an expression can reach a value the component's caller supplied
 * that may be, or may build, a live element.
 *
 * A caller can hand a component an element factory: a callback prop
 * (`renderNode={(n) => <Pill id={n.id} />}`), or an object holding one. The
 * element such a callback returns owns its own state, so a branch that may
 * hold one must not be evaluated again while it is mounted
 * (`IRExpression.readsCallerValue`). The compiler cannot see what a caller
 * passes, so the answer is built from the safe side: a name is safe only when
 * the caller's props cannot reach it, and everything else is not.
 *
 * A name read inside the component is safe when it is
 *
 *   - declared outside the component (a module const or function, an
 *     import, a global): it can see a prop only through an argument, and
 *     the arguments are read by the same walk;
 *   - a prop whose declared type holds data only (`isDataOnlyType`): a
 *     string, number, boolean, `null` or `undefined`, an array or object of
 *     those, or a function returning one;
 *   - a component `const` or `function` declaration whose initializer or
 *     body reads only safe names, through any number of hops.
 *
 * It is not safe when it is the props object used whole, a rest bag, a prop
 * with any other or no declared type (`children` included), a `let`, a const
 * the component mutates, a binding of a nested destructuring pattern, or a
 * component declaration that reads any of these. How the value is then used
 * does not matter: `props.render(row)`, `props['render'](row)`,
 * `props.render.call(null, row)`, `apply(props.render, row)`, a wrapper
 * `const draw = row => props.render(row)`, an object `{ draw: props.render }`
 * and a memo or signal seeded from one all read an unsafe name.
 *
 * The declarations are read from the component function's own AST rather than
 * from the analyzer's `localConstants` / `localFunctions` records: those hold
 * free identifier NAMES, which cannot tell `props.count` from `props.render`,
 * and they have no entry for an array pattern or a nested object pattern, so
 * a name bound by one would read as a global.
 */

import ts from 'typescript'
import { type AnalyzerContext, typeLiteralMembers } from './analyzer-context.ts'
import { unwrapJsxTransparent } from './analyzer.ts'
import type { ParamInfo, TypeInfo } from './types.ts'
import { isValueReferenceIdentifier } from './value-references.ts'

/**
 * Whether the recorded property list of a type declaration is its whole
 * member list. `PropertyInfo[]` keeps property signatures only: a method
 * (`render(row): unknown`), an index signature (`[k: string]: Fn`) and a
 * call signature are dropped, and an interface records its own members
 * without those of an `extends` clause. A type with any of these, or with
 * type parameters, cannot be proved data-only from the list, so it is not.
 * `source` is the declaration text (`interface ...`, `type ... = {...}`),
 * read with the TypeScript parser.
 */
function hasCompleteMembers(source: string): boolean {
  const file = ts.createSourceFile('__members__.ts', source, ts.ScriptTarget.Latest, false)
  const declaration = file.statements[0]
  if (!declaration || file.statements.length !== 1) return false
  let members: ts.NodeArray<ts.TypeElement> | null
  if (ts.isInterfaceDeclaration(declaration)) {
    if (declaration.heritageClauses?.length || declaration.typeParameters?.length) return false
    members = declaration.members
  } else if (ts.isTypeAliasDeclaration(declaration)) {
    if (declaration.typeParameters?.length) return false
    members = typeLiteralMembers(declaration.type)
  } else {
    return false
  }
  return members?.every(ts.isPropertySignature) ?? false
}

/**
 * Whether a value of `type` is data all the way down: it is not an element
 * and calling anything it holds cannot produce one. A named type resolves
 * through the file's own type definitions; one declared elsewhere is unknown.
 */
export function isDataOnlyType(
  type: TypeInfo | undefined | null,
  analyzer: Pick<AnalyzerContext, 'typeDefinitions'>,
  seen: ReadonlySet<string> = new Set(),
): boolean {
  if (!type) return false
  switch (type.kind) {
    case 'primitive':
      return true
    case 'union':
      return (type.unionTypes ?? []).length > 0 && (type.unionTypes ?? []).every(t => isDataOnlyType(t, analyzer, seen))
    case 'array':
      return isDataOnlyType(type.elementType, analyzer, seen)
    case 'function':
      return isDataOnlyType(type.returnType, analyzer, seen)
    case 'object':
      return type.properties !== undefined
        && hasCompleteMembers(`type T = ${type.raw}`)
        && type.properties.every(p => isDataOnlyType(p.type, analyzer, seen))
    case 'interface': {
      // A recursive type (`type Tree = { kids: Tree[] }`) is data when the
      // rest of it is.
      if (seen.has(type.raw)) return true
      // Two declarations of one name merge (`interface X` twice); the
      // recorded list is then partial.
      const named = analyzer.typeDefinitions.filter(d => d.name === type.raw)
      const definition = named.length === 1 ? named[0] : undefined
      if (!definition?.properties || !hasCompleteMembers(definition.definition)) return false
      const next = new Set(seen).add(type.raw)
      return definition.properties.every(p => isDataOnlyType(p.type, analyzer, next))
    }
    case 'unknown':
      return false
  }
}

/** The component's names a caller's element can be reached through. */
interface CallerReach {
  /** The props object and the consts that alias it (`const p = props`). */
  readonly propsObjects: ReadonlySet<string>
  /** Every other component-scope name that is not safe. */
  readonly unsafe: ReadonlySet<string>
}

/** A component-scope declaration still to be judged by what it reads. */
interface PendingDeclaration {
  readonly names: readonly string[]
  /** The initializer, or the whole function declaration. */
  readonly reads: ts.Node
}

const reachCache = new WeakMap<AnalyzerContext, CallerReach | null>()

function collectBindingNames(name: ts.BindingName, out: string[]): void {
  if (ts.isIdentifier(name)) {
    out.push(name.text)
    return
  }
  for (const element of name.elements) {
    if (!ts.isOmittedExpression(element)) collectBindingNames(element.name, out)
  }
}

function isFunctionLike(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)
    || ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)
    || ts.isConstructorDeclaration(node)
}

/** The component function: the one whose body the analyzer recorded, or that returns the JSX. */
function componentFunction(analyzer: AnalyzerContext): ts.FunctionLikeDeclaration | null {
  let node: ts.Node | undefined = analyzer.componentBodyBlock ?? analyzer.jsxReturn ?? undefined
  while (node && !isFunctionLike(node)) node = node.parent
  return node ?? null
}

/** The declared type of the prop `key` names: a destructured local name, or a member of the props object. */
function propTypeOf(key: string, byLocalName: boolean, analyzer: AnalyzerContext): TypeInfo | undefined {
  const param: ParamInfo | undefined = byLocalName
    ? analyzer.propsParams.find(p => p.name === key && !p.isRest)
    : analyzer.propsParams.find(p => (p.sourceName ?? p.name) === key && !p.isRest)
  return param?.declaredType ?? param?.type
}

/**
 * The prop a use of the props object reads: `props.name`, `props['name']`,
 * through parentheses, `!` and `as`. `null` for any other use, which hands
 * the whole object on.
 */
function readPropName(propsIdentifier: ts.Identifier): string | null {
  let inner: ts.Node = propsIdentifier
  let parent = inner.parent
  while (
    parent &&
    (ts.isParenthesizedExpression(parent) || ts.isNonNullExpression(parent) || ts.isAsExpression(parent) || ts.isSatisfiesExpression(parent))
  ) {
    inner = parent
    parent = parent.parent
  }
  if (!parent) return null
  if (ts.isPropertyAccessExpression(parent) && parent.expression === inner) return parent.name.text
  if (ts.isElementAccessExpression(parent) && parent.expression === inner && ts.isStringLiteralLike(parent.argumentExpression)) {
    return parent.argumentExpression.text
  }
  return null
}

/**
 * Whether anything under `node` reads a name a caller's element can be
 * reached through. `isSafeName` answers first for names the caller knows
 * (a loop row's item); a name a nested function binds as a parameter is that
 * function's own.
 */
function readsUnsafeName(
  node: ts.Node,
  reach: { propsObjects: ReadonlySet<string>; unsafe: ReadonlySet<string> },
  analyzer: AnalyzerContext,
  resolveOuter: (name: string) => boolean | undefined,
): boolean {
  const visit = (n: ts.Node, bound: ReadonlySet<string>): boolean => {
    if (ts.isTypeNode(n)) return false
    if (ts.isIdentifier(n)) {
      if (!isValueReferenceIdentifier(n) || bound.has(n.text)) return false
      const outer = resolveOuter(n.text)
      if (outer !== undefined) return outer
      if (reach.propsObjects.has(n.text)) {
        const prop = readPropName(n)
        return prop === null || !isDataOnlyType(propTypeOf(prop, false, analyzer), analyzer)
      }
      return reach.unsafe.has(n.text)
    }
    let inner = bound
    if (isFunctionLike(n) && n.parameters.length > 0) {
      const params: string[] = []
      for (const p of n.parameters) collectBindingNames(p.name, params)
      inner = new Set([...bound, ...params])
    }
    return ts.forEachChild(n, child => visit(child, inner) || undefined) === true
  }
  return visit(node, new Set())
}

/** Collect the declarations of the statements a component body runs, without entering nested functions. */
function collectStatementDeclarations(
  statement: ts.Node,
  declarations: ts.VariableDeclaration[],
  functions: ts.FunctionDeclaration[],
  otherNames: string[],
): void {
  if (ts.isFunctionDeclaration(statement)) {
    if (statement.name) functions.push(statement)
    return
  }
  if (ts.isClassDeclaration(statement)) {
    if (statement.name) otherNames.push(statement.name.text)
    return
  }
  if (ts.isVariableDeclaration(statement)) {
    declarations.push(statement)
    return
  }
  if (ts.isExpression(statement) || isFunctionLike(statement)) return
  ts.forEachChild(statement, child => collectStatementDeclarations(child, declarations, functions, otherNames))
}

/** Sort the props parameter's bindings into the props object and the unsafe names. */
function classifyParameters(
  fn: ts.FunctionLikeDeclaration,
  analyzer: AnalyzerContext,
  propsObjects: Set<string>,
  unsafe: Set<string>,
): void {
  fn.parameters.forEach((param, index) => {
    if (index === 0 && ts.isIdentifier(param.name)) {
      propsObjects.add(param.name.text)
      return
    }
    if (index === 0 && ts.isObjectBindingPattern(param.name)) {
      classifyPropsPattern(param.name, true, analyzer, unsafe, [])
      return
    }
    const names: string[] = []
    collectBindingNames(param.name, names)
    for (const name of names) unsafe.add(name)
  })
}

/**
 * Judge each binding of an object pattern over the props object: a plain
 * `name`, `key: name` or `name = default` binding of a data-only prop is
 * safe (its default is judged later, with the other declarations); a rest
 * element, a nested pattern or any other prop is not.
 */
function classifyPropsPattern(
  pattern: ts.ObjectBindingPattern,
  isParameter: boolean,
  analyzer: AnalyzerContext,
  unsafe: Set<string>,
  pending: PendingDeclaration[],
): void {
  for (const element of pattern.elements) {
    const names: string[] = []
    collectBindingNames(element.name, names)
    const key = element.propertyName ?? element.name
    const plain = !element.dotDotDotToken && ts.isIdentifier(element.name) && (ts.isIdentifier(key) || ts.isStringLiteralLike(key))
    const type = plain
      ? isParameter
        ? propTypeOf((element.name as ts.Identifier).text, true, analyzer)
        : propTypeOf((key as ts.Identifier | ts.StringLiteralLike).text, false, analyzer)
      : undefined
    if (!plain || !isDataOnlyType(type, analyzer)) {
      for (const name of names) unsafe.add(name)
    } else if (element.initializer) {
      pending.push({ names, reads: element.initializer })
    }
  }
}

/** The names a variable declaration binds. */
function declaredNames(declaration: ts.VariableDeclaration): string[] {
  const names: string[] = []
  collectBindingNames(declaration.name, names)
  return names
}

/**
 * Split the component's variable declarations into the `const`s that can be
 * judged by their initializer and the names that cannot: a `let` or `var`,
 * a declaration with no initializer, and a const the component mutates.
 */
function analysableConsts(
  declarations: readonly ts.VariableDeclaration[],
  analyzer: AnalyzerContext,
  unsafe: Set<string>,
): ts.VariableDeclaration[] {
  const mutated = new Set(analyzer.localConstants.filter(c => c.mutatedAfterDeclaration).map(c => c.name))
  const consts: ts.VariableDeclaration[] = []
  for (const declaration of declarations) {
    const names = declaredNames(declaration)
    const isConst = ts.isVariableDeclarationList(declaration.parent) && (declaration.parent.flags & ts.NodeFlags.Const) !== 0
    if (isConst && declaration.initializer && !names.some(n => mutated.has(n))) {
      consts.push(declaration)
    } else {
      for (const name of names) unsafe.add(name)
    }
  }
  return consts
}

/** Whether an initializer is the props object itself: `props`, or a name already known to alias it. */
function isPropsObjectValue(init: ts.Expression, propsObjects: ReadonlySet<string>): boolean {
  const value = unwrapJsxTransparent(init)
  return ts.isIdentifier(value) && propsObjects.has(value.text)
}

/**
 * Move every `const p = props` alias, through any number of hops and in any
 * declaration order, into `propsObjects`; return the other consts.
 */
function takePropsAliases(consts: readonly ts.VariableDeclaration[], propsObjects: Set<string>): ts.VariableDeclaration[] {
  let rest = [...consts]
  for (let grew = true; grew; ) {
    grew = false
    const next: ts.VariableDeclaration[] = []
    for (const declaration of rest) {
      if (ts.isIdentifier(declaration.name) && isPropsObjectValue(declaration.initializer!, propsObjects)) {
        propsObjects.add(declaration.name.text)
        grew = true
      } else {
        next.push(declaration)
      }
    }
    rest = next
  }
  return rest
}

/**
 * Mark a declaration unsafe as soon as it reads an unsafe name, and repeat
 * until none changes, so a chain of hops ends up unsafe in any order.
 */
function settleDeclarations(
  pending: readonly PendingDeclaration[],
  reach: { propsObjects: ReadonlySet<string>; unsafe: Set<string> },
  analyzer: AnalyzerContext,
): void {
  let open = [...pending]
  for (let changed = true; changed; ) {
    changed = false
    const still: PendingDeclaration[] = []
    for (const declaration of open) {
      if (readsUnsafeName(declaration.reads, reach, analyzer, () => undefined)) {
        for (const name of declaration.names) reach.unsafe.add(name)
        changed = true
      } else {
        still.push(declaration)
      }
    }
    open = still
  }
}

function buildCallerReach(analyzer: AnalyzerContext): CallerReach | null {
  const fn = componentFunction(analyzer)
  if (!fn) return null
  const propsObjects = new Set<string>()
  const unsafe = new Set<string>()
  const pending: PendingDeclaration[] = []
  classifyParameters(fn, analyzer, propsObjects, unsafe)

  const declarations: ts.VariableDeclaration[] = []
  const functions: ts.FunctionDeclaration[] = []
  const otherNames: string[] = []
  if (fn.body && ts.isBlock(fn.body)) {
    for (const statement of fn.body.statements) collectStatementDeclarations(statement, declarations, functions, otherNames)
  }
  for (const name of otherNames) unsafe.add(name)
  for (const declaration of functions) pending.push({ names: [declaration.name!.text], reads: declaration })

  const consts = takePropsAliases(analysableConsts(declarations, analyzer, unsafe), propsObjects)
  for (const declaration of consts) {
    const init = declaration.initializer!
    if (ts.isObjectBindingPattern(declaration.name) && isPropsObjectValue(init, propsObjects)) {
      classifyPropsPattern(declaration.name, false, analyzer, unsafe, pending)
    } else {
      pending.push({ names: declaredNames(declaration), reads: init })
    }
  }

  const reach = { propsObjects, unsafe }
  settleDeclarations(pending, reach, analyzer)
  return reach
}

/**
 * Whether `node`, an expression of the component's JSX, reads a value the
 * caller supplied that may be or build a live element. `rowName` answers for
 * the names the enclosing loop rows bind: `true` for a row's item, index or
 * destructured name (the row's own data), `false` for any other name a row
 * or callback binds (a `.map()` preamble local, whose initializer this walk
 * does not see), `undefined` for a name they do not bind.
 */
export function readsCallerValue(
  node: ts.Node,
  analyzer: AnalyzerContext,
  rowName: (name: string) => boolean | undefined,
): boolean {
  let reach = reachCache.get(analyzer)
  if (reach === undefined) {
    reach = buildCallerReach(analyzer)
    reachCache.set(analyzer, reach)
  }
  // No component function to read the declarations from: nothing is known safe.
  if (reach === null) return true
  return readsUnsafeName(node, reach, analyzer, name => {
    const row = rowName(name)
    return row === undefined ? undefined : !row
  })
}

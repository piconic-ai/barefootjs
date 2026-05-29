/**
 * Inline JSX callback preprocessor (#1211).
 *
 * Detects arrow functions whose body contains JSX when they appear as
 * JsxAttribute initializer values (e.g. `renderNode={(n) => <div/>}`).
 * Without this pre-pass the downstream `getAttributeValue` /
 * `processComponentProps` paths emit the arrow's source text verbatim
 * via `ctx.getJS(expr)`, leaking raw JSX into the client bundle and
 * crashing the parser with `SyntaxError: Unexpected token '<'`.
 *
 * Strategy: hoist each inline arrow into a freshly synthesized PascalCase
 * component declaration appended to the source. Replace the inline arrow
 * with a reference to the new name. The downstream pipeline already knows
 * how to compile a named `'use client'` component into
 * `init${Name}` + `hydrate('${Name}')` + a `createComponent` callable
 * shim — the same machinery that makes `<Flow renderNode={Bridge}>`
 * (where `Bridge` is a regular component) work today.
 *
 * Nested inline arrows (an arrow whose body itself contains another
 * inline JSX-returning arrow in JsxAttribute position) are handled by
 * iterating the pass to a fixpoint: each iteration hoists one outer
 * level into a new module-scope synthesized component, and the next
 * iteration sees the inner arrow at module scope.
 *
 * Limitations (v1):
 *   - The synthesized component cannot capture variables from the
 *     surrounding closure. Arrow params and module-scope identifiers
 *     are fine; anything else triggers BF080.
 *   - Only triggers in `'use client'` source files (the resulting
 *     component must reach the client runtime to have meaning).
 */

import ts from 'typescript'
import type { CompilerError, SourceLocation } from './types'
import { ErrorCodes, createError } from './errors'

export interface PreprocessResult {
  /** Source after rewriting; identical to the input when no inline arrows are found. */
  source: string
  /** Errors raised during preprocessing (e.g. BF080 closure capture). */
  errors: CompilerError[]
  /** Names of the synthesized components, in declaration order. */
  syntheticNames: string[]
}

const SYNTHETIC_PREFIX = 'BFInlineJsxCallback'
const MAX_FIXPOINT_ITERATIONS = 16

/**
 * Run the single-pass preprocessor to a fixpoint so nested inline
 * JSX-returning arrows are all hoisted (each iteration lifts one
 * level of nesting to module scope).
 */
export function preprocessInlineJsxCallbacks(
  source: string,
  filePath: string
): PreprocessResult {
  const errors: CompilerError[] = []
  const syntheticNames: string[] = []
  let counter = 0
  let current = source

  for (let iteration = 0; iteration < MAX_FIXPOINT_ITERATIONS; iteration++) {
    const pass = runSinglePass(current, filePath, counter)
    errors.push(...pass.errors)
    syntheticNames.push(...pass.syntheticNames)
    counter = pass.counterAfter
    if (pass.errors.length > 0 || pass.syntheticNames.length === 0) {
      // Stop on errors (no successful rewrite to iterate on) or when
      // the pass produced no new replacements (fixpoint reached).
      current = pass.source
      break
    }
    current = pass.source
  }

  return { source: current, errors, syntheticNames }
}

interface SinglePassResult extends PreprocessResult {
  counterAfter: number
}

function runSinglePass(
  source: string,
  filePath: string,
  startingCounter: number
): SinglePassResult {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  )

  const hasUseClient = sourceFile.statements.some(stmt =>
    ts.isExpressionStatement(stmt) &&
    ts.isStringLiteral(stmt.expression) &&
    (stmt.expression.text === 'use client' || stmt.expression.text === "'use client'")
  )

  // Without `'use client'` the synthesized component has nowhere to
  // hydrate; bail out so SSR-only files keep their existing behaviour
  // (they don't have a client bundle to crash anyway).
  if (!hasUseClient) {
    return { source, errors: [], syntheticNames: [], counterAfter: startingCounter }
  }

  const moduleScope = collectModuleScopeNames(sourceFile)
  const usedNames = new Set<string>(moduleScope)
  const errors: CompilerError[] = []
  const syntheticNames: string[] = []
  const replacements: { start: number; end: number; text: string }[] = []
  const synthesizedDecls: string[] = []

  let counter = startingCounter

  function nextName(): string {
    while (true) {
      counter += 1
      const candidate = `${SYNTHETIC_PREFIX}${counter}`
      if (!usedNames.has(candidate)) {
        usedNames.add(candidate)
        return candidate
      }
    }
  }

  function visit(node: ts.Node): void {
    // `renderNode={(n) => <div/>}` — arrow in JsxAttribute position.
    if (ts.isJsxAttribute(node) && node.initializer && ts.isJsxExpression(node.initializer) && node.initializer.expression) {
      if (tryHandleArrowValue(node.initializer.expression)) {
        // Don't dive into the arrow's body in this pass — the next
        // fixpoint iteration will see the synthesized component at
        // module scope and process any nested inline arrows there.
        return
      }
    }
    // `{ piconic: () => <BrandLogo/> }` — arrow as an object-literal
    // property value (e.g. a `Record<K, () => JSX>` lookup map). Without
    // this the JSX leaks untransformed into both the SSR template and the
    // client bundle (#1663).
    if (ts.isPropertyAssignment(node) && node.initializer) {
      if (tryHandleArrowValue(node.initializer)) return
    }
    ts.forEachChild(node, visit)
  }

  /**
   * If `initializer` is (a parenthesized chain wrapping) an arrow function
   * whose body contains JSX, hoist it into a synthesized component and
   * record the replacement. Returns true when the arrow was successfully
   * hoisted, so the caller can skip recursing into the arrow body.
   */
  function tryHandleArrowValue(initializer: ts.Expression): boolean {
    let expr: ts.Expression = initializer
    while (ts.isParenthesizedExpression(expr)) expr = expr.expression
    if (ts.isArrowFunction(expr) && arrowBodyContainsJsx(expr)) {
      return handleInlineArrow(expr)
    }
    return false
  }

  function handleInlineArrow(arrow: ts.ArrowFunction): boolean {
    const paramNames = collectArrowParamNames(arrow)
    const free = collectFreeIdentifiers(arrow)
    const captures: string[] = []
    for (const id of free) {
      if (paramNames.has(id)) continue
      if (moduleScope.has(id)) continue
      captures.push(id)
    }
    if (captures.length > 0) {
      const start = sourceFile.getLineAndCharacterOfPosition(arrow.getStart(sourceFile))
      const end = sourceFile.getLineAndCharacterOfPosition(arrow.getEnd())
      const loc: SourceLocation = {
        file: filePath,
        start: { line: start.line + 1, column: start.character },
        end: { line: end.line + 1, column: end.character },
      }
      const baseMessage = errorMessageForCapture(captures)
      errors.push(createError(ErrorCodes.INLINE_JSX_CALLBACK_CAPTURE, loc, { message: baseMessage }))
      return false
    }

    const name = nextName()
    syntheticNames.push(name)

    const decl = buildSyntheticDeclaration(name, arrow, sourceFile)
    synthesizedDecls.push(decl)

    const arrowStart = arrow.getStart(sourceFile)
    const arrowEnd = arrow.getEnd()
    // Reference the synthesized component by name. The shim emitted by
    // ir-to-client-js (`export function ${name}(props, key) { ... }`)
    // is callable as `${name}(node)` so the holding parent's runtime
    // (e.g. Flow's `props.renderNode(node)`) keeps working unchanged.
    replacements.push({ start: arrowStart, end: arrowEnd, text: name })
    return true
  }

  ts.forEachChild(sourceFile, visit)

  if (replacements.length === 0) {
    return { source, errors, syntheticNames, counterAfter: counter }
  }

  // Apply replacements in reverse order so earlier offsets stay valid.
  replacements.sort((a, b) => b.start - a.start)
  let rewritten = source
  for (const r of replacements) {
    rewritten = rewritten.slice(0, r.start) + r.text + rewritten.slice(r.end)
  }

  // Append synthesized declarations at the end so they're available
  // module-wide. PascalCase + `'use client'` makes `listComponentFunctions`
  // pick them up as ordinary components, so they receive the standard
  // init/hydrate/shim treatment.
  const trailing = rewritten.endsWith('\n') ? '' : '\n'
  rewritten = `${rewritten}${trailing}\n${synthesizedDecls.join('\n\n')}\n`

  return { source: rewritten, errors, syntheticNames, counterAfter: counter }
}

function errorMessageForCapture(captures: string[]): string {
  return (
    `Inline JSX-returning arrow function captures non-module identifier(s): ` +
    `${captures.sort().join(', ')}. ` +
    `Extract the callback into a top-level '\\'use client\\'' component (e.g. ` +
    `\`function MyNode(n) { return <div/> }\` then \`renderNode={MyNode}\`) ` +
    `or pass captured values via component props.`
  )
}

function arrowBodyContainsJsx(arrow: ts.ArrowFunction): boolean {
  if (ts.isBlock(arrow.body)) {
    return blockReturnsJsx(arrow.body)
  }
  let body: ts.Expression = arrow.body
  while (ts.isParenthesizedExpression(body)) body = body.expression
  return isJsxLike(body)
}

function blockReturnsJsx(block: ts.Block): boolean {
  let found = false
  function visit(n: ts.Node): void {
    if (found) return
    if (ts.isReturnStatement(n) && n.expression) {
      let e: ts.Expression = n.expression
      while (ts.isParenthesizedExpression(e)) e = e.expression
      if (isJsxLike(e)) {
        found = true
        return
      }
    }
    // Don't dive into nested function bodies — their returns belong to
    // those inner functions, not to the outer arrow.
    if (ts.isArrowFunction(n) || ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n)) return
    ts.forEachChild(n, visit)
  }
  ts.forEachChild(block, visit)
  return found
}

function isJsxLike(expr: ts.Expression): boolean {
  return ts.isJsxElement(expr) || ts.isJsxSelfClosingElement(expr) || ts.isJsxFragment(expr)
}

function collectArrowParamNames(arrow: ts.ArrowFunction): Set<string> {
  const names = new Set<string>()
  for (const p of arrow.parameters) collectBindingNames(p.name, names)
  return names
}

function collectBindingNames(name: ts.BindingName, out: Set<string> | string[]): void {
  const push = Array.isArray(out)
    ? (n: string) => out.push(n)
    : (n: string) => out.add(n)
  if (ts.isIdentifier(name)) {
    push(name.text)
  } else if (ts.isObjectBindingPattern(name)) {
    name.elements.forEach(el => collectBindingNames(el.name, out))
  } else if (ts.isArrayBindingPattern(name)) {
    name.elements.forEach(el => {
      if (!ts.isOmittedExpression(el)) collectBindingNames(el.name, out)
    })
  }
}

/**
 * Collect identifiers referenced inside the arrow's body or its
 * parameter default-initializers that are not bound by the arrow's
 * own parameters or by any nested binding within the body.
 *
 * Tracked binding forms inside the body:
 *   - VariableDeclaration with identifier OR destructure pattern name
 *   - FunctionDeclaration / ClassDeclaration
 *   - Catch clause variable
 *   - Inner arrow / function expression / function declaration parameters
 */
function collectFreeIdentifiers(arrow: ts.ArrowFunction): Set<string> {
  const ids = new Set<string>()
  const bound: string[] = []

  // Arrow parameter names — bound for the entire walk.
  for (const p of arrow.parameters) {
    const names: string[] = []
    collectBindingNames(p.name, names)
    bound.push(...names)
  }

  function pushBindings(name: ts.BindingName): string[] {
    const names: string[] = []
    collectBindingNames(name, names)
    bound.push(...names)
    return names
  }

  function popN(n: number): void {
    for (let i = 0; i < n; i++) bound.pop()
  }

  function isBound(name: string): boolean {
    return bound.includes(name)
  }

  function visit(node: ts.Node): void {
    if (ts.isIdentifier(node)) {
      const parent = node.parent
      if (parent && ts.isPropertyAccessExpression(parent) && parent.name === node) return
      if (parent && ts.isPropertyAssignment(parent) && parent.name === node) return
      if (parent && ts.isPropertySignature(parent) && parent.name === node) return
      if (parent && ts.isPropertyDeclaration(parent) && parent.name === node) return
      if (parent && ts.isMethodDeclaration(parent) && parent.name === node) return
      if (parent && ts.isMethodSignature(parent) && parent.name === node) return
      if (parent && ts.isGetAccessorDeclaration(parent) && parent.name === node) return
      if (parent && ts.isSetAccessorDeclaration(parent) && parent.name === node) return
      if (parent && ts.isEnumMember(parent) && parent.name === node) return
      if (parent && ts.isBindingElement(parent) && parent.propertyName === node) return
      if (parent && ts.isShorthandPropertyAssignment(parent) && parent.name === node) {
        // Shorthand `{ foo }` — `foo` IS a value reference; treat as a free id.
        if (!isBound(node.text)) ids.add(node.text)
        return
      }
      if (parent && ts.isParameter(parent) && parent.name === node) return
      if (parent && ts.isVariableDeclaration(parent) && parent.name === node) return
      if (parent && ts.isFunctionDeclaration(parent) && parent.name === node) return
      if (parent && ts.isClassDeclaration(parent) && parent.name === node) return
      if (parent && ts.isJsxAttribute(parent) && parent.name === node) return
      if (parent && ts.isJsxOpeningElement(parent) && parent.tagName === node) {
        // Lowercase tag names are intrinsic HTML elements (the runtime
        // resolves them as strings). Uppercase tags are component refs
        // and DO read from the surrounding scope.
        if (/^[a-z]/.test(node.text)) return
      }
      if (parent && ts.isJsxClosingElement(parent) && parent.tagName === node) {
        if (/^[a-z]/.test(node.text)) return
      }
      if (isBound(node.text)) return
      ids.add(node.text)
      return
    }

    if (ts.isVariableDeclaration(node)) {
      const declared = pushBindings(node.name)
      if (node.initializer) visit(node.initializer)
      // Bindings stay in scope for sibling declarations and the rest
      // of the enclosing block; rely on the outer block-scope unbind.
      // Don't pop here — popping happens at block end.
      // To avoid leaking out of the parent scope we record the count
      // at block entry and pop on exit; see Block handling below.
      // Re-push consumed names: this branch already pushed them.
      ;(declared)
      return
    }

    if (ts.isFunctionDeclaration(node)) {
      if (node.name) bound.push(node.name.text)
      visitInsideNewScope(node)
      // Function name stays bound in the enclosing block; popped on block exit.
      return
    }

    if (ts.isClassDeclaration(node)) {
      if (node.name) bound.push(node.name.text)
      // Visit class members for free identifiers inside method bodies.
      ts.forEachChild(node, visit)
      return
    }

    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      visitInsideNewScope(node)
      return
    }

    if (ts.isCatchClause(node)) {
      const before = bound.length
      if (node.variableDeclaration) pushBindings(node.variableDeclaration.name)
      ts.forEachChild(node, visit)
      popN(bound.length - before)
      return
    }

    if (ts.isBlock(node)) {
      const before = bound.length
      ts.forEachChild(node, visit)
      popN(bound.length - before)
      return
    }

    ts.forEachChild(node, visit)
  }

  function visitInsideNewScope(fn: ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration): void {
    const before = bound.length
    for (const p of fn.parameters) {
      pushBindings(p.name)
      if (p.initializer) visit(p.initializer)
    }
    if (fn.body) visit(fn.body)
    popN(bound.length - before)
  }

  // Walk the arrow's parameter default-initializers (e.g.
  // `(n = tone()) => ...`) at the OUTER scope so refs there count as
  // free relative to the synthesized module-scope component.
  for (const p of arrow.parameters) {
    if (p.initializer) visit(p.initializer)
  }

  visit(arrow.body)
  return ids
}

/**
 * Collect identifier names declared at module scope (top-level imports,
 * function/class/variable declarations, named binding patterns). Used to
 * recognize "the user already had this name" so we can pick a synthetic
 * name that doesn't collide, *and* to recognize free identifiers that
 * resolve to module-scope rather than to an enclosing closure (those are
 * fine — the synthesized component sees the same module-scope bindings).
 */
function collectModuleScopeNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>()

  for (const stmt of sourceFile.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name) names.add(stmt.name.text)
    else if (ts.isClassDeclaration(stmt) && stmt.name) names.add(stmt.name.text)
    else if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) collectBindingNames(decl.name, names)
    } else if (ts.isImportDeclaration(stmt) && stmt.importClause) {
      const ic = stmt.importClause
      if (ic.name) names.add(ic.name.text)
      if (ic.namedBindings) {
        if (ts.isNamespaceImport(ic.namedBindings)) names.add(ic.namedBindings.name.text)
        else for (const e of ic.namedBindings.elements) names.add(e.name.text)
      }
    } else if (ts.isTypeAliasDeclaration(stmt)) names.add(stmt.name.text)
    else if (ts.isInterfaceDeclaration(stmt)) names.add(stmt.name.text)
    else if (ts.isEnumDeclaration(stmt)) names.add(stmt.name.text)
  }

  return names
}

/**
 * Build the synthesized component declaration source. Preserves the
 * arrow's original parameter syntax (including type annotations) and
 * its body verbatim — relying on the host file's TypeScript context
 * for any imported types referenced in the annotations. Nested inline
 * JSX-returning arrows in the body are rewritten on the next fixpoint
 * iteration once the synthesized component reaches module scope.
 */
function buildSyntheticDeclaration(
  name: string,
  arrow: ts.ArrowFunction,
  sourceFile: ts.SourceFile
): string {
  const paramsText = arrow.parameters.length === 0
    ? ''
    : arrow.parameters.map(p => p.getText(sourceFile)).join(', ')

  let bodyText: string
  if (ts.isBlock(arrow.body)) {
    bodyText = arrow.body.getText(sourceFile)
  } else {
    const expr = arrow.body.getText(sourceFile)
    bodyText = `{ return ${expr} }`
  }

  return `function ${name}(${paramsText}) ${bodyText}`
}

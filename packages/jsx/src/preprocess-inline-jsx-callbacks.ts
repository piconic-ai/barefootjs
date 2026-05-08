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
 * Limitations (v1):
 *   - The synthesized component cannot capture variables from the
 *     surrounding closure. Arrow params and module-scope identifiers
 *     are fine; anything else triggers BF080.
 *   - Only triggers in `'use client'` source files (the resulting
 *     component must reach the client runtime to have meaning).
 */

import ts from 'typescript'
import type { CompilerError } from './types'

export interface PreprocessResult {
  /** Source after rewriting; identical to the input when no inline arrows are found. */
  source: string
  /** Errors raised during preprocessing (e.g. BF080 closure capture). */
  errors: CompilerError[]
  /** Names of the synthesized components, in declaration order. */
  syntheticNames: string[]
}

const SYNTHETIC_PREFIX = 'BFInlineJsxCallback'

/**
 * Walk the parsed source for arrow functions in JsxAttribute initializer
 * positions whose body contains JSX. For each match, synthesize a named
 * component declaration and rewrite the call site to reference it.
 */
export function preprocessInlineJsxCallbacks(
  source: string,
  filePath: string
): PreprocessResult {
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
    return { source, errors: [], syntheticNames: [] }
  }

  const moduleScope = collectModuleScopeNames(sourceFile)
  const usedNames = new Set<string>(moduleScope)
  const errors: CompilerError[] = []
  const syntheticNames: string[] = []
  const replacements: { start: number; end: number; text: string }[] = []
  const synthesizedDecls: string[] = []

  let counter = 0

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
    if (ts.isJsxAttribute(node) && node.initializer && ts.isJsxExpression(node.initializer) && node.initializer.expression) {
      let expr: ts.Expression = node.initializer.expression
      while (ts.isParenthesizedExpression(expr)) expr = expr.expression
      if (ts.isArrowFunction(expr) && arrowBodyContainsJsx(expr)) {
        handleInlineArrow(expr)
      }
    }
    ts.forEachChild(node, visit)
  }

  function handleInlineArrow(arrow: ts.ArrowFunction): void {
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
      errors.push({
        code: 'BF080',
        severity: 'error',
        message:
          `Inline JSX-returning arrow function captures non-module identifier(s): ` +
          `${captures.sort().join(', ')}. ` +
          `Extract the callback into a top-level '\\'use client\\'' component (e.g. ` +
          `\`function MyNode(n) { return <div/> }\` then \`renderNode={MyNode}\`) ` +
          `or pass captured values via component props.`,
        loc: {
          file: filePath,
          start: { line: start.line + 1, column: start.character },
          end: { line: end.line + 1, column: end.character },
        },
      })
      return
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
  }

  ts.forEachChild(sourceFile, visit)

  if (replacements.length === 0) {
    return { source, errors, syntheticNames }
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

  return { source: rewritten, errors, syntheticNames }
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
  function visitName(name: ts.BindingName): void {
    if (ts.isIdentifier(name)) {
      names.add(name.text)
    } else if (ts.isObjectBindingPattern(name)) {
      name.elements.forEach(el => visitName(el.name))
    } else if (ts.isArrayBindingPattern(name)) {
      name.elements.forEach(el => {
        if (!ts.isOmittedExpression(el)) visitName(el.name)
      })
    }
  }
  for (const p of arrow.parameters) visitName(p.name)
  return names
}

/**
 * Collect identifiers referenced inside the arrow's body (or its
 * parameter type annotations) that are not bound by the arrow's own
 * parameters or by any nested binding within the body. Mirrors the
 * spirit of `extractFreeIdentifiersFromNode` in analyzer.ts but runs
 * before the analyzer is wired up.
 */
function collectFreeIdentifiers(arrow: ts.ArrowFunction): Set<string> {
  const ids = new Set<string>()
  const bound: string[] = []

  function pushBindings(name: ts.BindingName): void {
    if (ts.isIdentifier(name)) bound.push(name.text)
    else if (ts.isObjectBindingPattern(name)) name.elements.forEach(e => pushBindings(e.name))
    else if (ts.isArrayBindingPattern(name)) name.elements.forEach(e => {
      if (!ts.isOmittedExpression(e)) pushBindings(e.name)
    })
  }

  for (const p of arrow.parameters) pushBindings(p.name)

  function isBound(name: string): boolean {
    return bound.includes(name)
  }

  function visit(node: ts.Node): void {
    if (ts.isIdentifier(node)) {
      const parent = node.parent
      if (parent && ts.isPropertyAccessExpression(parent) && parent.name === node) return
      if (parent && ts.isPropertyAssignment(parent) && parent.name === node) return
      if (parent && ts.isPropertySignature(parent) && parent.name === node) return
      if (parent && ts.isParameter(parent) && parent.name === node) return
      if (parent && ts.isVariableDeclaration(parent) && parent.name === node) return
      if (parent && ts.isJsxAttribute(parent) && parent.name === node) return
      if (parent && ts.isJsxOpeningElement(parent) && parent.tagName === node) {
        // JSX intrinsic like <div> uses an Identifier as tagName whose
        // first letter determines intrinsic vs component. Lowercase
        // tags resolve at the runtime as strings, not identifiers.
        if (/^[a-z]/.test(node.text)) return
      }
      if (parent && ts.isJsxClosingElement(parent) && parent.tagName === node) {
        if (/^[a-z]/.test(node.text)) return
      }
      if (isBound(node.text)) return
      ids.add(node.text)
      return
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      bound.push(node.name.text)
      ts.forEachChild(node, visit)
      const idx = bound.lastIndexOf(node.name.text)
      if (idx >= 0) bound.splice(idx, 1)
      return
    }
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)) {
      const innerBound: string[] = []
      for (const p of node.parameters) {
        const params: string[] = []
        ;(function collect(name: ts.BindingName): void {
          if (ts.isIdentifier(name)) params.push(name.text)
          else if (ts.isObjectBindingPattern(name)) name.elements.forEach(e => collect(e.name))
          else if (ts.isArrayBindingPattern(name)) name.elements.forEach(e => {
            if (!ts.isOmittedExpression(e)) collect(e.name)
          })
        })(p.name)
        innerBound.push(...params)
      }
      bound.push(...innerBound)
      ts.forEachChild(node, visit)
      for (let i = 0; i < innerBound.length; i++) bound.pop()
      return
    }
    ts.forEachChild(node, visit)
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

  function pushBinding(name: ts.BindingName): void {
    if (ts.isIdentifier(name)) names.add(name.text)
    else if (ts.isObjectBindingPattern(name)) name.elements.forEach(e => pushBinding(e.name))
    else if (ts.isArrayBindingPattern(name)) name.elements.forEach(e => {
      if (!ts.isOmittedExpression(e)) pushBinding(e.name)
    })
  }

  for (const stmt of sourceFile.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name) names.add(stmt.name.text)
    else if (ts.isClassDeclaration(stmt) && stmt.name) names.add(stmt.name.text)
    else if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) pushBinding(decl.name)
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
 * for any imported types referenced in the annotations.
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

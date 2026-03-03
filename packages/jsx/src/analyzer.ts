/**
 * BarefootJS Compiler - Single-Pass Analyzer
 *
 * Analyzes TypeScript/JSX source code in a single pass,
 * extracting all necessary metadata for IR generation.
 */

import ts from 'typescript'
import type { ImportSpecifier, TypeInfo, ParamInfo } from './types'
import {
  type AnalyzerContext,
  type ConditionalReturn,
  createAnalyzerContext,
  getSourceLocation,
  typeNodeToTypeInfo,
  isComponentFunction,
  isArrowComponentFunction,
} from './analyzer-context'
import { createError, createWarning, ErrorCodes } from './errors'
import path from 'path'

// =============================================================================
// TypeScript Program Creation
// =============================================================================

/**
 * Packages that export Reactive<T>-branded types beyond createSignal/createMemo.
 * Files importing from these packages need ts.TypeChecker for reactivity detection.
 * Regex-based detection handles createSignal/createMemo/props; the TypeChecker is
 * only needed for library accessor patterns like username.error() or form.isSubmitting().
 */
const REACTIVE_BRAND_PACKAGES = [
  '@barefootjs/form',
]

/**
 * Check if a source file imports from packages that export Reactive<T>-branded types.
 * Only these files need ts.createProgram() for type-based detection — all others
 * can rely on the regex fallback (which handles signals, memos, and props).
 */
export function needsTypeBasedDetection(source: string): boolean {
  return REACTIVE_BRAND_PACKAGES.some(pkg => source.includes(pkg))
}

/**
 * Create a TypeScript program for a single file to enable type-based reactivity detection.
 * Uses a virtual CompilerHost that injects the source string as a virtual file
 * and delegates to the real file system for node_modules resolution.
 *
 * Note: Module resolution depends on node_modules being reachable from the file's
 * directory. If the file path is virtual or node_modules isn't accessible,
 * imported types may resolve to `any` and the signal/memo regex fallback kicks in.
 * For full type resolution in build tools, pass a pre-built ts.Program via
 * CompileOptions.program instead.
 */
export function createProgramForFile(
  source: string,
  filePath: string
): { program: ts.Program; sourceFile: ts.SourceFile; checker: ts.TypeChecker } | null {
  try {
    const normalizedPath = path.resolve(filePath)

    const compilerOptions: ts.CompilerOptions = {
      target: ts.ScriptTarget.Latest,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
      strict: true,
      skipLibCheck: true,
      noEmit: true,
      baseUrl: path.dirname(normalizedPath),
    }

    const defaultHost = ts.createCompilerHost(compilerOptions)

    const virtualHost: ts.CompilerHost = {
      ...defaultHost,
      getSourceFile(fileName, languageVersion) {
        if (path.resolve(fileName) === normalizedPath) {
          return ts.createSourceFile(fileName, source, languageVersion, true, ts.ScriptKind.TSX)
        }
        return defaultHost.getSourceFile(fileName, languageVersion)
      },
      fileExists(fileName) {
        if (path.resolve(fileName) === normalizedPath) return true
        return defaultHost.fileExists(fileName)
      },
      readFile(fileName) {
        if (path.resolve(fileName) === normalizedPath) return source
        return defaultHost.readFile(fileName)
      },
    }

    const program = ts.createProgram([normalizedPath], compilerOptions, virtualHost)
    const sourceFile = program.getSourceFile(normalizedPath)

    if (!sourceFile) return null

    return { program, sourceFile, checker: program.getTypeChecker() }
  } catch {
    // Fall back to regex-based detection
    return null
  }
}

// =============================================================================
// Main Entry Point
// =============================================================================

export function analyzeComponent(
  source: string,
  filePath: string,
  targetComponentName?: string,
  program?: ts.Program
): AnalyzerContext {
  let sourceFile: ts.SourceFile | undefined
  let checker: ts.TypeChecker | null = null

  if (program) {
    // Use the pre-built program's source file and checker
    sourceFile = program.getSourceFile(filePath)
    if (sourceFile) {
      checker = program.getTypeChecker()
    }
  }

  if (!sourceFile) {
    sourceFile = ts.createSourceFile(
      filePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    )
  }

  // Create ts.Program only when the file imports from packages that export
  // Reactive<T>-branded types beyond what regex detection handles.
  // This avoids ~220ms overhead per file for the majority of components.
  if (!checker && needsTypeBasedDetection(source)) {
    const result = createProgramForFile(source, filePath)
    if (result) {
      sourceFile = result.sourceFile
      checker = result.checker
    }
  }

  const ctx = createAnalyzerContext(sourceFile, filePath)
  ctx.checker = checker

  // If no target specified, prioritize the default exported component
  if (!targetComponentName) {
    targetComponentName = findDefaultExportedComponent(sourceFile)
  }

  // Single pass visitor
  visit(sourceFile, ctx, targetComponentName)

  // Post-processing validations
  validateContext(ctx)

  return ctx
}

/**
 * Find the name of the default exported component in the source file.
 * Returns undefined if no default export or if it doesn't export a component.
 */
function findDefaultExportedComponent(sourceFile: ts.SourceFile): string | undefined {
  let defaultExportName: string | undefined

  function findDefaultExport(node: ts.Node): void {
    // export default ComponentName
    if (ts.isExportAssignment(node) && !node.isExportEquals) {
      if (ts.isIdentifier(node.expression)) {
        defaultExportName = node.expression.text
      }
    }
    ts.forEachChild(node, findDefaultExport)
  }

  ts.forEachChild(sourceFile, findDefaultExport)
  return defaultExportName
}

// =============================================================================
// Single Pass Visitor
// =============================================================================

function visit(
  node: ts.Node,
  ctx: AnalyzerContext,
  targetComponentName?: string
): void {
  // Check for 'use client' directive at module level
  if (ts.isExpressionStatement(node) && ts.isStringLiteral(node.expression)) {
    if (
      node.expression.text === 'use client' ||
      node.expression.text === "'use client'"
    ) {
      ctx.hasUseClientDirective = true
    }
  }

  // Import declarations
  if (ts.isImportDeclaration(node)) {
    collectImport(node, ctx)
  }

  // Type definitions (interface, type alias)
  if (ts.isInterfaceDeclaration(node)) {
    collectInterfaceDefinition(node, ctx)
  }
  if (ts.isTypeAliasDeclaration(node)) {
    collectTypeAliasDefinition(node, ctx)
  }

  // Component function
  if (isComponentFunction(node)) {
    if (!targetComponentName || node.name.text === targetComponentName) {
      if (!ctx.componentName) {
        ctx.componentName = node.name.text
        ctx.componentNode = node
        analyzeComponentBody(node, ctx)
      }
    } else {
      // Skip recursion into non-target component bodies
      return
    }
  }

  // Arrow function component
  if (isArrowComponentFunction(node)) {
    if (!targetComponentName || node.name.text === targetComponentName) {
      if (!ctx.componentName) {
        ctx.componentName = node.name.text
        ctx.componentNode = node.initializer
        analyzeComponentBody(node.initializer, ctx)
      }
    } else {
      // Skip recursion into non-target component bodies
      return
    }
  }

  // Module-level constants (outside component)
  if (ts.isVariableStatement(node) && !ctx.componentNode) {
    const isExported = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false
    const isLet = (node.declarationList.flags & ts.NodeFlags.Let) !== 0
    for (const decl of node.declarationList.declarations) {
      if (
        ts.isIdentifier(decl.name) &&
        decl.initializer &&
        !isArrowComponentFunction(decl)
      ) {
        collectConstant(decl, ctx, true, isLet ? 'let' : 'const', isExported)
      }
    }
  }

  // Module-level functions (outside component)
  if (ts.isFunctionDeclaration(node) && node.name && !isComponentFunction(node)) {
    const isExported = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false
    collectFunction(node, ctx, true, isExported)
    return // Body is captured as string; don't walk internals
  }

  // Named exports: export { X, Y } — mark already-collected items as exported
  if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
    for (const specifier of node.exportClause.elements) {
      const name = specifier.name.text
      for (const c of ctx.localConstants) {
        if (c.name === name) c.isExported = true
      }
      for (const f of ctx.localFunctions) {
        if (f.name === name) f.isExported = true
      }
    }
  }

  // Default export: export default ComponentName
  if (ts.isExportAssignment(node) && !node.isExportEquals) {
    const expr = node.expression
    if (ts.isIdentifier(expr)) {
      // Check if it exports the component
      if (ctx.componentName && expr.text === ctx.componentName) {
        ctx.hasDefaultExport = true
      }
    }
  }

  ts.forEachChild(node, (child) => visit(child, ctx, targetComponentName))
}

// =============================================================================
// Component Body Analysis
// =============================================================================

function analyzeComponentBody(
  node: ts.FunctionDeclaration | ts.ArrowFunction,
  ctx: AnalyzerContext
): void {
  // Extract props
  if (node.parameters.length > 0) {
    extractProps(node.parameters[0], ctx)
  }

  // Visit component body
  const body = ts.isFunctionDeclaration(node) ? node.body : getArrowFunctionBody(node)
  if (body) {
    visitComponentBody(body, ctx)
  }
}

function getArrowFunctionBody(
  node: ts.ArrowFunction
): ts.Block | ts.Expression | undefined {
  if (ts.isBlock(node.body)) {
    return node.body
  }
  return node.body
}

function visitComponentBody(node: ts.Node, ctx: AnalyzerContext): void {
  // Variable declarations (signals, memos, constants)
  if (ts.isVariableStatement(node)) {
    for (const decl of node.declarationList.declarations) {
      if (isSignalDeclaration(decl)) {
        collectSignal(decl, ctx)
      } else if (isMemoDeclaration(decl)) {
        collectMemo(decl, ctx)
      } else if (ts.isIdentifier(decl.name)) {
        const isLet = (node.declarationList.flags & ts.NodeFlags.Let) !== 0
        collectConstant(decl, ctx, false, isLet ? 'let' : 'const')
      }
    }
  }

  // Effect calls - collect the effect but don't recurse into it
  if (ts.isExpressionStatement(node)) {
    if (isEffectCall(node.expression)) {
      collectEffect(node.expression as ts.CallExpression, ctx)
      // Don't recurse into createEffect body to avoid collecting inner variables
      return
    }
    if (isOnMountCall(node.expression)) {
      collectOnMount(node.expression as ts.CallExpression, ctx)
      // Don't recurse into onMount body to avoid collecting inner variables
      return
    }
  }

  // Function declarations inside component
  if (ts.isFunctionDeclaration(node) && node.name) {
    collectFunction(node, ctx, false)
  }

  // If statement with JSX return (early return pattern)
  if (ts.isIfStatement(node)) {
    const jsxReturn = findJsxReturnInBlock(node.thenStatement)
    if (jsxReturn) {
      const scopeVars = collectScopeVariables(node.thenStatement, ctx)
      ctx.conditionalReturns.push({
        condition: node.expression,
        jsxReturn,
        scopeVariables: scopeVars,
        ifStatement: node,
      })
      // Don't set ctx.jsxReturn here - let the final return be processed normally
      // Don't recurse into the if block since we've already captured it
      return
    }
  }

  // Return statement with JSX
  if (ts.isReturnStatement(node) && node.expression) {
    if (
      ts.isJsxElement(node.expression) ||
      ts.isJsxFragment(node.expression) ||
      ts.isJsxSelfClosingElement(node.expression)
    ) {
      ctx.jsxReturn = node.expression
    }
    // Handle parenthesized JSX: return ( <div>...</div> )
    if (ts.isParenthesizedExpression(node.expression)) {
      const inner = node.expression.expression
      if (
        ts.isJsxElement(inner) ||
        ts.isJsxFragment(inner) ||
        ts.isJsxSelfClosingElement(inner)
      ) {
        ctx.jsxReturn = inner
      }
    }
  }

  // Arrow function with implicit return (JSX body)
  if (
    (ts.isJsxElement(node) ||
      ts.isJsxFragment(node) ||
      ts.isJsxSelfClosingElement(node)) &&
    !ctx.jsxReturn
  ) {
    ctx.jsxReturn = node
  }

  // Skip recursion into function bodies (arrow functions, function expressions, function declarations)
  // to avoid collecting inner local variables
  ts.forEachChild(node, (child) => {
    // Don't recurse into function bodies - their variables are function-scoped
    if (
      ts.isArrowFunction(child) ||
      ts.isFunctionExpression(child) ||
      ts.isFunctionDeclaration(child)
    ) {
      return
    }
    visitComponentBody(child, ctx)
  })
}

/**
 * Find a JSX return statement in an if block.
 */
function findJsxReturnInBlock(
  node: ts.Statement
): ts.JsxElement | ts.JsxFragment | ts.JsxSelfClosingElement | null {
  // Block statement: if (cond) { ... return <jsx> }
  if (ts.isBlock(node)) {
    for (const stmt of node.statements) {
      if (ts.isReturnStatement(stmt) && stmt.expression) {
        const jsx = extractJsxFromExpression(stmt.expression)
        if (jsx) return jsx
      }
    }
  }
  // Single statement: if (cond) return <jsx>
  if (ts.isReturnStatement(node) && node.expression) {
    return extractJsxFromExpression(node.expression)
  }
  return null
}

/**
 * Extract JSX element from an expression, handling parenthesized expressions.
 */
function extractJsxFromExpression(
  expr: ts.Expression
): ts.JsxElement | ts.JsxFragment | ts.JsxSelfClosingElement | null {
  if (ts.isJsxElement(expr) || ts.isJsxFragment(expr) || ts.isJsxSelfClosingElement(expr)) {
    return expr
  }
  if (ts.isParenthesizedExpression(expr)) {
    return extractJsxFromExpression(expr.expression)
  }
  return null
}

/**
 * Collect variable declarations from an if block scope.
 */
function collectScopeVariables(
  node: ts.Statement,
  ctx: AnalyzerContext
): ts.VariableDeclaration[] {
  const variables: ts.VariableDeclaration[] = []

  if (ts.isBlock(node)) {
    for (const stmt of node.statements) {
      if (ts.isVariableStatement(stmt)) {
        for (const decl of stmt.declarationList.declarations) {
          variables.push(decl)
        }
      }
    }
  }

  return variables
}

// =============================================================================
// Signal Detection & Collection
// =============================================================================

function isSignalDeclaration(node: ts.VariableDeclaration): boolean {
  if (!ts.isArrayBindingPattern(node.name)) return false
  if (!node.initializer || !ts.isCallExpression(node.initializer)) return false

  const callExpr = node.initializer
  return (
    ts.isIdentifier(callExpr.expression) &&
    callExpr.expression.text === 'createSignal'
  )
}

function collectSignal(node: ts.VariableDeclaration, ctx: AnalyzerContext): void {
  const pattern = node.name as ts.ArrayBindingPattern
  const callExpr = node.initializer as ts.CallExpression

  const elements = pattern.elements
  if (
    elements.length !== 2 ||
    !ts.isBindingElement(elements[0]) ||
    !ts.isBindingElement(elements[1]) ||
    !ts.isIdentifier(elements[0].name) ||
    !ts.isIdentifier(elements[1].name)
  ) {
    return
  }

  const getter = elements[0].name.text
  const setter = elements[1].name.text
  const initialValue = callExpr.arguments[0] ? ctx.getJS(callExpr.arguments[0]) : ''

  // Try to infer type from initial value or type argument
  let type: TypeInfo = { kind: 'unknown', raw: 'unknown' }

  // Check for type argument: createSignal<number>(0)
  if (callExpr.typeArguments && callExpr.typeArguments.length > 0) {
    type = typeNodeToTypeInfo(callExpr.typeArguments[0], ctx.sourceFile) ?? type
  } else {
    // Infer from initial value
    type = inferTypeFromValue(initialValue)
  }

  ctx.signals.push({
    getter,
    setter,
    initialValue,
    type,
    loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
  })
}

// =============================================================================
// Memo Detection & Collection
// =============================================================================

function isMemoDeclaration(node: ts.VariableDeclaration): boolean {
  if (!ts.isIdentifier(node.name)) return false
  if (!node.initializer || !ts.isCallExpression(node.initializer)) return false

  const callExpr = node.initializer
  return (
    ts.isIdentifier(callExpr.expression) &&
    callExpr.expression.text === 'createMemo'
  )
}

function collectMemo(node: ts.VariableDeclaration, ctx: AnalyzerContext): void {
  const name = (node.name as ts.Identifier).text
  const callExpr = node.initializer as ts.CallExpression
  const computation = callExpr.arguments[0] ? ctx.getJS(callExpr.arguments[0]) : ''

  // Extract dependencies from computation
  const deps = extractDependencies(computation, ctx)

  // Try to infer type
  let type: TypeInfo = { kind: 'unknown', raw: 'unknown' }
  if (callExpr.typeArguments && callExpr.typeArguments.length > 0) {
    type = typeNodeToTypeInfo(callExpr.typeArguments[0], ctx.sourceFile) ?? type
  }

  ctx.memos.push({
    name,
    computation,
    type,
    deps,
    loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
  })
}

// =============================================================================
// Effect Detection & Collection
// =============================================================================

function isEffectCall(node: ts.Expression): boolean {
  if (!ts.isCallExpression(node)) return false
  return (
    ts.isIdentifier(node.expression) && node.expression.text === 'createEffect'
  )
}

function collectEffect(node: ts.CallExpression, ctx: AnalyzerContext): void {
  const body = node.arguments[0] ? ctx.getJS(node.arguments[0]) : ''
  const deps = extractDependencies(body, ctx)

  ctx.effects.push({
    body,
    deps,
    loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
  })
}

// =============================================================================
// onMount Detection & Collection
// =============================================================================

function isOnMountCall(node: ts.Expression): boolean {
  if (!ts.isCallExpression(node)) return false
  return (
    ts.isIdentifier(node.expression) && node.expression.text === 'onMount'
  )
}

function collectOnMount(node: ts.CallExpression, ctx: AnalyzerContext): void {
  const body = node.arguments[0] ? ctx.getJS(node.arguments[0]) : ''

  ctx.onMounts.push({
    body,
    loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
  })
}

// =============================================================================
// Import Collection
// =============================================================================

function collectImport(node: ts.ImportDeclaration, ctx: AnalyzerContext): void {
  const source = (node.moduleSpecifier as ts.StringLiteral).text
  const specifiers: ImportSpecifier[] = []
  const isTypeOnly = !!node.importClause?.isTypeOnly

  if (node.importClause) {
    // Default import
    if (node.importClause.name) {
      specifiers.push({
        name: node.importClause.name.text,
        alias: null,
        isDefault: true,
        isNamespace: false,
      })
    }

    // Named imports
    if (node.importClause.namedBindings) {
      if (ts.isNamedImports(node.importClause.namedBindings)) {
        for (const element of node.importClause.namedBindings.elements) {
          specifiers.push({
            name: element.propertyName?.text ?? element.name.text,
            alias: element.propertyName ? element.name.text : null,
            isDefault: false,
            isNamespace: false,
          })
        }
      }
      // Namespace import
      if (ts.isNamespaceImport(node.importClause.namedBindings)) {
        specifiers.push({
          name: node.importClause.namedBindings.name.text,
          alias: null,
          isDefault: false,
          isNamespace: true,
        })
      }
    }
  }

  ctx.imports.push({
    source,
    specifiers,
    isTypeOnly,
    loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
  })
}

// =============================================================================
// Type Definition Collection
// =============================================================================

function collectInterfaceDefinition(
  node: ts.InterfaceDeclaration,
  ctx: AnalyzerContext
): void {
  ctx.typeDefinitions.push({
    kind: 'interface',
    name: node.name.text,
    definition: node.getText(ctx.sourceFile),
    loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
  })
}

function collectTypeAliasDefinition(
  node: ts.TypeAliasDeclaration,
  ctx: AnalyzerContext
): void {
  ctx.typeDefinitions.push({
    kind: 'type',
    name: node.name.text,
    definition: node.getText(ctx.sourceFile),
    loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
  })
}

// =============================================================================
// Function Collection
// =============================================================================

function collectFunction(
  node: ts.FunctionDeclaration,
  ctx: AnalyzerContext,
  _isModule: boolean,
  isExported: boolean = false
): void {
  if (!node.name) return

  const name = node.name.text
  const params: ParamInfo[] = node.parameters.map((p) => ({
    name: p.name.getText(ctx.sourceFile),
    type: typeNodeToTypeInfo(p.type, ctx.sourceFile) ?? {
      kind: 'unknown',
      raw: 'unknown',
    },
    optional: !!p.questionToken,
    defaultValue: p.initializer ? ctx.getJS(p.initializer) : undefined,
  }))
  const body = node.body ? ctx.getJS(node.body) : ''
  const returnType = typeNodeToTypeInfo(node.type, ctx.sourceFile)

  // Check if function contains JSX
  const containsJsx = body.includes('<') && (body.includes('/>') || body.includes('</'))

  ctx.localFunctions.push({
    name,
    params,
    body,
    returnType,
    containsJsx,
    isExported,
    loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
  })
}

// =============================================================================
// Constant Collection
// =============================================================================

function collectConstant(
  node: ts.VariableDeclaration,
  ctx: AnalyzerContext,
  _isModule: boolean,
  declarationKind: 'const' | 'let' = 'const',
  isExported: boolean = false
): void {
  if (!ts.isIdentifier(node.name)) return

  // Skip if it's a signal or memo
  if (isSignalDeclaration(node) || isMemoDeclaration(node)) return

  const name = node.name.text
  const value = node.initializer
    ? ctx.getJS(node.initializer)
    : undefined

  // Get type from annotation or infer
  let type: TypeInfo | null = null
  if (node.type) {
    type = typeNodeToTypeInfo(node.type, ctx.sourceFile)
  } else if (value) {
    type = inferTypeFromValue(value)
  }

  ctx.localConstants.push({
    name,
    value,
    declarationKind,
    isExported,
    type,
    loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
  })
}

// =============================================================================
// Ignore Directive Detection
// =============================================================================

/**
 * Check if a node has an ignore directive comment for the specified rule.
 * Supports: // @bf-ignore rule-id
 *
 * For arrow function components, also checks the parent VariableStatement.
 */
function hasIgnoreDirective(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  ruleId: string
): boolean {
  const checkComments = (targetNode: ts.Node): boolean => {
    const fullStart = targetNode.getFullStart()
    const leadingComments = ts.getLeadingCommentRanges(
      sourceFile.getFullText(),
      fullStart
    )
    if (!leadingComments) return false

    for (const range of leadingComments) {
      const text = sourceFile.getFullText().slice(range.pos, range.end)
      if (text.includes(`@bf-ignore ${ruleId}`)) {
        return true
      }
    }
    return false
  }

  // Check the node itself
  if (checkComments(node)) return true

  // For arrow functions, check the parent VariableStatement
  // AST structure: VariableStatement > VariableDeclarationList > VariableDeclaration > ArrowFunction
  if (ts.isArrowFunction(node)) {
    let current: ts.Node | undefined = node.parent
    while (current) {
      if (ts.isVariableStatement(current)) {
        if (checkComments(current)) return true
        break
      }
      current = current.parent
    }
  }

  return false
}

// =============================================================================
// Props Extraction
// =============================================================================

function extractProps(param: ts.ParameterDeclaration, ctx: AnalyzerContext): void {
  // Pattern 1: Destructured props - { prop1, prop2 }
  if (ts.isObjectBindingPattern(param.name)) {
    // Record destructuring info for deferred BF043 emission (stateful components only)
    const componentNode = ctx.componentNode
    const ignored = !!(componentNode && hasIgnoreDirective(componentNode, ctx.sourceFile, 'props-destructuring'))
    ctx.propsDestructuring = {
      loc: getSourceLocation(param, ctx.sourceFile, ctx.filePath),
      hasIgnoreDirective: ignored,
    }

    for (const element of param.name.elements) {
      if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
        const localName = element.name.text
        const defaultValue = element.initializer ? ctx.getJS(element.initializer) : undefined

        // Handle rest props: { ...props }
        if (element.dotDotDotToken) {
          ctx.restPropsName = localName
          continue
        }

        ctx.propsParams.push({
          name: localName,
          type: { kind: 'unknown', raw: 'unknown' },
          optional: !!element.initializer,
          defaultValue,
        })
      }
    }

    // Compute restPropsExpandedKeys when rest props exist with a type annotation
    if (ctx.restPropsName && param.type) {
      const allKeys = collectTypeKeys(param.type, ctx)
      if (allKeys) {
        const destructuredKeys = new Set(ctx.propsParams.map(p => p.name))
        ctx.restPropsExpandedKeys = allKeys.filter(k => !destructuredKeys.has(k))
      }
    }
  }

  // Pattern 2: Props object - props: Type (SolidJS-style)
  if (ts.isIdentifier(param.name)) {
    ctx.propsObjectName = param.name.text

    // Extract properties from the type annotation
    if (param.type) {
      extractPropsFromType(param.type, ctx)
    }
  }

  // Get props type annotation
  if (param.type) {
    ctx.propsType = typeNodeToTypeInfo(param.type, ctx.sourceFile)
  }
}

/**
 * Collect all property key names from a type node.
 * Returns null for open types (extends HTMLAttributes, index signatures, etc.)
 * where static key enumeration is not possible.
 */
function collectTypeKeys(typeNode: ts.TypeNode, ctx: AnalyzerContext): string[] | null {
  if (ts.isTypeLiteralNode(typeNode)) {
    return collectKeysFromMembers(typeNode.members, ctx)
  }

  if (ts.isTypeReferenceNode(typeNode)) {
    const typeName = typeNode.typeName.getText(ctx.sourceFile)
    const typeDecl = findTypeDeclaration(typeName, ctx.sourceFile)
    if (!typeDecl) return null // External type — open

    if (ts.isInterfaceDeclaration(typeDecl)) {
      // Interface with extends clause is considered open
      if (typeDecl.heritageClauses && typeDecl.heritageClauses.length > 0) return null
      return collectKeysFromMembers(typeDecl.members, ctx)
    }
    if (ts.isTypeAliasDeclaration(typeDecl)) {
      if (ts.isTypeLiteralNode(typeDecl.type)) {
        return collectKeysFromMembers(typeDecl.type.members, ctx)
      }
      if (ts.isIntersectionTypeNode(typeDecl.type)) {
        // Intersection types are considered open
        return null
      }
    }
  }

  return null
}

function collectKeysFromMembers(
  members: ts.NodeArray<ts.TypeElement>,
  ctx: AnalyzerContext
): string[] | null {
  const keys: string[] = []
  for (const member of members) {
    // Index signatures make the type open
    if (ts.isIndexSignatureDeclaration(member)) return null
    if (ts.isPropertySignature(member) && member.name) {
      keys.push(member.name.getText(ctx.sourceFile))
    }
  }
  return keys
}

/**
 * Extract props parameters from a type annotation.
 * Supports type literals and type references to local interfaces.
 */
function extractPropsFromType(typeNode: ts.TypeNode, ctx: AnalyzerContext): void {
  // Type literal: { prop1: Type1; prop2?: Type2 }
  if (ts.isTypeLiteralNode(typeNode)) {
    extractPropsFromTypeMembers(typeNode.members, ctx)
    return
  }

  // Type reference: PropsType or Interface name
  if (ts.isTypeReferenceNode(typeNode)) {
    const typeName = typeNode.typeName.getText(ctx.sourceFile)

    // Find the type definition in the same file
    const typeDecl = findTypeDeclaration(typeName, ctx.sourceFile)
    if (typeDecl) {
      if (ts.isInterfaceDeclaration(typeDecl)) {
        extractPropsFromTypeMembers(typeDecl.members, ctx)
      } else if (ts.isTypeAliasDeclaration(typeDecl) && ts.isTypeLiteralNode(typeDecl.type)) {
        extractPropsFromTypeMembers(typeDecl.type.members, ctx)
      }
    }
  }
}

/**
 * Extract props from interface/type members.
 */
function extractPropsFromTypeMembers(
  members: ts.NodeArray<ts.TypeElement>,
  ctx: AnalyzerContext
): void {
  for (const member of members) {
    if (ts.isPropertySignature(member) && member.name) {
      const propName = member.name.getText(ctx.sourceFile)
      const isOptional = !!member.questionToken
      const propType = member.type
        ? typeNodeToTypeInfo(member.type, ctx.sourceFile)
        : { kind: 'unknown' as const, raw: 'unknown' }

      ctx.propsParams.push({
        name: propName,
        type: propType ?? { kind: 'unknown', raw: 'unknown' },
        optional: isOptional,
        defaultValue: undefined,
      })
    }
  }
}

/**
 * Find a type declaration (interface or type alias) by name in the source file.
 */
function findTypeDeclaration(
  typeName: string,
  sourceFile: ts.SourceFile
): ts.InterfaceDeclaration | ts.TypeAliasDeclaration | undefined {
  let result: ts.InterfaceDeclaration | ts.TypeAliasDeclaration | undefined

  function visit(node: ts.Node): void {
    if (ts.isInterfaceDeclaration(node) && node.name.text === typeName) {
      result = node
      return
    }
    if (ts.isTypeAliasDeclaration(node) && node.name.text === typeName) {
      result = node
      return
    }
    ts.forEachChild(node, visit)
  }

  ts.forEachChild(sourceFile, visit)
  return result
}

// =============================================================================
// Helpers
// =============================================================================

function inferTypeFromValue(value: string): TypeInfo {
  const trimmed = value.trim()

  // Handle ?? fallback: infer type from the right-hand side
  const nullishMatch = trimmed.match(/^.+\?\?\s*(.+)$/)
  if (nullishMatch) {
    return inferTypeFromValue(nullishMatch[1])
  }

  // Number
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return { kind: 'primitive', raw: 'number', primitive: 'number' }
  }

  // Boolean
  if (trimmed === 'true' || trimmed === 'false') {
    return { kind: 'primitive', raw: 'boolean', primitive: 'boolean' }
  }

  // String
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith('`') && trimmed.endsWith('`'))
  ) {
    return { kind: 'primitive', raw: 'string', primitive: 'string' }
  }

  // Array
  if (trimmed.startsWith('[')) {
    return { kind: 'array', raw: 'unknown[]' }
  }

  // Object
  if (trimmed.startsWith('{')) {
    return { kind: 'object', raw: 'object' }
  }

  // Null/undefined
  if (trimmed === 'null') {
    return { kind: 'primitive', raw: 'null', primitive: 'null' }
  }
  if (trimmed === 'undefined') {
    return { kind: 'primitive', raw: 'undefined', primitive: 'undefined' }
  }

  return { kind: 'unknown', raw: 'unknown' }
}

function extractDependencies(code: string, ctx: AnalyzerContext): string[] {
  const deps: string[] = []

  // Find signal getter calls: signalName()
  for (const signal of ctx.signals) {
    const pattern = new RegExp(`\\b${signal.getter}\\s*\\(`, 'g')
    if (pattern.test(code)) {
      deps.push(signal.getter)
    }
  }

  // Find memo calls: memoName()
  for (const memo of ctx.memos) {
    const pattern = new RegExp(`\\b${memo.name}\\s*\\(`, 'g')
    if (pattern.test(code)) {
      deps.push(memo.name)
    }
  }

  return deps
}

// =============================================================================
// Validation
// =============================================================================

function validateContext(ctx: AnalyzerContext): void {
  // BF043: Emit props destructuring warning only for stateful components.
  // Stateless components can safely destructure props since values are static.
  const isStateful = ctx.signals.length > 0 || ctx.memos.length > 0 ||
    ctx.effects.length > 0 || ctx.onMounts.length > 0
  if (ctx.propsDestructuring && isStateful && !ctx.propsDestructuring.hasIgnoreDirective) {
    ctx.errors.push(
      createWarning(ErrorCodes.PROPS_DESTRUCTURING, ctx.propsDestructuring.loc, {
        suggestion: {
          message: 'Use props object directly: function Component(props: Props) { ... props.checked ... }',
        },
      })
    )
  }

  // Check for 'use client' directive if signals/events exist
  if (ctx.signals.length > 0 && !ctx.hasUseClientDirective) {
    ctx.errors.push(
      createError(ErrorCodes.MISSING_USE_CLIENT, {
        file: ctx.filePath,
        start: { line: 1, column: 0 },
        end: { line: 1, column: 0 },
      })
    )
  }
}

// =============================================================================
// List Exported Components
// =============================================================================

/**
 * Returns all exported component names in the file.
 * Useful for files with multiple components (e.g., icon.tsx).
 */
export function listExportedComponents(
  source: string,
  filePath: string
): string[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  )

  const componentNames: string[] = []

  function collectComponents(node: ts.Node): void {
    // Exported function declaration
    if (isComponentFunction(node)) {
      componentNames.push(node.name.text)
    }

    // Exported arrow function component
    if (isArrowComponentFunction(node)) {
      componentNames.push(node.name.text)
    }

    ts.forEachChild(node, collectComponents)
  }

  ts.forEachChild(sourceFile, collectComponents)

  return componentNames
}

// =============================================================================
// Export
// =============================================================================

export { type AnalyzerContext } from './analyzer-context'

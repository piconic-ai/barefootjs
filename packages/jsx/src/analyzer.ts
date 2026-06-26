/// <reference types="node" />
/**
 * BarefootJS Compiler - Single-Pass Analyzer
 *
 * Analyzes TypeScript/JSX source code in a single pass,
 * extracting all necessary metadata for IR generation.
 */

import ts from 'typescript'
import type { ImportSpecifier, TypeInfo, ParamInfo, ReactiveFactoryInfo } from './types.ts'
import { parseExpression, parseBlockBodyTolerant } from './expression-parser.ts'
import { rewriteBarePropRefs } from './prop-rewrite.ts'
import { incrementCounter } from './instrumentation.ts'
import {
  type AnalyzerContext,
  type ConditionalReturn,
  createAnalyzerContext,
  getSourceLocation,
  typeNodeToTypeInfo,
  tsTypeToTypeInfo,
  membersToProperties,
  isComponentFunction,
  isArrowComponentFunction,
} from './analyzer-context.ts'
import { createError, createWarning, ErrorCodes } from './errors.ts'
import path from 'node:path'
import fs from 'node:fs'

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
 * Check if a source file needs ts.TypeChecker for static analysis.
 * Reactive-brand detection requires the checker for library accessor patterns.
 * Loop-key nullability (BF023 case 3) also requires it for any file that has .map() calls.
 */
export function needsTypeBasedDetection(source: string): boolean {
  if (REACTIVE_BRAND_PACKAGES.some(pkg => source.includes(pkg))) return true
  // BF023/BF024 nullable-key check needs getTypeAtLocation() on the key expression.
  if (/\.map\s*\(/.test(source)) return true
  return false
}

/**
 * Locate the first `import ... from '<brand-package>'` statement in
 * `sourceFile`. Used by BF050 so the diagnostic points at the offending
 * import line rather than a synthetic (1, 0) position.
 *
 * The scan is structural (`ts.ImportDeclaration` + `StringLiteral`
 * specifier) rather than substring-based so it doesn't false-match on
 * the package name appearing inside a string literal or comment.
 */
function findBrandPackageImportLoc(
  sourceFile: ts.SourceFile,
  filePath: string,
): { file: string; start: { line: number; column: number }; end: { line: number; column: number } } | null {
  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt)) continue
    if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue
    if (!REACTIVE_BRAND_PACKAGES.includes(stmt.moduleSpecifier.text)) continue
    const start = sourceFile.getLineAndCharacterOfPosition(stmt.getStart(sourceFile))
    const end = sourceFile.getLineAndCharacterOfPosition(stmt.getEnd())
    return {
      file: filePath,
      start: { line: start.line + 1, column: start.character },
      end: { line: end.line + 1, column: end.character },
    }
  }
  return null
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
  incrementCounter('programCreations')
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
  incrementCounter('filesAnalyzed')
  // Track whether the caller supplied a shared ts.Program. Used downstream
  // to decide whether the silent per-file fallback should also emit a
  // BF050 diagnostic (issue #1248): when the source needs type-based
  // detection but no shared Program is in scope, the regex fallback may
  // misclassify library-getter reactivity.
  const hadSharedProgram = program !== undefined
  // Pre-pass: inline calls to same-file reactive factory helpers so the
  // downstream analyzer sees ordinary `createSignal(...)` declarations
  // instead of `const [a, b] = customFactory(...)` (#931). Skipped when
  // no recognisable factories are present, so it is a no-op for the
  // common case.
  const prescan = prescanReactiveFactoriesInSource(source, filePath)
  const rewritten = prescan.factories.size > 0
    ? rewriteFactoryCallsInSource(source, prescan)
    : null
  if (rewritten) {
    source = rewritten
    // The pre-built ts.Program (if any) references the original source,
    // so discard it — the analyzer will rebuild a fresh program if
    // type-based detection is needed.
    program = undefined
  }

  let sourceFile: ts.SourceFile | undefined
  let checker: ts.TypeChecker | null = null

  // If the caller passed a shared program but `source` was rewritten
  // upstream (e.g. by preprocessInlineJsxCallbacks in compiler.ts), the
  // program's cached SourceFile still reflects the on-disk text and would
  // mask the rewrite. Discard the program so the parse below uses the
  // rewritten source. needsTypeBasedDetection() further down rebuilds a
  // per-file program when type-based detection is required (#1217).
  if (program) {
    const cachedSourceFile = program.getSourceFile(filePath)
    if (cachedSourceFile && cachedSourceFile.text !== source) {
      program = undefined
    }
  }

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

  // BF050 — surface "no shared Program supplied for type-based reactivity
  // classification" as a diagnostic so callers can fail strict builds
  // rather than silently depending on the per-file Program fallback
  // (issue #1248). Restricted to sources that import a known
  // Reactive<T>-branded library: regex alone cannot classify those
  // getters, so the per-file fallback may misclassify reactivity. The
  // broader `needsTypeBasedDetection` predicate also fires for `.map()`
  // (BF023/BF024 nullable-key check), which is unrelated to reactivity
  // and must NOT trigger BF050.
  const brandImportLoc = findBrandPackageImportLoc(sourceFile, filePath)
  if (!hadSharedProgram && brandImportLoc !== null) {
    ctx.errors.push(createError(
      ErrorCodes.SHARED_PROGRAM_REQUIRED,
      brandImportLoc,
    ))
  }

  // If no target specified, prioritize the default exported component
  if (!targetComponentName) {
    targetComponentName = findDefaultExportedComponent(sourceFile)
  }

  // Pre-scan named exports (`export { Foo, Bar }`) so the multi-return
  // JSX helper reclassifier (#932) can refuse to demote functions that
  // other files import as components. Inline `export function Foo` is
  // picked up via the modifier, but named-export declarations only land
  // at the end of the file — too late for the visit.
  const namedExports = collectNamedExports(sourceFile)

  // Single pass visitor
  visit(sourceFile, ctx, targetComponentName, namedExports)

  // Cross-file: scan imported modules for exported @client signals/memos
  scanImportedClientSignals(ctx)

  // Post-processing validations
  validateContext(ctx)

  // Roadmap A: carry a best-effort structured parse of each signal's initial
  // value so adapters lower a literal init (`useState(['a', 'b'])`) from the
  // tree instead of re-parsing the string with `ts.createSourceFile`. Parse
  // the SAME (type-stripped) `initialValue` the adapter consumes; an
  // unsupported shape leaves `parsed` undefined and the adapter falls back.
  // Runs after `scanImportedClientSignals` so imported signals are covered too.
  for (const signal of ctx.signals) {
    if (!signal.initialValue) continue
    const parsed = parseExpression(signal.initialValue)
    if (parsed.kind !== 'unsupported') signal.parsed = parsed
  }

  return ctx
}

/**
 * Find the name of the default exported component in the source file.
 * Returns undefined if no default export or if it doesn't export a component.
 */
function findDefaultExportedComponent(sourceFile: ts.SourceFile): string | undefined {
  let defaultExportName: string | undefined

  function findDefaultExport(node: ts.Node): void {
    // Pattern 1: export default ComponentName
    if (ts.isExportAssignment(node) && !node.isExportEquals) {
      if (ts.isIdentifier(node.expression)) {
        defaultExportName = node.expression.text
      }
    }
    // Pattern 2: export default function ComponentName() { ... }
    if (
      ts.isFunctionDeclaration(node) &&
      node.name &&
      node.modifiers?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword)
    ) {
      defaultExportName = node.name.text
    }
    ts.forEachChild(node, findDefaultExport)
  }

  ts.forEachChild(sourceFile, findDefaultExport)
  return defaultExportName
}

/**
 * Collect the set of top-level names exported via `export { Name }` or
 * `export { Name as Alias }`. Used by the multi-return JSX helper
 * reclassifier (#932) to keep any PascalCase function that other files
 * import as a component on the component-compilation path.
 */
function collectNamedExports(sourceFile: ts.SourceFile): Set<string> {
  const exported = new Set<string>()
  for (const stmt of sourceFile.statements) {
    if (
      ts.isExportDeclaration(stmt) &&
      stmt.exportClause &&
      ts.isNamedExports(stmt.exportClause)
    ) {
      for (const spec of stmt.exportClause.elements) {
        // `export { LocalName as ExternalName }` — the declaration we
        // care about is identified by the local (`propertyName`) or, if
        // no alias, `name`.
        const local = (spec.propertyName ?? spec.name).text
        exported.add(local)
      }
    }
  }
  return exported
}

// =============================================================================
// Single Pass Visitor
// =============================================================================

function visit(
  node: ts.Node,
  ctx: AnalyzerContext,
  targetComponentName?: string,
  namedExports?: Set<string>
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

  // Module-level multi-return JSX helper (#932): a PascalCase function
  // whose body is a switch / if-else chain where every exit returns JSX
  // or null. In non-`"use client"` files the component pipeline collapses
  // such bodies into an empty output (conditional-returns machinery only
  // runs on the target component); preserve the function verbatim as a
  // helper so the marked-template emitter can include it in any
  // component that references it (<HelperName />).
  //
  // Reclassification only applies to *internal* helpers — functions that
  // aren't exported (inline `export function` or trailing `export { X }`).
  // Exported PascalCase functions are part of this file's public API and
  // other files import them as components; demoting them would break
  // cross-file consumers.
  //
  // `"use client"` files are also left alone — their multi-return
  // components are legitimately stateful (createSignal + onClick branches
  // per variant) and rely on `conditionalReturns` handling at IR time.
  if (
    !ctx.hasUseClientDirective &&
    ts.isFunctionDeclaration(node) &&
    node.name &&
    node.body &&
    isMultiReturnJsxFunctionBody(node.body)
  ) {
    const hasInlineExport = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false
    const hasNamedExport = namedExports?.has(node.name.text) ?? false
    if (!hasInlineExport && !hasNamedExport) {
      collectFunction(node, ctx, true, false)
      // Mark as a multi-return JSX helper so downstream emission (client JS)
      // can distinguish it from ordinary module-level helpers whose `body`
      // happens to contain JSX-like characters inside string literals.
      const fn = ctx.localFunctions.find(f => f.name === node.name!.text)
      if (fn) fn.isMultiReturnJsxHelper = true
      return
    }
  }

  // Component function
  if (isComponentFunction(node)) {
    if (!targetComponentName || node.name.text === targetComponentName) {
      if (!ctx.componentName) {
        ctx.componentName = node.name.text
        ctx.componentNode = node
        ctx.isExported = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false
        analyzeComponentBody(node, ctx)
        // Detect: export default function ComponentName() { ... }
        if (node.modifiers?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword)) {
          ctx.hasDefaultExport = true
        }
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
        // Arrow component: check the parent VariableStatement for export keyword
        const parentStatement = node.parent
        if (ts.isVariableDeclarationList(parentStatement)) {
          const varStatement = parentStatement.parent
          if (ts.isVariableStatement(varStatement)) {
            ctx.isExported = varStatement.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false
          }
        }
        analyzeComponentBody(node.initializer, ctx)
      }
    } else {
      // Skip recursion into non-target component bodies
      return
    }
  }

  // Module-level ambient declarations (TS `declare var X` / `declare let X`
  // / `declare const X` / `declare global { ... }`). These are runtime
  // contracts the author is asserting — TS believes them, and BF052 must
  // too, otherwise legitimate writes to ambient globals would false-fire
  // the "no declaration in scope" diagnostic. Detected before the regular
  // module-level constant path because `declare` statements have no
  // initializer and would otherwise be silently ignored there.
  if (!ctx.componentNode) {
    collectAmbientGlobals(node, ctx)
  }

  // Module-level constants (outside component)
  if (ts.isVariableStatement(node) && !ctx.componentNode) {
    const isExported = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false
    const isLet = (node.declarationList.flags & ts.NodeFlags.Let) !== 0
    const isModuleClientDirective = hasLeadingClientDirectiveOnStatement(node, ctx.sourceFile)
    for (const decl of node.declarationList.declarations) {
      if (declarationIsReactiveFactoryCall(decl, ctx)) {
        if (isModuleClientDirective) {
          // /* @client */ opt-in: collect as a module-scope signal/memo
          // so codegen preserves it in the client bundle and SSR emits a
          // placeholder for any reference.
          collectModuleScopeReactive(decl, ctx, isExported)
        } else {
          // BF011: module-level reactive declaration without opt-in.
          ctx.errors.push(createError(
            ErrorCodes.SIGNAL_OUTSIDE_COMPONENT,
            getSourceLocation(decl, ctx.sourceFile, ctx.filePath),
          ))
        }
        continue
      }
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

  // Named exports: collect for re-emit (so `export { ImportedSym }` survives)
  // AND mark matching locals as exported (so the inline rewrite picks them up).
  if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
    const isFromReexport = !!node.moduleSpecifier
    const sourceSpec =
      node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)
        ? node.moduleSpecifier.text
        : null

    const exportSpecifiers = node.exportClause.elements.map((spec) => ({
      name: (spec.propertyName ?? spec.name).text,
      alias: spec.propertyName ? spec.name.text : null,
      isTypeOnly: spec.isTypeOnly,
    }))

    ctx.namedExports.push({
      source: sourceSpec,
      specifiers: exportSpecifiers,
      isTypeOnly: node.isTypeOnly,
    })

    if (!isFromReexport) {
      for (const specifier of node.exportClause.elements) {
        const local = (specifier.propertyName ?? specifier.name).text
        if (ctx.componentName === local) {
          ctx.isExported = true
        }
        for (const c of ctx.localConstants) {
          if (c.name === local) c.isExported = true
        }
        for (const f of ctx.localFunctions) {
          if (f.name === local) f.isExported = true
        }
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
        ctx.isExported = true
      }
    }
  }

  ts.forEachChild(node, (child) => visit(child, ctx, targetComponentName, namedExports))
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
    // Track the component body Block so visitComponentBody can identify
    // statements that are its direct children (top-level). Any statement
    // that is a direct child of this Block and is not otherwise recognized
    // (signal/memo/effect/onMount/function/JSX-return/conditional-return)
    // is preserved as an InitStatementInfo so it runs at init time. See #930.
    ctx.componentBodyBlock = ts.isBlock(body) ? body : null

    // Arrow shorthand body (`() => <expr>`): the body *is* the JSX return
    // expression. Capture it directly here so `visitComponentBody` does
    // not have to rediscover it via recursion — the recursion-fallback
    // path was the #968 silent-drop mechanism and is removed in #971 PR 5.
    // ParenthesizedExpression is stripped so `() => (<div/>)` captures the
    // inner `<div/>` (equivalent to the pre-refactor `return (<div/>)`
    // unwrap at the block level).
    if (!ctx.componentBodyBlock) {
      ctx.jsxReturn = unwrapJsxTransparent(body as ts.Expression)
    }

    visitComponentBody(body, ctx)
    // Fold any resolved `const s = createSignal(...); const v = s[0]`
    // pairs into regular SignalInfo entries. Must run after visit so
    // accessors declared later in the body are visible.
    flushPendingSignalTuples(ctx)
    ctx.componentBodyBlock = null
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
  // Is this statement a direct child of the component body Block? Only
  // top-level statements are candidates for the "preserve unrecognized
  // statements" path — statements nested inside control flow are reached
  // through recursion and must not be double-captured.
  const isTopLevel = ctx.componentBodyBlock !== null && node.parent === ctx.componentBodyBlock

  // Variable declarations (signals, memos, constants)
  if (ts.isVariableStatement(node)) {
    for (const decl of node.declarationList.declarations) {
      if (isSignalDeclaration(decl, ctx)) {
        collectSignal(decl, ctx)
        continue
      }
      // Index-access patterns must be checked before the tuple-ref form so
      // a chained expression like `const s = createSignal(0)[0]` — parsed
      // with the element access at the root — does not fall through to
      // isSignalTupleDeclaration (which only matches a bare call).
      const indexMatch = isSignalIndexAccess(decl, ctx)
      if (indexMatch) {
        collectSignalFromIndexAccess(decl, indexMatch, ctx)
        continue
      }
      if (isSignalTupleDeclaration(decl)) {
        collectSignalTupleRef(decl, ctx)
        continue
      }
      if (isMemoDeclaration(decl, ctx)) {
        collectMemo(decl, ctx)
        continue
      }
      if (isEffectDisposerCapture(decl, ctx)) {
        // `const dispose = createEffect(() => { ... })` — capture the binding
        // name so emission can preserve the assignment and the effect body
        // both run at mount.
        collectEffect(decl.initializer as ts.CallExpression, ctx, (decl.name as ts.Identifier).text)
        continue
      }
      if (ts.isIdentifier(decl.name)) {
        const isLet = (node.declarationList.flags & ts.NodeFlags.Let) !== 0
        collectConstant(decl, ctx, false, isLet ? 'let' : 'const')
      } else if (
        ts.isObjectBindingPattern(decl.name) &&
        decl.initializer &&
        ts.isIdentifier(decl.initializer) &&
        ctx.propsObjectName === decl.initializer.text
      ) {
        // Body-level destructure from `props` — `collectConstant` handles
        // the expansion into one entry per destructured name.
        const isLet = (node.declarationList.flags & ts.NodeFlags.Let) !== 0
        collectConstant(decl, ctx, false, isLet ? 'let' : 'const')
      }
    }
  }

  // Effect calls - collect the effect but don't recurse into it
  if (ts.isExpressionStatement(node)) {
    if (isEffectCall(node.expression, ctx)) {
      collectEffect(node.expression as ts.CallExpression, ctx)
      // Don't recurse into createEffect body to avoid collecting inner variables
      return
    }
    if (isOnMountCall(node.expression, ctx)) {
      collectOnMount(node.expression as ts.CallExpression, ctx)
      // Don't recurse into onMount body to avoid collecting inner variables
      return
    }
    // Any other top-level expression statement (e.g., console.log, a bare
    // function call with side effects) is preserved verbatim as an init
    // statement so it runs once at mount time. See #930 for motivation.
    if (isTopLevel) {
      collectInitStatement(node, ctx)
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
      // #1414 cell #8: `[X, setX] = createSignal(...)` declarations
      // inside this branch must round-trip through emission so closures /
      // event handlers hoisted to outer init scope can reach them.
      // Tagged with `branchCondition` so the emitter wraps each in
      // `if (<cond>) [X, setX] = createSignal(...)`. The condition text
      // mirrors what `conditionalReturns` already records, but as raw JS
      // for the emit path — destructured-prop rewriting happens later.
      const branchCondition = node.expression.getText(ctx.sourceFile)
      collectBranchSignals(node.thenStatement, ctx, branchCondition)
      // Don't set ctx.jsxReturn here - let the final return be processed normally
      // Don't recurse into the if block since we've already captured it
      return
    }
    // An if statement at the top of the component body that does NOT return
    // JSX is a side-effect guard (e.g., `if (typeof window !== 'undefined')
    // { window.addEventListener(...) }`). Preserve it verbatim. Nested if
    // statements inside blocks are reached via recursion and skipped here
    // (isTopLevel is false for them).
    if (isTopLevel) {
      collectInitStatement(node, ctx)
      return
    }
  }

  // Other top-level imperative statements that carry side effects and don't
  // fit into any of the specialized buckets (try/catch, switch, do/while,
  // for, while, block). Preserve verbatim. For-in/of and while are rare in
  // component bodies but should not be silently dropped if present.
  if (
    isTopLevel &&
    (
      ts.isTryStatement(node) ||
      ts.isSwitchStatement(node) ||
      ts.isForStatement(node) ||
      ts.isForInStatement(node) ||
      ts.isForOfStatement(node) ||
      ts.isWhileStatement(node) ||
      ts.isDoStatement(node) ||
      ts.isThrowStatement(node) ||
      (ts.isBlock(node) && node.parent === ctx.componentBodyBlock)
    )
  ) {
    collectInitStatement(node, ctx)
    return
  }

  // Return statement: capture whatever expression is returned. The Phase 1
  // dispatcher core (`transformJsxExpression`) is the single arbiter of
  // whether the return expression yields IR — it classifies every
  // `ts.SyntaxKind` per spec `Appendix A`. Non-JSX-structural returns
  // (scalar literals, forbidden kinds, etc.) yield `null` and `jsxToIR`
  // treats that as "no IR emitted", matching pre-refactor behaviour.
  //
  // `ParenthesizedExpression` is stripped so `return (<div/>)` captures the
  // inner `<div/>` directly — same semantics as the pre-refactor explicit
  // unwrap, and avoids an extra synthetic scope wrapper at the root.
  //
  // The recursion-as-discriminator path (previously at lines 566-587 of this
  // file: an "arrow function with implicit return" block plus a generic
  // descent) was the #968 silent-drop mechanism — it registered the first
  // nested JSX descendant as `jsxReturn`, so `return cond && <A/>`
  // silently became `<A/>`. With the explicit return / arrow-shorthand
  // paths now covering every legitimate capture site, the recursion no
  // longer touches `jsxReturn`; it retains its other job (walking through
  // statements to collect signals / memos / effects / functions).
  if (ts.isReturnStatement(node) && node.expression) {
    ctx.jsxReturn = unwrapJsxTransparent(node.expression)
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
 * Strip JSX-transparent wrappers from an expression. Matches the
 * "transparent: unwrap and recurse" set in `transformJsxExpression`
 * (`jsx-to-ir.ts`): parentheses + TS type-only wrappers (`as`,
 * `satisfies`, `!`, `<T>`, partially-emitted). Returning-position JSX
 * may carry any of these without changing semantics; the analyzer must
 * see through them so `if (cond) return <jsx/> as X` registers as a
 * conditional return (#1405). Without this, the wrapped early-return
 * was treated as a verbatim init-body statement and its JSX leaked
 * unprocessed into the emitted client JS.
 */
export function unwrapJsxTransparent(expr: ts.Expression): ts.Expression {
  let current = expr
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    current.kind === ts.SyntaxKind.PartiallyEmittedExpression
  ) {
    current = (current as ts.AsExpression | ts.ParenthesizedExpression | ts.SatisfiesExpression | ts.NonNullExpression | ts.TypeAssertion).expression
  }
  return current
}

/**
 * Extract JSX element from an expression, handling parenthesized
 * expressions and TS type-only wrappers (`as`, `satisfies`, `!`,
 * `<T>`).
 */
function extractJsxFromExpression(
  expr: ts.Expression
): ts.JsxElement | ts.JsxFragment | ts.JsxSelfClosingElement | null {
  const inner = unwrapJsxTransparent(expr)
  if (ts.isJsxElement(inner) || ts.isJsxFragment(inner) || ts.isJsxSelfClosingElement(inner)) {
    return inner
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

/**
 * Collect the set of identifier names bound by a function's parameter
 * list, recursing into `ObjectBindingPattern` / `ArrayBindingPattern`
 * so destructured params like `function f({ size })` or
 * `function f([size])` correctly contribute `size` to the bound set.
 * Mirrors `addBindingNames` inside `extractFreeIdentifiersFromNode`.
 * #1422.
 */
function collectParamBindingNames(
  params: ts.NodeArray<ts.ParameterDeclaration>,
): Set<string> {
  const out = new Set<string>()
  const addBindingNames = (name: ts.BindingName): void => {
    if (ts.isIdentifier(name)) {
      out.add(name.text)
    } else if (ts.isObjectBindingPattern(name)) {
      name.elements.forEach(e => addBindingNames(e.name))
    } else if (ts.isArrayBindingPattern(name)) {
      name.elements.forEach(e => {
        if (!ts.isOmittedExpression(e)) addBindingNames(e.name)
      })
    }
  }
  for (const p of params) addBindingNames(p.name)
  return out
}

/**
 * Walk the ancestor chain of `node` looking for any enclosing
 * conditional-return `if`-block. Returns a map from branch-local const
 * name to the text of its initializer. Innermost branch wins on
 * collision (lexical shadowing). JSX-bearing initializers are skipped —
 * substituting them as raw text would emit JSX as TypeScript syntax,
 * which is invalid in raw-JS capture contexts (function bodies, ref
 * callbacks, event handlers). #1422.
 */
function collectEnclosingBranchVars(
  node: ts.Node,
  ctx: AnalyzerContext,
): Map<string, string> {
  const result = new Map<string, string>()
  let current: ts.Node | undefined = node.parent
  while (current) {
    for (const cr of ctx.conditionalReturns) {
      if (cr.ifStatement.thenStatement !== current) continue
      for (const decl of cr.scopeVariables) {
        if (!ts.isIdentifier(decl.name) || !decl.initializer) continue
        const varName = decl.name.text
        // Innermost wins — skip if a deeper branch already set this name.
        if (result.has(varName)) continue
        if (initializerShapeContainsJsx(decl.initializer)) continue
        result.set(varName, ctx.getJS(decl.initializer))
      }
    }
    current = current.parent
  }
  return result
}

/**
 * Walk an if-block body for `createSignal(...)` declarations and add
 * them to `ctx.signals` tagged with `branchCondition`. The emitter
 * then wraps each in `if (<branchCondition>) [getter, setter] =
 * createSignal(<initialValue>)` so closures hoisted to outer init scope
 * can reach the bindings.
 *
 * Only top-level statements of the if-block are inspected — nested
 * if/for/while blocks aren't supported yet (filed as a follow-up if
 * the desk migration hits them; the common case is a flat block).
 */
function collectBranchSignals(
  thenStatement: ts.Statement,
  ctx: AnalyzerContext,
  branchCondition: string,
): void {
  if (!ts.isBlock(thenStatement)) return
  for (const stmt of thenStatement.statements) {
    if (!ts.isVariableStatement(stmt)) continue
    for (const decl of stmt.declarationList.declarations) {
      // Track signals only. Plain (non-signal) branch-local consts are
      // already covered by `_branchScopeVars` text substitution
      // (#1410 / #1412 / #1415 / #1417); they don't need a hoisted
      // declaration because the substitution pass eliminates the
      // identifier before emit. Signal pairs can't be substituted
      // (identity matters — see #1414 cell #8), so they're the only
      // declaration kind that needs hoisting.
      if (!isSignalDeclaration(decl, ctx)) continue
      // Collect using the standard signal-emit path, then tag the
      // most recently added entry with `branchCondition`. This keeps
      // signal-shape detection logic (type inference, setter binding,
      // initialFreeIdentifiers) in one place.
      const before = ctx.signals.length
      collectSignal(decl, ctx)
      const after = ctx.signals.length
      for (let i = before; i < after; i++) {
        ctx.signals[i].branchCondition = branchCondition
      }
    }
  }
}

// =============================================================================
// Signal Detection & Collection
// =============================================================================

/**
 * Canonical names of reactive primitives exported by `@barefootjs/client`.
 * The fast path checks these directly; the symbol-resolution fallback
 * kicks in for aliases and namespace imports when a TypeChecker is
 * available.
 */
const PRIMITIVE_CANONICAL_NAMES: Record<string, 'signal' | 'memo' | 'effect' | 'onMount' | 'onCleanup'> = {
  createSignal: 'signal',
  createMemo: 'memo',
  createEffect: 'effect',
  onMount: 'onMount',
  onCleanup: 'onCleanup',
}

type PrimitiveKind = (typeof PRIMITIVE_CANONICAL_NAMES)[keyof typeof PRIMITIVE_CANONICAL_NAMES]

/**
 * Resolve a call expression to its reactive-primitive kind, or null if it
 * isn't one. Two strategies layered in priority order:
 *
 *  1. Fast path — callee is an Identifier whose text matches a canonical
 *     name (createSignal, createMemo, createEffect, onMount, onCleanup).
 *     Zero TypeChecker work. Covers 99% of real code.
 *
 *  2. Slow path — when (1) didn't match, consult the TypeChecker to
 *     resolve the callee's symbol back through alias and namespace
 *     imports. Recognises `import { createSignal as sig }`, `bf.createSignal`
 *     (where `bf` is a namespace import from @barefootjs/client), and
 *     re-exports that preserve the original name.
 *
 * The slow path is only reached when a checker is present (which, once
 * shared Programs are wired into builds, will be nearly always) AND the
 * fast path missed.
 */
function resolvePrimitiveKind(
  callExpr: ts.CallExpression,
  ctx: AnalyzerContext
): PrimitiveKind | null {
  // Fast path: direct identifier with canonical name.
  if (ts.isIdentifier(callExpr.expression)) {
    const hit = PRIMITIVE_CANONICAL_NAMES[callExpr.expression.text]
    if (hit) return hit
    // Identifier didn't match a canonical name — it might be an alias
    // like `sig` pointing to `createSignal`. Resolve via checker.
    return resolveCalleeViaChecker(callExpr.expression, ctx)
  }

  // Property access: maybe `namespace.createSignal`.
  if (ts.isPropertyAccessExpression(callExpr.expression)) {
    const propName = callExpr.expression.name.text
    const hit = PRIMITIVE_CANONICAL_NAMES[propName]
    if (!hit) return null
    // Property name matches — verify the object is a namespace import
    // from @barefootjs/client before trusting it.
    if (isBarefootClientNamespace(callExpr.expression.expression, ctx)) {
      return hit
    }
  }

  return null
}

/**
 * Walk an identifier's symbol back to its original declaration and check
 * whether it came from `@barefootjs/client` under a canonical primitive
 * name. Returns null when the checker is unavailable or the symbol does
 * not resolve to a known primitive.
 */
function resolveCalleeViaChecker(
  ident: ts.Identifier,
  ctx: AnalyzerContext
): PrimitiveKind | null {
  if (!ctx.checker) return null
  let symbol: ts.Symbol | undefined
  try {
    symbol = ctx.checker.getSymbolAtLocation(ident)
  } catch {
    return null
  }
  if (!symbol) return null
  // Follow alias chains: `import { createSignal as sig }` produces a
  // symbol flagged as Alias; getAliasedSymbol hops to the canonical
  // export declaration.
  let target: ts.Symbol = symbol
  if (symbol.flags & ts.SymbolFlags.Alias) {
    try {
      target = ctx.checker.getAliasedSymbol(symbol)
    } catch {
      return null
    }
  }
  const originalName = target.getName()
  const hit = PRIMITIVE_CANONICAL_NAMES[originalName]
  if (!hit) return null
  // Confirm the declaration actually lives in @barefootjs/client so we
  // don't match a user-defined function that happens to share the name.
  for (const decl of target.declarations ?? []) {
    const sourceName = decl.getSourceFile().fileName
    if (sourceName.includes('@barefootjs/client') || sourceName.includes('packages/client/')) {
      return hit
    }
  }
  return null
}

/**
 * Check whether an expression refers to a namespace import of
 * `@barefootjs/client`, e.g. `import * as bf from '@barefootjs/client'` →
 * `bf` would return true here. Used to validate `bf.createSignal(...)`.
 */
function isBarefootClientNamespace(
  expr: ts.Expression,
  ctx: AnalyzerContext
): boolean {
  if (!ts.isIdentifier(expr)) return false
  if (!ctx.checker) return false
  let symbol: ts.Symbol | undefined
  try {
    symbol = ctx.checker.getSymbolAtLocation(expr)
  } catch {
    return false
  }
  if (!symbol) return false
  for (const decl of symbol.declarations ?? []) {
    if (!ts.isNamespaceImport(decl)) continue
    const importDecl = decl.parent.parent
    if (!ts.isImportDeclaration(importDecl)) continue
    const mod = importDecl.moduleSpecifier
    if (ts.isStringLiteral(mod) && mod.text === '@barefootjs/client') {
      return true
    }
  }
  return false
}

function isSignalDeclaration(node: ts.VariableDeclaration, ctx: AnalyzerContext): boolean {
  if (!ts.isArrayBindingPattern(node.name)) return false
  if (!node.initializer || !ts.isCallExpression(node.initializer)) return false
  return resolvePrimitiveKind(node.initializer, ctx) === 'signal'
}

function collectSignal(node: ts.VariableDeclaration, ctx: AnalyzerContext): void {
  const pattern = node.name as ts.ArrayBindingPattern
  const callExpr = node.initializer as ts.CallExpression

  const elements = pattern.elements
  if (
    elements.length < 1 || elements.length > 2 ||
    !ts.isBindingElement(elements[0]) ||
    !ts.isIdentifier(elements[0].name)
  ) {
    return
  }
  // Validate second element if present
  if (elements.length === 2 && (
    !ts.isBindingElement(elements[1]) ||
    !ts.isIdentifier(elements[1].name)
  )) {
    return
  }

  const getter = elements[0].name.text
  const setter = elements.length === 2 && ts.isBindingElement(elements[1]) && ts.isIdentifier(elements[1].name)
    ? elements[1].name.text
    : null
  const initialValue = callExpr.arguments[0] ? ctx.getJS(callExpr.arguments[0]) : ''
  const typedInitialValue = callExpr.arguments[0] ? callExpr.arguments[0].getText(ctx.sourceFile) : undefined

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
    typedInitialValue: typedInitialValue !== initialValue ? typedInitialValue : undefined,
    type,
    loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
    initialFreeIdentifiers: callExpr.arguments[0]
      ? extractFreeIdentifiersFromNode(callExpr.arguments[0])
      : new Set(),
  })
}

/**
 * Detects `const s = createSignal(...)` — the tuple is stored in an
 * Identifier rather than destructured. The accessor(s) appear in later
 * declarations as `const v = s[0]` / `const sv = s[1]`. The declaration
 * itself is registered as a pending tuple ref and resolved later.
 */
function isSignalTupleDeclaration(node: ts.VariableDeclaration): boolean {
  if (!ts.isIdentifier(node.name)) return false
  if (!node.initializer || !ts.isCallExpression(node.initializer)) return false
  const callExpr = node.initializer
  return (
    ts.isIdentifier(callExpr.expression) &&
    callExpr.expression.text === 'createSignal'
  )
}

type SignalIndexAccessMatch =
  | { kind: 'direct'; index: 0 | 1; callExpr: ts.CallExpression }
  | { kind: 'tupleRef'; index: 0 | 1; tupleName: string }

/**
 * Detects two index-access patterns:
 *   Pattern A (direct)    — `const v = createSignal(...)[N]`
 *   Pattern C (tuple ref) — `const v = s[N]` where `s` is a known tuple ref
 *
 * N must be the numeric literal `0` (getter) or `1` (setter).
 */
function isSignalIndexAccess(
  node: ts.VariableDeclaration,
  ctx: AnalyzerContext
): SignalIndexAccessMatch | null {
  if (!ts.isIdentifier(node.name)) return null
  if (!node.initializer || !ts.isElementAccessExpression(node.initializer)) return null
  const access = node.initializer
  if (!ts.isNumericLiteral(access.argumentExpression)) return null
  const indexValue = Number(access.argumentExpression.text)
  if (indexValue !== 0 && indexValue !== 1) return null
  const index = indexValue as 0 | 1

  // Pattern A: createSignal(...)[N]
  if (ts.isCallExpression(access.expression)) {
    const call = access.expression
    if (
      ts.isIdentifier(call.expression) &&
      call.expression.text === 'createSignal'
    ) {
      return { kind: 'direct', index, callExpr: call }
    }
    return null
  }

  // Pattern C: s[N] where s is a known tuple ref
  if (ts.isIdentifier(access.expression)) {
    const tupleName = access.expression.text
    if (ctx.signalTupleRefs.has(tupleName)) {
      return { kind: 'tupleRef', index, tupleName }
    }
    return null
  }

  return null
}

function collectSignalTupleRef(
  node: ts.VariableDeclaration,
  ctx: AnalyzerContext
): void {
  const name = (node.name as ts.Identifier).text
  const callExpr = node.initializer as ts.CallExpression

  const initialValue = callExpr.arguments[0] ? ctx.getJS(callExpr.arguments[0]) : ''
  const typedInitialValue = callExpr.arguments[0]
    ? callExpr.arguments[0].getText(ctx.sourceFile)
    : undefined

  let type: TypeInfo = { kind: 'unknown', raw: 'unknown' }
  if (callExpr.typeArguments && callExpr.typeArguments.length > 0) {
    type = typeNodeToTypeInfo(callExpr.typeArguments[0], ctx.sourceFile) ?? type
  } else {
    type = inferTypeFromValue(initialValue)
  }

  ctx.signalTupleRefs.set(name, {
    initialValue,
    typedInitialValue: typedInitialValue !== initialValue ? typedInitialValue : undefined,
    type,
    loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
    getter: null,
    setter: null,
    initialFreeIdentifiers: callExpr.arguments[0]
      ? extractFreeIdentifiersFromNode(callExpr.arguments[0])
      : new Set(),
  })
}

function collectSignalFromIndexAccess(
  node: ts.VariableDeclaration,
  match: SignalIndexAccessMatch,
  ctx: AnalyzerContext
): void {
  const varName = (node.name as ts.Identifier).text

  if (match.kind === 'direct') {
    // Pattern A — each declaration is a standalone signal. Pair [0] -> getter
    // or [1] -> setter; the missing half stays null.
    const callExpr = match.callExpr
    const initialValue = callExpr.arguments[0] ? ctx.getJS(callExpr.arguments[0]) : ''
    const typedInitialValue = callExpr.arguments[0]
      ? callExpr.arguments[0].getText(ctx.sourceFile)
      : undefined

    let type: TypeInfo = { kind: 'unknown', raw: 'unknown' }
    if (callExpr.typeArguments && callExpr.typeArguments.length > 0) {
      type = typeNodeToTypeInfo(callExpr.typeArguments[0], ctx.sourceFile) ?? type
    } else {
      type = inferTypeFromValue(initialValue)
    }

    const loc = getSourceLocation(node, ctx.sourceFile, ctx.filePath)
    const initialFreeIdentifiers = callExpr.arguments[0]
      ? extractFreeIdentifiersFromNode(callExpr.arguments[0])
      : new Set<string>()
    if (match.index === 0) {
      ctx.signals.push({
        getter: varName,
        setter: null,
        initialValue,
        typedInitialValue: typedInitialValue !== initialValue ? typedInitialValue : undefined,
        type,
        loc,
        initialFreeIdentifiers,
      })
    } else {
      // Setter-only access: emission requires a getter name. Synthesize one
      // so the `const [g, s] = createSignal(init)` shape stays valid; the
      // synthesized getter is unreferenced in user code.
      ctx.signals.push({
        getter: `__bf_unused_getter_${ctx.signals.length}`,
        setter: varName,
        initialValue,
        typedInitialValue: typedInitialValue !== initialValue ? typedInitialValue : undefined,
        type,
        loc,
        initialFreeIdentifiers,
      })
    }
    return
  }

  // Pattern C — fold accessor into the pending tuple ref. If the same index
  // is claimed twice, keep the first binding (matches how destructuring
  // would collide at the language level).
  const pending = ctx.signalTupleRefs.get(match.tupleName)
  if (!pending) return
  if (match.index === 0) {
    if (!pending.getter) pending.getter = varName
  } else {
    if (!pending.setter) pending.setter = varName
  }
}

/**
 * Flush resolved signal tuple refs into ctx.signals. Entries without at
 * least one accessor are ignored (no DOM-observable effect) and leave
 * the original `const s = createSignal(...)` line unresolved — callers
 * that care can surface a diagnostic, but silently skipping matches the
 * "compile as if nothing special happened" contract for orphan refs.
 */
function flushPendingSignalTuples(ctx: AnalyzerContext): void {
  for (const pending of ctx.signalTupleRefs.values()) {
    if (!pending.getter && !pending.setter) continue
    ctx.signals.push({
      getter: pending.getter ?? `__bf_unused_getter_${ctx.signals.length}`,
      setter: pending.setter,
      initialValue: pending.initialValue,
      typedInitialValue: pending.typedInitialValue,
      type: pending.type,
      loc: pending.loc,
      initialFreeIdentifiers: pending.initialFreeIdentifiers,
    })
  }
  ctx.signalTupleRefs.clear()
}

// =============================================================================
// Memo Detection & Collection
// =============================================================================

function isMemoDeclaration(node: ts.VariableDeclaration, ctx: AnalyzerContext): boolean {
  if (!ts.isIdentifier(node.name)) return false
  if (!node.initializer || !ts.isCallExpression(node.initializer)) return false
  return resolvePrimitiveKind(node.initializer, ctx) === 'memo'
}

/**
 * Does the memo arrow's effective body resolve to a template literal? Mirrors
 * the Go adapter's former `isTemplateLiteralMemo` (which re-parsed `computation`
 * with `ts.createSourceFile`) but runs on the real arrow node at analysis time:
 * unwrap parens, descend a block body to its first `return`, and check for a
 * template expression / no-substitution template literal.
 */
function memoBodyIsTemplateLiteral(memoArrow: ts.Expression | undefined): boolean {
  let node: ts.Node | undefined = memoArrow
  while (node && ts.isParenthesizedExpression(node)) node = node.expression
  if (!node || !ts.isArrowFunction(node)) return false
  let body: ts.Node = node.body
  while (ts.isParenthesizedExpression(body)) body = body.expression
  if (ts.isBlock(body)) {
    const ret = body.statements.find(ts.isReturnStatement)
    if (!ret || !ret.expression) return false
    body = ret.expression
    while (ts.isParenthesizedExpression(body)) body = body.expression
  }
  return ts.isTemplateExpression(body) || ts.isNoSubstitutionTemplateLiteral(body)
}

function collectMemo(node: ts.VariableDeclaration, ctx: AnalyzerContext): void {
  const name = (node.name as ts.Identifier).text
  const callExpr = node.initializer as ts.CallExpression
  const computation = callExpr.arguments[0] ? ctx.getJS(callExpr.arguments[0]) : ''
  const typedComputation = callExpr.arguments[0] ? callExpr.arguments[0].getText(ctx.sourceFile) : undefined

  // Extract dependencies from computation
  const deps = extractDependencies(computation, ctx)

  // Try to infer type. Prefer the explicit `<T>` type argument when
  // present; otherwise fall back to the same value-shape inference
  // signals use (`inferTypeFromValue` handles `.length`, `.some(...)`,
  // `.every(...)`, etc.). Without this, `createMemo(() =>
  // todos().filter(...).length)` ends up as `unknown` and the Go
  // adapter renders the field as `interface{}`, even though the
  // expression is clearly a number.
  let type: TypeInfo = { kind: 'unknown', raw: 'unknown' }
  if (callExpr.typeArguments && callExpr.typeArguments.length > 0) {
    type = typeNodeToTypeInfo(callExpr.typeArguments[0], ctx.sourceFile) ?? type
  } else {
    // The memo computation is an arrow function; the type we want is
    // the body's, not the arrow itself. Pull `() => <body>` apart so
    // `inferTypeFromValue` sees the actual expression.
    const arrowBody = computation.replace(/^\s*\([^)]*\)\s*=>\s*/, '').trim()
    if (arrowBody && arrowBody !== computation) {
      type = inferTypeFromValue(arrowBody)
    }
  }

  // When the syntactic heuristic above can't resolve a precise type
  // (`object`/`unknown` — e.g. a local-function call or a ternary of typed
  // arrays), ask the type checker for the memo body's actual type. This is
  // what lets the Go adapter emit `[][]CalendarDay` / `[]string` / `bool`
  // instead of `map[string]interface{}` / `bool` placeholders (#1968), so a
  // typed backend can populate the SSR data. Only upgrades imprecise results —
  // already-precise syntactic types are left untouched.
  if (
    ctx.checker &&
    (type.kind === 'unknown' || type.kind === 'object') &&
    callExpr.arguments[0] &&
    (ts.isArrowFunction(callExpr.arguments[0]) || ts.isFunctionExpression(callExpr.arguments[0]))
  ) {
    const fnType = ctx.checker.getTypeAtLocation(callExpr.arguments[0])
    const sig = fnType.getCallSignatures()[0]
    if (sig) {
      const inferred = tsTypeToTypeInfo(ctx.checker.getReturnTypeOfSignature(sig), ctx.checker)
      if (inferred && inferred.kind !== 'unknown') type = inferred
    }
  }

  // Structured parse of the arrow BODY, so adapters can shape-match the memo
  // on a tree instead of re-parsing `computation`. Parse from the type-STRIPPED
  // body (`ctx.getJS`, same source as `computation`) — `getText` would keep
  // TypeScript-only syntax (`as T`, `!`, `satisfies`) that `parseExpression`
  // rejects, leaving `parsed` undefined for typed bodies that the stripped
  // `computation` would match. Expression-bodied arrows only — block bodies
  // (`() => { … }`) and unsupported shapes leave `parsed` undefined and
  // consumers fall back to `computation`.
  const memoArrow = callExpr.arguments[0]
  const parsedBody =
    memoArrow && ts.isArrowFunction(memoArrow) && !ts.isBlock(memoArrow.body)
      ? parseExpression(ctx.getJS(memoArrow.body))
      : undefined
  // `object-literal` is excluded alongside `unsupported`: an object-returning
  // memo (`() => ({ … })`) isn't lowered from the parsed tree yet, so leaving
  // `parsed` undefined keeps the adapter on its existing object-memo lowering
  // (byte-identical; flipped in a later Roadmap A unit).
  const parsed =
    parsedBody && parsedBody.kind !== 'unsupported' && parsedBody.kind !== 'object-literal'
      ? parsedBody
      : undefined

  // Block-bodied memos: carry the statements (tolerant — unparseable ones are
  // omitted) so adapters can pattern-match block shapes (e.g. a guard-and-
  // return-const memo) without re-parsing `computation`. Unwrap parens around
  // the arrow to match the former adapter walks.
  let arrowNode: ts.Node | undefined = memoArrow
  while (arrowNode && ts.isParenthesizedExpression(arrowNode)) arrowNode = arrowNode.expression
  const parsedBlock =
    arrowNode && ts.isArrowFunction(arrowNode) && ts.isBlock(arrowNode.body)
      ? parseBlockBodyTolerant(arrowNode.body, ctx.sourceFile, node => ctx.getJS(node))
      : undefined

  ctx.memos.push({
    name,
    computation,
    parsedBlock,
    typedComputation: typedComputation !== computation ? typedComputation : undefined,
    parsed,
    bodyIsTemplateLiteral: memoBodyIsTemplateLiteral(memoArrow),
    type,
    deps,
    loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
    computationFreeIdentifiers: callExpr.arguments[0]
      ? extractFreeIdentifiersFromNode(callExpr.arguments[0])
      : new Set(),
  })
}

// =============================================================================
// Effect Detection & Collection
// =============================================================================

function isEffectCall(node: ts.Expression, ctx: AnalyzerContext): boolean {
  if (!ts.isCallExpression(node)) return false
  return resolvePrimitiveKind(node, ctx) === 'effect'
}

/**
 * Detects the "disposer capture" pattern: `const dispose = createEffect(...)`.
 * Solid users commonly bind the effect's disposer so they can tear the effect
 * down explicitly (e.g., on route change). Prior to this helper the
 * declaration fell through to `collectConstant`, which preserved the raw
 * `createEffect(...)` call in the SSR template — a render-time crash.
 */
function isEffectDisposerCapture(
  node: ts.VariableDeclaration,
  ctx: AnalyzerContext
): boolean {
  if (!ts.isIdentifier(node.name)) return false
  if (!node.initializer || !ts.isCallExpression(node.initializer)) return false
  return resolvePrimitiveKind(node.initializer, ctx) === 'effect'
}

function collectEffect(
  node: ts.CallExpression,
  ctx: AnalyzerContext,
  captureName?: string
): void {
  const body = node.arguments[0] ? ctx.getJS(node.arguments[0]) : ''
  const deps = extractDependencies(body, ctx)

  ctx.effects.push({
    body,
    deps,
    captureName,
    loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
  })
}

// =============================================================================
// onMount Detection & Collection
// =============================================================================

function isOnMountCall(node: ts.Expression, ctx: AnalyzerContext): boolean {
  if (!ts.isCallExpression(node)) return false
  return resolvePrimitiveKind(node, ctx) === 'onMount'
}

function collectOnMount(node: ts.CallExpression, ctx: AnalyzerContext): void {
  const body = node.arguments[0] ? ctx.getJS(node.arguments[0]) : ''

  ctx.onMounts.push({
    body,
    loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
  })
}

// =============================================================================
// Top-level Init Statements (#930)
// =============================================================================

/**
 * Collect a top-level imperative statement from the component body. These
 * are statements like `if (typeof window !== 'undefined') { window.addEventListener(...) }`
 * or `console.log('init')` that aren't captured by any specialized bucket
 * (signals, memos, effects, onMount, JSX returns, conditional returns).
 *
 * The statement is preserved verbatim (with TypeScript types stripped) and
 * emitted into the component's init function in source order, after signal
 * and memo declarations. This fixes silent data loss where the compiler
 * previously threw these statements away. See #930 (bug-2).
 */
function collectInitStatement(node: ts.Statement, ctx: AnalyzerContext): void {
  const body = ctx.getJS(node)
  ctx.initStatements.push({
    body,
    loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
    freeIdentifiers: extractFreeIdentifiersFromNode(node),
    assignedIdentifiers: extractAssignedIdentifiersFromNode(node),
    // Init statements run inside the component's init function, so they
    // belong to `init` scope. Phase is conservatively `hydrate` (run-once
    // at hydration). relocate() can refine this when consuming the field.
    origin: { phase: 'hydrate', scope: 'init', effect: 'pure' },
    // ASI hazard: a statement starting with one of `(`, `[`, `\``, `+`,
    // `-`, `/` can be fused with the previous expression by the parser.
    // Tracking this in IR so emit can prepend `;` is the structural
    // closure for the leading-`;` failure mode documented in #1138.
    needsLeadingSemi: leadsWithAsiHazard(body),
  })
}

/**
 * Detect characters that — at the start of a JS statement — invite
 * automatic-semicolon-insertion fusion with the previous expression.
 * The parser interprets:
 *   - `(` / `[` as call / index continuation
 *   - `` ` `` as a tagged template
 *   - `+` / `-` as binary operator continuation
 *   - `/` as division (or a regex follow-up)
 * Whitespace at the start is ignored when scanning for the first
 * non-space character.
 */
function leadsWithAsiHazard(body: string): boolean {
  for (let i = 0; i < body.length; i++) {
    const c = body[i]
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') continue
    return c === '(' || c === '[' || c === '`' || c === '+' || c === '-' || c === '/'
  }
  return false
}

/**
 * Collect identifiers that appear on the left-hand side of an assignment
 * (simple `=`, compound `+=` / `-=` / etc., or `++` / `--`). These identifiers
 * must resolve to a real declaration at emit time — writing to an undeclared
 * name throws a ReferenceError in ESM strict mode. Destructuring targets are
 * also collected.
 */
function extractAssignedIdentifiersFromNode(node: ts.Node): Set<string> {
  const ids = new Set<string>()

  function addFromTarget(target: ts.Expression | ts.BindingElement): void {
    if (ts.isIdentifier(target)) {
      ids.add(target.text)
      return
    }
    if (ts.isParenthesizedExpression(target)) {
      addFromTarget(target.expression)
      return
    }
    if (ts.isArrayLiteralExpression(target)) {
      for (const el of target.elements) {
        if (ts.isOmittedExpression(el)) continue
        if (ts.isSpreadElement(el)) { addFromTarget(el.expression); continue }
        addFromTarget(el)
      }
      return
    }
    if (ts.isObjectLiteralExpression(target)) {
      for (const prop of target.properties) {
        if (ts.isShorthandPropertyAssignment(prop)) { ids.add(prop.name.text); continue }
        if (ts.isPropertyAssignment(prop)) { addFromTarget(prop.initializer); continue }
        if (ts.isSpreadAssignment(prop)) { addFromTarget(prop.expression); continue }
      }
      return
    }
    // PropertyAccessExpression / ElementAccessExpression: assignment to a
    // property of an object doesn't create an implicit global, so we skip it.
  }

  function visit(n: ts.Node): void {
    // Stop at the init / sub-init boundary (#1228): assignments inside
    // nested function literals (event-listener callbacks, setTimeout
    // arrows, returned closures, ...) do not execute at init time, so
    // they are not init-statement assignments and BF052 must not flag
    // them. The entry node passed in is always a ts.Statement from
    // collectInitStatement, never a function literal, so this guard
    // only trips on descent.
    if (
      ts.isArrowFunction(n) ||
      ts.isFunctionExpression(n) ||
      ts.isFunctionDeclaration(n) ||
      ts.isMethodDeclaration(n) ||
      ts.isGetAccessorDeclaration(n) ||
      ts.isSetAccessorDeclaration(n) ||
      ts.isConstructorDeclaration(n)
    ) {
      return
    }
    if (ts.isBinaryExpression(n)) {
      const op = n.operatorToken.kind
      if (
        op === ts.SyntaxKind.EqualsToken ||
        op === ts.SyntaxKind.PlusEqualsToken ||
        op === ts.SyntaxKind.MinusEqualsToken ||
        op === ts.SyntaxKind.AsteriskEqualsToken ||
        op === ts.SyntaxKind.SlashEqualsToken ||
        op === ts.SyntaxKind.PercentEqualsToken ||
        op === ts.SyntaxKind.AsteriskAsteriskEqualsToken ||
        op === ts.SyntaxKind.AmpersandEqualsToken ||
        op === ts.SyntaxKind.BarEqualsToken ||
        op === ts.SyntaxKind.CaretEqualsToken ||
        op === ts.SyntaxKind.LessThanLessThanEqualsToken ||
        op === ts.SyntaxKind.GreaterThanGreaterThanEqualsToken ||
        op === ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken ||
        op === ts.SyntaxKind.AmpersandAmpersandEqualsToken ||
        op === ts.SyntaxKind.BarBarEqualsToken ||
        op === ts.SyntaxKind.QuestionQuestionEqualsToken
      ) {
        addFromTarget(n.left)
      }
    }
    if (ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) {
      if (
        n.operator === ts.SyntaxKind.PlusPlusToken ||
        n.operator === ts.SyntaxKind.MinusMinusToken
      ) {
        addFromTarget(n.operand)
      }
    }
    ts.forEachChild(n, visit)
  }

  visit(node)

  // Subtract locally declared variables (e.g. `let i` in `for (let i = 0; …; i++)`)
  // so assignments to loop-local names don't trigger BF052.
  const localDecls = collectLocalDeclarations(node)
  for (const name of localDecls) ids.delete(name)

  return ids
}

/**
 * Collect all variable names declared within a statement tree (for-loop
 * initializers, for-in/of bindings, nested `let`/`const`/`var` blocks).
 * These names are local to the statement and must not be flagged by BF052.
 */
function collectLocalDeclarations(root: ts.Node): Set<string> {
  const names = new Set<string>()

  function addBindingName(name: ts.BindingName): void {
    if (ts.isIdentifier(name)) {
      names.add(name.text)
      return
    }
    if (ts.isArrayBindingPattern(name)) {
      for (const el of name.elements) {
        if (ts.isBindingElement(el)) addBindingName(el.name)
      }
      return
    }
    if (ts.isObjectBindingPattern(name)) {
      for (const el of name.elements) {
        addBindingName(el.name)
      }
    }
  }

  function visit(n: ts.Node): void {
    if (
      ts.isArrowFunction(n) ||
      ts.isFunctionExpression(n) ||
      ts.isFunctionDeclaration(n)
    ) return

    if (ts.isVariableDeclaration(n)) {
      addBindingName(n.name)
    }

    ts.forEachChild(n, visit)
  }
  visit(root)
  return names
}

// =============================================================================
// Import Collection
// =============================================================================

// Symbols exported from @barefootjs/client (the user-facing surface).
// Reactive primitives are DOM-free. The context/portal entries here are
// type-level shims — their implementations live in @barefootjs/client/runtime
// and are emitted by the compiler for 'use client' components.
const CLIENT_EXPORTS = new Set([
  'createSignal', 'createEffect', 'createDisposableEffect', 'createMemo',
  'createRoot', 'onCleanup', 'onMount', 'untrack', 'batch', 'splitProps',
  'forwardProps', 'unwrap', '__slot',
  'createContext', 'useContext', 'provideContext',
  'createPortal', 'isSSRPortal', 'findSiblingSlot', 'cleanupPortalPlaceholder',
  // Request-scoped environment signal (router v0.5) — a real user-facing
  // reactive export the compiler lowers like any other `@barefootjs/client`
  // signal read (SSR: a template binding; client: a `createEffect`).
  'searchParams',
  // Compile-away JSX built-ins (#1915) — importing them is what scopes the
  // compiler's `<Async>` / `<Region>` recognition; the import is elided on emit.
  'Async', 'Region',
])

/**
 * Collect names introduced by TypeScript ambient declarations at module
 * scope into `ctx.ambientGlobals`. Handles:
 *   - `declare var X: T` / `declare let X: T` / `declare const X: T`
 *   - `declare function fn(): T`
 *   - `declare global { var X; let Y; const Z; function fn() }`
 *
 * These declarations have no runtime emission — the author is asserting
 * that the binding exists at runtime (e.g., set up by another script tag,
 * a build-time inject, or a sibling `.d.ts`). For BF052 the only thing
 * that matters is whether the name is "in scope" from the compiler's
 * point of view; ambient declarations satisfy that.
 *
 * Type-only inner statements (`type`, `interface`) inside `declare global`
 * are skipped — they never produce a value binding to write to.
 */
function collectAmbientGlobals(node: ts.Node, ctx: AnalyzerContext): void {
  // `declare var X` / `declare let X` / `declare const X` at top level
  if (ts.isVariableStatement(node)) {
    const isDeclare = node.modifiers?.some(m => m.kind === ts.SyntaxKind.DeclareKeyword) ?? false
    if (!isDeclare) return
    for (const decl of node.declarationList.declarations) {
      if (ts.isIdentifier(decl.name)) ctx.ambientGlobals.add(decl.name.text)
    }
    return
  }

  // `declare function fn()` at top level
  if (ts.isFunctionDeclaration(node) && node.name) {
    const isDeclare = node.modifiers?.some(m => m.kind === ts.SyntaxKind.DeclareKeyword) ?? false
    if (isDeclare) ctx.ambientGlobals.add(node.name.text)
    return
  }

  // `declare global { ... }` — recurse into the module block
  if (ts.isModuleDeclaration(node)) {
    const isGlobalAugmentation = (node.flags & ts.NodeFlags.GlobalAugmentation) !== 0
    if (!isGlobalAugmentation) return
    if (!node.body || !ts.isModuleBlock(node.body)) return
    for (const inner of node.body.statements) {
      if (ts.isVariableStatement(inner)) {
        for (const decl of inner.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) ctx.ambientGlobals.add(decl.name.text)
        }
      } else if (ts.isFunctionDeclaration(inner) && inner.name) {
        ctx.ambientGlobals.add(inner.name.text)
      }
      // type / interface statements introduce no value binding — skip.
    }
  }
}

function collectImport(node: ts.ImportDeclaration, ctx: AnalyzerContext): void {
  const source = (node.moduleSpecifier as ts.StringLiteral).text
  const specifiers: ImportSpecifier[] = []
  const isTypeOnly = !!node.importClause?.isTypeOnly
  const loc = getSourceLocation(node, ctx.sourceFile, ctx.filePath)

  // Diagnostic: wrong package for specific imports
  if (source === '@barefootjs/client' && !isTypeOnly && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
    const wrongImports: string[] = []
    for (const element of node.importClause.namedBindings.elements) {
      const name = element.propertyName?.text ?? element.name.text
      if (!element.isTypeOnly && !CLIENT_EXPORTS.has(name)) {
        wrongImports.push(name)
      }
    }
    if (wrongImports.length > 0) {
      ctx.errors.push(createError(ErrorCodes.WRONG_PACKAGE_IMPORT, loc, {
        severity: 'error',
        message: `'${wrongImports.join("', '")}' is not exported from '@barefootjs/client'.`,
        suggestion: {
          message: `These identifiers belong to the compiler-emitted runtime and are not meant to be imported by user code. Remove the import and let the compiler generate it.`,
        },
      }))
    }
  }

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
            // Per-specifier `import { type Foo }` — no value binding (#1915).
            isTypeOnly: element.isTypeOnly,
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
    loc,
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
    properties: membersToProperties(node.members, ctx.sourceFile),
    loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
  })
}

function collectTypeAliasDefinition(
  node: ts.TypeAliasDeclaration,
  ctx: AnalyzerContext
): void {
  // Only object-type aliases carry structured fields; other aliases
  // (string-literal unions, etc.) have no field set to record.
  const properties = ts.isTypeLiteralNode(node.type)
    ? membersToProperties(node.type.members, ctx.sourceFile)
    : undefined
  ctx.typeDefinitions.push({
    kind: 'type',
    name: node.name.text,
    definition: node.getText(ctx.sourceFile),
    properties,
    loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
  })
}

// =============================================================================
// Function Collection
// =============================================================================

/**
 * Extract a single JSX return expression from a function body.
 * Returns null if the body has multiple returns, conditional returns, or no JSX return.
 */
function extractSingleJsxReturn(
  body: ts.Block
): ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment | null {
  let jsxReturn: ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment | null = null
  let returnCount = 0

  function visit(node: ts.Node): void {
    // Don't descend into nested functions/arrows
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) return
    if (ts.isReturnStatement(node)) {
      returnCount++
      if (node.expression) {
        const expr = unwrapJsxTransparent(node.expression)
        if (ts.isJsxElement(expr) || ts.isJsxSelfClosingElement(expr) || ts.isJsxFragment(expr)) {
          jsxReturn = expr
        }
      }
    }
    ts.forEachChild(node, visit)
  }

  ts.forEachChild(body, visit)

  // Only inline functions with exactly one return statement
  if (returnCount !== 1) return null
  return jsxReturn
}

type JsxReturnNode = ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment

/**
 * Extract conditional branches from a multi-return JSX helper function body.
 * Supports if/else if chains and switch statements where every branch
 * returns JSX or null. Returns null for unsupported patterns.
 */
function extractMultiReturnJsxBranches(
  body: ts.Block
): { branches: Array<{ condition: ts.Expression; jsxReturn: JsxReturnNode | null }>; fallback: JsxReturnNode | null; switchDiscriminant?: ts.Expression } | null {
  const branches: Array<{ condition: ts.Expression; jsxReturn: JsxReturnNode | null }> = []
  let fallback: JsxReturnNode | null = null

  const stmts = body.statements
  for (let i = 0; i < stmts.length; i++) {
    const stmt = stmts[i]

    // if (cond) return <jsx> — collect as a branch, continue to next statement
    if (ts.isIfStatement(stmt)) {
      // Walk this if/else if/else chain
      let current: ts.Statement = stmt
      while (ts.isIfStatement(current)) {
        const ifStmt = current
        // Reject branches with nested control flow — only accept
        // direct `return <jsx>` / `return null` (or a block with
        // exactly that as its only return).
        if (!isDirectReturnBlock(ifStmt.thenStatement)) return null
        const jsxReturn = findJsxReturnInBlock(ifStmt.thenStatement)
        const nullReturn = findNullReturnInBlock(ifStmt.thenStatement)
        if (!jsxReturn && !nullReturn) return null

        branches.push({ condition: ifStmt.expression, jsxReturn: jsxReturn ?? null })

        if (ifStmt.elseStatement) {
          if (ts.isIfStatement(ifStmt.elseStatement)) {
            current = ifStmt.elseStatement
            continue
          }
          // Final else block — chain is complete, return immediately
          // to prevent subsequent statements from overwriting fallback.
          if (!isDirectReturnBlock(ifStmt.elseStatement)) return null
          const elseJsx = findJsxReturnInBlock(ifStmt.elseStatement)
          if (elseJsx) {
            fallback = elseJsx
          } else if (!findNullReturnInBlock(ifStmt.elseStatement)) {
            return null
          }
          if (branches.length === 0) return null
          return { branches, fallback }
        }
        break
      }
      continue
    }

    // switch (expr) { case ...: return <jsx> }
    if (ts.isSwitchStatement(stmt)) {
      // Reject mixed if+switch bodies — prior if branches would be
      // incorrectly treated as switch case expressions.
      if (branches.length > 0) return null

      // Only inline switches whose discriminant is side-effect-free
      // (identifier or property access). A call expression like
      // `switch(getValue())` would be re-evaluated per branch in the
      // generated nested ternary.
      if (!ts.isIdentifier(stmt.expression) && !ts.isPropertyAccessExpression(stmt.expression)) {
        return null
      }

      // Require an explicit default clause — without one, inlining
      // adds an implicit `else null` that changes runtime behavior.
      const hasDefault = stmt.caseBlock.clauses.some(c => ts.isDefaultClause(c))
      if (!hasDefault) return null

      for (const clause of stmt.caseBlock.clauses) {
        const jsxReturn = findJsxReturnInCaseClause(clause)
        const nullReturn = findNullReturnInCaseClause(clause)
        if (!jsxReturn && !nullReturn) return null

        if (ts.isCaseClause(clause)) {
          branches.push({
            condition: clause.expression,
            jsxReturn: jsxReturn ?? null,
          })
        } else {
          fallback = jsxReturn ?? null
        }
      }

      if (branches.length === 0) return null
      return { branches, fallback, switchDiscriminant: stmt.expression }
    }

    // Trailing return <jsx> or return null — this is the fallback
    if (ts.isReturnStatement(stmt) && stmt.expression) {
      const expr = unwrapJsxTransparent(stmt.expression)
      if (ts.isJsxElement(expr) || ts.isJsxSelfClosingElement(expr) || ts.isJsxFragment(expr)) {
        fallback = expr
      } else if (expr.kind === ts.SyntaxKind.NullKeyword) {
        // fallback stays null
      } else {
        return null
      }
      continue
    }

    // Reject bodies with variable declarations — locals referenced in
    // conditions or JSX would become undefined after inlining.
    if (ts.isVariableStatement(stmt)) return null

    // Any other statement type → unsupported pattern
    return null
  }

  if (branches.length === 0) return null
  return { branches, fallback }
}

/**
 * Check that a statement is a direct `return ...` or a block whose
 * only non-variable statements are a single return. Rejects nested
 * control flow (nested if/switch/for/while) that could cause
 * `findJsxReturnInBlock` to pick the wrong return.
 */
function isDirectReturnBlock(node: ts.Statement): boolean {
  if (ts.isReturnStatement(node)) return true
  if (ts.isBlock(node)) {
    let returnCount = 0
    for (const stmt of node.statements) {
      if (ts.isReturnStatement(stmt)) {
        returnCount++
      } else if (
        ts.isIfStatement(stmt) ||
        ts.isSwitchStatement(stmt) ||
        ts.isForStatement(stmt) ||
        ts.isForOfStatement(stmt) ||
        ts.isForInStatement(stmt) ||
        ts.isWhileStatement(stmt) ||
        ts.isDoStatement(stmt) ||
        ts.isTryStatement(stmt)
      ) {
        return false
      }
    }
    return returnCount === 1
  }
  return false
}

function findNullReturnInBlock(node: ts.Statement): boolean {
  if (ts.isBlock(node)) {
    for (const stmt of node.statements) {
      if (ts.isReturnStatement(stmt) && stmt.expression) {
        const expr = unwrapJsxTransparent(stmt.expression)
        if (expr.kind === ts.SyntaxKind.NullKeyword) return true
      }
    }
  }
  if (ts.isReturnStatement(node) && node.expression) {
    const expr = unwrapJsxTransparent(node.expression)
    if (expr.kind === ts.SyntaxKind.NullKeyword) return true
  }
  return false
}

function findJsxReturnInCaseClause(
  clause: ts.CaseClause | ts.DefaultClause
): JsxReturnNode | null {
  for (const stmt of clause.statements) {
    if (ts.isReturnStatement(stmt) && stmt.expression) {
      return extractJsxFromExpression(stmt.expression)
    }
  }
  return null
}

function findNullReturnInCaseClause(
  clause: ts.CaseClause | ts.DefaultClause
): boolean {
  for (const stmt of clause.statements) {
    if (ts.isReturnStatement(stmt) && stmt.expression) {
      const expr = unwrapJsxTransparent(stmt.expression)
      if (expr.kind === ts.SyntaxKind.NullKeyword) return true
    }
  }
  return false
}

/**
 * Detect a multi-return JSX helper: every top-level exit point is a
 * `return <jsx>` or `return null`, and at least one return is JSX. Used
 * to reclassify module-level PascalCase functions with a `switch` / if-else
 * chain body as verbatim helpers rather than components — otherwise the
 * component pipeline collapses multi-branch bodies into an empty output
 * and SSR throws `ReferenceError: <Name> is not defined`. (#932)
 *
 * Does not descend into nested function/arrow bodies.
 */
export function isMultiReturnJsxFunctionBody(body: ts.Block): boolean {
  let returnCount = 0
  let hasJsxReturn = false
  let allReturnsAreJsxOrNull = true

  function visit(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) return
    if (ts.isReturnStatement(node)) {
      returnCount++
      if (!node.expression) {
        allReturnsAreJsxOrNull = false
        return
      }
      const expr = unwrapJsxTransparent(node.expression)
      const isJsx =
        ts.isJsxElement(expr) ||
        ts.isJsxSelfClosingElement(expr) ||
        ts.isJsxFragment(expr)
      const isNull = expr.kind === ts.SyntaxKind.NullKeyword
      if (isJsx) hasJsxReturn = true
      if (!isJsx && !isNull) allReturnsAreJsxOrNull = false
      return
    }
    ts.forEachChild(node, visit)
  }

  ts.forEachChild(body, visit)

  return returnCount > 1 && hasJsxReturn && allReturnsAreJsxOrNull
}

function collectFunction(
  node: ts.FunctionDeclaration,
  ctx: AnalyzerContext,
  _isModule: boolean,
  isExported: boolean = false
): void {
  if (!node.name) return

  // Skip bodyless FunctionDeclarations:
  //   - TS ambient signatures: `declare function fn(): void` at top level
  //     or `function fn(): void` inside `declare global { ... }` /
  //     `declare module 'x' { ... }`
  //   - TS overload signatures: the bodyless sibling declarations of a
  //     function that has a real implementation (e.g.
  //       `function helper(x: string): string`
  //       `function helper(x: number): number`
  //       `function helper(x: any): any { return x }`
  //     — only the last has a body)
  // Emitting these as helpers produced `var X = X ?? function() ` (no body),
  // a runtime SyntaxError. Ambient names are tracked separately via
  // collectAmbientGlobals; overload signatures are merged into the
  // implementation by the JS engine and don't need their own emission.
  if (!node.body) return

  const name = node.name.text
  const params: ParamInfo[] = node.parameters.map((p) => ({
    name: p.name.getText(ctx.sourceFile),
    type: typeNodeToTypeInfo(p.type, ctx.sourceFile) ?? {
      kind: 'unknown',
      raw: 'unknown',
    },
    optional: !!p.questionToken,
    defaultValue: p.initializer ? ctx.getJS(p.initializer) : undefined,
    isRest: !!p.dotDotDotToken || undefined,
  }))
  let body = node.body ? ctx.getJS(node.body) : ''
  const typedBody = node.body ? node.body.getText(ctx.sourceFile) : undefined
  const returnType = typeNodeToTypeInfo(node.type, ctx.sourceFile)
  // Source-verbatim param signature for type-preserving `.tsx` emit.
  // `formatParamWithType` rebuilds the signature from `ParamInfo` and
  // strips `:unknown` (the analyzer can't distinguish explicit `:unknown`
  // from no annotation), so a type predicate like
  // `function isValidElement(element: unknown): element is {…}` would
  // lose its parameter annotation and produce TS7006 on emit (#1453).
  const typedParams = node.parameters.map(p => p.getText(ctx.sourceFile)).join(', ')
  const typedReturnType = node.type ? node.type.getText(ctx.sourceFile) : undefined

  // #1422: a function declaration nested inside an early-return `if`-block
  // is captured here with its body as raw text. Downstream
  // (`compute-scope`) hoists it to outer init scope when it references
  // any init-required name, so bare references to branch-local consts
  // resolve at outer scope — wrong-value (when sibling branches declare
  // the same name) or undefined (single-branch case). The
  // `_branchScopeVars` text-substitution in `jsx-to-ir.ts` already covers
  // raw-text capture inside the JSX return (ref callbacks, event
  // handlers, `{local()}` child positions) but doesn't reach function
  // declarations because they're collected in this analyzer pass before
  // Phase 1 runs. Substitute branch-local references in the body here
  // — same trade-off as #547 / #1410 / #1412 / #1415: text-level
  // substitution duplicates the initializer per use site.
  if (node.body && ctx.conditionalReturns.length > 0) {
    const branchVars = collectEnclosingBranchVars(node, ctx)
    if (branchVars.size > 0) {
      const paramNames = collectParamBindingNames(node.parameters)
      const branchNames: string[] = []
      const branchSubs = new Map<string, string>()
      for (const [varName, initText] of branchVars) {
        // Params shadow outer names inside the function body. This
        // handles destructured params (`({ size })`, `([size])`) via
        // the recursive BindingName walk, not just bare identifiers.
        if (paramNames.has(varName)) continue
        branchNames.push(varName)
        branchSubs.set(varName, initText)
      }
      if (branchNames.length > 0) {
        // Identifier-aware boundaries: `\b` treats `$` as a word
        // separator, which both breaks substitution for valid JS
        // identifiers containing `$` and lets `foo$bar` partial-match
        // a `foo` branch name. Use `(?<![\w$])` / `(?![\w$])` to
        // anchor at true identifier boundaries. The leading guard also
        // excludes member-access tails (`el.dataset.size`) — `.` is
        // not in `[\w$]`, but the previous char before `.` is, so the
        // identifier after `.` still has a `\w` before it once you
        // step past the dot. We add `(?<![.\w$])` explicitly to skip
        // the member-access case.
        //
        // Branch names are JS identifiers so they have no regex
        // metacharacters except `$`, which is escaped here for safety
        // (regex `$` means end-of-input).
        const escaped = branchNames.map(n => n.replace(/\$/g, '\\$'))
        const re = new RegExp(`(?<![.\\w$])(${escaped.join('|')})(?![\\w$])`, 'g')
        // NOTE: this is text-level replacement and so will also rewrite
        // occurrences inside string literals / comments inside the
        // captured body. Same trade-off as the existing
        // `_branchScopeVars` regex in `jsx-to-ir.ts`; users who need
        // single-evaluation or string-literal-safe semantics should
        // hoist the local to outer init scope themselves.
        //
        // Fixpoint iteration: a branch-local initializer can itself
        // reference an earlier branch-local (e.g.
        // `const a = 1; const b = a + 1; function f() { return b }`
        // → first pass rewrites `b` to `(a + 1)`, leaving a fresh `a`
        // that the next pass rewrites to `(1)`). Bound by
        // `branchNames.length + 1` — the worst-case chain length.
        const maxIter = branchNames.length + 1
        for (let i = 0; i < maxIter; i++) {
          const next = body.replace(re, (_m, n) => `(${branchSubs.get(n)!})`)
          if (next === body) break
          body = next
        }
      }
    }
  }

  // Check if function contains JSX
  const containsJsx = body.includes('<') && (body.includes('/>') || body.includes('</'))

  // Store JSX-returning functions for IR-level inlining (#569)
  let isJsxFunction = false
  if (containsJsx && node.body) {
    const jsxReturn = extractSingleJsxReturn(node.body)
    if (jsxReturn) {
      isJsxFunction = true
      ctx.jsxFunctions.set(name, {
        jsxReturn,
        params: node.parameters.map(p => p.name.getText(ctx.sourceFile)),
      })
    } else {
      const multi = extractMultiReturnJsxBranches(node.body)
      if (multi) {
        isJsxFunction = true
        ctx.jsxMultiReturnFunctions.set(name, {
          ...multi,
          params: node.parameters.map(p => p.name.getText(ctx.sourceFile)),
        })
      }
    }
  }

  const isAsync = node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false
  // Generator functions (`function*`) are tracked so a future `function → const`
  // rewrite (the failure mode behind #1130) preserves the modifier from IR
  // rather than reconstructing it from text.
  const isGenerator = !!node.asteriskToken

  ctx.localFunctions.push({
    name,
    params,
    body,
    typedBody: typedBody !== body ? typedBody : undefined,
    typedParams,
    typedReturnType,
    returnType,
    containsJsx,
    isExported,
    isAsync: isAsync || undefined,
    isGenerator: isGenerator || undefined,
    declarationKind: 'function',
    isModule: _isModule || undefined,
    isJsxFunction: isJsxFunction || undefined,
    loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
  })
}

// =============================================================================
// Constant Collection
// =============================================================================

/**
 * Recursively flatten ternary (conditional) branches at the AST level,
 * returning leaf expressions as code strings.
 */
function extractValueBranches(node: ts.Expression, ctx: AnalyzerContext): string[] {
  if (ts.isParenthesizedExpression(node)) {
    return extractValueBranches(node.expression, ctx)
  }
  if (ts.isConditionalExpression(node)) {
    return [
      ...extractValueBranches(node.whenTrue, ctx),
      ...extractValueBranches(node.whenFalse, ctx),
    ]
  }
  return [ctx.getJS(node)]
}

/**
 * Extract free identifier references from an AST node by walking the tree.
 * Skips property keys, member access properties, bound parameter names,
 * and identifiers nested inside TypeScript type nodes (`as { … }` cast
 * type, type parameter constraints, return type annotations). Type-only
 * identifiers never reference runtime bindings — including them in the
 * free-id set surfaces them as init-locals downstream and demotes the
 * referenced const to `external-name`, which cascades into spurious
 * BF061 diagnostics and `(undefined …)` template fallbacks (#1404).
 */
export function extractFreeIdentifiersFromNode(node: ts.Node): Set<string> {
  const ids = new Set<string>()
  const boundNames = new Set<string>()

  function addBindingNames(name: ts.BindingName, out: string[]): void {
    if (ts.isIdentifier(name)) out.push(name.text)
    else if (ts.isObjectBindingPattern(name)) name.elements.forEach(e => addBindingNames(e.name, out))
    else if (ts.isArrayBindingPattern(name)) name.elements.forEach(e => { if (!ts.isOmittedExpression(e)) addBindingNames(e.name, out) })
  }

  function visit(n: ts.Node): void {
    // Type-only nodes (`as { compact?: boolean }`, `: Props`, …) carry
    // identifiers that exist solely in the type checker — they aren't
    // emitted, so they can't be runtime references. Stop the descent
    // here.
    if (ts.isTypeNode(n)) return
    if (ts.isIdentifier(n)) {
      const parent = n.parent
      if (parent && ts.isPropertyAccessExpression(parent) && parent.name === n) return
      if (parent && ts.isPropertyAssignment(parent) && parent.name === n) return
      if (parent && ts.isParameter(parent) && parent.name === n) return
      if (parent && ts.isVariableDeclaration(parent) && parent.name === n) return
      if (boundNames.has(n.text)) return
      ids.add(n.text)
      return
    }
    if (ts.isArrowFunction(n)) {
      const params: string[] = []
      for (const p of n.parameters) addBindingNames(p.name, params)
      for (const name of params) boundNames.add(name)
      ts.forEachChild(n, visit)
      for (const name of params) boundNames.delete(name)
      return
    }
    ts.forEachChild(n, visit)
  }

  visit(node)
  return ids
}

/**
 * Check if a const initializer expression contains JSX at a non-root
 * position — ternary with JSX on either side, logical-AND / OR /
 * nullish-coalescing with JSX on either side, parenthesized wrappers
 * around any of the above. Used to qualify constants for `inlineableJsxConsts`
 * (#1409 follow-up): pure JSX literals already go through `jsxConstants`,
 * but ternary-typed JSX locals (`cond ? <jsx/> : null`) need the same
 * inline-at-use-site treatment so a downstream `{/* @client * /
 * cLocal}` doesn't leak the bare identifier into the emitted client
 * JS. The walk stops at function / arrow boundaries so JSX inside a
 * helper's body isn't mistaken for the initializer's own JSX.
 */
export function initializerShapeContainsJsx(node: ts.Node): boolean {
  let found = false
  function visit(n: ts.Node): void {
    if (found) return
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) {
      found = true
      return
    }
    if (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n)) {
      return
    }
    ts.forEachChild(n, visit)
  }
  visit(node)
  return found
}

/**
 * True when `node` is a `.map()` or `.flatMap()` call whose callback
 * argument contains JSX. `initializerShapeContainsJsx` deliberately
 * stops at arrow boundaries, which means `const x = items.flatMap(
 * (item) => <div/>)` is not detected. This helper catches that
 * specific shape so the constant can be inlined at the use site
 * (#1554).
 */
function isMapLikeCallWithJsx(node: ts.Node): boolean {
  if (!ts.isCallExpression(node)) return false
  if (!ts.isPropertyAccessExpression(node.expression)) return false
  const method = node.expression.name.text
  if (method !== 'map' && method !== 'flatMap') return false
  const callback = node.arguments[0]
  if (!callback) return false
  if (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) return false
  return containsJsxDeep(callback.body)
}

function containsJsxDeep(node: ts.Node): boolean {
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) return true
  let found = false
  node.forEachChild(child => { if (!found) found = containsJsxDeep(child) })
  return found
}

/**
 * Check if an AST node contains an arrow function or function expression.
 */
function nodeContainsArrow(node: ts.Node): boolean {
  let found = false
  function visit(n: ts.Node) {
    if (found) return
    if (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) { found = true; return }
    ts.forEachChild(n, visit)
  }
  visit(node)
  return found
}

/**
 * True when the VariableDeclaration's initializer is recognized as a
 * `createSignal(...)` / `createMemo(...)` / signal-tuple-ref /
 * signal-index-access call. Covers every shape `visitComponentBody`
 * routes through dedicated collectors so BF011 detection at module
 * scope catches the same surface area.
 */
function declarationIsReactiveFactoryCall(
  decl: ts.VariableDeclaration,
  ctx: AnalyzerContext,
): boolean {
  if (isSignalDeclaration(decl, ctx)) return true
  if (isMemoDeclaration(decl, ctx)) return true
  if (isSignalTupleDeclaration(decl)) return true
  if (isSignalIndexAccess(decl, ctx) !== null) return true
  return false
}

// =============================================================================
// Module-level `/* @client */` directive detection + collection
// =============================================================================

const CLIENT_DIRECTIVE_INTERIOR_RE = /^\s*@client\s*$/
const BLOCK_COMMENT_RE = /\/\*([\s\S]*?)\*\//g

/**
 * Detect a leading `/* @client *​/` block comment on a VariableStatement.
 * Mirrors `hasLeadingClientDirective` in jsx-to-ir.ts (which targets
 * Expression nodes inside JSX). Reads the raw trivia between the
 * previous node's end and the statement's first token.
 */
function hasLeadingClientDirectiveOnStatement(
  stmt: ts.Statement,
  sourceFile: ts.SourceFile,
): boolean {
  const trivia = sourceFile.text.slice(stmt.pos, stmt.getStart(sourceFile))
  BLOCK_COMMENT_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = BLOCK_COMMENT_RE.exec(trivia)) !== null) {
    if (CLIENT_DIRECTIVE_INTERIOR_RE.test(m[1])) return true
  }
  return false
}

/**
 * Collect a module-level reactive declaration that the user opted into
 * with `/* @client *​/`. Reuses the existing in-component collectors and
 * marks the result with `isModule: true` so downstream codegen routes
 * it to module scope in the client bundle and skips it in SSR.
 */
function collectModuleScopeReactive(
  decl: ts.VariableDeclaration,
  ctx: AnalyzerContext,
  isExported: boolean,
): void {
  if (isSignalDeclaration(decl, ctx)) {
    collectSignal(decl, ctx)
    const sig = ctx.signals[ctx.signals.length - 1]
    sig.isModule = true
    sig.isExported = isExported || undefined
    return
  }
  if (isMemoDeclaration(decl, ctx)) {
    collectMemo(decl, ctx)
    const memo = ctx.memos[ctx.memos.length - 1]
    memo.isModule = true
    memo.isExported = isExported || undefined
    return
  }
  // tuple-ref (`const t = createSignal(0)`) and index-access
  // (`const c = createSignal(0)[0]`) shapes are not yet supported at
  // module scope — the flush logic they need is tightly coupled to
  // visitComponentBody. Emit BF011 so the user gets a diagnostic
  // rather than a silent drop.
  ctx.errors.push(createError(
    ErrorCodes.SIGNAL_OUTSIDE_COMPONENT,
    getSourceLocation(decl, ctx.sourceFile, ctx.filePath),
    {
      message: 'Module-level reactive declaration using tuple-ref or index-access pattern is not yet supported. ' +
        'Use the `const [getter, setter] = createSignal(...)` form with /* @client */ instead.',
    },
  ))
}

/**
 * Check if an AST node is a createContext() call or new WeakMap() expression.
 */
function getSystemConstructKind(node: ts.Node): 'createContext' | 'weakMap' | undefined {
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'createContext') return 'createContext'
  if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'WeakMap') return 'weakMap'
  return undefined
}

function collectConstant(
  node: ts.VariableDeclaration,
  ctx: AnalyzerContext,
  _isModule: boolean,
  declarationKind: 'const' | 'let' = 'const',
  isExported: boolean = false
): void {
  // Body-level destructure from `props` — e.g.
  //   const { org, projectNumber } = props
  // The standard collector below only handles plain identifier names. Without
  // expanding the destructure here, downstream emit drops it entirely (the
  // user's source destructure isn't preserved verbatim — emit-stage rebuilds
  // declarations from `localConstants`). Expand into one `localConstants`
  // entry per destructured name, valued `props.X`, so the late-stage
  // props-object rename turns them into `const X = _p.X` in the init body.
  if (
    !_isModule &&
    ts.isObjectBindingPattern(node.name) &&
    node.initializer &&
    ts.isIdentifier(node.initializer) &&
    ctx.propsObjectName === node.initializer.text
  ) {
    const propsName = node.initializer.text
    for (const el of node.name.elements) {
      if (!ts.isBindingElement(el) || !ts.isIdentifier(el.name) || el.dotDotDotToken) continue
      const localName = el.name.text
      const sourceKey = el.propertyName && ts.isIdentifier(el.propertyName) ? el.propertyName.text : localName
      const defaultValueExpr = el.initializer ? ctx.getJS(el.initializer) : undefined
      const baseValue = `${propsName}.${sourceKey}`
      const value = defaultValueExpr ? `${baseValue} ?? ${defaultValueExpr}` : baseValue
      const containsArrow = el.initializer ? nodeContainsArrow(el.initializer) : false
      const freeIdentifiers = el.initializer ? extractFreeIdentifiersFromNode(el.initializer) : new Set([propsName])
      ctx.localConstants.push({
        name: localName,
        value,
        declarationKind,
        isExported,
        type: null,
        loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
        freeIdentifiers,
        containsArrow: containsArrow || undefined,
        // Body-level destructure-from-props is collected only when
        // _isModule === false; binding lives in init scope.
        origin: { phase: 'hydrate', scope: 'init', effect: 'pure' },
      })
    }
    return
  }

  if (!ts.isIdentifier(node.name)) return

  // Skip if it's a signal, memo, captured effect disposer, or one of the
  // signal AST-shape variants (index-access / tuple-ref). The primary path
  // in visitComponentBody catches these first, but the belt-and-suspenders
  // check guards direct callers (e.g., the module-level path at line 366)
  // from double-collecting.
  if (isSignalDeclaration(node, ctx) || isMemoDeclaration(node, ctx)) return
  if (isSignalTupleDeclaration(node)) return
  if (isSignalIndexAccess(node, ctx) !== null) return
  if (isEffectDisposerCapture(node, ctx)) return

  const isModule = _isModule
  const name = node.name.text
  let value = node.initializer
    ? ctx.getJS(node.initializer)
    : undefined
  const typedValue = node.initializer
    ? node.initializer.getText(ctx.sourceFile)
    : undefined

  // Detect JSX initializers and store AST nodes for IR-level inlining (#547)
  let isJsx = false
  let isJsxFunction = false
  if (node.initializer) {
    let init: ts.Expression = node.initializer
    while (ts.isParenthesizedExpression(init)) init = init.expression
    if (ts.isJsxElement(init) || ts.isJsxSelfClosingElement(init) || ts.isJsxFragment(init)) {
      isJsx = true
      ctx.jsxConstants.set(name, init)
    } else if (initializerShapeContainsJsx(init)) {
      // Non-root JSX initializer (ternary / `&&` / `||` / `??` whose
      // operand is JSX). Stored here so `transformExpressionInner` can
      // inline at the use site instead of leaving the bare identifier
      // in the emitted client JS — the same way pure-JSX literals are
      // inlined via `jsxConstants`, but routed through the JSX-
      // expression dispatcher so the conditional / binary shape lowers
      // to IRConditional (with `clientOnly` preserved when applicable)
      // (#1409 follow-up).
      ctx.inlineableJsxConsts.set(name, init)
    } else if (isMapLikeCallWithJsx(init)) {
      // .map() / .flatMap() calls whose callbacks contain JSX (#1554).
      // The callback arrow blocks `initializerShapeContainsJsx` (by
      // design — arbitrary nested arrows shouldn't be inlined), but
      // map/flatMap callbacks ARE the JSX-bearing content. Inline at
      // the use site so `transformMapCall` compiles the JSX.
      //
      // NOT marked `isJsx = true`: that would unconditionally suppress
      // the const from init emission, breaking cases where the variable
      // is also referenced outside JSX-child position (e.g.
      // `children.length`). Instead, rely on the natural
      // `usedIdentifiers` gate in `classifyConstant` — when the
      // variable is only used as a JSX child, the inlining removes it
      // from the reference graph, so the classifier skips it without
      // `isJsx`.
      ctx.inlineableJsxConsts.set(name, init)
    }

    // Detect arrow function constants with JSX return (#569)
    if (ts.isArrowFunction(init)) {
      const arrowBody = init.body
      if (ts.isBlock(arrowBody)) {
        const jsxReturn = extractSingleJsxReturn(arrowBody)
        if (jsxReturn) {
          isJsxFunction = true
          ctx.jsxFunctions.set(name, {
            jsxReturn,
            params: init.parameters.map(p => p.name.getText(ctx.sourceFile)),
          })
        } else {
          const multi = extractMultiReturnJsxBranches(arrowBody)
          if (multi) {
            isJsxFunction = true
            ctx.jsxMultiReturnFunctions.set(name, {
              ...multi,
              params: init.parameters.map(p => p.name.getText(ctx.sourceFile)),
            })
          }
        }
      } else {
        // Implicit return: () => <div>...</div>
        let body: ts.Expression = arrowBody
        while (ts.isParenthesizedExpression(body)) body = body.expression
        if (ts.isJsxElement(body) || ts.isJsxSelfClosingElement(body) || ts.isJsxFragment(body)) {
          isJsxFunction = true
          ctx.jsxFunctions.set(name, {
            jsxReturn: body,
            params: init.parameters.map(p => p.name.getText(ctx.sourceFile)),
          })
        }
      }
    }
  }

  // Extract structured branch info from ternary initializers
  let valueBranches: string[] | undefined
  if (node.initializer) {
    let inner: ts.Expression = node.initializer
    while (ts.isParenthesizedExpression(inner)) inner = inner.expression
    if (ts.isConditionalExpression(inner)) {
      valueBranches = extractValueBranches(node.initializer, ctx)
    }
  }

  // Get type from annotation or infer
  let type: TypeInfo | null = null
  if (node.type) {
    type = typeNodeToTypeInfo(node.type, ctx.sourceFile)
  } else if (value) {
    type = inferTypeFromValue(value)
  }

  const freeIdentifiers = node.initializer
    ? extractFreeIdentifiersFromNode(node.initializer)
    : undefined

  // Compute AST-derived flags for Phase 2 optimization
  const containsArrow = node.initializer ? nodeContainsArrow(node.initializer) : false
  const systemConstructKind = node.initializer ? getSystemConstructKind(node.initializer) : undefined

  // Pre-transform bare prop refs for template inlining (#807). Two
  // distinct cases:
  //
  //  1) Destructured-arg components — `function Foo({ org }: Props)`.
  //     There's no `props` object (`propsObjectName` is undefined); the
  //     bare names came directly from the param destructure, so every
  //     `propsParams` name is fair game for rewriting.
  //
  //  2) `(props)`-arg components that ALSO body-destructure props — i.e.
  //     `function Foo(props: Props) { const { org } = props; ... }`. Here
  //     bare `org` references in dependant consts (e.g.
  //     `const cacheKey = ` desk-${org}` `) need to become `_p.X` for the
  //     standalone template AND in the init body, otherwise the minifier
  //     collapses const declarations and TDZ-throws on the bare ref.
  //     CRITICAL: only the BODY-DESTRUCTURED prop names are eligible — a
  //     plain `(props)`-arg component without body destructure (e.g.
  //     `function Cmd(props) { const handleMount = (el) => { const value
  //     = ...; el.setAttribute('data-value', value) } }`) must NOT have
  //     its nested-scope local bindings rewritten just because the local
  //     name happens to match a prop key. `rewriteBarePropRefs` is not
  //     scope-aware, so we have to gate eligibility upstream.
  let templateValue: string | undefined
  if (value && ctx.propsParams.length > 0 && node.initializer) {
    let propNames: Set<string>
    if (!ctx.propsObjectName) {
      // Case 1: destructured-arg — all propsParams are bare locals.
      propNames = new Set(ctx.propsParams.map(p => p.name))
    } else {
      // Case 2: `(props)`-arg — restrict to body-destructured pure aliases
      // of `props.X` (entries pushed by the body-destructure expansion at
      // line 1646). Defaults/expressions disqualify (the local has its
      // own value); a signal/memo/earlier non-alias local with the same
      // name acts as a shadow and also disqualifies.
      const shadowedByNonAlias = new Set<string>()
      for (const s of ctx.signals) {
        shadowedByNonAlias.add(s.getter)
        if (s.setter) shadowedByNonAlias.add(s.setter)
      }
      for (const m of ctx.memos) shadowedByNonAlias.add(m.name)
      const aliases = new Set<string>()
      for (const c of ctx.localConstants) {
        const isPureAlias =
          typeof c.value === 'string' &&
          c.value === `${ctx.propsObjectName}.${c.name}`
        if (isPureAlias) aliases.add(c.name)
        else shadowedByNonAlias.add(c.name)
      }
      propNames = new Set(
        [...aliases].filter(n => !shadowedByNonAlias.has(n)),
      )
    }
    if (propNames.size > 0) {
      const rewritten = rewriteBarePropRefs(value, node.initializer, propNames)
      if (rewritten !== undefined) {
        templateValue = rewritten
        // For the body-destructure case, also rewrite the init-body
        // source so the eventual `const cacheKey = ` desk-${_p.org}` ` form
        // survives minifier const-chain collapse without TDZ-throwing on
        // a bare `${org}`.
        if (ctx.propsObjectName) {
          value = rewritten
        }
      }
    }
  }

  // Structure a module-scope constant's value for adapters (Roadmap A). Only
  // module consts are carried — they're the ones adapters resolve as
  // compile-time records (e.g. a `strokePaths` icon map). Parse the
  // PARENTHESISED value so a bare object literal (`{ … }`), which TS reads as
  // a block at statement position, resolves to an `object-literal` instead of
  // failing. Best-effort and inert for inlined JSX (no usable value tree).
  const parsed =
    isModule && value && !isJsx && !isJsxFunction
      ? parseExpression(`(${value.trim()})`)
      : undefined

  ctx.localConstants.push({
    name,
    value,
    parsed,
    typedValue: typedValue !== value ? typedValue : undefined,
    valueBranches,
    declarationKind,
    isExported,
    isModule: isModule || undefined,
    type,
    loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
    freeIdentifiers,
    isJsx,
    isJsxFunction: isJsxFunction || undefined,
    containsArrow: containsArrow || undefined,
    systemConstructKind,
    templateValue,
    origin: {
      phase: isModule ? 'compile' : 'hydrate',
      scope: isModule ? 'module' : 'init',
      effect: 'pure',
    },
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

        const defaultContainsArrow = element.initializer ? nodeContainsArrow(element.initializer) : false
        ctx.propsParams.push({
          name: localName,
          type: { kind: 'unknown', raw: 'unknown' },
          optional: !!element.initializer,
          defaultValue,
          defaultContainsArrow: defaultContainsArrow || undefined,
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

  // Trailing method/property accesses that transform the operand type.
  // Without these, `createSignal((props.todos ?? []).length)` would fall
  // through to "unknown" and adapters would either pick `interface{}`
  // or copy the underlying array's element type — both worse than the
  // actual `number`. The accessor is the rightmost suffix, so a single
  // regex on the tail is enough; we don't need to fully parse the LHS.
  //
  //   .length / .size       → number
  //   .some(...) / .every(...) / .includes(...)           → boolean
  //   .indexOf(...) / .findIndex(...) / .lastIndexOf(...) → number
  //   .at(...) / .find(...) → unknown (element type; can't recover here)
  if (/\.(length|size)\s*$/.test(trimmed)) {
    return { kind: 'primitive', raw: 'number', primitive: 'number' }
  }
  if (/\.(some|every|includes)\s*\([\s\S]*\)\s*$/.test(trimmed)) {
    return { kind: 'primitive', raw: 'boolean', primitive: 'boolean' }
  }
  if (/\.(indexOf|findIndex|findLastIndex|lastIndexOf)\s*\([\s\S]*\)\s*$/.test(trimmed)) {
    return { kind: 'primitive', raw: 'number', primitive: 'number' }
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

  // Check for 'use client' directive if any browser-only API is used.
  // Browser-only APIs include signals AND context/portal runtime hooks:
  // their implementations live in `@barefootjs/client/runtime` and require
  // compiler emission to run correctly.
  if (!ctx.hasUseClientDirective) {
    const usesBrowserOnlyApi =
      ctx.signals.length > 0 || importsBrowserOnlyClientApi(ctx)
    if (usesBrowserOnlyApi) {
      ctx.errors.push(
        createError(ErrorCodes.MISSING_USE_CLIENT, {
          file: ctx.filePath,
          start: { line: 1, column: 0 },
          end: { line: 1, column: 0 },
        })
      )
    }
  }

  // BF052: init statements that write to an identifier with no visible
  // declaration cause a ReferenceError in ESM strict mode. Flag them
  // at compile time instead of shipping broken client JS. (#933)
  validateInitStatementReferences(ctx)

  // BF110: flag tuple-destructures that would have been silent runtime
  // failures before factory inlining landed (#931).
  validateReactiveFactoryCalls(ctx)

  // BF003: a `"use client"` file may not import a component from a
  // non-`"use client"` source file (#1501). Server-side knowledge must
  // not transitively cross into the client bundle, and hydration-marker
  // emission requires both sides of the boundary to be compile-aware.
  validateClientImports(ctx)
}

// =============================================================================
// BF003 — Cross-file "use client" import validation
// =============================================================================

/**
 * Enforce the one-way directionality: a `"use client"` file cannot import
 * a JSX-component binding from a file that lacks the `"use client"`
 * directive. The rule is component-scoped — non-JSX value imports
 * (utility functions, constants, etc.) are not flagged, since they have
 * no hydration-marker emission and no server-only-rendering surface that
 * the directive guards.
 *
 * Resolution is best-effort:
 *   - Relative imports (`./foo`, `../foo`) resolve against the file's
 *     directory with the usual `.tsx`/`.ts`/`index.*` extension fallback.
 *   - npm packages (`@barefootjs/...`, bare specifiers) and unresolved
 *     aliased paths (`@/...` without tsconfig paths support) are skipped:
 *     the BF051 check covers the framework-package shape, and aliased
 *     resolution requires shared-program / tsconfig wiring that isn't
 *     guaranteed at this layer.
 *
 * The check fires only on imports whose binding appears as a JSX tag
 * identifier in the current file. This matches the spec language
 * ("Client component cannot import server component") and avoids
 * false-positives on legitimate utility-function imports from
 * non-`"use client"` modules.
 */
function validateClientImports(ctx: AnalyzerContext): void {
  if (!ctx.hasUseClientDirective) return
  if (ctx.imports.length === 0) return

  const jsxComponentTags = collectJsxComponentTags(ctx.sourceFile)
  if (jsxComponentTags.size === 0) return

  // Dedup synchronous fs.stat / readFile across imports within this
  // analyzer call. Same-source imports (`import { A } from './x'` +
  // `import { B } from './x'`) and index.tsx-resolution probes share
  // the cache via the resolved absolute path.
  const resolveCache = new Map<string, string | null>()
  const directiveCache = new Map<string, boolean>()

  for (const imp of ctx.imports) {
    if (imp.isTypeOnly) continue
    if (!isResolvableComponentSource(imp.source)) continue

    const usedAsComponent = imp.specifiers.some(s => {
      if (s.isNamespace) return false
      const local = s.alias ?? s.name
      return jsxComponentTags.has(local)
    })
    if (!usedAsComponent) continue

    let resolvedPath = resolveCache.get(imp.source)
    if (resolvedPath === undefined) {
      resolvedPath = resolveRelativeImportToFile(imp.source, ctx.filePath)
      resolveCache.set(imp.source, resolvedPath)
    }
    if (!resolvedPath) continue

    let hasDirective = directiveCache.get(resolvedPath)
    if (hasDirective === undefined) {
      hasDirective = fileHasUseClientDirective(resolvedPath)
      directiveCache.set(resolvedPath, hasDirective)
    }
    if (hasDirective) continue

    const usedNames = imp.specifiers
      .filter(s => !s.isNamespace && jsxComponentTags.has(s.alias ?? s.name))
      .map(s => s.alias ?? s.name)
    const suggestionTarget = path.relative(path.dirname(ctx.filePath), resolvedPath)

    ctx.errors.push(createError(ErrorCodes.CLIENT_IMPORTING_SERVER, imp.loc, {
      severity: 'error',
      message: `Client component cannot import '${usedNames.join("', '")}' from '${imp.source}' — the target file lacks the "use client" directive.`,
      suggestion: {
        message: `Add "use client" at the top of ${suggestionTarget}, or move the component into the importing file.`,
      },
    }))
  }
}

function isResolvableComponentSource(source: string): boolean {
  // Relative imports — the only specifier shape we can resolve without
  // a program / tsconfig paths context. Aliased imports (`@/...`,
  // workspace packages) are intentionally skipped: those resolve via
  // bundler / shared-program configuration that this layer doesn't
  // currently consume. Worst case here is a false negative; BF003 is
  // additive on top of the existing same-file destructure path.
  return source.startsWith('./') || source.startsWith('../')
}

function collectJsxComponentTags(sourceFile: ts.SourceFile): Set<string> {
  const tags = new Set<string>()
  function visit(node: ts.Node): void {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName
      if (ts.isIdentifier(tagName)) {
        const first = tagName.text.charAt(0)
        // PascalCase tags reference component bindings; intrinsic
        // elements (lowercase) are not import targets.
        if (first >= 'A' && first <= 'Z') {
          tags.add(tagName.text)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return tags
}

// =============================================================================
// Cross-file @client signal scanning
// =============================================================================

/**
 * Regex that matches `/* @client *​/ export const [name1, name2] = createSignal(...)`
 * or `/* @client *​/ export const name = createMemo(...)` in a single line.
 * Captures the binding names.
 */
const CLIENT_EXPORT_SIGNAL_RE =
  /\/\*\s*@client\s*\*\/\s*\n?\s*export\s+const\s+\[([$\w]+)(?:\s*,\s*([$\w]+))?\]\s*=\s*createSignal\b/g
const CLIENT_EXPORT_MEMO_RE =
  /\/\*\s*@client\s*\*\/\s*\n?\s*export\s+const\s+([$\w]+)\s*=\s*createMemo\b/g

/**
 * Scan imported modules for exported `@client` signal/memo bindings.
 * For each relative import in `ctx.imports`, resolve the file path,
 * read it, and regex-scan for `/* @client *​/ export const [getter, setter]
 * = createSignal(...)` patterns. Imported names that match are added to
 * `ctx.importedClientSignalNames`.
 *
 * Uses the same `resolveRelativeImportToFile` + `fs.readFileSync`
 * pattern as the BF003 cross-file directive check.
 */
function scanImportedClientSignals(ctx: AnalyzerContext): void {
  for (const imp of ctx.imports) {
    if (imp.isTypeOnly) continue
    if (!imp.source.startsWith('./') && !imp.source.startsWith('../')) continue

    const resolvedPath = resolveRelativeImportToFile(imp.source, ctx.filePath)
    if (!resolvedPath) continue

    let content: string
    try {
      content = fs.readFileSync(resolvedPath, 'utf8')
    } catch {
      continue
    }

    const exportedClientNames = new Set<string>()
    CLIENT_EXPORT_SIGNAL_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = CLIENT_EXPORT_SIGNAL_RE.exec(content)) !== null) {
      if (m[1]) exportedClientNames.add(m[1])
      if (m[2]) exportedClientNames.add(m[2])
    }
    CLIENT_EXPORT_MEMO_RE.lastIndex = 0
    while ((m = CLIENT_EXPORT_MEMO_RE.exec(content)) !== null) {
      if (m[1]) exportedClientNames.add(m[1])
    }

    if (exportedClientNames.size === 0) continue

    for (const spec of imp.specifiers) {
      if (spec.isDefault || spec.isNamespace) continue
      const importedName = spec.name
      if (exportedClientNames.has(importedName)) {
        ctx.importedClientSignalNames.add(spec.alias ?? importedName)
      }
    }
  }
}

function resolveRelativeImportToFile(source: string, fromFile: string): string | null {
  const baseDir = path.dirname(fromFile)
  const candidate = path.resolve(baseDir, source)
  // Source already carries an extension (`./x.tsx`) — try the candidate
  // as-is before falling through to the extension-fallback list, which
  // would otherwise probe `x.tsx.tsx` / `x.tsx.ts` and silently miss.
  const KNOWN_EXTS = ['.tsx', '.ts', '.jsx', '.js']
  const sourceHasExt = KNOWN_EXTS.some(ext => source.endsWith(ext))
  const candidates = sourceHasExt
    ? [candidate]
    : [
        candidate + '.tsx',
        candidate + '.ts',
        candidate + '.jsx',
        candidate + '.js',
        path.join(candidate, 'index.tsx'),
        path.join(candidate, 'index.ts'),
        path.join(candidate, 'index.jsx'),
        path.join(candidate, 'index.js'),
      ]
  for (const c of candidates) {
    try {
      const stat = fs.statSync(c)
      if (stat.isFile()) return c
    } catch {
      // not found — try next
    }
  }
  return null
}

function fileHasUseClientDirective(filePath: string): boolean {
  let content: string
  try {
    content = fs.readFileSync(filePath, 'utf8')
  } catch {
    // Unreadable — silent skip rather than false-firing BF003.
    return true
  }
  // Match the analyzer's own directive detection on this file: any
  // ExpressionStatement whose expression is the string literal
  // `'use client'` counts, regardless of whether it sits at the
  // directive-prologue position. Enforcing top-of-file placement here
  // would make BF003 fire on files the analyzer itself classifies as
  // client (see use-client-directive-position.test.ts for the pinned
  // permissive-detection behavior).
  const sf = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TSX,
  )
  let found = false
  function visit(node: ts.Node): void {
    if (found) return
    if (ts.isExpressionStatement(node) && ts.isStringLiteral(node.expression)) {
      if (node.expression.text === 'use client') {
        found = true
        return
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return found
}

function validateInitStatementReferences(ctx: AnalyzerContext): void {
  if (ctx.initStatements.length === 0) return

  const resolved = collectResolvedNames(ctx)
  for (const stmt of ctx.initStatements) {
    if (!stmt.assignedIdentifiers) continue
    for (const name of stmt.assignedIdentifiers) {
      if (resolved.has(name)) continue
      ctx.errors.push(
        createError(ErrorCodes.UNDECLARED_INIT_STATEMENT_REFERENCE, stmt.loc, {
          message:
            `Init statement assigns to '${name}' but no declaration is in scope. ` +
            `Declare it at module scope (e.g., \`let ${name} = undefined\`) or ` +
            `inside the component function before assigning.`,
          suggestion: {
            message:
              `Writing to an undeclared identifier throws ReferenceError in ESM ` +
              `strict mode at runtime, silently breaking hydration.`,
          },
        })
      )
    }
  }
}

function collectResolvedNames(ctx: AnalyzerContext): Set<string> {
  const names = new Set<string>()
  for (const c of ctx.localConstants) names.add(c.name)
  for (const f of ctx.localFunctions) names.add(f.name)
  for (const s of ctx.signals) {
    names.add(s.getter)
    if (s.setter) names.add(s.setter)
  }
  for (const m of ctx.memos) names.add(m.name)
  for (const p of ctx.propsParams) names.add(p.name)
  if (ctx.propsObjectName) names.add(ctx.propsObjectName)
  if (ctx.restPropsName) names.add(ctx.restPropsName)
  for (const imp of ctx.imports) {
    for (const spec of imp.specifiers) {
      names.add(spec.alias ?? spec.name)
    }
  }
  // TS ambient declarations (`declare var X`, `declare global { var X }`)
  // — runtime contracts the author has asserted. See collectAmbientGlobals.
  for (const name of ctx.ambientGlobals) names.add(name)
  return names
}

// Identifiers from `@barefootjs/client` whose implementations live in the
// DOM runtime (`@barefootjs/client/runtime`). Source files importing any of
// these must be marked with `'use client'` so the compiler rewires them.
//
// Exported so the CLI's skip-gate (`detectMissingUseClient` in
// `@barefootjs/cli/lib/build`) can raise BF001 against the same trigger
// set the analyzer uses, instead of maintaining a drifting copy.
export const BROWSER_ONLY_CLIENT_APIS = new Set([
  'useContext',
  'provideContext',
  'createPortal',
  'isSSRPortal',
  'findSiblingSlot',
  'cleanupPortalPlaceholder',
])

function importsBrowserOnlyClientApi(ctx: AnalyzerContext): boolean {
  for (const imp of ctx.imports) {
    if (imp.source !== '@barefootjs/client') continue
    if (imp.isTypeOnly) continue
    for (const spec of imp.specifiers) {
      const importedName = spec.name
      if (BROWSER_ONLY_CLIENT_APIS.has(importedName)) return true
    }
  }
  return false
}

// =============================================================================
// List Exported Components
// =============================================================================

/**
 * Returns all exported component names in the file.
 * Useful for files with multiple components (e.g., icon.tsx).
 */
export function listComponentFunctions(
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

  // 'use client' directive detection (controls whether multi-return JSX
  // PascalCase functions are treated as components or as verbatim helpers).
  // See #932.
  const hasUseClient = sourceFile.statements.some(stmt =>
    ts.isExpressionStatement(stmt) &&
    ts.isStringLiteral(stmt.expression) &&
    (stmt.expression.text === 'use client' || stmt.expression.text === "'use client'")
  )
  const namedExports = collectNamedExports(sourceFile)

  function collectComponents(node: ts.Node): void {
    // Exported function declaration
    if (isComponentFunction(node)) {
      // In non-"use client" files, PascalCase functions whose body is a
      // multi-return JSX dispatch (switch / if-else chain) are preserved
      // verbatim as helpers rather than compiled as standalone components
      // (see #932 — the component pipeline drops their body). Skip them
      // here so `compileMultipleComponents` does not emit a broken file
      // for them. Only applies to *internal* helpers; anything exported
      // (inline or via `export { Name }`) is part of the file's public
      // API and must stay on the component-compilation path.
      const hasInlineExport = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false
      const hasNamedExport = namedExports.has(node.name.text)
      const isExported = hasInlineExport || hasNamedExport
      if (
        !hasUseClient &&
        !isExported &&
        node.body &&
        isMultiReturnJsxFunctionBody(node.body)
      ) {
        // fall through to forEachChild
      } else {
        componentNames.push(node.name.text)
      }
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
// Reactive Factory Pre-pass (#931)
// =============================================================================

// Names of reactive primitives that a factory body must contain for the
// factory to qualify for inlining. Identifier resolution happens at the
// source text level, so these are matched as bare identifiers.
//
// Exported so the CLI's skip-gate (`detectMissingUseClient` in
// `@barefootjs/cli/lib/build`) reuses the canonical list — keeps the
// "imports reactive primitive without 'use client'" BF001 surface
// from drifting out of sync with the analyzer's call-site detection.
export const REACTIVE_PRIMITIVES = new Set([
  'createSignal', 'createMemo', 'createEffect',
  'createDisposableEffect', 'onMount', 'onCleanup',
])

interface PrescanResult {
  factories: Map<string, ReactiveFactoryInfo>
  sourceFile: ts.SourceFile
}

/**
 * Scan a source string for module-level function declarations that match
 * the reactive-factory shape (single `return [a, b, ...]` exit + at least
 * one reactive primitive call in the body). Returns a map from factory
 * name to its metadata, and the parsed source file for call-site rewriting.
 */
function prescanReactiveFactoriesInSource(
  source: string,
  filePath: string
): PrescanResult {
  const sourceFile = ts.createSourceFile(
    filePath + '.prescan',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  )
  const factories = new Map<string, ReactiveFactoryInfo>()

  function visitTop(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node) && node.name && node.body) {
      const info = detectReactiveFactory(node, sourceFile, filePath)
      if (info) factories.set(node.name.text, info)
    }
    // Not recursing into function bodies: factory helpers are at module
    // scope only for this round (issue #931 "In scope" §1).
  }

  ts.forEachChild(sourceFile, visitTop)

  return { factories, sourceFile }
}

function detectReactiveFactory(
  node: ts.FunctionDeclaration,
  sourceFile: ts.SourceFile,
  filePath: string
): ReactiveFactoryInfo | null {
  if (!node.body || !node.name) return null

  // Require: exactly one top-level `return` whose argument is an array
  // literal of plain identifiers (optionally wrapped in `as const` / parens).
  let tupleReturn: ts.ArrayLiteralExpression | null = null
  let returnCount = 0
  for (const stmt of node.body.statements) {
    if (!ts.isReturnStatement(stmt)) continue
    returnCount++
    if (!stmt.expression) return null
    let expr: ts.Expression = stmt.expression
    while (ts.isParenthesizedExpression(expr)) expr = expr.expression
    // Accept `... as const` / `<const>...`
    if (ts.isAsExpression(expr)) expr = expr.expression
    if (ts.isTypeAssertionExpression(expr)) expr = expr.expression
    if (!ts.isArrayLiteralExpression(expr)) return null
    tupleReturn = expr
  }
  if (returnCount !== 1 || !tupleReturn) return null

  // Every element must be a plain identifier (no spreads, computed,
  // call expressions). Otherwise the caller-side rename would not be sound.
  const returnTupleIdentifiers: string[] = []
  for (const el of tupleReturn.elements) {
    if (!ts.isIdentifier(el)) return null
    returnTupleIdentifiers.push(el.text)
  }
  if (returnTupleIdentifiers.length === 0) return null

  // Body must contain at least one reactive primitive call so that the
  // factory is actually the right thing to inline (not just a tuple-returning
  // helper that happens to look similar).
  let hasReactiveCall = false
  function checkForReactive(n: ts.Node): void {
    if (hasReactiveCall) return
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) &&
        REACTIVE_PRIMITIVES.has(n.expression.text)) {
      hasReactiveCall = true
      return
    }
    ts.forEachChild(n, checkForReactive)
  }
  checkForReactive(node.body)
  if (!hasReactiveCall) return null

  // Collect local bindings in the factory body for identifier hygiene at
  // inlining time. Only direct-child declarations of the block are
  // considered — good enough for the typical helper shape.
  const localBindings: string[] = []
  for (const stmt of node.body.statements) {
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        addBindingNames(decl.name, localBindings)
      }
    } else if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      localBindings.push(stmt.name.text)
    }
  }

  // Serialize the body without the outer braces and without the return
  // statement — the return tuple is dissolved into caller-named identifiers.
  const bodyStatements = node.body.statements
    .filter(s => !ts.isReturnStatement(s))
    .map(s => s.getText(sourceFile))
    .join('\n')

  const params = node.parameters.map(p => {
    if (ts.isIdentifier(p.name)) return p.name.text
    // Destructured params are uncommon for this helper shape and out of
    // initial scope; return a placeholder so we can skip the factory.
    return ''
  })
  if (params.some(p => p === '')) return null

  return {
    params,
    bodySource: bodyStatements,
    returnTupleIdentifiers,
    localBindings,
    loc: getSourceLocation(node, sourceFile, filePath),
  }
}

function addBindingNames(name: ts.BindingName, out: string[]): void {
  if (ts.isIdentifier(name)) {
    out.push(name.text)
    return
  }
  if (ts.isObjectBindingPattern(name)) {
    for (const el of name.elements) addBindingNames(el.name, out)
    return
  }
  if (ts.isArrayBindingPattern(name)) {
    for (const el of name.elements) {
      if (ts.isOmittedExpression(el)) continue
      addBindingNames(el.name, out)
    }
  }
}

/**
 * Rewrite a source string by replacing each `const [a, b, ...] = factory(args)`
 * call at the source level with the inlined factory body — params
 * substituted with argument expressions, return tuple identifiers renamed
 * to caller destructure names, other local bindings suffix-renamed for
 * per-call uniqueness.
 *
 * Returns the rewritten source, or the original string if no inlining
 * applies (e.g., factory arity mismatch — those are left alone so the
 * analyzer can emit BF110 with an accurate source location).
 */
function rewriteFactoryCallsInSource(
  source: string,
  prescan: PrescanResult
): string {
  const { factories, sourceFile } = prescan

  // Collect edits: { start, end, replacement } tuples.
  type Edit = { start: number; end: number; replacement: string }
  const edits: Edit[] = []
  let callSiteIndex = 0

  function visitStmt(node: ts.Node, inComponent: boolean): void {
    if (ts.isVariableStatement(node) && inComponent) {
      for (const decl of node.declarationList.declarations) {
        maybeRewriteDecl(node, decl)
      }
    }
    ts.forEachChild(node, (child) => {
      // Recurse into function bodies so destructured factory calls in
      // nested scopes (e.g. inside a component function) are picked up,
      // but do not descend into other module-level helper bodies — their
      // own factory calls (recursive factory definitions) are out of
      // scope for this round.
      if (ts.isFunctionDeclaration(child) && child.name && factories.has(child.name.text)) return
      visitStmt(child, inComponent || isPascalCaseComponentFn(child))
    })
  }

  function maybeRewriteDecl(stmt: ts.VariableStatement, decl: ts.VariableDeclaration): void {
    if (!ts.isArrayBindingPattern(decl.name)) return
    if (!decl.initializer || !ts.isCallExpression(decl.initializer)) return
    if (!ts.isIdentifier(decl.initializer.expression)) return
    const factoryName = decl.initializer.expression.text
    const factory = factories.get(factoryName)
    if (!factory) return

    // Arity check — bail out on mismatch so the analyzer can report BF110
    // on the untouched source.
    const elements = decl.name.elements
    if (elements.length !== factory.returnTupleIdentifiers.length) return

    // Caller-side identifier names (one per tuple slot). Omitted slots
    // and nested destructure patterns are out of scope — bail out so the
    // analyzer can emit BF110.
    const callerNames: string[] = []
    for (const el of elements) {
      if (ts.isOmittedExpression(el) || !ts.isIdentifier(el.name)) return
      callerNames.push(el.name.text)
    }

    const argTexts = decl.initializer.arguments.map(a => a.getText(sourceFile))
    const thisCallIndex = callSiteIndex++
    const suffix = `_bf${thisCallIndex}`

    // Apply renames to the factory body source.
    let body = factory.bodySource
    // 1. Suffix-rename internal bindings (exclude params + return tuple
    //    + caller names to avoid collisions).
    const internalRenames = new Set<string>(factory.localBindings)
    for (const p of factory.params) internalRenames.delete(p)
    for (const r of factory.returnTupleIdentifiers) internalRenames.delete(r)
    for (const name of internalRenames) {
      body = body.replace(new RegExp(`\\b${escapeRegex(name)}\\b`, 'g'), name + suffix)
    }
    // 2. Parameters → argument expressions. Atomic arguments (bare
    //    identifiers, numeric literals, string literals) are spliced
    //    directly; anything more complex is wrapped in parens to preserve
    //    operator precedence at the splice site.
    const atomicArg = /^(?:[\w$.]+|'[^'\\]*'|"[^"\\]*"|-?\d+(?:\.\d+)?)$/
    for (let i = 0; i < factory.params.length; i++) {
      const p = factory.params[i]
      const a = argTexts[i] ?? 'undefined'
      const wrapped = atomicArg.test(a.trim()) ? a.trim() : `(${a})`
      body = body.replace(new RegExp(`\\b${escapeRegex(p)}\\b`, 'g'), wrapped)
    }
    // 3. Return tuple identifiers → caller destructure names.
    for (let i = 0; i < factory.returnTupleIdentifiers.length; i++) {
      const n = factory.returnTupleIdentifiers[i]
      const caller = callerNames[i]
      body = body.replace(new RegExp(`\\b${escapeRegex(n)}\\b`, 'g'), caller)
    }

    edits.push({
      start: stmt.getStart(sourceFile),
      end: stmt.getEnd(),
      replacement: body,
    })
  }

  visitStmt(sourceFile, false)

  if (edits.length === 0) return source

  // Apply edits from bottom to top so earlier offsets stay valid.
  edits.sort((a, b) => b.start - a.start)
  let out = source
  for (const e of edits) {
    out = out.slice(0, e.start) + e.replacement + out.slice(e.end)
  }
  return out
}

function isPascalCaseComponentFn(node: ts.Node): boolean {
  if (ts.isFunctionDeclaration(node) && node.name) {
    return /^[A-Z]/.test(node.name.text)
  }
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isArrowFunction(node.initializer)) {
    return /^[A-Z]/.test(node.name.text)
  }
  return false
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// =============================================================================
// BF110 diagnostic (#931)
// =============================================================================

/**
 * Scan a compiled component context for tuple-destructures whose callee is
 * neither `createSignal` / `createMemo` nor an inlinable reactive factory.
 * These are the silent-failure shapes that produced broken client JS prior
 * to factory inlining — emit BF110 so users get a clear message instead.
 */
export function validateReactiveFactoryCalls(ctx: AnalyzerContext): void {
  if (!ctx.componentNode) return
  const body = ts.isFunctionDeclaration(ctx.componentNode)
    ? ctx.componentNode.body
    : (ts.isBlock(ctx.componentNode.body) ? ctx.componentNode.body : null)
  if (!body) return

  for (const stmt of body.statements) {
    if (!ts.isVariableStatement(stmt)) continue
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isArrayBindingPattern(decl.name)) continue
      if (!decl.initializer || !ts.isCallExpression(decl.initializer)) continue
      if (!ts.isIdentifier(decl.initializer.expression)) continue
      const callee = decl.initializer.expression.text
      if (callee === 'createSignal' || callee === 'createMemo') continue
      // Inlined factories were rewritten away before this analysis, so
      // anything still matching the shape is a destructure of an
      // unrecognised callee (imported helper, ad-hoc tuple fn, factory
      // with arity mismatch).
      ctx.errors.push(
        createError(
          ErrorCodes.UNRECOGNIZED_REACTIVE_FACTORY,
          getSourceLocation(stmt, ctx.sourceFile, ctx.filePath),
          {
            severity: 'error',
            message:
              `Tuple destructuring of '${callee}(...)': this helper is not a ` +
              `recognised reactive factory (createSignal / createMemo / a ` +
              `same-file helper that wraps them with a single \`return [a, b, ...]\`).`,
            suggestion: {
              message:
                `Inline the createSignal call at the call site, or move the ` +
                `helper into this file as a function that returns a tuple of ` +
                `identifiers at its single exit point.`,
            },
          }
        )
      )
    }
  }
}

// =============================================================================
// Export
// =============================================================================

export { type AnalyzerContext } from './analyzer-context.ts'

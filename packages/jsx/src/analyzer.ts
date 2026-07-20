/// <reference types="node" />
/**
 * BarefootJS Compiler - Single-Pass Analyzer
 *
 * Analyzes TypeScript/JSX source code in a single pass,
 * extracting all necessary metadata for IR generation.
 */

import ts from 'typescript'
import type { ImportSpecifier, TypeInfo, ParamInfo, ReactiveFactoryInfo, DeclinedReactiveFactory, RequiredFactoryImport, FactoryRenameSite, SourceLocation } from './types.ts'
import { parseExpression, parseBlockBodyTolerant, foldBlockToExpr } from './expression-parser.ts'
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
  collectReactiveGetterNames,
} from './analyzer-context.ts'
import { createError, createWarning, ErrorCodes, type ErrorCode } from './errors.ts'
import { baseTypeName } from './rich-type-evidence.ts'
import { CATALOGUED_RICH_TYPE_NAMES } from './date-lowering.ts'
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
  // createSelector's returned accessor is Reactive<>-branded like a library
  // accessor above — a selector call outside any `.map()` (no loop in the
  // file at all) would otherwise skip the TypeChecker entirely and miss the
  // brand.
  if (source.includes('createSelector')) return true
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

  // Reactive-factory prescan results (#931, #2325 cross-file + object-
  // return round 2) — same-file and relative-imported factories, plus the
  // declined / reactive-shaped buckets `validateReactiveFactoryCalls` uses
  // to emit a specific diagnostic instead of the generic BF110.
  ctx.reactiveFactories = prescan.factories
  ctx.declinedReactiveFactories = prescan.declined
  ctx.reactiveShapedHelpers = prescan.reactiveShaped
  ctx.cleanFactoryImports = prescan.cleanFactoryImports

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
  // tree instead of re-parsing the string with `ts.createSourceFile`. The value
  // is parenthesised before parsing so a bare object-literal init
  // (`createSignal({ a: 1 })`) resolves to an `object-literal` rather than being
  // read as a block statement; `parseExpression` unwraps the parens, so arrays /
  // scalars / prop refs are unchanged. An unsupported shape leaves `parsed`
  // undefined and the adapter falls back. Runs after `scanImportedClientSignals`
  // so imported signals are covered too.
  for (const signal of ctx.signals) {
    if (!signal.initialValue) continue
    const parsed = parseExpression(`(${signal.initialValue})`)
    if (parsed.kind !== 'unsupported') signal.parsed = parsed
  }

  // #2040: fold a complete, value-producing block-bodied memo into a single
  // expression so it flows through the same `parsed` path as an expression-bodied
  // memo, instead of relying on per-idiom block recognizers (#1897 / #1945 /
  // #2015). Runs after all signals/memos are collected so the reactive-getter
  // set (used as the purity oracle — an idempotent signal/memo read may be
  // inlined on several branches) is complete. An incomplete block (the tolerant
  // parser dropped a statement it couldn't represent) or one that doesn't fold
  // (imperative residue) leaves `parsed` undefined and consumers keep their
  // existing `parsedBlock` fallback.
  const reactiveGetterNames = collectReactiveGetterNames(ctx.signals, ctx.memos)
  for (const memo of ctx.memos) {
    if (memo.parsed || !memo.parsedBlock || !memo.parsedBlockComplete) continue
    const folded = foldBlockToExpr(memo.parsedBlock, { pureCallNames: reactiveGetterNames })
    if (folded.ok) memo.parsed = folded.expr
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
  // Request-scoped env-signal factories (#2057) are `createSignal`-shaped, so
  // they resolve to the `signal` kind and flow through the normal signal
  // collection + fold purity oracle. Their env key (see ENV_SIGNAL_FACTORIES)
  // is recorded separately on the collected signal so adapters can lower the
  // reader value; the reactivity kind itself is just `signal`.
  createSearchParams: 'signal',
}

/**
 * Env-signal factories → the request-env key their getter reads
 * (`createSearchParams` → `'search'`, matching the runtime's
 * `createEnvSignal('search', …)`). Recognising the *factory* is a general
 * mechanism (like the reactive-primitive names above); the resulting signal is
 * tagged with the key so adapters lower its reader value from structure, with
 * no `searchParams`-name allow-list (#2057, superseding #2055).
 */
const ENV_SIGNAL_FACTORIES: Record<string, string> = {
  createSearchParams: 'search',
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
  const name = resolveCanonicalClientExportName(ident, ctx)
  return name ? (PRIMITIVE_CANONICAL_NAMES[name] ?? null) : null
}

/**
 * Resolve an identifier back to the canonical export name it was imported under
 * from `@barefootjs/client`, following alias chains
 * (`import { createSignal as sig }`). Returns null when the checker is
 * unavailable, the symbol doesn't resolve, or its declaration doesn't live in
 * `@barefootjs/client` — so a user-defined function that happens to share a
 * name never matches. Shared by the primitive-kind and env-signal resolvers.
 */
function resolveCanonicalClientExportName(
  ident: ts.Identifier,
  ctx: AnalyzerContext
): string | null {
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
  // Confirm the declaration actually lives in @barefootjs/client so we
  // don't match a user-defined function that happens to share the name.
  for (const decl of target.declarations ?? []) {
    const sourceName = decl.getSourceFile().fileName
    if (sourceName.includes('@barefootjs/client') || sourceName.includes('packages/client/')) {
      return target.getName()
    }
  }
  return null
}

/**
 * Resolve a call expression to the request-env key of the env-signal factory it
 * calls (`createSearchParams()` → `'search'`), or null if it isn't one. Mirrors
 * {@link resolvePrimitiveKind}'s fast/slow paths (direct name, alias via
 * checker, `bf.createSearchParams` namespace access) against
 * {@link ENV_SIGNAL_FACTORIES}.
 */
function resolveEnvSignalKey(
  callExpr: ts.CallExpression,
  ctx: AnalyzerContext
): string | null {
  if (ts.isIdentifier(callExpr.expression)) {
    const key = ENV_SIGNAL_FACTORIES[callExpr.expression.text]
    if (key) return key
    const canonical = resolveCanonicalClientExportName(callExpr.expression, ctx)
    return canonical ? (ENV_SIGNAL_FACTORIES[canonical] ?? null) : null
  }
  if (ts.isPropertyAccessExpression(callExpr.expression)) {
    const key = ENV_SIGNAL_FACTORIES[callExpr.expression.name.text]
    if (key && isBarefootClientNamespace(callExpr.expression.expression, ctx)) return key
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

  const envReader = resolveEnvSignalKey(callExpr, ctx) ?? undefined
  // The factory as written (identifier, alias, or `ns.factory`), so emit re-emits
  // the binding actually in scope rather than a hardcoded canonical name (#2057).
  const envFactory = envReader ? callExpr.expression.getText(ctx.sourceFile) : undefined

  // Destructured-arg components only (#2265): a signal's initial value
  // referencing a bare destructured prop (`createSignal(size ?? 1)` with
  // `{ size }: { size?: number }`) needs `_p.size` for the CSR
  // `template:` arrow's module-scope SSR fallback — that arrow isn't a
  // closure over `initXxx`'s `const size = _p.size` extraction. Mirrors
  // the local-constant rewrite a few hundred lines up (`propNames` built
  // the same way from `ctx.propsParams`).
  let templateInitialValue: string | undefined
  if (!ctx.propsObjectName && callExpr.arguments[0]) {
    const propNames = new Set(ctx.propsParams.map(p => p.name))
    if (propNames.size > 0) {
      templateInitialValue = rewriteBarePropRefs(initialValue, callExpr.arguments[0], propNames)
    }
  }

  ctx.signals.push({
    getter,
    setter,
    initialValue,
    typedInitialValue: typedInitialValue !== initialValue ? typedInitialValue : undefined,
    templateInitialValue,
    type,
    loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
    initialFreeIdentifiers: callExpr.arguments[0]
      ? extractFreeIdentifiersFromNode(callExpr.arguments[0])
      : new Set(),
    envReader,
    envFactory,
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
  const blockBody =
    arrowNode && ts.isArrowFunction(arrowNode) && ts.isBlock(arrowNode.body)
      ? arrowNode.body
      : undefined
  const parsedBlock = blockBody
    ? parseBlockBodyTolerant(blockBody, ctx.sourceFile, node => ctx.getJS(node))
    : undefined
  // `parseBlockBodyTolerant` runs `parseStatement` once per source statement and
  // pushes only the non-null results, so equal lengths mean every statement was
  // represented — nothing silently omitted (see `MemoInfo.parsedBlockComplete`).
  const parsedBlockComplete =
    parsedBlock && blockBody ? parsedBlock.length === blockBody.statements.length : undefined

  ctx.memos.push({
    name,
    computation,
    parsedBlock,
    parsedBlockComplete,
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
  'createSelector',
  'createRoot', 'onCleanup', 'onMount', 'untrack', 'batch', 'splitProps',
  'forwardProps', 'unwrap', '__slot',
  'createContext', 'useContext', 'provideContext',
  'createPortal', 'isSSRPortal', 'findSiblingSlot', 'cleanupPortalPlaceholder',
  // Request-scoped environment signal factory (router v0.5) — `createSignal`-
  // shaped, recognised structurally (#2057) so its getter is just a signal
  // getter; the compiler lowers the reader value per adapter via the signal's
  // `envReader` key, with no `searchParams`-name allow-list.
  'createSearchParams',
  // Pure URL-query builder (#2042) — the functional counterpart to
  // `searchParams`. Runs natively on the client; SSR adapters lower a
  // `queryHref(base, { … })` call to their query helper (go-template: `bf_query`).
  'queryHref',
  // Pure date formatter (#2324). Runs natively on the client; SSR adapters
  // lower a `formatDate(date, pattern, tz)` call to their `format_date`
  // helper (spec/template-helpers.md).
  'formatDate',
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
  //
  // Carried for component-scope consts too (#2018 P5): the Go constructor
  // lowerers (`lowerCtorExpr`, helper inlining) read this single generic tree —
  // which now models the multi-param-arrow and regex shapes the former
  // Go-only `parsed2` carried — to inline a derived component const's value
  // (`base || '/'`) recursively. Best-effort; an unrepresentable shape leaves
  // `parsed` undefined and consumers fall back to the string.
  const parsed =
    value && !isJsx && !isJsxFunction
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

    // Resolve each destructured binding's declared type from the param's type
    // annotation, so `{ value }: Props` keeps the same per-prop TypeInfo as the
    // `props: Props` path instead of degrading to `unknown` (which typed
    // adapters emit as `interface{}` + an unchecked assertion). See issue #2150.
    const memberTypes = param.type ? collectMemberTypes(param.type, ctx) : null

    for (const element of param.name.elements) {
      if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
        const localName = element.name.text
        const defaultValue = element.initializer ? ctx.getJS(element.initializer) : undefined

        // Handle rest props: { ...props }
        if (element.dotDotDotToken) {
          ctx.restPropsName = localName
          continue
        }

        // Aliased bindings (`{ value: v }`) take their type from the source
        // property name, not the local alias.
        const sourcePropName =
          element.propertyName && ts.isIdentifier(element.propertyName)
            ? element.propertyName.text
            : localName
        const member = memberTypes?.get(sourcePropName)
        const resolvedType: TypeInfo = member?.type ?? { kind: 'unknown', raw: 'unknown' }

        const defaultContainsArrow = element.initializer ? nodeContainsArrow(element.initializer) : false
        ctx.propsParams.push({
          name: localName,
          type: resolvedType,
          // The type's `?` and a destructure default (`{ x = 1 }`) both mean
          // the caller may omit the prop.
          optional: !!member?.optional || !!element.initializer,
          defaultValue,
          defaultContainsArrow: defaultContainsArrow || undefined,
          // Only aliased bindings carry the source key — see ParamInfo.sourceName.
          ...(sourcePropName !== localName && { sourceName: sourcePropName }),
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
 * Build a property-name -> { type, optional } map from a props type
 * annotation, for destructured params (`{ value }: Props`) so they carry the
 * same per-prop TypeInfo and optionality the props-object path
 * (`props: Props`) already resolves (#2150, #2259). Returns null for
 * external/unresolvable types.
 *
 * Scope:
 * - Optionality is collected for EVERY member — it feeds the type's `?` into
 *   `propsParams[].optional` alongside a destructure default. Optional
 *   members resolve like required ones: typed adapters no longer need them
 *   degraded to `unknown` -> `interface{}` for attribute omission, because
 *   #2252's nullish-flip machinery supplies the nillable representation
 *   exactly where absence is semantically observable (#2259).
 * - Only PRIMITIVE members (string/number/boolean) resolve a type. Those are
 *   the types that otherwise produce an unchecked scalar assertion (`in.X.(int)`)
 *   that panics. Arrays/objects/functions are left as `unknown` because typed
 *   adapters lower them through interface{}-based helpers (`bf_flat`, spread,
 *   `bf_json`); giving them concrete types would break that lowering and is a
 *   larger, separate change.
 */
function collectMemberTypes(
  typeNode: ts.TypeNode,
  ctx: AnalyzerContext
): Map<string, { type: TypeInfo | null; optional: boolean }> | null {
  // #2150 originally restricted this gate to string/number/boolean only,
  // because a non-primitive TypeInfo here used to mean "the typed adapters
  // will emit an unchecked scalar assertion (`in.X.(int)`) that panics" for
  // a shape the template layer has no representation for. That reasoning
  // does NOT extend to a rich type with a CATALOGUED lowering (#2274: `Date`
  // → the `date` helper): its propsParams TypeInfo is consumed only as
  // call-site evidence for `resolveReceiverType` (rich-type-evidence.ts) —
  // never emitted as a concrete field type (`typeInfoToGo`'s `interface`
  // case falls through to `interface{}` for an unbacked host name exactly
  // as `unknown` already did) — so there is no assertion to panic. Gating on
  // `CATALOGUED_RICH_TYPE_NAMES` specifically (not `HOST_RICH_TYPE_NAMES`
  // wholesale) keeps an un-catalogued rich type (`Map`, `Set`, …) at
  // `unknown`, i.e. avoids resurrecting the #2150 mistake for a shape no
  // lowering plugin exists for yet.
  const isResolvablePrimitive = (info: TypeInfo): boolean =>
    (info.kind === 'primitive' &&
      (info.primitive === 'string' || info.primitive === 'number' || info.primitive === 'boolean')) ||
    (info.kind === 'interface' && CATALOGUED_RICH_TYPE_NAMES.has(baseTypeName(info.raw)))

  const fromMembers = (
    members: ts.NodeArray<ts.TypeElement>
  ): Map<string, { type: TypeInfo | null; optional: boolean }> => {
    const map = new Map<string, { type: TypeInfo | null; optional: boolean }>()
    for (const member of members) {
      if (ts.isPropertySignature(member) && member.name) {
        const info = member.type ? typeNodeToTypeInfo(member.type, ctx.sourceFile) : null
        map.set(member.name.getText(ctx.sourceFile), {
          type: info && isResolvablePrimitive(info) ? info : null,
          optional: !!member.questionToken,
        })
      }
    }
    return map
  }

  if (ts.isTypeLiteralNode(typeNode)) {
    return fromMembers(typeNode.members)
  }

  if (ts.isTypeReferenceNode(typeNode)) {
    const typeName = typeNode.typeName.getText(ctx.sourceFile)
    const typeDecl = findTypeDeclaration(typeName, ctx.sourceFile)
    if (!typeDecl) return null
    if (ts.isInterfaceDeclaration(typeDecl)) {
      return fromMembers(typeDecl.members)
    }
    if (ts.isTypeAliasDeclaration(typeDecl) && ts.isTypeLiteralNode(typeDecl.type)) {
      return fromMembers(typeDecl.type.members)
    }
  }

  return null
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
    // Env signals (`createSearchParams()`, #2057) are exempt: reading the
    // request query is SSR-safe and hydrates without `use client`, exactly as
    // the pre-#2057 bare `searchParams()` import did (it was not a signal).
    const usesBrowserOnlyApi =
      ctx.signals.some(s => !s.envReader) || importsBrowserOnlyClientApi(ctx)
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
  /** Factories recognized but declined for inlining (#2325). */
  declined: Map<string, DeclinedReactiveFactory>
  /** Module-scope helpers whose body wraps a reactive primitive but whose
   *  shape is not an inlinable factory (#2325). */
  reactiveShaped: Set<string>
  /** Imported destructured-callee names whose helper file was resolved,
   *  read, and found reactive-free / factory-free (#2325, filled by
   *  `prescanImportedReactiveFactories`). */
  cleanFactoryImports: Set<string>
  sourceFile: ts.SourceFile
}

/**
 * Scan a source string for module-level function declarations that match
 * the reactive-factory shape (single `return [a, b, ...]` / `return { a, b
 * }` exit + at least one reactive primitive call in the body). Returns a
 * map from factory name to its metadata, and the parsed source file for
 * call-site rewriting. Also resolves factories defined in a relative-
 * imported helper file (#2325, see `prescanImportedReactiveFactories`) —
 * every `analyzeComponent` caller gets cross-file resolution with no call-
 * site changes elsewhere.
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
  const declined = new Map<string, DeclinedReactiveFactory>()
  const reactiveShaped = new Set<string>()
  const cleanFactoryImports = new Set<string>()

  function visitTop(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node) && node.name && node.body) {
      const det = detectReactiveFactory(node, sourceFile, filePath)
      if (!det) return
      switch (det.kind) {
        case 'factory':
          factories.set(node.name.text, det.info)
          break
        case 'declined':
          declined.set(node.name.text, det.declined)
          break
        case 'reactive-shaped':
          reactiveShaped.add(node.name.text)
          break
      }
    }
    // Not recursing into function bodies: factory helpers are at module
    // scope only for this round (issue #931 "In scope" §1).
  }

  ts.forEachChild(sourceFile, visitTop)

  const result: PrescanResult = { factories, declined, reactiveShaped, cleanFactoryImports, sourceFile }
  prescanImportedReactiveFactories(sourceFile, filePath, result)
  return result
}

/**
 * #2332 — portable component-relative import specifier for a resolved
 * absolute helper-import target. Same `'.'`/`'./'` prefix convention as the
 * CLI's buildRelativeImportRewriter (packages/cli/src/lib/build.ts); strips
 * the resolved extension to match the codebase's extensionless-import
 * style. Unlike `buildRelativeImportRewriter`, this normalizes
 * `path.relative`'s separators to POSIX (`/`) — a backslash-separated
 * specifier is not valid ESM syntax, so on win32 `path.relative`'s native
 * output would inject a broken import rather than merely an unconventional
 * one (Copilot review, PR #2338).
 */
function toComponentRelativeSpecifier(resolvedAbs: string, componentFilePath: string): string {
  let rel = path.relative(path.dirname(componentFilePath), resolvedAbs).split(path.sep).join('/')
  rel = rel.replace(/\.(tsx|ts|jsx|js)$/, '')
  if (rel === '') rel = '.'
  if (!rel.startsWith('.')) rel = './' + rel
  return rel
}

/**
 * localName -> identity of what the entry file's own top-level named value
 * imports bind, for the satisfied-import dedupe check (#2332): if the
 * component file already imports the exact binding a factory needs to
 * re-provision, injecting it again would be a duplicate declaration rather
 * than a shadow, so that case is skipped instead of injected. `targetKey` is
 * the resolved absolute path for relative sources (or `unresolved:<source>`
 * when probing fails) and the raw specifier for bare sources.
 */
function buildEntryImportIndex(
  sf: ts.SourceFile,
  filePath: string
): Map<string, { targetKey: string; exportedName: string }> {
  const index = new Map<string, { targetKey: string; exportedName: string }>()
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue
    if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue
    if (stmt.importClause?.isTypeOnly) continue
    const src = stmt.moduleSpecifier.text
    const targetKey = src.startsWith('./') || src.startsWith('../')
      ? (resolveRelativeImportToFile(src, filePath) ?? 'unresolved:' + src)
      : src
    const namedBindings = stmt.importClause?.namedBindings
    if (namedBindings && ts.isNamedImports(namedBindings)) {
      for (const el of namedBindings.elements) {
        if (el.isTypeOnly) continue
        index.set(el.name.text, { targetKey, exportedName: (el.propertyName ?? el.name).text })
      }
    }
  }
  return index
}

/**
 * Every value-binding name anywhere in the entry file (imports, variable
 * declarations at any depth, function/class/enum names, function
 * parameters) — used by the #2332 re-provisioned-import collision check
 * (BF113). Deliberately over-broad: the inlined factory body lands INSIDE a
 * component function, where any nested binding (params, destructures,
 * locals) would silently shadow a top-level import injected by this round.
 * A scan limited to top-level bindings would miss that, so any hit anywhere
 * in the file declines re-provisioning with a loud BF113 rather than
 * risking a silent shadow — matching `moduleCaptureCheck`'s stated failure-
 * direction philosophy (loud build error over silent runtime break).
 */
function collectEntryBindingNames(sf: ts.SourceFile): Set<string> {
  const names = new Set<string>()
  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && node.importClause) {
      if (node.importClause.name) names.add(node.importClause.name.text)
      const namedBindings = node.importClause.namedBindings
      if (namedBindings && ts.isNamedImports(namedBindings)) {
        // Type-only specifiers still occupy the identifier at the TS level.
        for (const el of namedBindings.elements) names.add(el.name.text)
      }
      if (namedBindings && ts.isNamespaceImport(namedBindings)) {
        names.add(namedBindings.name.text)
      }
    }
    if (ts.isVariableDeclaration(node)) {
      const out: string[] = []
      addBindingNames(node.name, out)
      for (const n of out) names.add(n)
    }
    if (
      (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isEnumDeclaration(node)) &&
      node.name
    ) {
      names.add(node.name.text)
    }
    if (ts.isFunctionLike(node)) {
      for (const p of node.parameters) {
        const out: string[] = []
        addBindingNames(p.name, out)
        for (const n of out) names.add(n)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return names
}

// One `export ... from` hop is followed when resolving a re-exported name
// (#2341 BUG-2) — a visited-set guards against cycles regardless, so
// raising this later is safe without further changes.
const MAX_REEXPORT_HOPS = 1

/** A helper file's export surface, cached per absolute path for the
 *  lifetime of one `prescanImportedReactiveFactories` call (#2341 BUG-2). */
interface HelperFileInfo {
  sf: ts.SourceFile
  /** Module-scope function declarations exported under their external name
   *  (own `export function`, or a local `export { f as g }`). */
  exportedFns: Map<string, ts.FunctionDeclaration>
  /** `export { a as b } from 'src'` re-exports, keyed by the EXTERNAL name
   *  `b` — a barrel file's whole reason for existing (#2341 BUG-2). */
  reexports: Map<string, { source: string; innerName: string }>
  /** Any `export * from '...'` in this file — a named lookup that misses
   *  `exportedFns`/`reexports` might still resolve through one of these, so
   *  it can never be classified `'clean'`. (`export * as ns from` is a
   *  `NamespaceExport` clause and is excluded: a named lookup can never
   *  come through it.) */
  hasStarReexport: boolean
  moduleBindings: HelperModuleBindings
}
/** `'clean'` = read, parsed (or gate-skipped), and proven to define no
 *  reactive factory under any name reachable from it. `null` = unreadable. */
type LoadedHelper = HelperFileInfo | 'clean' | null
type ExportLookup =
  | { kind: 'fn'; fn: ts.FunctionDeclaration; file: HelperFileInfo; definingPath: string }
  | { kind: 'clean' } // proven non-reactive under this name → cleanFactoryImports
  | { kind: 'unknown' } // cannot prove → leave unclassified so the BF110 name heuristic still fires

/**
 * Cross-file half of the factory prescan (#2325 round 2): resolve factories
 * defined in a relative-imported helper file so `const { count } =
 * createCounter(0)` inlines the same way whether `createCounter` lives in
 * this file or in `./hooks`. Follows one `export ... from` hop so a barrel
 * `index.ts` re-exporting the real helper resolves to the file that
 * actually DEFINES it (#2341 BUG-2) — every classification (factory /
 * declined / reactive-shaped / clean) and every downstream anchor (module-
 * capture check, helper-import re-provisioning, `sourceFilePath`) is keyed
 * off that defining file, never the barrel. Mutates `result`'s maps in
 * place.
 *
 * Perf: gated on a candidate-callee set collected from the ALREADY-parsed
 * entry AST (no regex over source text, per CONTRIBUTING.md's "never parse
 * imports with regex" rule) — files with no tuple/object-destructured call
 * at all skip every filesystem access below. A second cheap gate (does the
 * helper file's raw text contain any `REACTIVE_PRIMITIVES` substring, or
 * any `export ... from` re-export text) skips the AST parse of helper files
 * that plainly define no factory and re-export nothing; this is a
 * skip-gate over content, not an import parse, so it doesn't run afoul of
 * that same rule.
 *
 * Name-collision precedence: a same-file factory/declined/reactive-shaped
 * entry always wins over a same-named cross-file import — every write
 * below is guarded on the name being unclaimed in all three buckets.
 */
function prescanImportedReactiveFactories(
  entrySourceFile: ts.SourceFile,
  filePath: string,
  result: PrescanResult
): void {
  // 1. Candidate gate: names destructured (tuple or object) from a direct
  //    call-expression initializer, anywhere in the file. Cheap AST walk,
  //    no filesystem access.
  const candidateCallees = new Set<string>()
  function collectCandidates(node: ts.Node): void {
    if (
      ts.isVariableDeclaration(node) &&
      (ts.isArrayBindingPattern(node.name) || ts.isObjectBindingPattern(node.name)) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      ts.isIdentifier(node.initializer.expression)
    ) {
      candidateCallees.add(node.initializer.expression.text)
    }
    ts.forEachChild(node, collectCandidates)
  }
  collectCandidates(entrySourceFile)
  if (candidateCallees.size === 0) return

  // 2. Relative imports whose named specifiers overlap the candidate set.
  interface CandidateSpec {
    /** Name exported from the helper file. */
    exported: string
    /** Local (call-site) binding name — the key every result map uses. */
    local: string
  }
  const importsToCheck: { src: string; specs: CandidateSpec[] }[] = []
  for (const stmt of entrySourceFile.statements) {
    if (!ts.isImportDeclaration(stmt)) continue
    if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue
    const src = stmt.moduleSpecifier.text
    // Mirrors `scanImportedClientSignals`'s restriction to relative
    // specifiers — non-relative (bare/aliased) imports resolve through
    // bundler / tsconfig-paths configuration this layer doesn't consume.
    if (!src.startsWith('./') && !src.startsWith('../')) continue
    if (stmt.importClause?.isTypeOnly) continue
    const namedBindings = stmt.importClause?.namedBindings
    if (!namedBindings || !ts.isNamedImports(namedBindings)) continue

    const specs: CandidateSpec[] = []
    for (const el of namedBindings.elements) {
      if (el.isTypeOnly) continue
      const local = el.name.text
      if (!candidateCallees.has(local)) continue
      specs.push({ exported: (el.propertyName ?? el.name).text, local })
    }
    if (specs.length === 0) continue
    importsToCheck.push({ src, specs })
  }
  if (importsToCheck.length === 0) return

  // #2332 — computed once per entry file, shared across all helper files.
  const entryBindingNames = collectEntryBindingNames(entrySourceFile)
  const entryImportIndex = buildEntryImportIndex(entrySourceFile, filePath)
  // localName -> planned injection identity; a later factory requiring the
  // same name from a DIFFERENT (targetKey, exportedName) is a collision.
  const plannedInjections = new Map<string, { targetKey: string; exportedName: string }>()

  // #2341 BUG-2 — one read+parse per helper file per entry file, memoized
  // across every spec/hop that touches it (a barrel is typically visited
  // once per re-exported name it satisfies).
  const helperCache = new Map<string, LoadedHelper>()

  function loadHelperFile(abs: string): LoadedHelper {
    const cached = helperCache.get(abs)
    if (cached !== undefined) return cached

    let content: string
    try {
      content = fs.readFileSync(abs, 'utf8')
    } catch {
      helperCache.set(abs, null)
      return null
    }

    // Cheap text-level skip-gate (not an import/JS parse — see docstring):
    // a file with no reactive-primitive substring AND no re-export gate
    // text (`export` ... `from`) can neither define a reactive factory nor
    // re-export one, so skip parsing it entirely. Substring checks only —
    // false positives merely cause an AST parse whose outcome is still
    // correct, they never cause a false 'clean'.
    const hasAnyPrimitiveText = [...REACTIVE_PRIMITIVES].some(p => content.includes(p))
    const hasReexportText = content.includes('export') && content.includes('from')
    if (!hasAnyPrimitiveText && !hasReexportText) {
      helperCache.set(abs, 'clean')
      return 'clean'
    }

    const sf = ts.createSourceFile(abs + '.prescan', content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

    // Map exported name -> module-scope FunctionDeclaration via the AST.
    const localFns = new Map<string, ts.FunctionDeclaration>()
    const exportedFns = new Map<string, ts.FunctionDeclaration>()
    for (const stmt of sf.statements) {
      if (ts.isFunctionDeclaration(stmt) && stmt.name && stmt.body) {
        localFns.set(stmt.name.text, stmt)
        const hasExportModifier = stmt.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false
        const hasDefaultModifier = stmt.modifiers?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword) ?? false
        if (hasExportModifier && !hasDefaultModifier) {
          exportedFns.set(stmt.name.text, stmt)
        }
      }
    }

    const reexports = new Map<string, { source: string; innerName: string }>()
    let hasStarReexport = false
    for (const stmt of sf.statements) {
      if (!ts.isExportDeclaration(stmt) || stmt.isTypeOnly) continue
      if (!stmt.moduleSpecifier) {
        // `export { f }` / `export { f as g }` — keyed by the EXTERNAL export name.
        if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
          for (const el of stmt.exportClause.elements) {
            if (el.isTypeOnly) continue
            const fn = localFns.get((el.propertyName ?? el.name).text)
            if (fn) exportedFns.set(el.name.text, fn)
          }
        }
        continue
      }
      if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue
      if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
        // `export { a as b } from 'src'` — keyed by the EXTERNAL name `b`.
        for (const el of stmt.exportClause.elements) {
          if (el.isTypeOnly) continue
          reexports.set(el.name.text, {
            source: stmt.moduleSpecifier.text,
            innerName: (el.propertyName ?? el.name).text,
          })
        }
      } else if (!stmt.exportClause) {
        // `export * from 'src'`. (`export * as ns from` carries a
        // NamespaceExport clause here, not `undefined` — excluded on
        // purpose: a named lookup can never come through it.)
        hasStarReexport = true
      }
    }

    // Module-scope bindings the helper file declares — an inlined factory
    // body must not reference any of these (#2325 §4h / BF112), since
    // inlining moves the body into the component file where they don't
    // exist.
    const moduleBindings = collectHelperModuleValueBindings(sf)

    const info: HelperFileInfo = { sf, exportedFns, reexports, hasStarReexport, moduleBindings }
    helperCache.set(abs, info)
    return info
  }

  /**
   * Resolve `exportedName` from the file at `abs`, following one
   * `export ... from` hop through a barrel re-export (#2341 BUG-2).
   * `visited` guards against self/indirect barrel cycles.
   */
  function lookupExportedFactory(
    abs: string,
    exportedName: string,
    visited: Set<string>,
    hopsLeft: number
  ): ExportLookup {
    if (visited.has(abs)) return { kind: 'unknown' }
    visited.add(abs)

    const file = loadHelperFile(abs)
    if (file === null) return { kind: 'unknown' }
    if (file === 'clean') return { kind: 'clean' }

    const fn = file.exportedFns.get(exportedName)
    if (fn) return { kind: 'fn', fn, file, definingPath: abs }

    const re = file.reexports.get(exportedName)
    if (re) {
      if (hopsLeft <= 0) return { kind: 'unknown' }
      // Non-relative re-export specifiers (`export { x } from 'pkg'`)
      // resolve through bundler/tsconfig-paths configuration this layer
      // doesn't consume — same restriction as direct imports.
      if (!re.source.startsWith('./') && !re.source.startsWith('../')) return { kind: 'unknown' }
      const target = resolveRelativeImportToFile(re.source, abs)
      if (!target) return { kind: 'unknown' } // unresolvable re-export target: never mark clean
      return lookupExportedFactory(target, re.innerName, visited, hopsLeft - 1)
    }

    // `export * from` might still reach this name through a file this
    // layer doesn't enumerate — never clean. Otherwise the file was fully
    // inspected and genuinely doesn't define or re-export this name.
    if (file.hasStarReexport) return { kind: 'unknown' }
    return { kind: 'clean' }
  }

  for (const { src, specs } of importsToCheck) {
    const resolved = resolveRelativeImportToFile(src, filePath)
    // Unresolvable — left alone here; the name-heuristic BF110 branch in
    // validateReactiveFactoryCalls handles it at validation time.
    if (!resolved) continue

    const alreadyKnown = (name: string): boolean =>
      result.factories.has(name) || result.declined.has(name) || result.reactiveShaped.has(name)

    for (const spec of specs) {
      if (alreadyKnown(spec.local)) continue

      const found = lookupExportedFactory(resolved, spec.exported, new Set<string>(), MAX_REEXPORT_HOPS)
      if (found.kind === 'clean') {
        result.cleanFactoryImports.add(spec.local)
        continue
      }
      if (found.kind === 'unknown') continue

      const { fn, file, definingPath } = found
      const helperSf = file.sf
      const moduleBindings = file.moduleBindings

      const det = detectReactiveFactory(fn, helperSf, definingPath)
      if (!det) {
        result.cleanFactoryImports.add(spec.local)
        continue
      }
      switch (det.kind) {
        case 'reactive-shaped':
          result.reactiveShaped.add(spec.local)
          break
        case 'declined':
          result.declined.set(spec.local, det.declined)
          break
        case 'factory': {
          // Module-capture check is anchored to the DEFINING file's own
          // module bindings, not the barrel's (#2341 BUG-2) — the barrel
          // itself contributes no bindings the inlined body could reference.
          const capture = moduleCaptureCheck(fn, det.info, moduleBindings, fn.name!.text)
          if (capture.captured.length > 0) {
            result.declined.set(spec.local, {
              code: 'BF112',
              detail: `'${capture.captured.join("', '")}'`,
              loc: det.info.loc,
            })
            break
          }
          // #2332 — re-provision the helper file's own named value imports
          // that the factory body references, instead of declining. Each
          // ref resolves to a component-relative specifier (or passes
          // through unchanged for bare/npm specifiers); a ref already
          // satisfied by an identical top-level import in the component
          // file is dropped rather than injected (would redeclare it). A
          // ref whose local name collides with a DIFFERENT existing/planned
          // binding declines with BF113 — `pending` is only merged into
          // `plannedInjections` on full factory success (§3.4), so a
          // factory that declines mid-loop reserves nothing.
          const required: RequiredFactoryImport[] = []
          const pending: Array<[string, { targetKey: string; exportedName: string }]> = []
          let declinedEntry: DeclinedReactiveFactory | null = null
          for (const ref of capture.importedRefs) {
            let specifier: string
            let targetKey: string
            if (ref.source.startsWith('./') || ref.source.startsWith('../')) {
              // Resolve from the DEFINING file's directory (#2341 BUG-2 —
              // `definingPath` is the file that actually declares this
              // import, which may differ from the barrel that was
              // imported). Unresolvable → same posture as a local
              // capture: nothing importable to re-provision (BF112).
              const abs = resolveRelativeImportToFile(ref.source, definingPath)
              if (!abs) {
                declinedEntry = {
                  code: 'BF112',
                  detail: `'${ref.localName}' (import '${ref.source}' did not resolve from the helper file)`,
                  loc: det.info.loc,
                }
                break
              }
              specifier = toComponentRelativeSpecifier(abs, filePath)
              targetKey = abs
            } else {
              specifier = ref.source // bare/npm specifier — unchanged (#2332 test 2)
              targetKey = ref.source
            }
            // Already satisfied by an identical top-level import in the
            // component file — injecting again would redeclare the binding.
            const existing = entryImportIndex.get(ref.localName)
            if (existing && existing.targetKey === targetKey && existing.exportedName === ref.exportedName) {
              continue
            }
            const planned = plannedInjections.get(ref.localName)
            const collides =
              (existing !== undefined) ||
              (planned !== undefined && (planned.targetKey !== targetKey || planned.exportedName !== ref.exportedName)) ||
              (planned === undefined && entryBindingNames.has(ref.localName))
            if (collides) {
              declinedEntry = {
                code: 'BF113',
                detail: `'${ref.localName}' from '${specifier}'`,
                loc: det.info.loc,
              }
              break
            }
            pending.push([ref.localName, { targetKey, exportedName: ref.exportedName }])
            required.push({ localName: ref.localName, exportedName: ref.exportedName, specifier })
          }
          if (declinedEntry) {
            result.declined.set(spec.local, declinedEntry)
            break
          }
          for (const [name, id] of pending) plannedInjections.set(name, id)
          // #2341 BUG-2 — anchored to the file that actually defines the
          // factory, not the (possibly barrel) import path the component
          // used to reach it.
          det.info.sourceFilePath = definingPath
          if (required.length > 0) det.info.requiredImports = required
          result.factories.set(spec.local, det.info)
          break
        }
      }
    }
  }
}

/**
 * Value bindings at the helper file's module scope, split by whether they
 * have a re-importable module of their own (#2332).
 *
 * `local` bindings — top-level const/let/var, function/class/enum names,
 * plus default-import and namespace-import names — have no module a
 * component file could re-import them from, so an inlined factory body
 * referencing one unconditionally declines with BF112 (#2325 §4h): moving
 * the body into the component file would leave a dangling reference.
 *
 * `imported` bindings — the helper file's own named value imports — CAN be
 * re-provisioned: the component file can import the same binding under the
 * same specifier (#2332). These are collected here (keyed by the helper
 * file's local name) but are NOT captures; `moduleCaptureCheck` below
 * reports them separately from `local` hits so the caller can decide
 * whether to re-import rather than unconditionally decline.
 *
 * EXCEPT in both cases: imports from '@barefootjs/client' /
 * '@barefootjs/client/runtime'. Those are re-provisioned from usage by the
 * client-JS emitter regardless of where the call that used them textually
 * came from (`resolveFinalImports` / `detectUsedImports` regex-scan the
 * *generated* code, not the consumer's source imports — see #2325 spec C1),
 * so an inlined body calling `createSignal` is never a capture even though
 * the helper file itself imports it. Type-only imports/declarations carry
 * no runtime binding and are excluded.
 */
interface HelperModuleBindings {
  /** Declared directly in the helper file — unconditional BF112 capture. */
  local: Set<string>
  /** Named value-import specifiers, keyed by helper-file local name —
   *  re-provisionable into the component file (#2332). */
  imported: Map<string, { source: string; exportedName: string }>
}

function collectHelperModuleValueBindings(sf: ts.SourceFile): HelperModuleBindings {
  const local = new Set<string>()
  const imported = new Map<string, { source: string; exportedName: string }>()
  for (const stmt of sf.statements) {
    if (ts.isVariableStatement(stmt)) {
      const out: string[] = []
      for (const decl of stmt.declarationList.declarations) {
        addBindingNames(decl.name, out)
      }
      for (const n of out) local.add(n)
      continue
    }
    if (
      (ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt) || ts.isEnumDeclaration(stmt)) &&
      stmt.name
    ) {
      local.add(stmt.name.text)
      continue
    }
    if (ts.isImportDeclaration(stmt)) {
      if (stmt.importClause?.isTypeOnly) continue
      if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue
      const src = stmt.moduleSpecifier.text
      if (src === '@barefootjs/client' || src === '@barefootjs/client/runtime') continue
      // Default/namespace imports stay hard BF112 (#2332 scope decision):
      // no single named export to re-provision under one local name.
      if (stmt.importClause?.name) local.add(stmt.importClause.name.text)
      const namedBindings = stmt.importClause?.namedBindings
      if (namedBindings && ts.isNamedImports(namedBindings)) {
        for (const el of namedBindings.elements) {
          if (el.isTypeOnly) continue
          imported.set(el.name.text, { source: src, exportedName: (el.propertyName ?? el.name).text })
        }
      }
      if (namedBindings && ts.isNamespaceImport(namedBindings)) {
        local.add(namedBindings.name.text)
      }
    }
  }
  return { local, imported }
}

/**
 * Categorized free-identifier references of a reactive-factory body into
 * its own module scope (#2332): `captured` are unconditional BF112 hits
 * (helper-local bindings — the body would dangle if inlined verbatim);
 * `importedRefs` are references to the helper file's own named value
 * imports, which the caller may re-provision into the component file
 * instead of declining (§3.4 in the #2332 spec).
 */
interface ModuleCaptureResult {
  /** Free refs resolving to helper-local bindings (BF112), sorted. */
  captured: string[]
  /** Free refs resolving to the helper's own named value imports, sorted by localName. */
  importedRefs: Array<{ localName: string; source: string; exportedName: string }>
}

/**
 * Free identifiers of a reactive-factory body that resolve to bindings at
 * its own module scope (#2325 §4h / BF112, #2332) — references the inlined
 * body would silently lose once spliced into the component file, unless
 * re-provisioned as an import. Returns `captured` (unconditional BF112) and
 * `importedRefs` (re-provisionable) separately, each sorted for stable
 * diagnostic/injection text.
 *
 * Known accepted limitation: `extractFreeIdentifiersFromNode` only scope-
 * tracks arrow-function parameters, not nested `function` declarations'
 * parameters or nested-block declarations — a body-nested binding that
 * happens to shadow a helper-module binding could false-positive into
 * BF112 or `importedRefs`. Acceptable: the failure direction is always a
 * loud build error (BF112/BF113) or a redundant-but-harmless injected
 * import, never a silent dangling reference.
 */
function moduleCaptureCheck(
  fn: ts.FunctionDeclaration,
  info: ReactiveFactoryInfo,
  moduleBindings: HelperModuleBindings,
  selfName: string
): ModuleCaptureResult {
  if (!fn.body) return { captured: [], importedRefs: [] }
  const free = extractFreeIdentifiersFromNode(fn.body)
  const exclude = new Set<string>(info.params)
  for (const b of info.localBindings) exclude.add(b)
  for (const r of info.returnTupleIdentifiers) exclude.add(r)
  for (const p of REACTIVE_PRIMITIVES) exclude.add(p)
  exclude.add(selfName)

  const captured: string[] = []
  const importedRefs: ModuleCaptureResult['importedRefs'] = []
  for (const id of free) {
    if (exclude.has(id)) continue
    if (moduleBindings.local.has(id)) {
      captured.push(id)
      continue
    }
    const imp = moduleBindings.imported.get(id)
    if (imp) importedRefs.push({ localName: id, source: imp.source, exportedName: imp.exportedName })
  }
  captured.sort()
  importedRefs.sort((a, b) => (a.localName < b.localName ? -1 : 1))
  return { captured, importedRefs }
}

/**
 * Classification result for a module-level function that might be a
 * reactive-factory helper (#2325). `null` means the function has no
 * reactive-primitive call anywhere in its body, so it isn't reactive-
 * related at all — every other case implies at least one such call.
 */
type FactoryDetection =
  | { kind: 'factory'; info: ReactiveFactoryInfo }
  | { kind: 'declined'; declined: DeclinedReactiveFactory }
  | { kind: 'reactive-shaped' } // wraps a reactive primitive but shape unsupported
  | null

function detectReactiveFactory(
  node: ts.FunctionDeclaration,
  sourceFile: ts.SourceFile,
  filePath: string
): FactoryDetection {
  if (!node.body || !node.name) return null

  // Body must contain at least one reactive primitive call so that the
  // factory is actually the right thing to inline (not just a helper that
  // happens to look similar). Checked FIRST: a function with zero reactive
  // calls is not reactive-related in any way, so it is out of scope for
  // every diagnostic below, not just "not a factory".
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

  const loc = getSourceLocation(node, sourceFile, filePath)

  // Count `return`s ANYWHERE in the body, stopping at nested function-like
  // boundaries (ts.isFunctionLike — functions, arrows, methods, accessors,
  // and constructors; broader than isMultiReturnJsxFunctionBody's #932
  // three-kind check, which only needs to catch JSX-returning callbacks and
  // was never exercised against class/object methods) — a return inside a
  // nested callback OR a class/object method declared in the factory body
  // belongs to that inner scope, not this factory (Copilot review, PR
  // #2342: the narrower check would misclassify a factory with, e.g., a
  // helper class whose method contains a `return` as having multiple
  // returns, declining it unnecessarily). A return nested in if/try/loop
  // blocks DOES count, so guard-clause factories are declassified instead
  // of splicing an early `return` into the component's init function
  // (#2341 BUG-3).
  let totalReturnCount = 0
  function countReturns(n: ts.Node): void {
    if (ts.isFunctionLike(n)) return
    if (ts.isReturnStatement(n)) { totalReturnCount++; return }
    ts.forEachChild(n, countReturns)
  }
  ts.forEachChild(node.body, countReturns)

  // Require exactly one top-level `return`, whose argument (after unwrapping
  // parens / `as const` / type-assertion) is a tuple (array literal) or a
  // shorthand-object literal.
  let returnExpr: ts.Expression | null = null
  let returnCount = 0
  for (const stmt of node.body.statements) {
    if (!ts.isReturnStatement(stmt)) continue
    returnCount++
    if (!stmt.expression) return { kind: 'reactive-shaped' }
    let expr: ts.Expression = stmt.expression
    while (ts.isParenthesizedExpression(expr)) expr = expr.expression
    // Accept `... as const` / `<const>...`
    if (ts.isAsExpression(expr)) expr = expr.expression
    if (ts.isTypeAssertionExpression(expr)) expr = expr.expression
    returnExpr = expr
  }
  // `totalReturnCount === 1 && returnCount === 1` jointly guarantee the
  // single return is a direct child of `node.body` (top-level returns are a
  // subset of total) — so a guard-clause / try-catch / loop return
  // declassifies the factory instead of silently producing an inert
  // component (#2341 BUG-3).
  if (totalReturnCount !== 1 || returnCount !== 1 || !returnExpr) return { kind: 'reactive-shaped' }

  const returnTupleIdentifiers: string[] = []
  let returnKind: 'tuple' | 'object'

  if (ts.isArrayLiteralExpression(returnExpr)) {
    returnKind = 'tuple'
    // Every element must be a plain identifier (no spreads, computed,
    // call expressions). Otherwise the caller-side rename would not be sound.
    for (const el of returnExpr.elements) {
      if (!ts.isIdentifier(el)) return { kind: 'reactive-shaped' }
      returnTupleIdentifiers.push(el.text)
    }
    if (returnTupleIdentifiers.length === 0) return { kind: 'reactive-shaped' }
  } else if (ts.isObjectLiteralExpression(returnExpr)) {
    returnKind = 'object'
    const hasNonShorthand = returnExpr.properties.some(p => !ts.isShorthandPropertyAssignment(p))
    if (hasNonShorthand) {
      return {
        kind: 'declined',
        declined: {
          code: 'BF111',
          detail: `return object of '${node.name.text}' uses non-shorthand properties`,
          loc,
        },
      }
    }
    for (const p of returnExpr.properties) {
      // Every property already proven ts.isShorthandPropertyAssignment above.
      returnTupleIdentifiers.push((p as ts.ShorthandPropertyAssignment).name.text)
    }
    if (returnTupleIdentifiers.length === 0) return { kind: 'reactive-shaped' }
  } else {
    return { kind: 'reactive-shaped' }
  }

  // Collect parameter names first — the rename-site walk below needs them
  // as part of `relevantNames` and to detect param-shadowing declarations
  // (BF114). Hoisted above local-binding/body-serialization collection
  // (#2341 BUG-1); it has no dependency on either.
  const params: string[] = []
  for (const p of node.parameters) {
    if (ts.isIdentifier(p.name)) {
      params.push(p.name.text)
      continue
    }
    // Destructured params are uncommon for this helper shape and out of
    // initial scope; the factory still wraps a reactive primitive, so
    // classify it as reactive-shaped rather than silently ignoring it.
    return { kind: 'reactive-shaped' }
  }

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

  // Names that call-site inlining may rename: params (substituted with
  // arbitrary argument expressions), local bindings (suffix-renamed for
  // per-call-site hygiene), and return identifiers (renamed to the
  // caller's destructure names). Every other identifier in the body is
  // left untouched — the #2341 BUG-1 fix for the old whole-body regex
  // renames, which corrupted string/template literals, property keys,
  // and `.prop` tails that merely happened to share a relevant name.
  const relevantNames = new Set<string>([...params, ...localBindings, ...returnTupleIdentifiers])

  const renameSites: FactoryRenameSite[] = []
  let shadowedParam: string | null = null

  /**
   * Recursive AST walk collecting rename sites for one kept statement.
   * `toBodyOffset` converts a position in `sourceFile` (this statement's
   * original source) to an offset in the final joined `bodyStatements`
   * string — see the join loop below for why this must stay a pure
   * function of `stmtStart`/`base`.
   */
  function collectRenameSites(root: ts.Node, toBodyOffset: (pos: number) => number): void {
    function push(id: ts.Identifier, form: 'plain' | 'shorthand'): void {
      renameSites.push({
        name: id.text,
        start: toBodyOffset(id.getStart(sourceFile)),
        end: toBodyOffset(id.getEnd()),
        form,
      })
    }

    function classify(id: ts.Identifier): void {
      if (!relevantNames.has(id.text)) return
      const p = id.parent
      // Pure-key / non-reference positions — never rename:
      if (ts.isPropertyAccessExpression(p) && p.name === id) return        // obj.name tail (incl. ?. chains)
      if (ts.isPropertyAssignment(p) && p.name === id) return              // { name: v } key
      if (ts.isBindingElement(p) && p.propertyName === id) return          // { name: local } pattern key
      if ((ts.isMethodDeclaration(p) || ts.isGetAccessorDeclaration(p) ||
           ts.isSetAccessorDeclaration(p) || ts.isPropertyDeclaration(p) ||
           ts.isEnumMember(p)) && p.name === id) return                    // member keys
      if (ts.isJsxAttribute(p) && p.name === id) return                    // JSX attr name
      if ((ts.isLabeledStatement(p) && p.label === id) ||
          ((ts.isBreakStatement(p) || ts.isContinueStatement(p)) && p.label === id)) return
      if ((ts.isJsxOpeningElement(p) || ts.isJsxSelfClosingElement(p) || ts.isJsxClosingElement(p)) &&
          p.tagName === id && /^[a-z]/.test(id.text)) return               // intrinsic tag <div>

      // Shorthand dual-role positions → expansion form (renaming must
      // preserve the implied key): `{ name }` object literal / pattern.
      if (ts.isShorthandPropertyAssignment(p) && p.name === id) { push(id, 'shorthand'); return }
      if (ts.isBindingElement(p) && p.name === id && !p.propertyName &&
          ts.isObjectBindingPattern(p.parent)) {
        // ArrayBindingPattern trap: a tuple destructure element
        // (`const [a, b] = ...`) ALSO has propertyName === undefined —
        // the ts.isObjectBindingPattern(p.parent) check above is what
        // keeps tuple elements out of the shorthand-expansion path.
        if (params.includes(id.text)) shadowedParam = id.text            // decl of a param name → BF114
        push(id, 'shorthand')
        return
      }

      // Declaration-name positions → plain rename, but a param name
      // re-declared here is a shadow: params are substituted with
      // arbitrary argument expressions, so a shadowing declaration would
      // receive an invalid left-hand side (BF114 declines instead).
      const isDecl =
        (ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isBindingElement(p) ||
         ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) ||
         ts.isClassDeclaration(p) || ts.isClassExpression(p)) && p.name === id
      if (isDecl && params.includes(id.text)) shadowedParam = id.text

      push(id, 'plain')                                                   // genuine value reference or decl
    }

    function visit(n: ts.Node): void {
      // Never descend into type-land: annotations are stripped downstream,
      // and splicing an argument EXPRESSION into a type position would be
      // invalid JS.
      if (ts.isTypeNode(n) || ts.isTypeParameterDeclaration(n) ||
          ts.isTypeAliasDeclaration(n) || ts.isInterfaceDeclaration(n)) return
      if (ts.isIdentifier(n)) { classify(n); return }                      // identifiers have no relevant children
      ts.forEachChild(n, visit)
    }

    visit(root)
  }

  // Serialize the body without the outer braces and without the return
  // statement — the return tuple/object is dissolved into caller-named
  // identifiers. `renameSites` is collected in this SAME loop so its
  // offsets (relative to the joined `bodyStatements` string) can never
  // drift from the join logic — this invariant is the single most fragile
  // part of the rename mechanism (#2341 BUG-1): site collection and
  // `bodyStatements` construction must use the identical statement filter,
  // identical `getText` slices, and identical '\n' join.
  const keptStatements = node.body.statements.filter(s => !ts.isReturnStatement(s))
  const pieces: string[] = []
  let base = 0
  for (const stmt of keptStatements) {
    const text = stmt.getText(sourceFile)
    const stmtStart = stmt.getStart(sourceFile)
    collectRenameSites(stmt, (pos) => pos - stmtStart + base)
    pieces.push(text)
    base += text.length + 1 // +1 for the '\n' join — MUST match the join below
  }
  const bodyStatements = pieces.join('\n')

  if (shadowedParam !== null) {
    return {
      kind: 'declined',
      declined: {
        code: 'BF114',
        detail: `parameter '${shadowedParam}' of '${node.name.text}' is shadowed by a nested declaration inside the factory body`,
        loc,
      },
    }
  }

  // Dev invariant: every collected site's [start, end) range must slice
  // out exactly the identifier text it was collected for, or the
  // bottom-to-top splice in inlineFactoryCallAtSite would corrupt
  // unrelated text. Cheap (bounded by body size) — kept as a permanent
  // guard against the offset math drifting under a future edit. Declines
  // rather than throwing (Copilot review, PR #2342): compileJSX does not
  // catch analyzer errors, so a thrown exception here would crash the
  // whole compilation instead of failing one factory loudly-but-
  // gracefully as a diagnostic — this should never trigger in practice,
  // but the failure mode if it ever does must stay "loud decline," not
  // "hard crash," matching this feature's whole design philosophy.
  for (const site of renameSites) {
    if (bodyStatements.slice(site.start, site.end) !== site.name) {
      return {
        kind: 'declined',
        declined: {
          code: 'BF111',
          detail:
            `internal rename-site offset mismatch for '${site.name}' — this is a compiler bug, ` +
            `please report it`,
          loc,
        },
      }
    }
  }

  return {
    kind: 'factory',
    info: {
      params,
      bodySource: bodyStatements,
      returnTupleIdentifiers,
      returnKind,
      localBindings,
      loc,
      renameSites,
    },
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
  // #2332 — factories actually inlined in this walk (not merely present in
  // `prescan.factories`; `maybeRewriteDecl` bails on arity mismatch/omitted
  // elements/rename destructures without inlining), so their
  // `requiredImports` can be re-provisioned without adding a dead import
  // for a factory that was never actually spliced in.
  const inlinedFactories = new Set<ReactiveFactoryInfo>()

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
    if (!decl.initializer || !ts.isCallExpression(decl.initializer)) return
    if (!ts.isIdentifier(decl.initializer.expression)) return
    const factoryName = decl.initializer.expression.text
    const factory = factories.get(factoryName)
    if (!factory) return

    if (ts.isArrayBindingPattern(decl.name)) {
      if (factory.returnKind !== 'tuple') return
      rewriteTupleDecl(stmt, decl.name, decl.initializer, factory)
      return
    }
    if (ts.isObjectBindingPattern(decl.name)) {
      if (factory.returnKind !== 'object') return
      rewriteObjectDecl(stmt, decl.name, decl.initializer, factory)
      return
    }
  }

  function rewriteTupleDecl(
    stmt: ts.VariableStatement,
    pattern: ts.ArrayBindingPattern,
    call: ts.CallExpression,
    factory: ReactiveFactoryInfo
  ): void {
    // Arity check — bail out on mismatch so the analyzer can report BF110
    // on the untouched source.
    const elements = pattern.elements
    if (elements.length !== factory.returnTupleIdentifiers.length) return

    // Caller-side identifier names (one per tuple slot). Omitted slots
    // and nested destructure patterns are out of scope — bail out so the
    // analyzer can emit BF110.
    const callerNames: string[] = []
    for (const el of elements) {
      if (ts.isOmittedExpression(el) || !ts.isIdentifier(el.name)) return
      callerNames.push(el.name.text)
    }

    // Exclude params + every return-tuple identifier from suffix-renaming
    // (they're renamed to caller names below instead).
    const excludeFromSuffixRename = new Set<string>(factory.params)
    for (const r of factory.returnTupleIdentifiers) excludeFromSuffixRename.add(r)

    const renameReturnToCallerNames = new Map<string, string>()
    for (let i = 0; i < factory.returnTupleIdentifiers.length; i++) {
      renameReturnToCallerNames.set(factory.returnTupleIdentifiers[i], callerNames[i])
    }

    inlineFactoryCallAtSite(stmt, factory, call.arguments, excludeFromSuffixRename, renameReturnToCallerNames)
  }

  function rewriteObjectDecl(
    stmt: ts.VariableStatement,
    pattern: ts.ObjectBindingPattern,
    call: ts.CallExpression,
    factory: ReactiveFactoryInfo
  ): void {
    // Shorthand destructuring only (no renames/defaults/rest) of names the
    // factory actually returns. Anything else bails so the analyzer can
    // report BF110/BF111 on the untouched source. Subset destructures are
    // allowed — a caller may destructure fewer than all returned names.
    const destructured = new Set<string>()
    for (const el of pattern.elements) {
      if (el.dotDotDotToken) return
      if (el.propertyName) return
      if (el.initializer) return
      if (!ts.isIdentifier(el.name)) return
      if (!factory.returnTupleIdentifiers.includes(el.name.text)) return
      destructured.add(el.name.text)
    }

    // Exclude params + the destructured names from suffix-renaming (caller
    // name already equals the property name under shorthand, C4). Returned
    // names the caller did NOT destructure are ordinary internal locals and
    // DO get suffix-renamed — otherwise two subset calls of the same
    // factory collide on the undestructured name.
    const excludeFromSuffixRename = new Set<string>(factory.params)
    for (const d of destructured) excludeFromSuffixRename.add(d)

    // No return-name→caller-name rename step: identity under shorthand.
    inlineFactoryCallAtSite(stmt, factory, call.arguments, excludeFromSuffixRename, null)
  }

  /**
   * Shared inlining tail for both return shapes: suffix-rename internal
   * bindings not in `excludeFromSuffixRename`, splice argument expressions
   * in for parameters, optionally rename return identifiers to caller
   * names (tuple path only — see C4 for why the object path passes null),
   * and push the resulting edit for this call site.
   */
  function inlineFactoryCallAtSite(
    stmt: ts.VariableStatement,
    factory: ReactiveFactoryInfo,
    args: ts.NodeArray<ts.Expression>,
    excludeFromSuffixRename: Set<string>,
    renameReturnToCallerNames: Map<string, string> | null
  ): void {
    const argTexts = args.map(a => a.getText(sourceFile))
    const thisCallIndex = callSiteIndex++
    const suffix = `_bf${thisCallIndex}`

    // Merged rename map, one entry per old name → replacement text.
    // Precedence (matches the pre-#2341 sequential-pass outcome): param
    // substitution > return→caller rename > internal suffix rename — later
    // `.set()` calls for the same key overwrite earlier ones below.
    const renames = new Map<string, string>()
    // 1. Suffix-rename internal bindings not excluded (tuple params/returns,
    //    or object-path destructured names — see excludeFromSuffixRename's
    //    callers).
    for (const name of factory.localBindings) {
      if (!excludeFromSuffixRename.has(name)) renames.set(name, name + suffix)
    }
    // 2. Return identifiers → caller destructure names (tuple path only).
    if (renameReturnToCallerNames) {
      for (const [n, caller] of renameReturnToCallerNames) {
        if (caller !== n) renames.set(n, caller) // identity rename = no-op, skip
      }
    }
    // 3. Parameters → argument expressions. Atomic arguments (bare
    //    identifiers, numeric literals, string literals) are spliced
    //    directly; anything more complex is wrapped in parens to preserve
    //    operator precedence at the splice site. Overwrites any same-name
    //    return rename above — param substitution wins, as before #2341.
    const atomicArg = /^(?:[\w$.]+|'[^'\\]*'|"[^"\\]*"|-?\d+(?:\.\d+)?)$/
    for (let i = 0; i < factory.params.length; i++) {
      const p = factory.params[i]
      const a = (argTexts[i] ?? 'undefined').trim()
      renames.set(p, atomicArg.test(a) ? a : `(${a})`)
    }

    // Apply the merged renames as a single bottom-to-top position splice
    // over `bodySource`, using the sites collected once at detection time
    // (#2341 BUG-1) — never a text search, so string/template-literal
    // contents, property keys, `.prop` tails, and JSX intrinsic tags are
    // never touched, and (unlike the old sequential regex passes) an
    // argument expression already spliced in for an earlier site can never
    // be re-scanned and corrupted by a later rename.
    let body = factory.bodySource
    for (let i = factory.renameSites.length - 1; i >= 0; i--) {
      const site = factory.renameSites[i]
      const repl = renames.get(site.name)
      if (repl === undefined) continue
      const text = site.form === 'shorthand' ? `${site.name}: ${repl}` : repl
      body = body.slice(0, site.start) + text + body.slice(site.end)
    }

    edits.push({
      start: stmt.getStart(sourceFile),
      end: stmt.getEnd(),
      replacement: body,
    })
    inlinedFactories.add(factory)
  }

  visitStmt(sourceFile, false)

  if (edits.length === 0) return source

  // #2332 — one deduped import statement per specifier for every inlined
  // cross-file factory's re-provisioned imports. Injected as a zero-width
  // edit so the ordinary bottom-to-top splice below applies it; the result
  // is indistinguishable from a hand-written import for every downstream
  // consumer (ctx.imports → SSR templateImports AND client
  // collectExternalImports both parse this same rewritten string).
  const importsBySpecifier = new Map<string, Map<string, string>>() // specifier -> localName -> exportedName
  for (const f of inlinedFactories) {
    for (const r of f.requiredImports ?? []) {
      let names = importsBySpecifier.get(r.specifier)
      if (!names) { names = new Map(); importsBySpecifier.set(r.specifier, names) }
      names.set(r.localName, r.exportedName) // same-key duplicates are identical by prescan construction
    }
  }
  if (importsBySpecifier.size > 0) {
    // Sort specifiers and, within each, named-import entries by local name —
    // `importsBySpecifier`/`inlinedFactories` iterate in incidental AST-
    // traversal/insertion order, which would otherwise make this generated
    // text order-unstable across unrelated refactors (Copilot review, PR
    // #2338).
    const lines = [...importsBySpecifier]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([spec, names]) => {
        const specifiers = [...names]
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([local, exported]) => (exported === local ? local : `${exported} as ${local}`))
        return `import { ${specifiers.join(', ')} } from '${spec}'`
      })
    const at = factoryImportInsertionOffset(sourceFile)
    edits.push({ start: at, end: at, replacement: at === 0 ? lines.join('\n') + '\n' : '\n' + lines.join('\n') })
  }

  // Apply edits from bottom to top so earlier offsets stay valid. A factory
  // with `requiredImports` is by definition imported, so the entry file has
  // at least one import statement and `at` above lands strictly inside the
  // import prologue — every call-site edit's start is strictly greater
  // (separated at minimum by the statement break after the last import), so
  // starts never tie and no sort tiebreak is needed.
  edits.sort((a, b) => b.start - a.start)
  let out = source
  for (const e of edits) {
    out = out.slice(0, e.start) + e.replacement + out.slice(e.end)
  }
  return out
}

/**
 * Offset just after the last top-level import (else after the 'use client'
 * directive, else 0) in the prescan source file — where re-provisioned
 * factory imports are injected (#2332).
 */
function factoryImportInsertionOffset(sf: ts.SourceFile): number {
  let lastImportEnd = -1
  let directiveEnd = -1
  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt)) { lastImportEnd = stmt.getEnd(); continue }
    if (directiveEnd === -1 && ts.isExpressionStatement(stmt) &&
        ts.isStringLiteral(stmt.expression) && stmt.expression.text === 'use client') {
      directiveEnd = stmt.getEnd()
    }
  }
  return lastImportEnd >= 0 ? lastImportEnd : directiveEnd >= 0 ? directiveEnd : 0
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

// =============================================================================
// BF110 diagnostic (#931)
// =============================================================================

/**
 * Build the diagnostic for a call site whose callee was recognised but
 * declined for inlining (#2325 — cross-file factories that rename their
 * return properties or capture their own module scope; #2332 — a
 * re-provisioned helper import collides with an existing binding). BF112
 * and BF113's wording is specific to their respective failure; every other
 * declined reason (currently only BF111 — non-shorthand return properties)
 * shares BF111's generic "cannot be inlined: <detail>" phrasing, matching
 * the wording used for the tuple call-site path.
 */
function declinedFactoryMessage(callee: string, d: DeclinedReactiveFactory): string {
  if (d.code === 'BF112') {
    return (
      `Reactive factory '${callee}' references ${d.detail} from its own module ` +
      `scope and cannot be inlined. Move the referenced helper(s) into this file, ` +
      `pass them as factory arguments, or inline the factory here.`
    )
  }
  if (d.code === 'BF113') {
    return (
      `Reactive factory '${callee}' cannot be inlined: it needs ${d.detail} ` +
      `imported into this file, but that name is already bound here to something ` +
      `else. Rename the conflicting binding in this file, or alias the import in ` +
      `the factory's own file (import { x as y }).`
    )
  }
  return `Reactive factory '${callee}' cannot be inlined: ${d.detail}.`
}

/** Diagnostic code for a declined reactive-factory call site (#2325 / #2332). */
function declinedFactoryErrorCode(code: DeclinedReactiveFactory['code']): ErrorCode {
  switch (code) {
    case 'BF112': return ErrorCodes.REACTIVE_FACTORY_MODULE_CAPTURE
    case 'BF113': return ErrorCodes.REACTIVE_FACTORY_IMPORT_COLLISION
    case 'BF114': return ErrorCodes.REACTIVE_FACTORY_PARAM_SHADOWED
    default: return ErrorCodes.REACTIVE_FACTORY_RENAME_UNSUPPORTED
  }
}

/**
 * Scan a compiled component context for destructures (tuple or object)
 * whose callee is neither `createSignal` / `createMemo` nor an inlinable
 * reactive factory. These are the silent-failure shapes that produced
 * broken client JS prior to factory inlining — emit BF110 (unrecognised
 * shape), BF111 (unsupported rename), or BF112 (module-scope capture) so
 * users get a clear message instead.
 *
 * Only walks top-level component-body statements, matching the scope the
 * inliner itself operates on (#931) — a factory call inside a nested block
 * is out of scope for both inlining and this diagnostic.
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
      if (!decl.initializer || !ts.isCallExpression(decl.initializer)) continue
      if (!ts.isIdentifier(decl.initializer.expression)) continue
      const callee = decl.initializer.expression.text
      const loc = getSourceLocation(stmt, ctx.sourceFile, ctx.filePath)

      if (ts.isArrayBindingPattern(decl.name)) {
        if (callee === 'createSignal' || callee === 'createMemo') continue
        // Env-signal factories (`createSearchParams`, #2057) are `createSignal`-
        // shaped and recognised structurally — a valid tuple destructure. Resolve
        // via the same path as recognition (`resolveEnvSignalKey`) so an aliased
        // import (`import { createSearchParams as csp }`) is accepted here too,
        // rather than falling through to a spurious BF110.
        if (resolveEnvSignalKey(decl.initializer, ctx)) continue

        const declinedEntry = ctx.declinedReactiveFactories.get(callee)
        if (declinedEntry) {
          ctx.errors.push(createError(
            declinedFactoryErrorCode(declinedEntry.code),
            loc,
            { severity: 'error', message: declinedFactoryMessage(callee, declinedEntry) }
          ))
          continue
        }

        const objectFactory = ctx.reactiveFactories.get(callee)
        if (objectFactory && objectFactory.returnKind === 'object') {
          ctx.errors.push(createError(ErrorCodes.UNRECOGNIZED_REACTIVE_FACTORY, loc, {
            severity: 'error',
            message:
              `'${callee}' is a reactive factory that returns an object — destructure ` +
              `it with a matching object pattern: const { ${objectFactory.returnTupleIdentifiers.join(', ')} } = ${callee}(...)`,
          }))
          continue
        }

        // Inlined factories were rewritten away before this analysis, so
        // anything still matching the shape is a destructure of an
        // unrecognised callee (imported helper, ad-hoc tuple fn, factory
        // with arity mismatch).
        ctx.errors.push(
          createError(
            ErrorCodes.UNRECOGNIZED_REACTIVE_FACTORY,
            loc,
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
        continue
      }

      if (ts.isObjectBindingPattern(decl.name)) {
        validateObjectFactoryDestructure(ctx, decl.name, callee, loc)
      }
    }
  }
}

/**
 * Object-destructure half of `validateReactiveFactoryCalls` (#2325). Split
 * out so the tuple path above stays a straight read of the pre-#2325 logic
 * (the tuple diagnostics are pinned by pre-existing tests) while this path
 * covers the previously-silent object-destructure failure modes: an
 * unrecognised callee, a tuple factory destructured as an object, a rename/
 * default/rest destructure of a shorthand-only factory, an unknown
 * property, a declined (BF111/BF112/BF113) factory, or an uninspectable
 * import that looks reactive-factory-shaped by name.
 */
function validateObjectFactoryDestructure(
  ctx: AnalyzerContext,
  pattern: ts.ObjectBindingPattern,
  callee: string,
  loc: SourceLocation
): void {
  const factory = ctx.reactiveFactories.get(callee)
  if (factory) {
    // Return-shape mismatch takes priority over element-form validation: a
    // tuple-return factory destructured as an object is *never* valid,
    // regardless of whether the object pattern happens to use shorthand or
    // a rename/default/rest element — always point the caller at positional
    // destructuring (BF110) instead of the shorthand-only guidance below
    // (BF111), which only makes sense for genuinely object-return factories.
    if (factory.returnKind === 'tuple') {
      ctx.errors.push(createError(ErrorCodes.UNRECOGNIZED_REACTIVE_FACTORY, loc, {
        severity: 'error',
        message:
          `'${callee}' is a reactive factory that returns a tuple — destructure ` +
          `it positionally: const [${factory.returnTupleIdentifiers.join(', ')}] = ${callee}(...)`,
      }))
      return
    }

    const hasUnsupportedElement = pattern.elements.some(
      el => !!el.propertyName || !!el.initializer || !!el.dotDotDotToken || !ts.isIdentifier(el.name)
    )
    if (hasUnsupportedElement) {
      ctx.errors.push(createError(ErrorCodes.REACTIVE_FACTORY_RENAME_UNSUPPORTED, loc, {
        severity: 'error',
        message:
          `Object destructure of reactive factory '${callee}' uses a property ` +
          `rename, default, or rest element; only shorthand destructuring of ` +
          `{ ${factory.returnTupleIdentifiers.join(', ')} } is supported.`,
      }))
      return
    }

    const unknown = pattern.elements
      .map(el => (ts.isIdentifier(el.name) ? el.name.text : ''))
      .filter(name => name && !factory.returnTupleIdentifiers.includes(name))
    if (unknown.length > 0) {
      const label = unknown.length === 1 ? 'property' : 'properties'
      ctx.errors.push(createError(ErrorCodes.UNRECOGNIZED_REACTIVE_FACTORY, loc, {
        severity: 'error',
        message:
          `Object destructure of reactive factory '${callee}' references ${label} ` +
          `'${unknown.join("', '")}' not present in its return { ${factory.returnTupleIdentifiers.join(', ')} }.`,
      }))
      return
    }

    // Shorthand object pattern that matches the factory's return shape —
    // already inlined; nothing to report.
    return
  }

  const declinedEntry = ctx.declinedReactiveFactories.get(callee)
  if (declinedEntry) {
    ctx.errors.push(createError(
      declinedFactoryErrorCode(declinedEntry.code),
      loc,
      { severity: 'error', message: declinedFactoryMessage(callee, declinedEntry) }
    ))
    return
  }

  if (ctx.reactiveShapedHelpers.has(callee)) {
    ctx.errors.push(createError(ErrorCodes.UNRECOGNIZED_REACTIVE_FACTORY, loc, {
      severity: 'error',
      message:
        `Object destructure of '${callee}(...)': this helper wraps a reactive ` +
        `primitive but does not match the inlinable factory shape (single ` +
        '`return { a, b }` of shorthand identifiers at its one exit point).',
    }))
    return
  }

  // Proven non-reactive import (helper file resolved, read, and found to
  // export nothing reactive-shaped under this name) — silent, correctly
  // (C2: an ordinary object destructure must not become a false positive).
  if (ctx.cleanFactoryImports.has(callee)) return

  // Last resort: an import the compiler cannot inspect (non-relative or
  // unresolvable path) whose name looks like a hook/factory. Name-based
  // heuristic only — false negatives here fall through to silence, which
  // matches this file's ordinary-object-destructure default (C2).
  let matchedImportSource: string | null = null
  for (const imp of ctx.imports) {
    if (imp.isTypeOnly) continue
    const spec = imp.specifiers.find(s => !s.isTypeOnly && (s.alias ?? s.name) === callee)
    if (spec) {
      matchedImportSource = imp.source
      break
    }
  }
  if (
    matchedImportSource !== null &&
    !matchedImportSource.startsWith('@barefootjs/') &&
    /^(use|create)[A-Z]/.test(callee)
  ) {
    ctx.errors.push(createError(ErrorCodes.UNRECOGNIZED_REACTIVE_FACTORY, loc, {
      severity: 'error',
      message:
        `Object destructure of imported '${callee}(...)': the compiler cannot ` +
        `inspect this import (non-relative or unresolvable path), so if it wraps ` +
        `createSignal/createMemo the destructured bindings will not be reactive. Move ` +
        `the helper to a relative-imported file or inline its body.`,
    }))
  }
  // Otherwise: ordinary object destructure of unrelated code — leave untouched (C2).
}

// =============================================================================
// Export
// =============================================================================

export { type AnalyzerContext } from './analyzer-context.ts'

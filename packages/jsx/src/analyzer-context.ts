/**
 * BarefootJS Compiler - Analyzer Context
 *
 * Context object for single-pass AST analysis.
 */

import ts from 'typescript'
import type {
  SignalInfo,
  MemoInfo,
  EffectInfo,
  OnMountInfo,
  InitStatementInfo,
  ImportInfo,
  NamedExportInfo,
  FunctionInfo,
  ConstantInfo,
  TypeDefinition,
  TypeInfo,
  CompilerError,
  SourceLocation,
  ParamInfo,
  PropertyInfo,
  ReactiveFactoryInfo,
} from './types.ts'
import { type ExcludeRange, collectAllTypeRanges, reconstructWithoutTypes } from './strip-types.ts'

/**
 * Deferred info for BF043 (props destructuring warning).
 * Recorded during extractProps(), emitted only for stateful components in validateContext().
 */
export interface PropsDestructuringInfo {
  loc: SourceLocation
  hasIgnoreDirective: boolean
}

/**
 * Pending signal tuple reference used for the "late extraction" pattern:
 *   const s = createSignal(0)
 *   const v = s[0]
 *
 * On seeing the first line we register `s` in AnalyzerContext.signalTupleRefs;
 * on seeing the second line we set `getter` (or `setter` for `[1]`). Resolved
 * entries are flushed into `signals` after visitComponentBody completes.
 */
export interface PendingSignalTuple {
  initialValue: string
  typedInitialValue?: string
  type: TypeInfo
  loc: SourceLocation
  getter: string | null
  setter: string | null
  initialFreeIdentifiers: ReadonlySet<string>
}

/**
 * One branch of a multi-return JSX helper function's if/else chain.
 * `jsxReturn` is null for guard clauses that `return null`.
 */
export interface MultiReturnJsxBranch {
  condition: ts.Expression
  jsxReturn: ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment | null
}

/**
 * Extracted control flow from a multi-return JSX helper function.
 * Represents `if (c1) return <A/>; if (c2) return <B/>; return <C/>`
 * as a chain of condition→JSX pairs plus an optional fallback.
 */
export interface MultiReturnJsxInfo {
  branches: MultiReturnJsxBranch[]
  fallback: ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment | null
  params: string[]
  /** For switch-sourced branches, the discriminant expression (e.g. `name` in `switch(name)`) */
  switchDiscriminant?: ts.Expression
}

/**
 * Represents an if statement with a JSX return in a component function.
 */
export interface ConditionalReturn {
  /** The condition expression node */
  condition: ts.Expression
  /** The JSX return statement found in the if block */
  jsxReturn: ts.JsxElement | ts.JsxFragment | ts.JsxSelfClosingElement
  /** Variables declared in the if block scope */
  scopeVariables: ts.VariableDeclaration[]
  /** The original if statement node */
  ifStatement: ts.IfStatement
}

export interface AnalyzerContext {
  sourceFile: ts.SourceFile
  filePath: string

  // Component info
  componentName: string | null
  componentNode: ts.FunctionDeclaration | ts.ArrowFunction | null
  hasDefaultExport: boolean
  /** Whether the component has an `export` keyword in the source */
  isExported: boolean

  // Collected data
  signals: SignalInfo[]
  memos: MemoInfo[]
  effects: EffectInfo[]
  onMounts: OnMountInfo[]
  /** Bare imperative statements at the top of the component body (#930). */
  initStatements: InitStatementInfo[]
  imports: ImportInfo[]
  namedExports: NamedExportInfo[]
  localFunctions: FunctionInfo[]
  localConstants: ConstantInfo[]
  /**
   * Names declared via TypeScript ambient declarations at module scope
   * (`declare var X`, `declare global { var X; let Y; const Z; function fn() }`).
   * These bindings are not emitted by the compiler — they are runtime
   * contracts the author is asserting — but they ARE in scope for BF052,
   * which would otherwise false-positive on writes / reads of ambient
   * globals.
   */
  ambientGlobals: Set<string>
  typeDefinitions: TypeDefinition[]
  /** Maps constant names to their JSX initializer AST nodes (#547) */
  jsxConstants: Map<string, ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment>
  /**
   * Maps constant names to initializer AST nodes whose shape contains
   * JSX at a non-root position — ternary with JSX on either side,
   * logical-AND / OR / nullish-coalescing with JSX on either side,
   * parenthesized wrappers around any of the above. The pure-JSX-
   * literal case (root JSX) stays in `jsxConstants` and routes through
   * the #547 `transformNode` shim; this map is consulted only after
   * that miss and routes through `transformExpressionInner` so the
   * existing JSX-expression dispatcher handles the lowering, including
   * `clientOnly` propagation. Without this, an outer-scope ternary-
   * typed JSX local referenced from a JSX expression left a bare
   * identifier in the emitted client JS at init scope and tripped a
   * runtime ReferenceError (#1409 follow-up).
   */
  inlineableJsxConsts: Map<string, ts.Expression>
  /** Maps function names to their JSX return AST and parameter names (#569) */
  jsxFunctions: Map<string, {
    jsxReturn: ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment
    params: string[]
  }>
  /** Maps multi-return JSX helper functions for conditional inlining at call sites. */
  jsxMultiReturnFunctions: Map<string, MultiReturnJsxInfo>
  /**
   * Maps function names to reactive-factory info (#931). A reactive factory
   * is a same-file helper whose body declares reactive primitives and
   * returns a tuple of identifiers, e.g.
   *   `function createCounter(initial) { const [c,s] = createSignal(initial); return [c, s] as const }`.
   * When a component destructures the result of a factory call, the factory
   * body is inlined at the call site so the compiler sees ordinary
   * `createSignal` declarations.
   */
  reactiveFactories: Map<string, ReactiveFactoryInfo>
  /**
   * Intermediate `const s = createSignal(...)` tuples awaiting `s[0]`/`s[1]`
   * extraction. Flushed into `signals` at the end of visitComponentBody.
   */
  signalTupleRefs: Map<string, PendingSignalTuple>

  // Props
  propsType: TypeInfo | null
  propsParams: ParamInfo[]
  propsObjectName: string | null
  restPropsName: string | null
  /** Keys that can be statically expanded from rest props (closed type) */
  restPropsExpandedKeys: string[]
  /** Deferred BF043 info; emitted only for stateful components in validateContext() */
  propsDestructuring: PropsDestructuringInfo | null

  // JSX return — widened to any `ts.Expression` so the Phase 1 dispatcher
  // core (`transformJsxExpression`) is the single source of truth for
  // what a component can return. Non-JSX-structural returns (plain scalar
  // values, forbidden kinds, unrecognized shapes) route through the same
  // dispatcher and produce `null`, which `jsxToIR` treats as "no IR" —
  // same as pre-refactor. The recursion-as-discriminator capture path in
  // `visitComponentBody` is gone with #971 PR 5, so this field is only
  // ever set by the explicit `return` handler or the arrow-shorthand
  // capture — no silent-drop surface.
  jsxReturn: ts.Expression | null

  // Conditional returns (if statements with JSX returns)
  conditionalReturns: ConditionalReturn[]

  // Errors
  errors: CompilerError[]

  // Directive
  hasUseClientDirective: boolean

  /**
   * Names imported from cross-file `@client` signal/memo exports.
   * Populated by `scanImportedClientSignals` after the initial AST walk.
   * Consumed by `exprReferencesModuleClientSignal` in jsx-to-ir.ts to
   * auto-promote JSX references to `clientOnly`.
   */
  importedClientSignalNames: Set<string>

  // Pre-computed type ranges for type stripping
  typeExcludeRanges: ExcludeRange[]

  /** TypeScript type checker for type-based reactivity detection (null = regex fallback) */
  checker: ts.TypeChecker | null

  /**
   * The component body Block (when the component has a block body, not an
   * expression-body arrow). Used transiently during analyzeComponentBody()
   * so visitComponentBody() can identify statements that are direct children
   * of the component body — i.e., top-level statements — and preserve the
   * unrecognized ones as init statements (#930). null outside analyze calls.
   */
  componentBodyBlock: ts.Block | null

  /** Return node text with TypeScript type syntax removed. */
  getJS(node: ts.Node): string
}

export function createAnalyzerContext(
  sourceFile: ts.SourceFile,
  filePath: string
): AnalyzerContext {
  return {
    sourceFile,
    filePath,

    componentName: null,
    componentNode: null,
    hasDefaultExport: false,
    isExported: false,

    signals: [],
    memos: [],
    effects: [],
    onMounts: [],
    initStatements: [],
    imports: [],
    namedExports: [],
    localFunctions: [],
    localConstants: [],
    ambientGlobals: new Set(),
    typeDefinitions: [],
    jsxConstants: new Map(),
    inlineableJsxConsts: new Map(),
    jsxFunctions: new Map(),
    jsxMultiReturnFunctions: new Map(),
    reactiveFactories: new Map(),
    signalTupleRefs: new Map(),

    propsType: null,
    propsParams: [],
    propsObjectName: null,
    restPropsName: null,
    restPropsExpandedKeys: [],
    propsDestructuring: null,

    jsxReturn: null,
    conditionalReturns: [],

    errors: [],

    hasUseClientDirective: false,
    importedClientSignalNames: new Set(),

    typeExcludeRanges: collectAllTypeRanges(sourceFile),
    checker: null,
    componentBodyBlock: null,
    getJS(node: ts.Node): string {
      return reconstructWithoutTypes(node, sourceFile, this.typeExcludeRanges)
    },
  }
}

// =============================================================================
// Source Location Helper
// =============================================================================

export function getSourceLocation(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  filePath: string
): SourceLocation {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart())
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd())

  return {
    file: filePath,
    start: {
      line: start.line + 1, // 1-indexed
      column: start.character,
    },
    end: {
      line: end.line + 1,
      column: end.character,
    },
  }
}

// =============================================================================
// Type Helpers
// =============================================================================

/**
 * Extract structured {@link PropertyInfo} entries from the members of an object
 * type literal or interface declaration. Shared so the type-literal branch of
 * {@link typeNodeToTypeInfo} and interface-definition collection produce
 * identical field shapes.
 */
export function membersToProperties(
  members: ts.NodeArray<ts.TypeElement>,
  sourceFile: ts.SourceFile
): PropertyInfo[] {
  return members
    .filter(ts.isPropertySignature)
    .map((member) => ({
      name: propertyNameText(member.name, sourceFile),
      type: typeNodeToTypeInfo(member.type, sourceFile) ?? {
        kind: 'unknown' as const,
        raw: 'unknown',
      },
      optional: !!member.questionToken,
      readonly: !!member.modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.ReadonlyKeyword
      ),
    }))
}

/**
 * The source-level name of an object/interface member. String- and numeric-
 * literal keys are returned unquoted (`{ "id": ... }` → `id`), so consumers see
 * the same name whether the key was written as an identifier or a string —
 * `getText()` would otherwise keep the quotes.
 */
function propertyNameText(
  name: ts.PropertyName | undefined,
  sourceFile: ts.SourceFile
): string {
  if (!name) return ''
  if (ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text
  return name.getText(sourceFile)
}

export function typeNodeToTypeInfo(
  typeNode: ts.TypeNode | undefined,
  sourceFile: ts.SourceFile,
  // When set, `raw` is derived from this extractor instead of
  // `node.getText(sourceFile)`. Synthetic nodes (from `checker.typeToTypeNode`,
  // used by `tsTypeToTypeInfo`) have no source positions, so `getText()` would
  // throw — callers pass a printer-based extractor. In that mode the
  // object-literal / function branches that need member/param source text emit
  // a `raw`-only shape (those consumers only run on real source).
  rawOf?: (node: ts.TypeNode) => string
): TypeInfo | null {
  if (!typeNode) return null

  const synthetic = rawOf !== undefined
  const raw = rawOf ? rawOf(typeNode) : typeNode.getText(sourceFile)
  const recurse = (n: ts.TypeNode): TypeInfo =>
    typeNodeToTypeInfo(n, sourceFile, rawOf) ?? { kind: 'unknown', raw: 'unknown' }

  // Primitive types (check by SyntaxKind)
  switch (typeNode.kind) {
    case ts.SyntaxKind.StringKeyword:
      return { kind: 'primitive', raw, primitive: 'string' }
    case ts.SyntaxKind.NumberKeyword:
      return { kind: 'primitive', raw, primitive: 'number' }
    case ts.SyntaxKind.BooleanKeyword:
      return { kind: 'primitive', raw, primitive: 'boolean' }
    case ts.SyntaxKind.NullKeyword:
      return { kind: 'primitive', raw, primitive: 'null' }
    case ts.SyntaxKind.UndefinedKeyword:
      return { kind: 'primitive', raw, primitive: 'undefined' }
  }

  // Array types
  if (ts.isArrayTypeNode(typeNode)) {
    return { kind: 'array', raw, elementType: recurse(typeNode.elementType) }
  }

  // Union types
  if (ts.isUnionTypeNode(typeNode)) {
    return { kind: 'union', raw, unionTypes: typeNode.types.map(recurse) }
  }

  // Type literal (object type)
  if (ts.isTypeLiteralNode(typeNode)) {
    return {
      kind: 'object',
      raw,
      // Synthetic members have no source positions for membersToProperties'
      // getText(); emit a property-less object in that mode.
      ...(synthetic ? {} : { properties: membersToProperties(typeNode.members, sourceFile) }),
    }
  }

  // Type reference (named type)
  if (ts.isTypeReferenceNode(typeNode)) {
    // Normalise the generic array forms `Array<T>` / `ReadonlyArray<T>` to the
    // same `kind: 'array'` shape as `T[]`, so every consumer sees one array
    // representation regardless of how the source spelled it.
    const refName = ts.isIdentifier(typeNode.typeName) ? typeNode.typeName.text : ''
    if (
      (refName === 'Array' || refName === 'ReadonlyArray') &&
      typeNode.typeArguments?.length === 1
    ) {
      return { kind: 'array', raw, elementType: recurse(typeNode.typeArguments[0]) }
    }
    return {
      kind: 'interface',
      raw,
    }
  }

  // Function type
  if (ts.isFunctionTypeNode(typeNode)) {
    // Param names/defaults come from getText — skip them for synthetic nodes.
    if (synthetic) return { kind: 'function', raw }
    return {
      kind: 'function',
      raw,
      params: typeNode.parameters.map((p) => ({
        name: p.name.getText(sourceFile),
        type: typeNodeToTypeInfo(p.type, sourceFile) ?? {
          kind: 'unknown',
          raw: 'unknown',
        },
        optional: !!p.questionToken,
        defaultValue: p.initializer?.getText(sourceFile),
      })),
      returnType: typeNodeToTypeInfo(typeNode.type, sourceFile) ?? undefined,
    }
  }

  return { kind: 'unknown', raw }
}

// Printer + blank source file reused across calls so checker-driven type
// conversion never allocates a fresh `ts.createSourceFile` per memo on the
// build hot path (the blank file is only printer context for synthetic
// nodes, created once at module load).
const _typePrinter = ts.createPrinter({ removeComments: true, omitTrailingSemicolon: true })
const _blankTypeSourceFile = ts.createSourceFile('__bf_types__.ts', '', ts.ScriptTarget.Latest)

/**
 * Convert a resolved `ts.Type` to `TypeInfo` via the type checker. Used to
 * sharpen `createMemo` field types the syntactic `inferTypeFromValue`
 * heuristic can't reach — e.g. `createMemo(() => generateDays())` whose body
 * is a local-function call (→ `CalendarDay[][]`) or a ternary of typed
 * arrays (→ `string[]`). Without this the Go adapter renders such memos as
 * `map[string]interface{}` / `bool` placeholders, so a typed backend can't
 * populate the SSR data (#1968). Returns `null` when the type can't be
 * lowered to a `ts.TypeNode`.
 *
 * Shares the structural lowering in `typeNodeToTypeInfo` (via the `rawOf`
 * extractor) so node→TypeInfo logic lives in one place; the synthetic nodes
 * from `typeToTypeNode` have no source text, so `raw` comes from the printer.
 */
export function tsTypeToTypeInfo(type: ts.Type, checker: ts.TypeChecker): TypeInfo | null {
  const node = checker.typeToTypeNode(type, undefined, ts.NodeBuilderFlags.NoTruncation)
  if (!node) return null
  const rawOf = (n: ts.TypeNode): string => {
    try {
      return _typePrinter.printNode(ts.EmitHint.Unspecified, n, _blankTypeSourceFile)
    } catch {
      return 'unknown'
    }
  }
  return typeNodeToTypeInfo(node, _blankTypeSourceFile, rawOf)
}

// =============================================================================
// AST Helpers
// =============================================================================

export function isPascalCase(name: string): boolean {
  return /^[A-Z][a-zA-Z0-9]*$/.test(name)
}

export function isComponentFunction(
  node: ts.Node
): node is ts.FunctionDeclaration & { name: ts.Identifier } {
  return (
    ts.isFunctionDeclaration(node) &&
    !!node.name &&
    isPascalCase(node.name.text) &&
    !!node.body
  )
}

export function isArrowComponentFunction(
  node: ts.Node
): node is ts.VariableDeclaration & {
  name: ts.Identifier
  initializer: ts.ArrowFunction
} {
  if (!ts.isVariableDeclaration(node)) return false
  if (!ts.isIdentifier(node.name)) return false
  if (!isPascalCase(node.name.text)) return false
  if (!node.initializer || !ts.isArrowFunction(node.initializer)) return false
  return true
}

/**
 * The set of reactive getter names for a component — signal accessors plus memo
 * names. Single source of truth for "what counts as a reactive getter", shared
 * by the analyzer's block-memo fold purity oracle (#2040) and `jsx-to-ir`'s
 * `getReactiveGetterNames`. A reactive read is idempotent within a render, so
 * callers treat `getter()` as pure. If a third reactive kind is added, update
 * this one function.
 */
export function collectReactiveGetterNames(
  signals: ReadonlyArray<{ getter: string }>,
  memos: ReadonlyArray<{ name: string }>,
): Set<string> {
  const names = new Set<string>()
  for (const s of signals) names.add(s.getter)
  for (const m of memos) names.add(m.name)
  return names
}

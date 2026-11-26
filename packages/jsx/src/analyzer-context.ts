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
  DeclinedReactiveFactory,
  SourceFacts,
} from './types.ts'
import { type ExcludeRange, collectAllTypeRanges, reconstructWithoutTypes } from './strip-types.ts'
import type { CallbackBodyAcceptor } from './adapters/interface.ts'
import { nodeContainsJsx } from './reactivity-checker.ts'
import { sourceFactsOf } from './source-facts.ts'

/**
 * Whether the getJS trust-boundary assertion is armed (BF_ASSERT_NO_JSX_IN_GETJS=1).
 *
 * Read through `globalThis` rather than a bare `process` identifier: the
 * compiler also runs where no Node `process` exists (the site playground
 * bundles it into a browser Worker), and a bare reference there throws
 * ReferenceError on the first getJS call. Evaluated per call, not at module
 * load, because the test harnesses that arm it set the env var in `beforeAll`.
 */
function isGetJsAssertionArmed(): boolean {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
  return env?.BF_ASSERT_NO_JSX_IN_GETJS === '1'
}

/**
 * The props destructuring pattern's own source location. Carries no
 * diagnostic of its own — it is the more precise location other
 * props-parameter diagnostics point at instead of the component root (see
 * `compiler.ts`'s `checkRichTypePropSerialization`).
 */
export interface PropsDestructuringInfo {
  loc: SourceLocation
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
   * Maps factory-call-site-local names to reactive-factory info (#931,
   * #2325). A reactive factory is a helper whose body declares reactive
   * primitives and returns a tuple or shorthand-object of identifiers, e.g.
   *   `function createCounter(initial) { const [c,s] = createSignal(initial); return [c, s] as const }`.
   * When a component destructures the result of a factory call, the factory
   * body is inlined at the call site so the compiler sees ordinary
   * `createSignal` declarations. Populated by `analyzeComponent` from the
   * factory prescan (same-file declarations plus relative-imported
   * factories resolved by `prescanImportedReactiveFactories`); consumed by
   * `validateReactiveFactoryCalls`.
   */
  reactiveFactories: Map<string, ReactiveFactoryInfo>
  /** Factories recognized but declined for inlining, keyed by call-site-local name (#2325). */
  declinedReactiveFactories: Map<string, DeclinedReactiveFactory>
  /** Module-scope helpers (same-file or resolved import) whose body contains a
   *  reactive primitive call but whose shape is not an inlinable factory. */
  reactiveShapedHelpers: Set<string>
  /** Imported destructured-callee names whose helper file was resolved, read,
   *  and found reactive-free / factory-free — proven safe to leave alone. */
  cleanFactoryImports: Set<string>
  /**
   * Intermediate `const s = createSignal(...)` tuples awaiting `s[0]`/`s[1]`
   * extraction. Flushed into `signals` at the end of visitComponentBody.
   */
  signalTupleRefs: Map<string, PendingSignalTuple>
  /**
   * Writers of a signal seed's / memo body's client template text
   * (`SignalInfo.templateInitialValue`, `MemoInfo.templateBodyExpr`), run
   * once the whole component body is walked so the props bindings they read
   * live are decided against every body binding (`templatePropReadParams`).
   */
  templatePropReadWriters: Array<() => void>

  // Props
  propsType: TypeInfo | null
  propsParams: ParamInfo[]
  propsObjectName: string | null
  /** Whether the component reads its props object as a whole (`observesWholePropsObject`). */
  propsObjectObservedWhole: boolean
  restPropsName: string | null
  /** Keys that can be statically expanded from rest props (closed type) */
  restPropsExpandedKeys: string[]
  /** See `IRMetadata.restPropsOmittedKeys`. */
  restPropsOmittedKeys: string[] | null
  /** Set when the props parameter is a destructuring pattern — see `PropsDestructuringInfo`. */
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
  /**
   * Capability of the adapter this component is being compiled for: can its
   * runtime render an off-subset callback body (`filter`/`sort`/… predicate)
   * verbatim? Set from `TemplateAdapter.acceptsCallbackBody`; undefined for
   * direct analyzer callers (no adapter) and DSL adapters. Consulted at the
   * Phase-1 callback-lowering sites so a JS-runtime target isn't rejected for
   * a body it could run. See `spec/callback-fidelity.md`.
   */
  acceptsCallbackBody?: CallbackBodyAcceptor
  /**
   * The spread bag keys the target adapter's spread helper renames as the
   * reference does (`TemplateAdapter.spreadKeyRenames`); undefined for the
   * default set. Set by the compiler before Phase 1 builds the IR.
   */
  spreadKeyRenames?: ReadonlySet<string>
  /**
   * Whether the target adapter's spread helper writes a bag key outside its
   * renames with the bag's spelling, as the reference does
   * (`TemplateAdapter.spreadKeysVerbatim`). Set by the compiler before Phase 1
   * builds the IR.
   */
  spreadKeysVerbatim?: boolean

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

  /** What each printed text reads, keyed by the text (`IRMetadata.sourceFacts`). */
  sourceFacts: Record<string, SourceFacts>

  /** Return node text with TypeScript type syntax removed. */
  getJS(node: ts.Node): string
}

export function createAnalyzerContext(
  sourceFile: ts.SourceFile,
  filePath: string,
  acceptsCallbackBody?: CallbackBodyAcceptor
): AnalyzerContext {
  return {
    sourceFile,
    filePath,
    acceptsCallbackBody,

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
    declinedReactiveFactories: new Map(),
    reactiveShapedHelpers: new Set(),
    cleanFactoryImports: new Set(),
    signalTupleRefs: new Map(),
    templatePropReadWriters: [],

    propsType: null,
    propsParams: [],
    propsObjectName: null,
    propsObjectObservedWhole: false,
    restPropsName: null,
    restPropsExpandedKeys: [],
    restPropsOmittedKeys: null,
    propsDestructuring: null,

    jsxReturn: null,
    conditionalReturns: [],

    errors: [],

    hasUseClientDirective: false,
    importedClientSignalNames: new Set(),

    typeExcludeRanges: collectAllTypeRanges(sourceFile),
    checker: null,
    componentBodyBlock: null,
    sourceFacts: Object.create(null) as Record<string, SourceFacts>,
    getJS(node: ts.Node): string {
      // A node whose owning source file differs from this component's
      // `sourceFile` comes from a synthetic re-parse — e.g. #2090's
      // resolved sort-comparator functions, or #2092's desugared
      // tagged-template-literal callee — rather than a live position in
      // this file. `reconstructWithoutTypes` slices `sourceFile.text` by
      // the node's start/end, so feeding it a foreign node's positions
      // would silently slice the WRONG bytes (not throw). These synthetic
      // subtrees are already built from plain re-parsed source text with
      // no straggling TS type syntax to strip, so the node's own text is
      // correct as-is — mirrors the `astText()` workaround already used
      // for synthetic const/function re-parses elsewhere in the compiler.
      let ownSourceFile: ts.SourceFile | undefined
      try {
        ownSourceFile = node.getSourceFile()
      } catch {
        ownSourceFile = undefined
      }
      // Test-gated trust-boundary assertion (write-side string rule,
      // CLAUDE.md): getJS output is spliced into emitted artifacts, so a
      // JSX-bearing node here is a leak by construction — mixed content must
      // travel as structured segments, never as raw text. Every getJS call
      // site shares this contract; the env gate keeps the subtree walk off
      // the production hot path (the trichotomy harness enables it). Scoped
      // to compiles with no `error`-severity diagnostic: a compile that
      // already refused loudly may take degraded fallback paths whose
      // artifacts are gated by the error — the invariant this trips on is
      // the SILENT leak. A `warning`-severity diagnostic does not gate
      // anything, so it must not silently disarm this assertion too (#2867)
      // — only `error` severity does.
      if (
        isGetJsAssertionArmed() &&
        !this.errors.some((e) => e.severity === 'error') &&
        nodeContainsJsx(node)
      ) {
        throw new Error(
          'getJS() called on a JSX-bearing node — raw JSX must never be spliced ' +
          'into emitted output. Carry mixed content as structured segments ' +
          '(MapCallbackPreamble / FlatMapCallback) instead.'
        )
      }
      const text = ownSourceFile && ownSourceFile !== sourceFile
        ? node.getText(ownSourceFile)
        : reconstructWithoutTypes(node, sourceFile, this.typeExcludeRanges)
      if (!Object.hasOwn(this.sourceFacts, text)) this.sourceFacts[text] = sourceFactsOf(node)
      return text
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
 * `{ openMembers: true }` when `members` include anything but a plain property
 * signature (an index signature, a method, a call or construct signature),
 * so the properties `membersToProperties` keeps are not the type's whole key
 * set (`TypeInfo.openMembers` / `TypeDefinition.openMembers`).
 */
export function openMembersField(members: ts.NodeArray<ts.TypeElement>): { openMembers?: true } {
  return members.every(ts.isPropertySignature) ? {} : { openMembers: true }
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
  // `(T)` is `T`: the parentheses only group, so lower the inner node,
  // `raw` included. Every position reaches this one door — a member type,
  // an array element (`(A | B)[]`), a union arm, a generic argument
  // (`Array<(T)>`) — so no consumer has to know parentheses exist (#3973).
  if (ts.isParenthesizedTypeNode(typeNode)) return typeNodeToTypeInfo(typeNode.type, sourceFile, rawOf)

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

  // Literal types (`'a'`, `42`, `-1`, `true`, `null`) — including as union
  // members, which is where the absence of this arm hurt: `'a' | 'b'`
  // members fell to `{kind:'unknown', raw:"'a'"}`, forcing every consumer
  // that needed the member's family or value to re-parse `raw` with a
  // regex (the Go adapter's literal-union collapse, #2324's
  // `unionMemberLiteral`, `rich-type-evidence`'s nullish-arm match — all
  // three carried one). A literal is structurally a primitive of its
  // family carrying its value; consumers that only care about the family
  // see a plain primitive, and the value rides along in `literalValue`
  // for the ones that need it. `null` inside a union arrives as
  // `LiteralTypeNode(NullKeyword)` — NOT the bare `NullKeyword` the
  // switch above catches — which is exactly why nullish union arms were
  // invisible before.
  if (ts.isLiteralTypeNode(typeNode)) return literalTypeInfo(typeNode.literal, raw)

  // Union types
  if (ts.isUnionTypeNode(typeNode)) {
    return { kind: 'union', raw, unionTypes: typeNode.types.flatMap((arm) => unionArms(recurse(arm))) }
  }

  // Type literal (object type)
  if (ts.isTypeLiteralNode(typeNode)) {
    return {
      kind: 'object',
      raw,
      // Synthetic members have no source positions for membersToProperties'
      // getText(); emit a property-less object in that mode.
      ...(synthetic ? {} : { properties: membersToProperties(typeNode.members, sourceFile), ...openMembersField(typeNode.members) }),
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

  return opaqueTypeInfo(typeNode, raw, sourceFile, synthetic)
}

/**
 * The arms one lowered union member contributes to the enclosing union: a
 * grouped union (`('a' | 'b') | 'c'`, the only way the parser nests one)
 * spreads into its arms, so it lowers exactly like the flat `'a' | 'b' | 'c'`
 * while the enclosing node keeps its own `raw` spelling (#3973).
 */
function unionArms(info: TypeInfo): TypeInfo[] {
  return info.kind === 'union' && info.unionTypes ? info.unionTypes : [info]
}

/** `typeNodeToTypeInfo` for a literal type node: a primitive of the literal's family carrying its value. */
function literalTypeInfo(lit: ts.LiteralTypeNode['literal'], raw: string): TypeInfo {
  if (ts.isStringLiteral(lit) || ts.isNoSubstitutionTemplateLiteral(lit)) {
    return { kind: 'primitive', raw, primitive: 'string', literalValue: lit.text }
  }
  if (ts.isNumericLiteral(lit)) {
    return { kind: 'primitive', raw, primitive: 'number', literalValue: lit.text }
  }
  if (
    ts.isPrefixUnaryExpression(lit) &&
    lit.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(lit.operand)
  ) {
    return { kind: 'primitive', raw, primitive: 'number', literalValue: `-${lit.operand.text}` }
  }
  if (lit.kind === ts.SyntaxKind.TrueKeyword || lit.kind === ts.SyntaxKind.FalseKeyword) {
    return {
      kind: 'primitive',
      raw,
      primitive: 'boolean',
      literalValue: lit.kind === ts.SyntaxKind.TrueKeyword ? 'true' : 'false',
    }
  }
  if (lit.kind === ts.SyntaxKind.NullKeyword) {
    return { kind: 'primitive', raw, primitive: 'null' }
  }
  // BigInt and anything newer: opaque, as before.
  return { kind: 'unknown', raw }
}

/**
 * `typeNodeToTypeInfo`'s fallback: `unknown`. An intersection (`A & B`, also
 * parenthesized) stays `unknown` to every consumer that switches on `kind`,
 * but its constituents ride along in `inherits` so type-evidence lookups
 * resolve its members like an intersection alias's (#3949). Synthetic nodes
 * have no source text for the arms, so they stay bare.
 */
function opaqueTypeInfo(typeNode: ts.TypeNode, raw: string, sourceFile: ts.SourceFile, synthetic: boolean): TypeInfo {
  const inherits = synthetic ? [] : intersectionConstituents(typeNode, sourceFile)
  return inherits.length > 0 ? { kind: 'unknown', raw, inherits, inheritance: 'intersection' } : { kind: 'unknown', raw }
}

/** Strip any number of enclosing parentheses: `((Base))` -> `Base`. */
export function unwrapParenthesizedType(type: ts.TypeNode): ts.TypeNode {
  return ts.isParenthesizedTypeNode(type) ? unwrapParenthesizedType(type.type) : type
}

/**
 * The members of `type` when it is an object type literal, through any
 * enclosing parentheses (`type Props = ({ a: string })`), else null. The one
 * answer every "is this annotation / alias body an object literal" site
 * reads, so a parenthesized body declares the same members as a bare one
 * (#3973).
 */
export function typeLiteralMembers(type: ts.TypeNode): ts.NodeArray<ts.TypeElement> | null {
  const inner = unwrapParenthesizedType(type)
  return ts.isTypeLiteralNode(inner) ? inner.members : null
}

/** The leaf arms of an intersection, parentheses and nested intersections flattened. */
function intersectionArms(type: ts.TypeNode): ts.TypeNode[] {
  const inner = unwrapParenthesizedType(type)
  return ts.isIntersectionTypeNode(inner) ? inner.types.flatMap(intersectionArms) : [inner]
}

/**
 * The lowered constituents of `type` when it is an intersection (parentheses
 * and nested intersections flattened), else empty. An arm that is neither a
 * named reference nor an object literal (a union, a mapped type, ...) is kept
 * as `unknown` so consumers know the member set is incomplete rather than
 * silently missing it. Shared by `typeNodeToTypeInfo` and the analyzer's
 * intersection-alias collection, so both record the same constituents.
 */
export function intersectionConstituents(type: ts.TypeNode, sourceFile: ts.SourceFile): TypeInfo[] {
  if (!ts.isIntersectionTypeNode(unwrapParenthesizedType(type))) return []
  return intersectionArms(type).map((arm) => constituentTypeInfo(arm, sourceFile))
}

/** One intersection/alias constituent: a named reference or object literal, else opaque `unknown`. */
export function constituentTypeInfo(arm: ts.TypeNode, sourceFile: ts.SourceFile): TypeInfo {
  const info = typeNodeToTypeInfo(arm, sourceFile)
  return info && (info.kind === 'interface' || info.kind === 'object') ? info : { kind: 'unknown', raw: arm.getText(sourceFile) }
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

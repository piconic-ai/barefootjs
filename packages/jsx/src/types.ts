/**
 * BarefootJS Compiler - Pure IR Types
 *
 * JSX-independent intermediate representation for multi-backend support.
 */

import type { ParsedExpr, ParsedStatement } from './expression-parser'

// =============================================================================
// Source Location (for Error Reporting)
// =============================================================================

export interface Position {
  line: number // 1-indexed
  column: number // 0-indexed
}

export interface SourceLocation {
  file: string
  start: Position
  end: Position
}

// =============================================================================
// Type Information
// =============================================================================

export type TypeKind =
  | 'primitive'
  | 'object'
  | 'array'
  | 'union'
  | 'function'
  | 'interface'
  | 'unknown'

export interface TypeInfo {
  kind: TypeKind
  raw: string // Original TypeScript type string

  // For primitives
  primitive?: 'string' | 'number' | 'boolean' | 'null' | 'undefined'

  // For objects/interfaces
  properties?: PropertyInfo[]

  // For arrays
  elementType?: TypeInfo

  // For unions
  unionTypes?: TypeInfo[]

  // For functions
  params?: ParamInfo[]
  returnType?: TypeInfo
}

export interface PropertyInfo {
  name: string
  type: TypeInfo
  optional: boolean
  readonly: boolean
}

export interface ParamInfo {
  name: string
  type: TypeInfo
  optional: boolean
  defaultValue?: string
  /** When true, the default value contains an arrow function or function expression (computed from AST). */
  defaultContainsArrow?: boolean
}

// =============================================================================
// IR Node Types
// =============================================================================

export type IRNode =
  | IRElement
  | IRText
  | IRExpression
  | IRConditional
  | IRLoop
  | IRComponent
  | IRSlot
  | IRFragment
  | IRIfStatement
  | IRProvider
  | IRAsync

export interface IRElement {
  type: 'element'
  tag: string
  attrs: IRAttribute[]
  events: IREvent[]
  ref: string | null
  children: IRNode[]
  slotId: string | null
  needsScope: boolean
  loc: SourceLocation
}

export interface IRText {
  type: 'text'
  value: string
  loc: SourceLocation
}

export interface IRExpression {
  type: 'expression'
  expr: string
  /** Pre-transformed expr with destructured prop refs rewritten to _p.xxx (for client JS templates). */
  templateExpr?: string
  typeInfo: TypeInfo | null
  reactive: boolean
  slotId: string | null
  loc: SourceLocation
  /** When true, expression should be evaluated on client side only */
  clientOnly?: boolean
  /** When true, expression calls signal getters or memos (has reactive `foo()` pattern). */
  callsReactiveGetters?: boolean
  /** When true, expression contains function call(s) — any `identifier()` pattern (computed from AST). */
  hasFunctionCalls?: boolean
}

export interface IRConditional {
  type: 'conditional'
  condition: string
  /** Pre-transformed condition with destructured prop refs rewritten to _p.xxx. */
  templateCondition?: string
  conditionType: TypeInfo | null
  reactive: boolean
  whenTrue: IRNode
  whenFalse: IRNode
  slotId: string | null
  loc: SourceLocation
  /** When true, condition should be evaluated on client side only */
  clientOnly?: boolean
  /** When true, condition calls signal getters or memos (has reactive `foo()` pattern). */
  callsReactiveGetters?: boolean
  /** When true, condition contains function call(s) — any `identifier()` pattern (computed from AST). */
  hasFunctionCalls?: boolean
}

/**
 * Child component info for loop rendering with createComponent()
 */
export interface IRLoopChildComponent {
  name: string
  slotId: string | null // Slot ID for querySelector targeting
  props: Array<{
    name: string
    value: string // Expression (can use loop variables)
    dynamic: boolean
    isLiteral: boolean // true if value came from a string literal attribute
    isEventHandler: boolean
  }>
  children: IRNode[] // Child nodes for nested component rendering
  loopDepth?: number // 0 = direct child of outer loop, 1+ = inside nested inner loops
  innerLoopArray?: string // Array expression of the innermost enclosing loop (for disambiguation)
}

export interface IRLoop {
  type: 'loop'
  array: string
  /** Pre-transformed array expr with destructured prop refs rewritten to _p.xxx. */
  templateArray?: string
  arrayType: TypeInfo | null
  itemType: TypeInfo | null
  param: string
  index: string | null
  key: string | null
  children: IRNode[]
  slotId: string | null
  loc: SourceLocation

  /**
   * True if the array is a static prop (not a signal).
   * Static arrays don't need reconcileList - SSR elements are hydrated directly.
   * Dynamic signal arrays need reconcileList to update DOM when signal changes.
   */
  isStaticArray: boolean

  /**
   * When the loop body is a single component, store its info here
   * for createComponent-based rendering instead of template strings.
   * This enables proper parent-to-child prop passing (including event handlers).
   */
  childComponent?: IRLoopChildComponent

  /**
   * When the loop body contains nested components (wrapped in elements),
   * store their info here for static array hydration.
   * This enables initializing components that are not direct children of the loop.
   */
  nestedComponents?: IRLoopChildComponent[]

  /**
   * Filter predicate for filter().map() pattern.
   * When present, the loop renders with an if-condition wrapping each iteration.
   * Example: todos.filter(t => !t.done).map(...) stores { param: 't', predicate: ParsedExpr, raw: '!t.done' }
   *
   * For block-body filters like:
   *   filter(t => { const f = filter(); if (f === 'active') return !t.done; return true })
   * The blockBody field contains the parsed statements.
   */
  filterPredicate?: {
    param: string
    predicate?: ParsedExpr        // Expression body
    blockBody?: ParsedStatement[] // Block body (mutually exclusive with predicate)
    raw: string  // Original string for error messages
  }

  /**
   * Sort comparator for sort().map() / toSorted().map() pattern.
   * When present, the loop array is sorted before iteration.
   * Example: todos.sort((a, b) => a.priority - b.priority).map(...)
   */
  sortComparator?: {
    paramA: string          // e.g., 'a'
    paramB: string          // e.g., 'b'
    field: string           // e.g., 'priority'
    direction: 'asc' | 'desc'
    raw: string             // Full comparator body for client JS
    method: 'sort' | 'toSorted'
  }

  /**
   * When both filter and sort are chained, indicates the order of operations.
   * 'filter-sort': filter first, then sort (e.g., filter().sort().map())
   * 'sort-filter': sort first, then filter (e.g., sort().filter().map())
   */
  chainOrder?: 'filter-sort' | 'sort-filter'

  /**
   * When true, loop should be evaluated on client side only.
   * SSR adapters should skip rendering and output placeholder markers.
   */
  clientOnly?: boolean

  /**
   * Raw JS of pre-return statements in block body .map() callback.
   * Example: `items.map(item => { const label = item.name.toUpperCase(); return <li>{label}</li> })`
   * stores "const label = item.name.toUpperCase();" as mapPreamble.
   */
  mapPreamble?: string
  /** Pre-transformed mapPreamble with destructured prop refs rewritten to _p.xxx. */
  templateMapPreamble?: string

  /** Type annotation for loop param (e.g., 'Desk'), preserved for .tsx output */
  paramType?: string
  /** Type annotation for loop index param (e.g., 'number'), preserved for .tsx output */
  indexType?: string
  /** mapPreamble with TypeScript type annotations preserved, for .tsx output */
  typedMapPreamble?: string
}

export interface IRComponent {
  type: 'component'
  name: string
  props: IRProp[]
  propsType: TypeInfo | null
  children: IRNode[]
  template: string // Reference to partial
  slotId: string | null // For components with event handlers
  loc: SourceLocation
}

export interface IRSlot {
  type: 'slot'
  name: string
  loc: SourceLocation
}

export interface IRFragment {
  type: 'fragment'
  children: IRNode[]
  /** When true, this fragment just passes through children (Context Provider pattern) */
  transparent?: boolean
  /** When true, emit a comment-based scope marker instead of bf-s attributes on children */
  needsScopeComment?: boolean
  loc: SourceLocation
}

export interface IRProvider {
  type: 'provider'
  contextName: string   // "MenuContext" (extracted from X.Provider)
  valueProp: IRProp     // The 'value' prop expression
  children: IRNode[]
  loc: SourceLocation
}

/**
 * Async streaming boundary node for out-of-order SSR.
 *
 * Maps to `<Async fallback={...}>children</Async>` in JSX.
 * Adapters translate this to their native streaming mechanism:
 *   - Hono: `<Suspense fallback={...}>` (native streaming)
 *   - Go: `bfAsyncBoundary()` + OOS resolve chunks
 */
export interface IRAsync {
  type: 'async'
  /** Unique boundary ID (e.g., "a0", "a1") — assigned by the compiler */
  id: string
  /** Fallback content shown while loading (e.g., skeleton UI) */
  fallback: IRNode
  /** Resolved content rendered after data loads */
  children: IRNode[]
  loc: SourceLocation
}

/**
 * If statement node for component-level conditional returns.
 * Preserves if-else structure from source code (early returns).
 */
export interface IRIfStatement {
  type: 'if-statement'
  /** The condition expression (e.g., "name === 'github'") */
  condition: string
  /** Pre-transformed condition with destructured prop refs rewritten to _p.xxx. */
  templateCondition?: string
  /** The JSX return in the then branch */
  consequent: IRNode
  /** The else branch: either another IRIfStatement (else if) or IRNode (final else) */
  alternate: IRNode | null
  /** Variables declared in the if block scope */
  scopeVariables: Array<{ name: string; initializer: string; templateInitializer?: string }>
  loc: SourceLocation
}

// =============================================================================
// IR Attributes & Events
// =============================================================================

/**
 * Template literal with ternary expressions for structured conditional rendering.
 * Used when attribute values contain template literals with ternaries like:
 * style={`background: ${on() ? '#4caf50' : '#ccc'}`}
 */
export interface IRTemplateLiteral {
  type: 'template-literal'
  parts: IRTemplatePart[]
}

export type IRTemplatePart =
  | { type: 'string'; value: string; templateValue?: string }
  | { type: 'ternary'; condition: string; templateCondition?: string; whenTrue: string; whenFalse: string }

/**
 * Attribute metadata shared across all attribute-like interfaces.
 * Adding a field here automatically propagates it through the entire pipeline
 * (IRAttribute → ReactiveAttribute / ReactiveChildProp / LoopChildReactiveAttr → emit).
 */
export interface AttrMeta {
  presenceOrUndefined?: boolean // true when `expr || undefined` pattern is detected
}

/**
 * Copy all AttrMeta fields from a source object.
 * Use this at every propagation point so new fields are automatically included.
 */
export function pickAttrMeta(src: AttrMeta): AttrMeta {
  return {
    ...(src.presenceOrUndefined !== undefined && { presenceOrUndefined: src.presenceOrUndefined }),
  }
}

export interface IRAttribute extends AttrMeta {
  name: string
  value: string | IRTemplateLiteral | null // null for boolean attrs like 'disabled'
  /** Pre-transformed value string with destructured prop refs rewritten to _p.xxx. */
  templateValue?: string
  dynamic: boolean
  isLiteral: boolean // true if value came from a string literal attribute
  loc: SourceLocation
}

export interface IREvent {
  name: string // 'click', 'input', 'keydown'
  originalAttr?: string // Original JSX attribute name: 'onClick', 'onKeyDown'
  handler: string // JS expression: '() => setCount(n => n + 1)'
  loc: SourceLocation
}

export interface IRProp extends AttrMeta {
  name: string
  value: string
  /** Pre-transformed value with destructured prop refs rewritten to _p.xxx. */
  templateValue?: string
  dynamic: boolean
  isLiteral: boolean // true if value came from a string literal attribute (e.g., value="account")
  loc: SourceLocation
  /** When the prop value is a JSX element/fragment, store the transformed IR nodes here */
  jsxChildren?: IRNode[]
}

// =============================================================================
// Metadata
// =============================================================================

export interface SignalInfo {
  getter: string
  setter: string | null
  initialValue: string
  /** Initial value with TypeScript type annotations preserved, for .tsx output */
  typedInitialValue?: string
  type: TypeInfo
  loc: SourceLocation
}

export interface MemoInfo {
  name: string
  computation: string
  /** Computation with TypeScript type annotations preserved, for .tsx output */
  typedComputation?: string
  type: TypeInfo
  deps: string[]
  loc: SourceLocation
}

export interface EffectInfo {
  body: string
  deps: string[]
  loc: SourceLocation
}

export interface OnMountInfo {
  body: string
  loc: SourceLocation
}

/**
 * A bare imperative statement at the top level of a component body that is
 * not otherwise captured (i.e., not a signal/memo/constant declaration,
 * effect/onMount call, JSX return, or conditional return).
 *
 * Emitted verbatim inside the component's init function in source order,
 * after signal/memo/constant declarations so they can legally reference
 * component-scope names. Typical examples: a `typeof window !== 'undefined'`
 * guard that attaches a window event listener, a `console.log`, or a
 * `try/catch` around `localStorage.getItem`.
 */
export interface InitStatementInfo {
  /** Raw JS source of the statement (TypeScript types already stripped). */
  body: string
  loc: SourceLocation
  /**
   * Free identifier references used by this statement. Used by the emitter
   * to decide which module-level declarations must be preserved (#933) and
   * to flag writes to undeclared globals.
   */
  freeIdentifiers?: Set<string>
  /**
   * Identifiers this statement assigns to (LHS of `=`, compound assignments,
   * `++`, `--`). A subset of `freeIdentifiers` that must resolve to an
   * actual declaration, otherwise ESM strict mode throws a ReferenceError
   * at runtime.
   */
  assignedIdentifiers?: Set<string>
}

export interface ImportInfo {
  source: string
  specifiers: ImportSpecifier[]
  isTypeOnly: boolean
  loc: SourceLocation
}

/**
 * Reactive factory helper metadata (#931). Collected when a same-file
 * function matches the factory shape: exactly one top-level `return` whose
 * argument is an array literal of identifiers, and at least one reactive
 * primitive call (`createSignal`, `createMemo`, `createEffect`, etc.) in
 * the body.
 *
 * When a component calls the factory in a tuple-destructure context, the
 * body is inlined at the call site so downstream signal/memo collection
 * sees an ordinary `createSignal(...)` declaration.
 */
export interface ReactiveFactoryInfo {
  /** Parameter names, in declaration order. */
  params: string[]
  /**
   * Raw JS source of the factory body block *without braces* and with the
   * return tuple removed. Identifiers are renamed at the call site.
   */
  bodySource: string
  /** Identifier names inside the returned array literal, in order. */
  returnTupleIdentifiers: string[]
  /**
   * Names declared anywhere in the factory body (local bindings). Used by
   * the call-site inliner to apply unique-suffix renaming and keep
   * identifiers hygienic across repeat calls of the same factory.
   */
  localBindings: string[]
  loc: SourceLocation
}

export interface ImportSpecifier {
  name: string
  alias: string | null
  isDefault: boolean
  isNamespace: boolean
}

export interface FunctionInfo {
  name: string
  params: ParamInfo[]
  body: string
  /** Body with TypeScript type annotations preserved, for .tsx output */
  typedBody?: string
  returnType: TypeInfo | null
  containsJsx: boolean
  isExported?: boolean
  /** When true, declared at module level (outside the component function). */
  isModule?: boolean
  /** When true, this function returns JSX and is inlined at call sites (#569). */
  isJsxFunction?: boolean
  /**
   * When true, this is a module-level multi-return JSX helper reclassified
   * from the component path (#932). The body is preserved verbatim for the
   * SSR marked template but MUST be skipped from client-JS emission — the
   * body contains actual JSX syntax, not just JSX-like string literals.
   */
  isMultiReturnJsxHelper?: boolean
  loc: SourceLocation
}

export interface ConstantInfo {
  name: string
  value?: string
  /** Value with TypeScript type annotations preserved, for .tsx output */
  typedValue?: string
  valueBranches?: string[]
  declarationKind: 'const' | 'let'
  isExported?: boolean
  /** When true, declared at module level (outside the component function). */
  isModule?: boolean
  type: TypeInfo | null
  loc: SourceLocation
  /** Pre-computed free identifier references in the value expression (computed at analysis time). */
  freeIdentifiers?: Set<string>
  /** When true, the initializer is JSX that is inlined into the IR tree at usage sites (#547). */
  isJsx?: boolean
  /** When true, the initializer is a JSX-returning function inlined at call sites (#569). */
  isJsxFunction?: boolean
  /** When true, the initializer contains an arrow function or function expression (computed from AST). */
  containsArrow?: boolean
  /** The kind of system construct, if the initializer is createContext() or new WeakMap(). */
  systemConstructKind?: 'createContext' | 'weakMap'
  /** Value with destructured prop refs rewritten to _p.propName, for template inlining. */
  templateValue?: string
}

export interface TypeDefinition {
  kind: 'interface' | 'type'
  name: string
  definition: string // Original TypeScript definition
  loc: SourceLocation
}

export interface IRMetadata {
  componentName: string
  hasDefaultExport: boolean
  /** Whether this component has an `export` keyword in the source */
  isExported: boolean
  /** Whether this component is from a "use client" file */
  isClientComponent: boolean
  typeDefinitions: TypeDefinition[]
  propsType: TypeInfo | null
  propsParams: ParamInfo[]
  /** Name of the props object parameter (e.g., 'props' in `function Component(props: Props)`) */
  propsObjectName: string | null
  restPropsName: string | null
  /** Keys statically expanded from rest props via type analysis (closed type only) */
  restPropsExpandedKeys: string[]
  signals: SignalInfo[]
  memos: MemoInfo[]
  effects: EffectInfo[]
  onMounts: OnMountInfo[]
  /**
   * Bare imperative statements at the top of the component body that are
   * not one of the recognized reactive primitives or a JSX return.
   * Emitted verbatim inside init() after signal/memo declarations (#930).
   */
  initStatements: InitStatementInfo[]
  imports: ImportInfo[]
  /** Imports filtered for template use (client-side packages stripped).
   *  Computed by the compiler — adapters should use this instead of `imports`. */
  templateImports: ImportInfo[]
  localFunctions: FunctionInfo[]
  localConstants: ConstantInfo[]
  /** Pre-computed client JS analysis for adapter use */
  clientAnalysis?: {
    needsInit: boolean
    usedProps: string[]
  }
}

// =============================================================================
// Component IR (Complete Output)
// =============================================================================

export interface ComponentIR {
  version: '0.1'
  metadata: IRMetadata
  root: IRNode
  errors: CompilerError[]
}

// =============================================================================
// Error Types
// =============================================================================

export type ErrorSeverity = 'error' | 'warning' | 'info'

export interface CompilerError {
  code: string // 'BF001', 'BF002', etc.
  severity: ErrorSeverity
  message: string
  loc: SourceLocation
  suggestion?: ErrorSuggestion
}

export interface ErrorSuggestion {
  message: string
  replacement?: string
}

// =============================================================================
// Compile Options & Results
// =============================================================================

export interface CompileOptions {
  outputIR?: boolean // Output *.ir.json
  sourceMaps?: boolean
  /** CSS layer prefix for component classes.
   * When set, static class strings and class-related constants
   * are prefixed with `layer-{value}:` for CSS cascade priority.
   * Example: 'components' → classes prefixed with 'layer-components:'
   */
  cssLayerPrefix?: string
  /** Pre-built TypeScript program for type-based reactivity detection */
  program?: import('typescript').Program
  /** Import prefixes resolved at build time, not in browser (e.g., ['@/', '@ui/']) */
  localImportPrefixes?: string[]
}

export interface FileOutput {
  path: string
  content: string
  type: 'markedTemplate' | 'clientJs' | 'ir' | 'sourceMap' | 'types'
}

export interface CompileResult {
  files: FileOutput[]
  errors: CompilerError[]
}

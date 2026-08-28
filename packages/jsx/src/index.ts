/**
 * BarefootJS JSX Compiler
 *
 * Multi-backend JSX compiler that generates Marked Templates and Client JS.
 */

// Main compiler API
export { compileJSX, buildMetadata } from './compiler.ts'
export type { CompileResult, CompileOptions, CompileOptionsWithAdapter, FileOutput } from './compiler.ts'

// SSR template-variable defaults (manifest seeds for stash-based adapters)
export { extractSsrDefaults, deriveStashFromDefaults } from './ssr-defaults.ts'

// Shared props-destructure binding + alias-map helpers (#2524)
export { propsDestructureBinding, buildPropAliasMap, isIdentifierName } from './props-binding.ts'
export type { SsrDefault } from './ssr-defaults.ts'

// Backend-neutral SSR seed plan (in-template derived signal/memo seeding)
export { computeSsrSeedPlan } from './ssr-seed-plan.ts'
export type { SsrSeedPlan, SsrSeedStep } from './ssr-seed-plan.ts'

// Pure IR types
export type {
  ComponentIR,
  IRNode,
  IRElement,
  IRText,
  IRExpression,
  IRConditional,
  IRLoop,
  IRLoopChildComponent,
  LoopParamBinding,
  LoopBindingPathSegment,
  RestExcludeKey,
  IRComponent,
  IRFragment,
  IRSlot,
  IRIfStatement,
  IRProvider,
  IRAsync,
  IRMetadata,
  AttrValue,
  LiteralAttr,
  ExpressionAttr,
  BooleanAttr,
  BooleanShorthandAttr,
  TemplateAttr,
  SpreadAttr,
  JsxChildrenAttr,
  IRTemplatePart,
  IRProp,
  ParamInfo,
  PropertyInfo,
  MemoInfo,
  ConstantInfo,
  TypeInfo,
  TypeDefinition,
  SourceLocation,
  CompilerError,
  ErrorSuggestion,
  EscapeKind,
  EscapeSsrCost,
  ConformancePin,
  ConformancePins,
  RenderDivergences,
} from './types.ts'

// Analyzer
export { analyzeComponent, listComponentFunctions, listComponentFunctions as listExportedComponents, createProgramForFile, needsTypeBasedDetection, REACTIVE_PRIMITIVES, BROWSER_ONLY_CLIENT_APIS, type AnalyzerContext } from './analyzer.ts'
export { createProgramForCorpus, type SharedProgramOptions } from './shared-program.ts'

// JSX to IR transformer
export { jsxToIR } from './jsx-to-ir.ts'
export { decideClientOnlyElision } from './ir-to-client-js/client-only-elision.ts'

// Module exports generation (compiler layer)
export { generateModuleExports, extractFunctionParams, formatParamWithType, findReachableNames } from './module-exports.ts'

// Adapters
export { BaseAdapter } from './adapters/interface.ts'
// Dependency-free adapter for tooling that only needs client JS (e.g. the
// profiler scenario driver) — the client output is adapter-independent.
export { TestAdapter, testAdapter } from './adapters/test-adapter.ts'
export type {
  TemplateAdapter,
  AdapterOutput,
  AdapterGenerateOptions,
  TemplateSections,
  TemplatePrimitiveEmit,
  TemplatePrimitiveRegistry,
  TemplateCallAcceptor,
} from './adapters/interface.ts'
export { JsxAdapter } from './adapters/jsx-adapter.ts'
export type { JsxAdapterConfig } from './adapters/jsx-adapter.ts'
export { rewriteImportsForTemplate, rewriteDynamicImportsInSource } from './adapters/template-imports.ts'
export { emitParsedExpr, groupBinaryOperand, groupObjectLiteralSegments, isStringTypedOperand, isStringConcatBinary } from './adapters/parsed-expr-emitter.ts'
export type { ParsedExprEmitter, HigherOrderMethod, ArrayMethod, SortMethod, LiteralType } from './adapters/parsed-expr-emitter.ts'
export { collectLoopBoundNames } from './adapters/loop-bound-names.ts'
export { derivesScopeFromSlot } from './adapters/child-scope.ts'
export { evaluateStaticLiteral, isFullyStaticLiteral, resolveStaticLoopSource } from './static-literal.ts'
export { importsSearchParams, searchParamsLocalNames, envSignalLocalNames, envSignalReaderFor, ENV_SIGNAL_READERS, queryHrefLocalNames, formatDateLocalNames, matchSearchParamsMethodCall } from './adapters/env-signal.ts'
export type { EnvSignalReader } from './adapters/env-signal.ts'
export { matchQueryHrefCall, queryHrefArgs, type QueryHrefCall, type QueryHrefTriple } from './query-href-lowering.ts'
export {
  registerLoweringPlugin,
  getLoweringPlugins,
  prepareLoweringMatchers,
  matchLoweringCall,
  isValidHelperId,
  __resetLoweringPluginsForTest,
  type LoweringPlugin,
  type LoweringNode,
  type LoweringTriple,
  type LoweringMatcher,
} from './lowering-registry.ts'
export {
  queryHrefPlugin,
  registerBuiltinLoweringPlugins,
  BUILTIN_LOWERING_PLUGINS,
} from './builtin-lowering-plugins.ts'
// Register the built-in lowering plugins (queryHref, …) into the shared registry
// on load, so every adapter that imports @barefootjs/jsx recognises them with no
// explicit setup — queryHref is a default-applied plugin, not an adapter branch.
import { registerBuiltinLoweringPlugins as __registerBuiltins } from './builtin-lowering-plugins.ts'
__registerBuiltins()
export { emitIRNode } from './adapters/ir-node-emitter.ts'
export type { IRNodeEmitter, EmitIRNode } from './adapters/ir-node-emitter.ts'
export { emitAttrValue } from './adapters/attr-value-emitter.ts'
export type { AttrValueEmitter } from './adapters/attr-value-emitter.ts'
export {
  isDangerousInnerHtmlAttr,
  resolveDangerousInnerHtml,
  dangerousInnerHtmlMetacharViolation,
  dangerousInnerHtmlDiagnostic,
} from './adapters/dangerous-inner-html.ts'
export type { DangerousInnerHtmlResolution } from './adapters/dangerous-inner-html.ts'

// Client JS Generator
export { generateClientJs, generateClientJsWithSourceMap, analyzeClientNeeds } from './ir-to-client-js/index.ts'
export type { ClientJsResult } from './ir-to-client-js/index.ts'

// Source Map
export { SourceMapGenerator, buildSourceMapFromIR } from './ir-to-client-js/source-map.ts'
export type { SourceMapV3 } from './ir-to-client-js/source-map.ts'

// Client JS Combiner (for build scripts)
export { combineParentChildClientJs } from './combine-client-js.ts'

export interface PostBuildContext {
  /** Collected types: componentName → types content */
  types: Map<string, string>
  /** Absolute path to the output directory */
  outDir: string
  /** Absolute path to the project directory */
  projectDir: string
  /** Build manifest */
  manifest: Record<string, { clientJs?: string; markedTemplate: string; ssrDefaults?: Record<string, unknown> }>
  /**
   * Signal that the post-build step wrote (or otherwise altered) outputs the
   * CLI does not track directly — e.g. adapter-generated files produced
   * outside `outDir`. Used by the CLI's dev-reload sentinel so the browser
   * reloads only when a build actually changed the world.
   *
   * Adapters should call this after a real write (use your own
   * write-if-changed logic to decide). Safe to call multiple times per build.
   *
   * Optional on the type so older callers that construct a ctx manually (e.g.
   * in tests) don't have to supply one; the CLI always provides one at runtime.
   */
  markChanged?: () => void
}

/**
 * Project layout paths used by registry tooling (`bf add`, `search`,
 * `meta:extract`, `tokens`, `inspect`, etc.). These are consumed only by
 * non-build tooling — the build pipeline ignores them — but they live in
 * `barefoot.config.ts` so the project has a single source of truth.
 */
export interface BarefootPaths {
  /** Component registry root (where `bf add` lands new components). */
  components: string
  /** Tokens directory (tokens.json, tokens.css). */
  tokens: string
  /** Meta directory (meta/index.json + per-component meta files). */
  meta: string
}

// AttrValue constructors
export { AttrValueOf } from './types.ts'

// Per-escape-kind SSR cost — the one place every renderer reads the trade from (#2613)
export { ESCAPE_SSR_COST } from './types.ts'

// CSS Layer Prefixer
export { applyCssLayerPrefix } from './css-layer-prefixer.ts'

// Compiler instrumentation (bench + perf debugging)
export {
  enableCompilerInstrumentation,
  disableCompilerInstrumentation,
  resetCompilerCounters,
  getCompilerCounters,
  type CompilerCounters,
} from './instrumentation.ts'

// Errors
export { ErrorCodes, createError, formatError, generateCodeFrame } from './errors.ts'

// Value-reference classifier (#2432) — shared "is this a real value use"
// door for import-emission sites and the CLI's stripped-reference scan.
export { isValueReferenceIdentifier, collectValueReferencedNames } from './value-references.ts'

// Expression Parser
export { parseExpression, tsNodeToParsedExpr, asCallbackMethodCall, CALLBACK_METHODS, sortComparatorFromArrow, serializeParsedExpr, freeVarsInBody, freeIdentifiers, materializeGetterCalls, isSupported, isSupportedValue, exprToString, stringifyParsedExpr, identifierPath, parseBlockBody, parseBlockBodyTolerant, foldBlockToExpr, predicateTernaryToLogical, containsHigherOrder, extractArrowBodyExpression, parseStyleObjectEntries, hasUnsafeStyleValue, parseProviderObjectLiteral, type ProviderObjectMember, type FoldBlockOptions } from './expression-parser.ts'
export type { StyleObjectEntry } from './expression-parser.ts'
export { PARSED_EXPR_KINDS, ARRAY_METHOD_NAMES, SORT_KEY_TYPES, SORT_KEY_TARGETS, SORT_KEY_DIRECTIONS } from './expression-parser.ts'
export type { ParsedExpr, ObjectLiteralProperty, ParsedStatement, SortComparator, SortKey, FlatDepth, SupportLevel, SupportResult, TemplatePart } from './expression-parser.ts'
export { buildLoopChainExpr } from './loop-chain.ts'
export type { LoopChainInputs } from './loop-chain.ts'
export { isLowerableLoopDestructure, isLowerableObjectRestDestructure } from './loop-destructure.ts'

// Binding scope (#2482) — shared loop-bound-name resolution service
export { BindingScope } from './scope/binding-scope.ts'
export type { ScopeBindingSource, ScopeBinding, ScopeFrame, LoopBindingSource } from './scope/binding-scope.ts'

// Debug analysis
export {
  buildComponentGraph,
  buildComponentAnalysis,
  buildGraphFromIR,
  buildEventSummary,
  buildLoopSummary,
  buildWhyUpdate,
  traceUpdatePath,
  formatComponentGraph,
  formatUpdatePath,
  formatEventSummary,
  formatLoopSummary,
  formatWhyUpdate,
  describeFallback,
  formatFallbackExplanations,
  buildComponentSummary,
  formatComponentSummary,
  formatSignalTrace,
  generateStaticTrace,
  graphToJSON,
  resolveSetters,
  buildLocalFunctionSetterMap,
  makeIdCallRegex,
} from './debug.ts'
export type { ComponentGraph, ComponentAnalysis, SignalNode, MemoNode, EffectNode, DomBinding, UpdatePath, SignalTrace, EventBinding, SetterRef, FnSetterResolution, EventSummary, LoopInfo, LoopChildBinding, LoopSummary, WhyUpdateResult, WhyUpdateDep, WhyUpdateSource, FallbackExplanation, ComponentSummary } from './debug.ts'
export type { WrapReason } from './ir-to-client-js/reactivity.ts'

// Reactive performance profiler (#1690). Static half (SR5 budget, SR6 diff) +
// dynamic half (SR2/SR4 join, SR7 report, v1 analyses).
export {
  PROFILE_SCHEMA_VERSION,
  buildStaticBudget,
  formatStaticBudget,
  diffStaticBudget,
  formatBudgetDiff,
  buildProfileReport,
  formatProfileReport,
  buildIdIndex,
  joinProfilerEvents,
  parseProfilerId,
  analyzeHotSubscribers,
  formatHotSubscribers,
  findUninstrumentedEffects,
  analyzeWastedReReruns,
  formatWastedReReruns,
  analyzeBatchAdvisor,
  formatBatchAdvisor,
  evaluateProfileGates,
} from './profiler.ts'
export type {
  StaticBudget,
  StaticBudgetOptions,
  FanOutEntry,
  BudgetHandler,
  BudgetDiff,
  FanOutChange,
  ProfileReport,
  ProfileReportInput,
  ProfileCoverage,
  DiagnosticsSummary,
  EffectCandidate,
  IdIndex,
  ResolvedNode,
  JoinResult,
  JoinedEvent,
  UnattributedId,
  HotSubscribersResult,
  HotSubscriber,
  HotSubscribersOptions,
  WastedReRunsResult,
  WastedSubscriber,
  WastedReRunsOptions,
  BatchAdvisorResult,
  BatchCandidate,
  BatchSafety,
  ProfileSeverity,
  ProfileStatus,
  AgentFinding,
  ScenarioGuidance,
  GateName,
  GateConfig,
  GateCheck,
  GateResult,
} from './profiler.ts'

// Reactive profile — findings layer (#1690 dogfood: Bug A/C/D fixes, batch-candidate dedup,
// fallback-heavy detection, multi-component table, SR6 compile-diff).
export {
  buildReactiveProfile,
  buildProfileFromGraph,
  diffProfiles,
  formatSingleProfile,
  formatProfileTable,
  formatProfileDiff,
  profileToJSON,
} from './debug-profile.ts'
export type {
  ComponentProfile,
  ComponentProfileMetrics,
  ProfileFinding,
  ProfileDiff,
  ProfileDiffEntry,
} from './debug-profile.ts'

// HTML constants
export { BOOLEAN_ATTRS, isBooleanAttr } from './html-constants.ts'

// Shared props-object-pattern helpers for the Go / Mojo template adapters
export { augmentInheritedPropAccesses, parseRecordIndexAccess, evalStringArrayJoin, collectModuleStringConsts, lookupStaticRecordLiteral, collectContextConsumers } from './augment-inherited-props.ts'
export type { RecordIndexAccess, RecordIndexEntry, ContextConsumer } from './augment-inherited-props.ts'

// HTML element attribute types
export type {
  // Event types
  TargetedEvent,
  TargetedInputEvent,
  TargetedFocusEvent,
  TargetedKeyboardEvent,
  TargetedMouseEvent,

  // Event handlers
  InputEventHandler,
  FocusEventHandler,
  KeyboardEventHandler,
  MouseEventHandler,
  ChangeEventHandler,

  // Base attributes
  BaseEventAttributes,
  HTMLBaseAttributes,

  // Form attribute helper types
  HTMLAttributeFormEnctype,
  HTMLAttributeFormMethod,
  HTMLAttributeAnchorTarget,

  // Element-specific attributes
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  TextareaHTMLAttributes,
  SelectHTMLAttributes,
  FormHTMLAttributes,
  AnchorHTMLAttributes,
  ImgHTMLAttributes,
  LabelHTMLAttributes,
  OptionHTMLAttributes,

  // SVG attributes (for components whose root is an `<svg>`, e.g. icons)
  SVGSVGAttributes,
} from './html-types.ts'

/**
 * BarefootJS JSX Compiler
 *
 * Multi-backend JSX compiler that generates Marked Templates and Client JS.
 */

// Main compiler API
export { compileJSX, buildMetadata } from './compiler.ts'
export type { CompileResult, CompileOptions, CompileOptionsWithAdapter, FileOutput } from './compiler.ts'

// SSR template-variable defaults (manifest seeds for stash-based adapters)
export { extractSsrDefaults } from './ssr-defaults.ts'
export type { SsrDefault } from './ssr-defaults.ts'

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
  TypeInfo,
  TypeDefinition,
  SourceLocation,
  CompilerError,
} from './types.ts'

// Analyzer
export { analyzeComponent, listComponentFunctions, listComponentFunctions as listExportedComponents, createProgramForFile, needsTypeBasedDetection, REACTIVE_PRIMITIVES, BROWSER_ONLY_CLIENT_APIS, type AnalyzerContext } from './analyzer.ts'
export { createProgramForCorpus, type SharedProgramOptions } from './shared-program.ts'

// JSX to IR transformer
export { jsxToIR } from './jsx-to-ir.ts'

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
export { rewriteImportsForTemplate } from './adapters/template-imports.ts'
export { emitParsedExpr } from './adapters/parsed-expr-emitter.ts'
export type { ParsedExprEmitter, HigherOrderMethod, ArrayMethod, SortMethod, LiteralType } from './adapters/parsed-expr-emitter.ts'
export { importsSearchParams, searchParamsLocalNames, queryHrefLocalNames, matchSearchParamsMethodCall } from './adapters/env-signal.ts'
export { matchQueryHrefCall, queryHrefArgs, type QueryHrefCall, type QueryHrefTriple } from './query-href-lowering.ts'
export {
  registerLoweringPlugin,
  getLoweringPlugins,
  prepareLoweringMatchers,
  matchLoweringCall,
  type LoweringPlugin,
  type LoweringNode,
  type LoweringMatcher,
} from './lowering-registry.ts'
export { emitIRNode } from './adapters/ir-node-emitter.ts'
export type { IRNodeEmitter, EmitIRNode } from './adapters/ir-node-emitter.ts'
export { emitAttrValue } from './adapters/attr-value-emitter.ts'
export type { AttrValueEmitter } from './adapters/attr-value-emitter.ts'

// Client JS Generator
export { generateClientJs, generateClientJsWithSourceMap, analyzeClientNeeds } from './ir-to-client-js/index.ts'
export type { ClientJsResult } from './ir-to-client-js/index.ts'

// Source Map
export { SourceMapGenerator, buildSourceMapFromIR } from './ir-to-client-js/source-map.ts'
export type { SourceMapV3 } from './ir-to-client-js/source-map.ts'

// Client JS Combiner (for build scripts)
export { combineParentChildClientJs } from './combine-client-js.ts'

// Externals manifest + importmap snippet renderer (shared by adapters and CLI)
export { renderImportMapHtml } from './import-map.ts'
export type { ExternalsManifest, ImportMapManifest } from './import-map.ts'

// Build options (shared by adapters and CLI)
export interface OutputLayout {
  /** Subdirectory for marked templates (default: 'components') */
  templates: string
  /** Subdirectory for client JS files (default: 'components') */
  clientJs: string
  /** Subdirectory for runtime (barefoot.js) (default: same as clientJs) */
  runtime: string
}

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
 * Vendor code-splitting spec for a single package.
 *
 * - `true` / `{ chunk: true }` — locate the package's browser-ready entry
 *   (umd → unpkg → jsdelivr → import condition) and copy it to the output dir.
 * - `{ url }` — CDN passthrough: skip local copy, use the URL as-is in the importmap.
 * - `preload: true` — emit a `<link rel="modulepreload">` hint for this entry.
 * - `rebundle: true` — re-bundle the resolved entry with esbuild into a self-contained
 *   ESM file, inlining all dependencies. Useful for packages (e.g. `yjs`) whose
 *   `dist/*.mjs` files still contain bare external imports that browsers cannot resolve.
 */
export type ExternalSpec =
  | true
  | { chunk?: true; preload?: boolean; rebundle?: boolean }
  | { url: string; preload?: boolean }

/**
 * An entry point to bundle directly with esbuild.
 * Externals declared in `BuildOptions.externals` are applied automatically.
 * `@barefootjs/client`, `@barefootjs/client/runtime`, and
 * `@barefootjs/client/reactive` are always kept external, so you never need
 * to list them here. They resolve through the page's import map to the shared
 * `barefoot.js` runtime; inlining them would fork the reactive runtime and
 * duplicate signals (#927).
 * Use this for modules that are not barefoot components (e.g. plain TS entry
 * points that import external vendor packages).
 */
export interface BundleEntry {
  /** Entry file path relative to the config file */
  entry: string
  /** Output filename placed in the client JS output directory */
  outfile: string
  /** Additional packages to mark as external beyond those in `externals` */
  externals?: string[]
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

export interface BuildOptions {
  /**
   * Project layout paths. Consumed by registry tooling, not the build pipeline.
   * Defaults to `{ components: 'components/ui', tokens: 'tokens', meta: 'meta' }`
   * when omitted.
   */
  paths?: BarefootPaths
  /** Source component directories relative to config file */
  components?: string[]
  /** Output directory relative to config file */
  outDir?: string
  /** Minify client JS output */
  minify?: boolean
  /** Add content hash to client JS filenames */
  contentHash?: boolean
  /** Custom output directory layout */
  outputLayout?: OutputLayout
  /** Post-build hook called after minification, before manifest write */
  postBuild?: (ctx: PostBuildContext) => Promise<void> | void
  /**
   * Vendor packages to split out as separately-cached browser chunks.
   * The CLI copies each package's browser-ready bundle to the output dir,
   * then emits `dist/barefoot-externals.json` with the importmap and
   * `--external` flag list for use in the app's own `bun build`.
   *
   * `@barefootjs/client*` dedup entries are added automatically whenever
   * this field is non-empty, preventing reactive-primitive duplication (#927).
   */
  externals?: Record<string, ExternalSpec>
  /**
   * URL base path for vendor chunks in the emitted importmap.
   * Defaults to `/<runtimeSubdir>/` (e.g., `/static/components/`).
   */
  externalsBasePath?: string
  /**
   * Additional entry points to bundle with esbuild directly, bypassing the
   * barefoot component compiler. Useful for plain TS/TSX modules (e.g. canvas
   * init entry points) that import vendor packages listed in `externals`.
   * Each entry is bundled as ESM with all `externals` automatically excluded.
   */
  bundleEntries?: BundleEntry[]
  /**
   * Import prefixes resolved at build time rather than left as bare
   * specifiers in the emitted client JS. Use this for tsconfig `paths`
   * aliases like `@/`, `@ui/`, `@app/` so the compiler does not emit
   * them as browser imports.
   *
   * Forwarded to `compileJSX` as `CompileOptions.localImportPrefixes`.
   */
  localImportPrefixes?: string[]
}

// AttrValue constructors
export { AttrValueOf } from './types.ts'

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

// Expression Parser
export { parseExpression, tsNodeToParsedExpr, asCallbackMethodCall, CALLBACK_METHODS, sortComparatorFromArrow, serializeParsedExpr, freeVarsInBody, isSupported, exprToString, stringifyParsedExpr, identifierPath, parseBlockBody, parseBlockBodyTolerant, foldBlockToExpr, predicateTernaryToLogical, containsHigherOrder, extractArrowBodyExpression, parseStyleObjectEntries, parseProviderObjectLiteral, type ProviderObjectMember, type FoldBlockOptions } from './expression-parser.ts'
export type { StyleObjectEntry } from './expression-parser.ts'
export type { ParsedExpr, ObjectLiteralProperty, ParsedStatement, SortComparator, SortKey, FlatDepth, SupportLevel, SupportResult, TemplatePart } from './expression-parser.ts'
export { buildLoopChainExpr } from './loop-chain.ts'
export type { LoopChainInputs } from './loop-chain.ts'
export { isLowerableObjectRestDestructure } from './loop-destructure.ts'

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
} from './html-types.ts'

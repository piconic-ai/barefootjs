/**
 * BarefootJS JSX Compiler
 *
 * Multi-backend JSX compiler that generates Marked Templates and Client JS.
 */

// Main compiler API
export { compileJSX, compileJSXSync, buildMetadata } from './compiler'
export type { CompileResult, CompileOptions, CompileOptionsWithAdapter, FileOutput } from './compiler'

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
  IRTemplateLiteral,
  IRTemplatePart,
  IRProp,
  ParamInfo,
  TypeInfo,
  SourceLocation,
  CompilerError,
} from './types'

// Analyzer
export { analyzeComponent, listComponentFunctions, listComponentFunctions as listExportedComponents, createProgramForFile, needsTypeBasedDetection, type AnalyzerContext } from './analyzer'
export { createProgramForCorpus, type SharedProgramOptions } from './shared-program'

// JSX to IR transformer
export { jsxToIR } from './jsx-to-ir'

// Module exports generation (compiler layer)
export { generateModuleExports, extractFunctionParams, formatParamWithType, findReachableNames } from './module-exports'

// Adapters
export { BaseAdapter } from './adapters/interface'
export type { TemplateAdapter, AdapterOutput, AdapterGenerateOptions, TemplateSections } from './adapters/interface'
export { JsxAdapter } from './adapters/jsx-adapter'
export type { JsxAdapterConfig } from './adapters/jsx-adapter'

// Client JS Generator
export { generateClientJs, generateClientJsWithSourceMap, analyzeClientNeeds } from './ir-to-client-js'
export type { ClientJsResult } from './ir-to-client-js'

// Source Map
export { SourceMapGenerator, buildSourceMapFromIR } from './ir-to-client-js/source-map'
export type { SourceMapV3 } from './ir-to-client-js/source-map'

// Client JS Combiner (for build scripts)
export { combineParentChildClientJs } from './combine-client-js'

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
  manifest: Record<string, { clientJs?: string; markedTemplate: string }>
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
 * Project layout paths used by registry tooling (`barefoot add`, `search`,
 * `meta:extract`, `tokens`, `inspect`, etc.). These are consumed only by
 * non-build tooling — the build pipeline ignores them — but they live in
 * `barefoot.config.ts` so the project has a single source of truth.
 */
export interface BarefootPaths {
  /** Component registry root (where `barefoot add` lands new components). */
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
  /** Output only client JS, skip marked templates and manifest */
  clientOnly?: boolean
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
}

// CSS Layer Prefixer
export { applyCssLayerPrefix } from './css-layer-prefixer'

// Compiler instrumentation (bench + perf debugging)
export {
  enableCompilerInstrumentation,
  disableCompilerInstrumentation,
  resetCompilerCounters,
  getCompilerCounters,
  type CompilerCounters,
} from './instrumentation'

// Errors
export { ErrorCodes, createError, formatError, generateCodeFrame } from './errors'

// Expression Parser
export { parseExpression, isSupported, exprToString, parseBlockBody } from './expression-parser'
export type { ParsedExpr, ParsedStatement, SupportLevel, SupportResult, TemplatePart } from './expression-parser'

// Debug analysis
export {
  buildComponentGraph,
  buildGraphFromIR,
  traceUpdatePath,
  formatComponentGraph,
  formatUpdatePath,
  formatSignalTrace,
  generateStaticTrace,
  graphToJSON,
} from './debug'
export type { ComponentGraph, SignalNode, MemoNode, EffectNode, DomBinding, UpdatePath, SignalTrace } from './debug'
export type { WrapReason } from './ir-to-client-js/reactivity'

// HTML constants
export { BOOLEAN_ATTRS, isBooleanAttr } from './html-constants'

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
} from './html-types'

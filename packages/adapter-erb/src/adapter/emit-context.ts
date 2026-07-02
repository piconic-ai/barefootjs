/**
 * The contract the extracted expression-emitter modules depend on instead of
 * the concrete `ErbAdapter`.
 *
 * The ERB adapter's top-level expression lowering is mutually recursive with
 * the adapter's own const/record resolution and its filter-predicate emitter,
 * so the extracted `ErbTopLevelEmitter` still needs to call back into shared
 * per-compile state and recursive entry points. `ErbEmitContext` is that
 * seam: the emitter takes an `ErbEmitContext` built by the adapter's private
 * `emitCtx` getter (the adapter does NOT `implements` this interface, so the
 * wrapped members stay private and off its exported public type — matching
 * the Mojo/Go adapters' `emitCtx`). The emitter depends on this narrow
 * interface rather than the full adapter class, so the coupling is explicit
 * and it's unit-testable against a stub.
 *
 * Keep this surface minimal: add a member only when an extracted module
 * genuinely needs it, so the seam documents the real cross-module coupling
 * rather than re-exposing the whole adapter.
 */

import type { ParsedExpr, CompilerError, IRMetadata } from '@barefootjs/jsx'

export interface ErbEmitContext {
  /**
   * Local binding names the request-scoped `searchParams()` env signal
   * is imported under. Non-empty enables the env-signal method-call lowering.
   */
  readonly _searchParamsLocals: Set<string>

  /**
   * Inline a module-scope pure string-literal const by name as the resolved
   * literal value, or null when the name is not such a const.
   */
  resolveModuleStringConst(name: string): string | null

  /** Resolve a literal const (`const totalPages = 5`) to its Ruby value, or null. */
  resolveLiteralConst(name: string): string | null

  /**
   * Resolve a static property access on a module object-literal const
   * (`variantClasses.ghost`) to its Ruby value at compile time, or null.
   */
  resolveStaticRecordLiteral(objectName: string, key: string): string | null

  /**
   * Whether `name` currently names a bare Ruby local bound by an enclosing
   * loop/block (`todos().map(todo => ...)` → `|todo|`) — as opposed to a
   * prop / signal / memo / module const, which always resolves through the
   * `v[:name]` vars Hash. This is the ERB-specific branch point the Mojo/
   * Kolon adapters don't need: Perl's `$name` sigil resolves a lexical
   * loop var and a stash var identically, but ERB's two-locals variable
   * model (`bf`, `v`) requires the identifier emitter to choose between a
   * bare Ruby local and a `v[:name]` hash lookup.
   */
  isLoopBoundName(name: string): boolean

  /** Whether a getter/prop name resolves to a string-typed SSR value. */
  _isStringValueName(name: string): boolean

  /** Record a BF101 unsupported-expression diagnostic. */
  _recordExprBF101(message: string, reason?: string): void

  /** Lower a filter/predicate body to its Ruby form, bound to `param`. */
  _renderRubyFilterExprPublic(expr: ParsedExpr, param: string): string
}

/**
 * The contract the extracted object-literal / conditional-spread lowering
 * (`spread/spread-codegen.ts`) depends on. The spread lowering recurses into
 * the core expression lowering and records its own BF101 diagnostics, so it
 * needs the recursive entry point plus the per-compile bookkeeping the
 * adapter owns. Declared separately from `ErbEmitContext` so each extracted
 * module's real coupling is documented precisely.
 */
export interface ErbSpreadContext {
  /** Component name, for diagnostic source locations. */
  readonly componentName: string

  /** Per-compile diagnostic list the spread lowering appends to. */
  readonly errors: CompilerError[]

  /** Local-constant metadata, for resolving `Record[key]` spread values. */
  readonly localConstants: IRMetadata['localConstants']

  /** Prop params, for classifying a bare-identifier index as a prop. */
  readonly propsParams: { name: string }[]

  /**
   * Lower a JS expression to its Ruby form (the core recursive entry).
   *
   * When the IR already carries a structured `ParsedExpr` tree, pass it as
   * `preParsed` so the converter threads it straight through instead of
   * re-parsing `expr` — mirrors go-template's
   * `convertExpressionToGo(jsExpr, out?, preParsed?)`. With `preParsed` set,
   * `expr` is unused for parsing (the converter derives any diagnostic text
   * from the tree), so callers may pass `''`.
   */
  convertExpressionToRuby(expr: string, preParsed?: ParsedExpr): string
}

/**
 * The contract the extracted in-template memo / context seeding
 * (`memo/seed.ts`) depends on. The seed lowering recurses into the core
 * expression lowering to compute a derived signal/memo value or a context
 * default; that recursive entry is its only adapter coupling.
 */
export interface ErbMemoContext {
  /**
   * Lower a JS expression to its Ruby form (the core recursive entry).
   *
   * When the IR already carries a structured `ParsedExpr` tree, pass it as
   * `preParsed` so the converter threads it straight through instead of
   * re-parsing `expr` — mirrors go-template's
   * `convertExpressionToGo(jsExpr, out?, preParsed?)`. With `preParsed` set,
   * `expr` is unused for parsing (the converter derives any diagnostic text
   * from the tree), so callers may pass `''`.
   */
  convertExpressionToRuby(expr: string, preParsed?: ParsedExpr): string
}

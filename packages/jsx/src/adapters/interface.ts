/**
 * BarefootJS Compiler - Template Adapter Interface
 *
 * Defines the interface for language-specific template adapters.
 */

import type {
  ComponentIR,
  IRNode,
  IRElement,
  IRExpression,
  IRConditional,
  IRLoop,
  IRComponent,
  IRAsync,
} from '../types.ts'

export interface TemplateSections {
  imports: string
  types: string
  component: string
  defaultExport: string
  /**
   * Module-scope statements (e.g. SSR-side context bindings emitted by the
   * Hono adapter). Placed between `imports` and `types` in the assembled
   * template. Multi-component compilation dedupes this section by exact
   * string equality — adapters must emit the same content for every
   * component in a source file.
   */
  moduleConstants?: string
}

export interface AdapterOutput {
  /** Complete assembled template string (kept for external consumers and debugging). */
  template: string
  /** Structured sections used by the compiler to assemble the final module
   *  file. Required: the compiler does not parse the raw `template`. */
  sections: TemplateSections
  types?: string // Generated types (for typed languages)
  extension: string
}

export interface AdapterGenerateOptions {
  /** Skip script registration (for child components bundled in parent's .client.js) */
  skipScriptRegistration?: boolean
  /** Base name for script registration (for non-default exports sharing parent's .client.js) */
  scriptBaseName?: string
  /**
   * Caller guarantees that every sibling `.tsx` file's generated template
   * will be registered on the same template instance at render time
   * (e.g. the barefoot CLI compiles all source-dir files together and
   * registers them on the same `*template.Template` instance / Mojo
   * equivalent).
   *
   * Adapters use this to suppress diagnostics about cross-template
   * lookups that would otherwise be silent failures at request time
   * — see `BF103` in the Go template / Mojo adapters. Defaults to
   * `false`: stand-alone `compileJSX` callers (e.g. the conformance
   * runner) get the loud build-time error.
   */
  siblingTemplatesRegistered?: boolean
  /**
   * Optional rewrite hook applied to **relative** module specifiers
   * (those starting with `.`) when an adapter re-emits the source's
   * import / re-export list into a marked template. Bare specifiers
   * (`@barefootjs/jsx`, `react`) are NOT passed through this hook.
   *
   * The CLI sets this so source-authored paths still resolve from the
   * on-disk emit position (#1453): a registry-shaped
   * `import type { Child } from '../../../types'` written from
   * `components/ui/button/index.tsx` is correct at source depth but
   * lands at the wrong depth once emitted to
   * `public/components/ui/button/index.tsx`.
   *
   * Operates on the structured `ImportInfo.source` strings, not the
   * emitted text — so JSDoc `@example` blocks containing
   * import-shaped code, template literals, and other source-level
   * incidentals are unaffected.
   */
  rewriteRelativeImport?: (importPath: string) => string
}

/**
 * Emit a registered primitive call into the template. Receives the already-
 * rewritten argument expressions (as strings) and returns the substituted
 * template-side call expression.
 *
 * Examples:
 *   Hono: `(args) => \`JSON.stringify(\${args[0]})\``
 *   Go:   `(args) => \`{{ json \${args[0]} }}\``
 */
export type TemplatePrimitiveEmit = (args: string[]) => string

/**
 * Maps callee identifier paths to adapter-specific template emit functions.
 * Keys are the textual callee path as it appears in the JSX expression
 * (`JSON.stringify`, `Math.floor`, `String`).
 *
 * V1 scope (#1187): identifier-path callees only, and only names the adapter
 * knows about AHEAD OF TIME — this map is fixed at adapter-construction
 * time, so it can never contain a name from a component's own (unknown in
 * advance) imports. Method calls on values whose type the analyzer must
 * resolve (`props.name.toUpperCase()`) are ALSO out of scope — see #1187 R1.
 * Users can fall back to `/* @client *\/` for either limitation.
 *
 * V2 (#2069) does not widen this map — it adds a separate, orthogonal
 * acceptance path instead: `RelocateEnv.loweringMatchers`, bound once per
 * component from the global `LoweringPlugin` registry
 * (`prepareLoweringMatchers`, `packages/jsx/src/lowering-registry.ts`). A
 * plugin's `prepare(metadata)` resolves the component's ACTUAL import list,
 * so it can recognise a call this string-keyed map structurally never could
 * (a bespoke user import, unknown until compile time). `templatePrimitives`
 * remains the right home for well-known JS builtins (`JSON.stringify`,
 * `Math.floor`) that every component might reasonably use, with no import
 * to key a plugin against.
 */
export type TemplatePrimitiveRegistry = Record<string, TemplatePrimitiveEmit>

/**
 * Optional broad-acceptance predicate for adapters whose template runtime is
 * a full JS engine (Hono SSR, CSR adapter). When the callee isn't found in
 * `templatePrimitives`, the compiler consults this predicate; returning true
 * means "inline the call as-is in the template, the runtime can execute it".
 *
 * Adapters whose template runtime can't execute arbitrary JS (Go, Perl,
 * other server-side template languages) should leave this undefined and
 * rely on the explicit `templatePrimitives` map alone (plus, since #2069,
 * whatever `LoweringPlugin`s are registered — see `TemplatePrimitiveRegistry`
 * above).
 */
export type TemplateCallAcceptor = (calleeName: string) => boolean

/**
 * The collection-method callbacks whose body the compiler may hand to a
 * backend to run. Used by {@link CallbackBodyAcceptor}. See
 * `spec/callback-fidelity.md`.
 */
export type CallbackBodyKind =
  | 'filter'
  | 'sort'
  | 'map'
  | 'flatMap'
  | 'find'
  | 'some'
  | 'every'
  | 'reduce'

/**
 * Predicate: can this adapter's runtime render an *off-subset* callback body
 * of the given kind verbatim? A callback whose body the compiler can't express
 * as a template / ParsedExpr subtree is only renderable at SSR by a backend
 * whose template runtime is a full JS engine.
 *
 * JS-runtime adapters (Hono SSR, CSR — anything extending `JsxAdapter`) return
 * true, so the compiler keeps the callback inlined for the runtime to execute
 * instead of raising a universal Phase-1 diagnostic. DSL adapters (Go, Perl,
 * …) leave this undefined; an off-subset body then raises the usual diagnostic
 * with the `/* @client *\/` escape, and the user opts that piece into
 * client-only rendering. Granular by kind so a DSL adapter may later accept a
 * subset (e.g. `filter` but not `sort`). See `spec/callback-fidelity.md`.
 */
export type CallbackBodyAcceptor = (kind: CallbackBodyKind) => boolean

export interface TemplateAdapter {
  name: string
  extension: string
  /**
   * When true, compileJSX emits one markedTemplate FileOutput per component function
   * in a multi-component source file, instead of combining all into one file.
   * Required for adapters that look up templates by filename (e.g. Mojolicious).
   */
  templatesPerComponent?: boolean
  /**
   * How the application author injects the externals importmap (and any
   * `<link rel="modulepreload">` hints) into the page `<head>` when
   * `externals` / `bundleEntries` are configured.
   *
   * - `'component'` — the adapter ships a render-time component (e.g. Hono's
   *   `BfImportMap`) that reads `barefoot-externals.json`; `bf build` emits no
   *   static snippet.
   * - `'html-snippet'` — the adapter targets a template-string language (Go
   *   html/template, Mojolicious EP) with no component layer, so `bf build`
   *   writes a ready-to-include `barefoot-importmap.html` alongside
   *   `barefoot-externals.json` (via `renderImportMapHtml`).
   *
   * Optional only for backward compatibility (and internal-only adapters like
   * the CSR test adapter). Every *shipping* adapter must set it — the
   * adapter-tests importmap-injection contract enforces this so a new adapter
   * cannot silently leave configured `externals` with no injection point.
   * See issue #1644.
   */
  importMapInjection?: 'component' | 'html-snippet'
  /**
   * Module specifier of the SSR shim for `@barefootjs/client` (and
   * `/runtime`). When set, the compiler rewrites client-package imports in
   * SSR templates to point at this shim instead of stripping them. The shim
   * is expected to provide SSR-safe stubs for `useContext`, `provideContext`,
   * pure helpers (`splitProps`, `unwrap`, ...), and throwing stubs for
   * reactive primitives that the compiler should never reach at SSR.
   *
   * When undefined, the compiler keeps the legacy whole-package strip
   * behaviour for adapters that do not run JS at SSR (e.g. go-template).
   */
  clientShimSource?: string

  /**
   * Pure JS callees the adapter promises it can render in template scope.
   * The compiler consults this map when classifying expressions for
   * template-scope safety: a call whose callee is registered is treated as
   * lift-safe instead of forcing the surrounding expression into init scope.
   *
   * Contract: the emit function must produce template-side code whose value
   * is **value-equivalent** to the JS reference implementation given the
   * same input. Order/whitespace differences are acceptable for non-string-
   * compared outputs (CSS class lists, JSON-decoded objects). See #1187
   * registry contract for details.
   *
   * V1 scope is identifier-path callees (`JSON.stringify`, `Math.floor`,
   * `String`). Method calls on values whose receiver type the analyzer
   * must resolve are out of scope; users can fall back to `/* @client *\/`.
   */
  templatePrimitives?: TemplatePrimitiveRegistry

  /**
   * Broad-acceptance predicate for adapters whose template runtime is a
   * full JS engine (Hono SSR, CSR). Consulted when a callee isn't in
   * `templatePrimitives`. Returning true means the runtime can execute the
   * call as-is — the compiler keeps the call inlined in the template.
   *
   * Server-side template languages (Go, Perl) should leave this undefined
   * and rely on the explicit `templatePrimitives` map.
   */
  acceptsTemplateCall?: TemplateCallAcceptor

  /**
   * Whether this adapter's runtime can render an off-subset callback body
   * (`filter`/`sort`/`find`/… predicate or comparator the compiler can't
   * lower to a template / ParsedExpr) verbatim. JS-runtime adapters set this
   * (via `JsxAdapter`); DSL adapters leave it undefined and instead surface
   * the diagnostic + `/* @client *\/` escape. See `spec/callback-fidelity.md`.
   */
  acceptsCallbackBody?: CallbackBodyAcceptor

  // Main entry point - generates complete template from IR
  generate(ir: ComponentIR, options?: AdapterGenerateOptions): AdapterOutput

  // Node rendering
  renderNode(node: IRNode): string
  renderElement(element: IRElement): string
  renderExpression(expr: IRExpression): string
  renderConditional(cond: IRConditional): string
  renderLoop(loop: IRLoop): string
  renderComponent(comp: IRComponent): string
  renderAsync(node: IRAsync): string

  // Hydration markers
  renderScopeMarker(instanceIdExpr: string): string
  renderSlotMarker(slotId: string): string
  renderCondMarker(condId: string): string

  // Type generation (for typed languages)
  generateTypes?(ir: ComponentIR): string | null

  /**
   * Generate the SSR declaration block for the user's reactive bindings
   * (signals, memos, locally-declared functions/constants) at the top
   * of the rendered component body.
   *
   * Only adapters whose target is a JS runtime — Hono and the test
   * adapter — implement this. The shared `JsxAdapter` base class owns
   * the implementation; adapters that extend `JsxAdapter` pick it up
   * transparently.
   *
   * DSL adapters (Go template, Mojolicious) leave this `undefined` by
   * design: their target languages never declare the user's reactive
   * bindings inside the template body. Instead, signal/memo values
   * reach the template via target-language-native mechanisms (Go
   * struct fields built by `collectStaticChildInstances`, Mojo stash
   * variables threaded from the controller). Surfacing this divergence
   * as an optional interface method makes "DSL adapters do not declare
   * signal inits" type-visible — previously it was hidden inside the
   * `JsxAdapter` inheritance branch.
   */
  generateSignalInitializers?(ir: ComponentIR, body: string): string
}

// Base class with common functionality
export abstract class BaseAdapter implements TemplateAdapter {
  abstract name: string
  abstract extension: string

  abstract generate(ir: ComponentIR, options?: AdapterGenerateOptions): AdapterOutput
  abstract renderNode(node: IRNode): string
  abstract renderElement(element: IRElement): string
  abstract renderExpression(expr: IRExpression): string
  abstract renderConditional(cond: IRConditional): string
  abstract renderLoop(loop: IRLoop): string
  abstract renderComponent(comp: IRComponent): string
  abstract renderScopeMarker(instanceIdExpr: string): string
  abstract renderSlotMarker(slotId: string): string
  abstract renderCondMarker(condId: string): string

  renderChildren(children: IRNode[]): string {
    return children.map((child) => this.renderNode(child)).join('')
  }

  /** Default: render fallback + children inline (no streaming). Override for streaming support. */
  renderAsync(node: IRAsync): string {
    return this.renderNode(node.fallback) + this.renderChildren(node.children)
  }
}

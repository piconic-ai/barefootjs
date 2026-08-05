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
  /**
   * Ordered list of fully-resolved, absolute URLs to emit as ES module
   * script registrations, in array order. When present (including the
   * empty array `[]`), this **fully supersedes** the adapter-computed
   * `clientJsBasePath` / `barefootJsPath` / `scriptBaseName` computation
   * that adapters otherwise use to bake exactly two script URLs (the
   * shared runtime, then the component's own `.client.js`) at codegen
   * time.
   *
   * Exists for callers — chiefly the Vite plugin — that only learn the
   * real script URLs after bundling: under Vite, filenames are content-
   * hashed, the runtime is not a separately-registered script (it
   * arrives as an ESM import of a shared chunk pulled in by the
   * component's own entry), and the number of scripts a component needs
   * is not fixed at two. The caller is responsible for all of that
   * resolution — including any dev-server client script and the
   * component's own entry — and hands the adapter a plain, ordered URL
   * list to register verbatim.
   *
   * `undefined` (the default) means "fall back to the adapter-computed
   * paths" — this is a purely additive option; every existing caller
   * that never sets it keeps byte-identical output. An empty array is
   * semantically distinct from `undefined`: it means "this component
   * needs no script registrations at all" (e.g. the caller determined
   * the component has no client interactivity), whereas `undefined`
   * means "adapter, please decide using the computed path options."
   *
   * `skipScriptRegistration: true` still wins over this unconditionally
   * — it means "a parent/caller will register scripts for me", which
   * takes precedence regardless of what `scriptAssets` says.
   */
  scriptAssets?: string[]
  /**
   * Ordered list of fully-resolved, absolute URLs to emit as
   * `<link rel="modulepreload">` hints, in array order, alongside the
   * `<script type="module">` registrations driven by `scriptAssets`.
   *
   * These are the chunks the entry pulls in **transitively** — not the
   * entry's own file, which is already covered by `scriptAssets`. Under
   * Vite, a component's entry chunk is rarely a leaf: it imports the
   * shared `@barefootjs/client` runtime chunk and, for a parent that
   * renders a child island, the child's own entry chunk. Left alone, the
   * browser only discovers those imports after it has fetched and parsed
   * the entry — a second sequential round trip before the component can
   * hydrate. A preload hint issued up front collapses that into one wave.
   *
   * `undefined` (the default) means "the caller has no preload
   * information" — adapters emit nothing, exactly like the
   * `clientJsBasePath`-computed path never emitted preloads before this
   * option existed. An empty array is semantically distinct: it means
   * "resolved, and there is nothing to preload" (e.g. the entry is a
   * leaf with no transitive imports) — also emits nothing, but for a
   * different reason, mirroring the `undefined`/`[]` distinction on
   * `scriptAssets`.
   *
   * Only meaningful alongside a non-empty `scriptAssets` — there is
   * nothing to preload ahead of if nothing is being registered.
   * `skipScriptRegistration: true` still wins over this unconditionally,
   * exactly as it does over `scriptAssets`.
   */
  preloadAssets?: string[]
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

/**
 * BarefootJS ERB (Embedded Ruby) Template Adapter
 *
 * Generates ERB template files (.erb) from BarefootJS IR. Ported from the
 * Mojolicious EP adapter (`@barefootjs/mojolicious`) — EP (Embedded Perl)
 * maps 1:1 onto ERB (Embedded Ruby) for control flow and hydration-marker
 * shape; the substantive divergences are:
 *
 *   - **Variable model.** Templates receive exactly two locals: `bf`
 *     (runtime) and `v` (vars Hash, symbol keys). Every prop / signal /
 *     memo / module-constant reference lowers to `v[:name]` — never a bare
 *     Ruby local. Perl's uniform `$name` sigil doesn't need this split
 *     (a lexical `my $name` and a stash `$name` render identically); Ruby's
 *     bare-identifier ambiguity (reserved words, leading-uppercase =
 *     constant) is why props/signals/consts move to a Hash instead.
 *     Loop/block params are the one case that stays a bare Ruby local
 *     (`lib/ruby-naming.ts::rubyLocal`).
 *   - **Escaping.** Mojo's `<%= %>` auto-escapes; stdlib ERB does not — every
 *     text/attribute-value interpolation that was a plain mojo `<%= %>`
 *     becomes ERB `<%= bf.h(...) %>`. Every *raw* mojo `<%== %>` (runtime
 *     helper output, already HTML) becomes a plain ERB `<%= %>` (no `bf.h`
 *     — the plan's blanket EP→ERB mapping rule, applied mechanically
 *     everywhere so there's exactly one place to audit for escaping bugs).
 *   - **Ruby truthiness.** Ruby's falsy set is only `nil`/`false` — JS's is
 *     `false, 0, NaN, "", null/undefined`. Every JS conditional TEST (`if`,
 *     `&&`, `||`, `!`, `?:`) wraps in `bf.truthy?(...)`; ERB conditionals
 *     wrap the same way. See `expr/emitters.ts`'s file docstring for the
 *     `&&`/`||` operand-returning rewrite this forces.
 *   - **Content capture.** Mojo's `begin %>…<% end` block-capture (for
 *     forwarded JSX children / async fallback) has no ERB syntax analog;
 *     ERB captures by slicing the shared output buffer around the nested
 *     render (see `renderComponent` / `renderAsync`).
 *
 * See `expr/emitters.ts`, `expr/operand.ts`, and `lib/ruby-naming.ts` for
 * the rest of the Perl→Ruby emission-contract detail.
 */

import type {
  ComponentIR,
  IRMetadata,
  IRNode,
  IRElement,
  IRText,
  IRExpression,
  IRConditional,
  IRLoop,
  IRComponent,
  IRFragment,
  IRSlot,
  IRIfStatement,
  IRProvider,
  IRAsync,
  IRProp,
  IRTemplatePart,
  AttrValue,
  CompilerError,
  TypeInfo,
  TemplatePrimitiveRegistry,
} from '@barefootjs/jsx'
import {
  BaseAdapter,
  type AdapterOutput,
  type AdapterGenerateOptions,
  type TemplateSections,
  type IRNodeEmitter,
  type EmitIRNode,
  type AttrValueEmitter,
  isBooleanAttr,
  parseExpression,
  stringifyParsedExpr,
  parseStyleObjectEntries,
  isSupported,
  exprToString,
  parseProviderObjectLiteral,
  emitParsedExpr,
  emitIRNode,
  emitAttrValue,
  augmentInheritedPropAccesses,
  parseRecordIndexAccess,
  extractArrowBodyExpression,
  collectContextConsumers,
  isLowerableObjectRestDestructure,
  type ContextConsumer,
  collectModuleStringConsts,
  lookupStaticRecordLiteral,
  searchParamsLocalNames,
  prepareLoweringMatchers,
  queryHrefArgs,
  sortComparatorFromArrow,
} from '@barefootjs/jsx'
import { isAriaBooleanAttr, isBooleanResultExpr, isExplicitStringCall } from './boolean-result.ts'
import type { ParsedExpr, LoweringMatcher } from '@barefootjs/jsx'
import { BF_SLOT, BF_COND, BF_REGION } from '@barefootjs/shared'

import type { ErbRenderCtx } from './lib/types.ts'
import { ERB_PRIMITIVE_EMIT_MAP } from './lib/constants.ts'
import {
  rubyLocal,
  rubyStringLiteral,
  rubySymbolKey,
  rubySymbolLiteral,
  rubyIdentifierFromMarkerId,
} from './lib/ruby-naming.ts'
import {
  resolveJsxChildrenProp,
  collectRootScopeNodes,
} from './lib/ir-scope.ts'
import { renderSortMethod, renderSortEval } from './expr/array-method.ts'
import { ErbFilterEmitter, ErbTopLevelEmitter } from './expr/emitters.ts'
import type { ErbEmitContext, ErbSpreadContext, ErbMemoContext } from './emit-context.ts'
import {
  hasClientInteractivity,
  collectImportedLoopChildComponentErrors,
} from './analysis/component-tree.ts'
import {
  conditionalSpreadToRuby,
  objectLiteralExprToRubyHash,
} from './spread/spread-codegen.ts'
import {
  generateContextConsumerSeed,
  generateDerivedMemoSeed,
} from './memo/seed.ts'
import {
  collectProviderDataNames,
  collectBooleanTypedProps,
  collectNullableOptionalProps,
  collectStringValueNames,
} from './props/prop-classes.ts'

export type { ErbAdapterOptions } from './lib/types.ts'
import type { ErbAdapterOptions } from './lib/types.ts'

export class ErbAdapter extends BaseAdapter implements IRNodeEmitter<ErbRenderCtx> {
  name = 'erb'
  extension = '.erb'
  templatesPerComponent = true
  // Template-string target with no component layer: `bf build` emits a
  // static `barefoot-importmap.html` to include in the page <head>, same as
  // the Mojo/Go adapters.
  importMapInjection = 'html-snippet' as const

  /**
   * Identifier-path callees the ERB runtime can render in template scope.
   * The relocate pass consults this map to mark matching calls as
   * template-safe so the surrounding expression stays inlinable; the SSR
   * template emitter substitutes the JS call with the registered Ruby
   * helper invocation.
   */
  templatePrimitives: TemplatePrimitiveRegistry = ERB_PRIMITIVE_EMIT_MAP

  private componentName: string = ''
  /** The component's root scope element(s) — each carries `data-key` for a
   *  keyed loop item (set by the child renderer from the JSX `key` prop). A
   *  plain element root is a single node; an `if-statement` (early-return)
   *  root contributes the top element of every branch, since any one of
   *  them can be the rendered root at runtime. */
  private rootScopeNodes: Set<IRNode> = new Set()
  private options: Required<ErbAdapterOptions>
  private errors: CompilerError[] = []
  private inLoop: boolean = false
  /**
   * SolidJS-style props identifier (`function(props: P)`) and the
   * analyzer-extracted prop names. Stashed at `generate()` entry so the
   * per-attribute `emitSpread` callback can build a propsObject spread bag
   * as an inline Ruby Hash literal without re-walking the IR.
   */
  private propsObjectName: string | null = null
  private propsParams: { name: string }[] = []
  private booleanTypedProps: Set<string> = new Set()
  /**
   * Names that resolve to a real SSR template var (via `v[:name]`) — prop
   * param, signal getter, or memo. A `<Ctx.Provider value>` member
   * referencing a name NOT in this set is a client-only function (a local
   * handler const, or a signal setter) with no SSR value: it would read an
   * un-seeded vars-Hash key, so it's lowered to `nil` instead.
   */
  private providerDataNames: Set<string> = new Set()
  /**
   * Names (signal getters + props) whose value is a string. Ruby's `==`
   * doesn't drive equality-operator selection the way Perl's `eq`/`ne`
   * split does (see `props/prop-classes.ts`), but this set still gates
   * index-access Hash-vs-Array lowering (`expr/operand.ts`).
   */
  private stringValueNames: Set<string> = new Set()
  /**
   * Local binding names the request-scoped `searchParams()` env signal is
   * imported under (handles `import { searchParams as sp }`). When
   * non-empty the emitter lowers a `<binding>().get(k)` call to a real
   * method call on the reserved `v[:search_params]` reader instead of the
   * generic Hash lookup. Set at `generate()` entry from `ir.metadata.imports`;
   * read by the top-level ParsedExpr emitter.
   */
  private _searchParamsLocals: Set<string> = new Set()

  /**
   * Call-lowering matchers active for this component. Bound at
   * `generate()` entry via `prepareLoweringMatchers` and read by the
   * top-level emitter. Covers both userland plugins and the compiler's
   * built-in plugins (e.g. `queryHref` → `bf.query`) — one uniform path,
   * no per-API branch.
   */
  private _loweringMatchers: LoweringMatcher[] = []
  /**
   * Module-scope pure string-literal constants (`const X = 'literal'` at
   * file top-level), keyed by name → resolved literal value. Populated at
   * `generate()` entry from `ir.metadata.localConstants`. When an
   * identifier in an expression resolves to one of these, the adapter
   * inlines the literal instead of emitting `v[:X]` against a vars-Hash key
   * that is never seeded (a module const isn't a prop, signal, or local —
   * the value would render empty).
   */
  private moduleStringConsts: Map<string, string> = new Map()
  /**
   * Full local-constant metadata from the entry IR, kept so spread
   * lowering can resolve a bare-identifier spread (`{...sizeAttrs}`) to
   * its initializer text and a `Record[propKey]` spread value to the
   * module-const object literal it indexes. Populated at `generate()`
   * entry alongside `moduleStringConsts`.
   */
  private localConstants: IRMetadata['localConstants'] = []
  /**
   * Names currently bound by an enclosing loop body — the block-param
   * locals `renderLoop` introduces (item, index, per-binding destructure
   * fields) — ref-counted so nested loops compose. This is load-bearing
   * for TWO things in the ERB adapter (more than the Mojo original, which
   * only used it to guard const-inlining): it also decides the
   * fundamental `v[:name]` vs bare-Ruby-local rendering choice in
   * `ErbTopLevelEmitter.identifier` — see `emit-context.ts`'s
   * `isLoopBoundName` docstring for why ERB's two-locals model needs this
   * where Perl's uniform `$name` sigil does not.
   */
  private loopBoundNames: Map<string, number> = new Map()
  /**
   * Prop names whose value is `nil` in the template body when the caller
   * omits them — so a bare-reference attribute should be dropped rather
   * than rendered as `attr=""`. See `props/prop-classes.ts`'s
   * `collectNullableOptionalProps` for the exact population criterion.
   * Used by `elementAttrEmitter.emitExpression` to guard such an attribute
   * with a Ruby nil-check (`<textarea>` omits `rows`), matching Hono's
   * nullish-attribute omission.
   */
  private nullableOptionalProps: Set<string> = new Set()

  constructor(options: ErbAdapterOptions = {}) {
    super()
    this.options = {
      clientJsBasePath: options.clientJsBasePath ?? '/static/components/',
      barefootJsPath: options.barefootJsPath ?? '/static/components/barefoot.js',
    }
  }

  generate(ir: ComponentIR, options?: AdapterGenerateOptions): AdapterOutput {
    this.componentName = ir.metadata.componentName
    this.propsObjectName = ir.metadata.propsObjectName ?? null
    // Enumerate inherited-attribute accesses for the props-object pattern
    // (`function Checkbox(props: CheckboxProps)`) before deriving
    // `nullableOptionalProps`, so a bare optional attribute like
    // `id={props.id}` gets the Ruby nil-guard (Hono-style omission).
    // Shared with the Go/Mojo adapters (single source of truth in
    // `@barefootjs/jsx`).
    augmentInheritedPropAccesses(ir)
    this.propsParams = ir.metadata.propsParams.map(p => ({ name: p.name }))
    // Per-compile prop classifications (see `props/prop-classes.ts`).
    this.providerDataNames = collectProviderDataNames(ir)
    this.booleanTypedProps = collectBooleanTypedProps(ir)
    this.nullableOptionalProps = collectNullableOptionalProps(ir)
    this.stringValueNames = collectStringValueNames(ir)
    this.moduleStringConsts = collectModuleStringConsts(ir.metadata.localConstants)
    this._searchParamsLocals = searchParamsLocalNames(ir.metadata)
    this._loweringMatchers = prepareLoweringMatchers(ir.metadata)
    this.localConstants = ir.metadata.localConstants ?? []
    this.loopBoundNames.clear()
    this.errors = []
    this.childrenCaptureCounter = 0

    // Mirror of the Go/Mojo adapters' BF103 check: when a child component
    // referenced inside a loop body is imported from a sibling .tsx, the
    // ERB adapter emits a `<%= bf.render_child(...) %>`-style cross-
    // template call that resolves only if the user has compiled the
    // sibling file and registered the resulting template alongside the
    // parent. When that doesn't happen the failure is silent at build time
    // and surfaces at request time — surface it loudly here so the user
    // can act on it. Suppressed when the caller (e.g. the barefoot CLI)
    // guarantees that all sibling templates are registered on the same
    // template instance at render time.
    if (!options?.siblingTemplatesRegistered) {
      this.errors.push(...collectImportedLoopChildComponentErrors(ir, this.componentName))
    }

    this.rootScopeNodes = collectRootScopeNodes(ir.root)
    const templateBody = ir.root.type === 'if-statement'
      ? this.renderIfStatement(ir.root as IRIfStatement)
      : this.renderNode(ir.root)

    // Generate script registration
    const scriptReg = options?.skipScriptRegistration
      ? ''
      : this.generateScriptRegistrations(ir, options?.scriptBaseName)

    // SSR context consumers (`const x = useContext(Ctx)`): seed each local
    // from the active provider value (or the `createContext` default) so
    // the body's `v[:x]` resolves. The provider side pushes the value via
    // `emitProvider`; here the consumer reads it.
    const ctxSeed = generateContextConsumerSeed(ir)

    // Prop/signal-derived memos that aren't statically evaluable (e.g.
    // `createMemo(() => props.value * 10)`) have a `null` SSR default, so
    // their `v[:x]` would render empty. Compute them in-template from the
    // already-seeded prop/signal vars — mirroring Go's generated child
    // constructor that evaluates the memo from the passed prop.
    const memoSeed = generateDerivedMemoSeed(this.memoCtx, ir)

    const template = `${scriptReg}${ctxSeed}${memoSeed}${templateBody}\n`

    // Merge collected errors into IR errors
    if (this.errors.length > 0) {
      ir.errors.push(...this.errors)
    }

    // ERB templates have no JS-style imports / types / default-export
    // sections. The `templatesPerComponent` mode emits one file per
    // component using the raw `template` value; sections are populated for
    // contract uniformity so the compiler never has to fall back to
    // string-parsing the template.
    const sections: TemplateSections = {
      imports: '',
      types: '',
      component: template,
      defaultExport: '',
    }

    return {
      template,
      sections,
      extension: this.extension,
    }
  }

  /**
   * Whether `expr` is a bare reference to a boolean-TYPED prop
   * (`props.isActive` / destructured `isActive`) — used to route the
   * binding through `bool_str` even though the expression itself is
   * structurally opaque.
   */
  isBooleanTypedPropRef(expr: string): boolean {
    let bare = expr.trim()
    if (this.propsObjectName && bare.startsWith(`${this.propsObjectName}.`)) {
      bare = bare.slice(this.propsObjectName.length + 1)
    }
    if (!/^[A-Za-z_$][\w$]*$/.test(bare)) return false
    return this.booleanTypedProps.has(bare)
  }

  /**
   * Whether an attribute-value expression should route through
   * `bf.bool_str` (single source of truth for all three attribute-emission
   * call sites that make this decision). Three witnesses (any one
   * suffices): the JS source structurally evaluates to a boolean
   * (`isBooleanResultExpr`), the attribute name is one of the ARIA
   * true/false(/mixed) names (`isAriaBooleanAttr` — the expression itself
   * may be opaque, e.g. `accepted()`), or the expression is a bare
   * reference to a boolean-TYPED prop (`isBooleanTypedPropRef`).
   *
   * EXCEPT when the expression is already a top-level `String(...)` call
   * (`isExplicitStringCall`): `convertExpressionToRuby` lowers that to
   * `bf.string(...)`, which for a real boolean already returns the
   * JS-correct `"true"`/`"false"` text — wrapping that STRING in
   * `bf.bool_str` again is a bug (Ruby has no falsy-string, so
   * `bf.bool_str("false")` always returns `"true"`), not a harmless
   * no-op. See `isExplicitStringCall`'s docstring for the full
   * Perl-vs-Ruby truthiness contrast.
   */
  private shouldWrapBoolStr(expr: string, name: string): boolean {
    if (isExplicitStringCall(expr)) return false
    return isBooleanResultExpr(expr) || isAriaBooleanAttr(name) || this.isBooleanTypedPropRef(expr)
  }

  /**
   * Parse `cond ? value : undefined` (or `: null`), returning the
   * condition/consequent source spans, else `null`. Used for the
   * attribute-omission rule; mirrors the Mojo/Xslate adapters.
   */
  parseUndefinedAlternateTernary(
    expr: string,
  ): { condition: string; consequent: string } | null {
    const parsed = parseExpression(expr.trim())
    if (parsed?.kind !== 'conditional') return null
    const alt = parsed.alternate
    const isUndef =
      (alt.kind === 'identifier' && (alt.name === 'undefined' || alt.name === 'null')) ||
      (alt.kind === 'literal' && (alt.value === null || alt.value === undefined))
    if (!isUndef) return null
    // Serialise the parsed sub-expressions back to JS source rather than
    // slicing `expr` text — `indexOf('?')` / `lastIndexOf(':')` would
    // mis-split when the consequent itself contains `?` / `:` inside a
    // string or nested ternary (`cond ? 'a:b' : undefined`).
    return {
      condition: exprToString(parsed.test),
      consequent: exprToString(parsed.consequent),
    }
  }

  /**
   * Inline a const (any scope) whose initializer is a pure numeric or
   * quoted string literal (`const totalPages = 5`) — function-scope
   * consts never reach the per-render vars Hash, so a bare `v[:totalPages]`
   * would read nil.
   */
  private resolveLiteralConst(name: string): string | null {
    if (this.loopBoundNames?.has?.(name)) return null
    const c = (this.localConstants ?? []).find(lc => lc.name === name)
    if (c?.value === undefined) return null
    const v = c.value.trim()
    if (/^-?\d+(\.\d+)?$/.test(v)) return v
    const strLit = /^'([^'\\]*)'$/.exec(v) ?? /^"([^"\\]*)"$/.exec(v)
    if (strLit) return rubyStringLiteral(strLit[1])
    return null
  }

  private resolveStaticRecordLiteral(objectName: string, key: string): string | null {
    if (this.loopBoundNames?.has?.(objectName)) return null
    const hit = lookupStaticRecordLiteral(objectName, key, this.localConstants)
    if (!hit) return null
    return hit.kind === 'number' ? hit.text : rubyStringLiteral(hit.text)
  }

  private resolveModuleStringConst(name: string): string | null {
    // A loop body introduces block-param bindings that shadow a module
    // const of the same name — never inline inside one.
    if (this.loopBoundNames.has(name)) return null
    const value = this.moduleStringConsts.get(name)
    if (value === undefined) return null
    return rubyStringLiteral(value)
  }

  /** Whether `name` currently names a loop-bound Ruby local. See
   *  `ErbEmitContext.isLoopBoundName`'s docstring. */
  private isLoopBoundName(name: string): boolean {
    return this.loopBoundNames.has(name)
  }

  // ===========================================================================
  // Script Registration
  // ===========================================================================

  private generateScriptRegistrations(ir: ComponentIR, scriptBaseName?: string): string {
    const hasInteractivity = hasClientInteractivity(ir)
    if (!hasInteractivity) return ''

    const name = scriptBaseName ?? ir.metadata.componentName
    const runtimePath = this.options.barefootJsPath
    const clientJsPath = `${this.options.clientJsBasePath}${name}.client.js`

    const lines: string[] = []
    lines.push(`<%- bf.register_script('${runtimePath}') -%>`)
    lines.push(`<%- bf.register_script('${clientJsPath}') -%>`)
    lines.push('')
    return lines.join('\n')
  }

  // ===========================================================================
  // Node Rendering
  // ===========================================================================

  /**
   * Public entry point for node rendering. Delegates to the shared
   * `IRNodeEmitter` dispatcher; per-kind logic lives in the
   * `IRNodeEmitter` methods below.
   */
  renderNode(node: IRNode): string {
    return emitIRNode<ErbRenderCtx>(node, this, {} as ErbRenderCtx)
  }

  // ===========================================================================
  // IRNodeEmitter implementation (ERB / Ruby)
  // ===========================================================================

  emitElement(node: IRElement, _ctx: ErbRenderCtx, _emit: EmitIRNode<ErbRenderCtx>): string {
    return this.renderElement(node)
  }

  emitText(node: IRText): string {
    return node.value
  }

  emitExpression(node: IRExpression): string {
    return this.renderExpression(node)
  }

  emitConditional(node: IRConditional, _ctx: ErbRenderCtx, _emit: EmitIRNode<ErbRenderCtx>): string {
    return this.renderConditional(node)
  }

  emitLoop(node: IRLoop, _ctx: ErbRenderCtx, _emit: EmitIRNode<ErbRenderCtx>): string {
    return this.renderLoop(node)
  }

  emitComponent(node: IRComponent, _ctx: ErbRenderCtx, _emit: EmitIRNode<ErbRenderCtx>): string {
    return this.renderComponent(node)
  }

  emitFragment(node: IRFragment, _ctx: ErbRenderCtx, _emit: EmitIRNode<ErbRenderCtx>): string {
    return this.renderFragment(node)
  }

  emitSlot(node: IRSlot): string {
    return this.renderSlot(node)
  }

  emitIfStatement(node: IRIfStatement, _ctx: ErbRenderCtx, _emit: EmitIRNode<ErbRenderCtx>): string {
    return this.renderIfStatement(node)
  }

  emitProvider(node: IRProvider, _ctx: ErbRenderCtx, _emit: EmitIRNode<ErbRenderCtx>): string {
    // SSR context propagation: push the provider value onto the shared
    // controller context stack, render the children (descendant
    // `useContext` consumers read it via `bf.use_context`), then pop. The
    // push/pop bracket the children in the same render so the value scopes
    // exactly to the subtree — mirroring the client `provideContext`.
    // Both calls are actions (no output) — trimmed non-outputting tags.
    const value = this.providerValueRuby(node.valueProp)
    const children = this.renderChildren(node.children)
    const name = node.contextName
    return (
      `<%- bf.provide_context('${name}', ${value}) -%>` +
      children +
      `<%- bf.revoke_context('${name}') -%>`
    )
  }

  /** Lower a `<Ctx.Provider value>` value prop to a Ruby expression. */
  private providerValueRuby(valueProp: IRProvider['valueProp']): string {
    const v = valueProp.value
    if (v.kind === 'literal') {
      return typeof v.value === 'string' ? rubyStringLiteral(v.value) : String(v.value)
    }
    if (v.kind === 'expression') {
      const hashRuby = this.providerObjectLiteralRuby(v.expr)
      if (hashRuby !== null) return hashRuby
      return this.convertExpressionToRuby(v.expr)
    }
    if (v.kind === 'template') return this.convertTemplateLiteralPartsToRuby(v.parts)
    // Out-of-shape value (spread / jsx-children) — render as nil rather
    // than emit invalid Ruby; the consumer falls back to its default.
    return 'nil'
  }

  /**
   * Lower an object-literal provider value (`value={{ open: () => props.open
   * ?? false, onOpenChange: … }}`) to a Ruby Hash. The SSR lowering is a
   * per-member snapshot of what a consumer would READ during the same
   * render:
   *
   * - zero-param expression-body arrows are getters — lower the body (the
   *   value is fixed for the render, so the call-time indirection drops out)
   * - `on[A-Z]`-named members and function-shaped values are client-only
   *   behavior SSR never invokes — lower to `nil`
   * - anything else lowers through the normal expression pipeline (so an
   *   unsupported getter body still refuses loudly with BF101)
   *
   * Keys keep their JS names verbatim (as symbol keys) so a consumer-side
   * `ctx.open` access maps onto the same key. Returns `null` when the
   * expression is not a plain object literal (spread / computed key) — the
   * caller falls back to the whole-expression path, which refuses those
   * shapes with BF101.
   */
  private providerObjectLiteralRuby(expr: string): string | null {
    const members = parseProviderObjectLiteral(expr.trim())
    if (members === null) return null
    const entries = members.map(m => {
      const key = rubySymbolKey(m.name)
      if (m.kind === 'function' || /^on[A-Z]/.test(m.name)) return `${key} nil`
      const src = m.kind === 'getter' ? m.body : m.expr
      // A member whose value is a bare identifier that doesn't resolve to
      // a prop/signal/memo is a client-only function reference (a local
      // handler const like `scrollPrev`, or a signal setter like
      // `setCanScrollPrev`) — no SSR value, and emitting `v[:scrollPrev]`
      // would read an un-seeded vars-Hash key. Lower to nil.
      if (this.isClientOnlyContextIdentifier(src)) return `${key} nil`
      return `${key} ${this.convertExpressionToRuby(src)}`
    })
    return `{ ${entries.join(', ')} }`
  }

  /**
   * True when `src` is a bare identifier that doesn't resolve to a
   * prop/signal/memo or an SSR-inlinable module string const — i.e. a
   * client-only function reference in a context value (a local handler
   * const like `scrollPrev`, or a signal setter like `setCanScrollPrev`).
   * See `providerDataNames`. Module-scope string consts (`carouselClasses`)
   * ARE SSR-resolvable via `moduleStringConsts`, so they're excluded here.
   */
  private isClientOnlyContextIdentifier(src: string): boolean {
    const t = src.trim()
    if (!/^[A-Za-z_$][\w$]*$/.test(t)) return false
    return !this.providerDataNames.has(t) && !this.moduleStringConsts.has(t)
  }

  emitAsync(node: IRAsync, _ctx: ErbRenderCtx, _emit: EmitIRNode<ErbRenderCtx>): string {
    return this.renderAsync(node)
  }

  // ===========================================================================
  // Element Rendering
  // ===========================================================================

  renderElement(element: IRElement): string {
    const tag = element.tag
    const attrs = this.renderAttributes(element)
    const children = this.renderChildren(element.children)

    let hydrationAttrs = ''
    if (element.needsScope) {
      hydrationAttrs += ` ${this.renderScopeMarker('')}`
    }
    // A root scope element carries `data-key` for a keyed loop item
    // (emitted from the bf instance; the child renderer sets it from the
    // JSX `key` prop), so a non-keyed render adds nothing. Mirrors Hono
    // stamping data-key on each loop item's scope root, including
    // early-return (if-statement) roots where every branch's top element
    // qualifies.
    if (this.rootScopeNodes.has(element) && element.needsScope) {
      hydrationAttrs += ` <%= bf.data_key_attr %>`
    }
    if (element.slotId) {
      hydrationAttrs += ` ${this.renderSlotMarker(element.slotId)}`
    }
    // Page-lifecycle boundary lowered from `<Region>` (spec/router.md). The
    // id is a deterministic static string (`<file scope>:<index>`), so it
    // emits as a plain literal attribute — no ERB tag.
    if (element.regionId) {
      hydrationAttrs += ` ${BF_REGION}="${element.regionId}"`
    }

    const voidElements = [
      'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
      'link', 'meta', 'param', 'source', 'track', 'wbr',
    ]

    if (voidElements.includes(tag.toLowerCase())) {
      return `<${tag}${attrs}${hydrationAttrs}>`
    }

    return `<${tag}${attrs}${hydrationAttrs}>${children}</${tag}>`
  }

  // ===========================================================================
  // Expression Rendering
  // ===========================================================================

  renderExpression(expr: IRExpression): string {
    if (expr.clientOnly) {
      if (expr.slotId) {
        return `<%= bf.comment("client:${expr.slotId}") %>`
      }
      return ''
    }

    const rubyExpr = this.convertExpressionToRuby(expr.expr)

    // A bare read of the `children` prop (`{children}` / `{props.children}`,
    // optionally `?? fallback`) is pre-rendered HTML — captured via the
    // ERB output-buffer slice in `renderComponent` when THIS component was
    // itself invoked as a child, or materialized by `Context#render_child`
    // before the registered renderer runs. Mojo / Xslate don't need this
    // check: their runtimes bless the captured value itself (Mojo::ByteStream
    // / Kolon's `mark_raw`), so any later `<%= %>`/`<: :>` auto-escape
    // dispatches on the VALUE and skips already-raw content transparently.
    // Stdlib ERB's `<%=` has no such wrapper type (see
    // `BarefootJS::Backend::Erb#mark_raw`'s docstring — "there is nothing to
    // opt out of"), so the ADAPTER must decide raw-vs-escaped at this call
    // site instead: every other raw-HTML position (component forwarding,
    // spread_attrs, hydration markers) already routes around `bf.h`
    // structurally; a component reading its OWN `children` back as a text
    // expression was the one position still falling through the generic
    // escape-everything path. Emitting the same `bf.h(...)` wrap here would
    // double-encode markup the runtime already rendered.
    const wrapped = this.isChildrenValueExpr(expr) ? rubyExpr : `bf.h(${rubyExpr})`

    if (expr.slotId) {
      return `<%= bf.text_start("${expr.slotId}") %><%= ${wrapped} %><%= bf.text_end %>`
    }

    return `<%= ${wrapped} %>`
  }

  /**
   * True when `expr` is a structural read of the `children` prop: a bare
   * `children` identifier, `props.children` / `<propsObjectName>.children`,
   * or either of those on the left of a `?? fallback`. Prefers the IR's
   * already-parsed `expr.parsed` tree (attached once during IR construction)
   * and falls back to parsing `expr.expr` only when that's absent — never a
   * regex/string scan of the source text.
   */
  private isChildrenValueExpr(expr: IRExpression): boolean {
    const parsed = expr.parsed ?? parseExpression(expr.expr.trim()) ?? undefined
    return this.isChildrenReferenceParsedExpr(parsed)
  }

  private isChildrenReferenceParsedExpr(parsed: ParsedExpr | undefined): boolean {
    if (!parsed) return false
    if (parsed.kind === 'logical' && parsed.op === '??') {
      return this.isChildrenReferenceParsedExpr(parsed.left)
    }
    if (parsed.kind === 'identifier') return parsed.name === 'children'
    if (parsed.kind === 'member' && !parsed.computed && parsed.property === 'children') {
      return (
        parsed.object.kind === 'identifier' &&
        (parsed.object.name === 'props' ||
          (this.propsObjectName !== null && parsed.object.name === this.propsObjectName))
      )
    }
    return false
  }

  // ===========================================================================
  // Conditional Rendering
  // ===========================================================================

  renderConditional(cond: IRConditional): string {
    if (cond.clientOnly && cond.slotId) {
      return `<%= bf.comment("cond-start:${cond.slotId}") %><%= bf.comment("cond-end:${cond.slotId}") %>`
    }

    const condition = this.convertExpressionToRuby(cond.condition)
    const whenTrue = this.renderNode(cond.whenTrue)
    const whenFalse = this.renderNodeOrNull(cond.whenFalse)

    // When slotId is present, add bf-c marker.
    // Use comment markers for fragments (multiple sibling elements), attribute for single elements.
    const isFragmentBranch = cond.whenTrue.type === 'fragment' || cond.whenFalse.type === 'fragment'
    const useCommentMarkers = cond.slotId && isFragmentBranch

    let markedTrue = whenTrue
    let markedFalse = whenFalse
    if (cond.slotId && !useCommentMarkers) {
      markedTrue = this.addCondMarkerToFirstElement(whenTrue, cond.slotId)
      markedFalse = whenFalse ? this.addCondMarkerToFirstElement(whenFalse, cond.slotId) : whenFalse
    }

    let result: string
    if (useCommentMarkers) {
      // Fragment branches: use comment markers
      const inner = whenFalse
        ? `\n<%- if bf.truthy?(${condition}) -%>\n${whenTrue}\n<%- else -%>\n${whenFalse}\n<%- end -%>\n`
        : `\n<%- if bf.truthy?(${condition}) -%>\n${whenTrue}\n<%- end -%>\n`
      result = `<%= bf.comment("cond-start:${cond.slotId}") %>${inner}<%= bf.comment("cond-end:${cond.slotId}") %>`
    } else if (markedFalse) {
      result = `\n<%- if bf.truthy?(${condition}) -%>\n${markedTrue}\n<%- else -%>\n${markedFalse}\n<%- end -%>\n`
    } else if (cond.slotId) {
      // Conditional with no else: wrap with comment markers for client hydration
      result = `<%= bf.comment("cond-start:${cond.slotId}") %>\n<%- if bf.truthy?(${condition}) -%>\n${whenTrue}\n<%- end -%>\n<%= bf.comment("cond-end:${cond.slotId}") %>`
    } else {
      result = `\n<%- if bf.truthy?(${condition}) -%>\n${whenTrue}\n<%- end -%>\n`
    }

    return result
  }

  private renderNodeOrNull(node: IRNode): string | null {
    if (node.type === 'expression' && (node.expr === 'null' || node.expr === 'undefined')) {
      return null
    }
    return this.renderNode(node)
  }

  /**
   * Add bf-c attribute to the first HTML element in a branch. If no element
   * found, wrap with comment markers. Operates on already-emitted ERB
   * template TEXT (not JS/TS source), matching the Mojo/Go adapters'
   * identical marker-injection precedent.
   */
  private addCondMarkerToFirstElement(content: string, condId: string): string {
    const match = content.match(/^(<\w+)([\s>])/)
    if (match) {
      return content.replace(/^(<\w+)([\s>])/, `$1 ${BF_COND}="${condId}"$2`)
    }
    // Fall back to comment markers for non-element content
    return `<%= bf.comment("cond-start:${condId}") %>${content}<%= bf.comment("cond-end:${condId}") %>`
  }

  // ===========================================================================
  // Loop Rendering
  // ===========================================================================

  renderLoop(loop: IRLoop): string {
    // clientOnly loops must not render items at SSR time, but must still
    // emit the `loop:`/`/loop:` boundary marker pair (Hono and Go parity)
    // so the client runtime's mapArray() can locate the insertion anchor
    // when hydrating the array. The marker id disambiguates sibling
    // `.map()` calls under the same parent.
    if (loop.clientOnly) {
      return `<%= bf.comment("loop:${loop.markerId}") %><%= bf.comment("/loop:${loop.markerId}") %>`
    }

    // An array/object-destructure loop param (`([emoji, users]) => ...` or
    // `({ name, age }) => ...`) lowers to invalid Ruby block-param syntax in
    // general — the adapter would otherwise need `|[emoji, users]|`-shaped
    // destructuring the IR doesn't carry structurally for every case. A
    // destructure loop param IS lowerable for the object-rest / simple-field
    // shape (`.map(({ id, title, ...rest }) => …)`, `rest` read via member
    // access): each binding becomes a Ruby local off the per-item Hash, so
    // the body's `id` / `rest[:flag]` resolve natively. Array-index / nested
    // / rest-spread shapes still can't unpack into scalar locals → BF104.
    const destructure = !!(loop.paramBindings && loop.paramBindings.length > 0)
    const supportableDestructure = destructure && isLowerableObjectRestDestructure(loop)
    if (destructure && !supportableDestructure) {
      this.errors.push({
        code: 'BF104',
        severity: 'error',
        message: `Loop callback uses an array/object destructure pattern (\`${loop.param}\`) that the ERB adapter cannot lower — Ruby local bindings can't unpack a tuple in a single assignment.`,
        loc: loop.loc ?? { file: this.componentName + '.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
        suggestion: {
          message:
            `Options:\n` +
            `  1. Rename the parameter to a single name and access tuple elements with index syntax in the body (e.g. \`entry => entry[0]\` instead of \`([k, v]) => ...\`).\n` +
            `  2. Mark the loop position as @client-only so the destructure runs in JS on the client.\n` +
            `  3. Move the loop into a primitive that the adapter registers explicitly.`,
        },
      })
    }

    const rawArray = this.convertExpressionToRuby(loop.array)
    // Apply sort if present: hoist the (possibly sorted) array into a Ruby
    // local BEFORE the index loop, so both the loop bound and the per-item
    // lookup reference the same materialised array — otherwise a sort
    // helper call spliced into both spots would run twice per render.
    let sortedHoist: string | null = null
    let array = rawArray
    if (loop.sortComparator) {
      sortedHoist = `bf_iter_${rubyIdentifierFromMarkerId(loop.markerId)}`
      array = sortedHoist
    }
    const param = loop.param
    // `.keys().map(k => ...)` — the callback param is the index. Use it as
    // the loop's index local and skip the per-item value assignment.
    const indexVar = loop.iterationShape === 'keys'
      ? rubyLocal(param)
      : rubyLocal(loop.index ?? '_i')
    // Names this loop binds in body scope. Guard module-const inlining (and,
    // in ERB, the fundamental v[:name]-vs-local rendering choice) for the
    // whole body (children + key + filter) so a same-named loop variable
    // isn't replaced by the const literal / a vars-Hash read. Ref-counted
    // for nested loops; released after the body lines are assembled below.
    const loopBound = loop.iterationShape === 'keys'
      ? [param]
      : supportableDestructure
        ? ['__bf_item', ...(loop.paramBindings ?? []).map(b => b.name), loop.index ?? '_i']
        : [param, loop.index ?? '_i']
    for (const n of loopBound) {
      this.loopBoundNames.set(n, (this.loopBoundNames.get(n) ?? 0) + 1)
    }
    const prevInLoop = this.inLoop
    this.inLoop = true
    const renderedChildren = this.renderChildren(loop.children)
    this.inLoop = prevInLoop

    // Whole-item conditional: prepend an always-present
    // `<!--bf-loop-i:KEY-->` anchor before each item's (possibly empty)
    // conditional content so the client's `mapArrayAnchored` can hydrate
    // every SSR-rendered item by its anchor. `bf.comment` prepends `bf-`,
    // so `"loop-i:" + KEY` yields `<!--bf-loop-i:KEY-->`. `bf.string` keeps
    // the concatenation valid when KEY isn't already a Ruby String.
    const children =
      loop.bodyIsItemConditional && loop.key
        ? `<%= bf.comment("loop-i:" + bf.string(${this.convertExpressionToRuby(loop.key)})) %>\n${renderedChildren}`
        : renderedChildren

    const lines: string[] = []
    // Scoped per-call-site marker so sibling `.map()`s under the same
    // parent each get their own reconciliation range.
    lines.push(`<%= bf.comment("loop:${loop.markerId}") %>`)
    if (sortedHoist && loop.sortComparator) {
      // Evaluator-first: serialize the comparator + emit `bf.sort_eval`;
      // fall back to the structured `bf.sort` for a comparator the
      // evaluator can't model (e.g. `localeCompare`).
      //
      // The hoisted sort runs OUTSIDE this loop, so this loop's bound names
      // must not shadow the comparator's captured free vars while emitting
      // the env — otherwise a captured var that happens to share a
      // loop-param name is blocked from inlining its module const / from
      // reading `v[:name]` and instead resolves to the (out-of-scope) loop
      // local. Drop this loop's bound names for the sort emit, then
      // restore (a nested loop's outer bindings, ref-counted, stay in effect).
      for (const n of loopBound) {
        const c = (this.loopBoundNames.get(n) ?? 1) - 1
        if (c <= 0) this.loopBoundNames.delete(n)
        else this.loopBoundNames.set(n, c)
      }
      const sortEmit = (e: ParsedExpr) => this.convertExpressionToRuby('', e)
      const sortArrow = loop.sortComparator.arrow
      let sorted: string | null = null
      if (sortArrow.kind === 'arrow') {
        sorted = renderSortEval(rawArray, sortArrow.body, sortArrow.params, sortEmit)
      }
      if (sorted === null) {
        const structured = sortComparatorFromArrow(sortArrow)
        if (structured !== null) sorted = renderSortMethod(rawArray, structured)
      }
      if (sorted === null) {
        // Neither the evaluator nor the structured fallback can model this
        // comparator — record BF101 and fall through with the unsorted
        // array so the hoist line stays syntactically valid.
        this._recordExprBF101(
          `.sort(...) loop comparator is not lowerable to a template sort`,
          `Pre-sort the array in the route handler, or mark the loop @client-only.`,
        )
        sorted = rawArray
      }
      for (const n of loopBound) {
        this.loopBoundNames.set(n, (this.loopBoundNames.get(n) ?? 0) + 1)
      }
      lines.push(`<%- ${sortedHoist} = ${sorted} -%>`)
    }
    lines.push(`<%- (0...${array}.length).each do |${indexVar}| -%>`)
    if (loop.iterationShape !== 'keys') {
      if (supportableDestructure) {
        // Per-item local + one local per binding; `rest` aliases the item
        // so `rest[:flag]` resolves (object-rest read via member access).
        lines.push(`<%- __bf_item = ${array}[${indexVar}] -%>`)
        for (const b of loop.paramBindings ?? []) {
          lines.push(
            b.rest
              ? `<%- ${rubyLocal(b.name)} = __bf_item -%>`
              : `<%- ${rubyLocal(b.name)} = __bf_item[${rubySymbolLiteral(b.path.slice(1))}] -%>`,
          )
        }
      } else {
        lines.push(`<%- ${rubyLocal(param)} = ${array}[${indexVar}] -%>`)
      }
    }

    // Handle filter().map() pattern by wrapping children in if-condition
    if (loop.filterPredicate) {
      let filterCond: string
      if (loop.filterPredicate.predicate) {
        // The loop's own (possibly destructure-adjusted) param name IS the
        // filter predicate's parameter for rendering purposes — pass it
        // straight through as the filter emitter's bound param. Ruby's
        // named-block-param model makes the Mojo original's regex
        // `$filterParam → $loopParam` rename unnecessary here: the emitter
        // just renders every reference to the predicate's own arrow
        // parameter AS `param` from the start.
        filterCond = this.renderRubyFilterExpr(loop.filterPredicate.predicate, param)
      } else {
        filterCond = 'true'
      }
      lines.push(`<%- if bf.truthy?(${filterCond}) -%>`)
      lines.push(children)
      lines.push(`<%- end -%>`)
    } else {
      lines.push(children)
    }

    // Body fully rendered — release the loop-bound names.
    for (const n of loopBound) {
      const c = (this.loopBoundNames.get(n) ?? 1) - 1
      if (c <= 0) this.loopBoundNames.delete(n)
      else this.loopBoundNames.set(n, c)
    }

    lines.push(`<%- end -%>`)
    lines.push(`<%= bf.comment("/loop:${loop.markerId}") %>`)

    return lines.join('\n')
  }

  // ===========================================================================
  // Component Rendering
  // ===========================================================================

  /**
   * AttrValue lowering for component invocation props (ERB / Ruby Hash
   * literal form). Routed through the shared dispatcher so a new AttrValue
   * kind becomes a TS compile error here.
   *
   * `jsx-children` returns empty — children are captured via the ERB
   * output-buffer slice below, not threaded through the `render_child`
   * props Hash.
   */
  private readonly componentPropEmitter: AttrValueEmitter = {
    emitLiteral: (value, name) => `${rubySymbolKey(name)} ${rubyStringLiteral(String(value.value))}`,
    emitExpression: (value, name) => {
      // The IR producer collapses component-prop `template` kinds into
      // `expression` for client-runtime reasons but preserves the parsed
      // parts on `v.parts`. Prefer the structured form when available —
      // the bare-expression path can't handle `${MAP[KEY]}` shapes (the JS
      // object literal leaks into the Ruby template).
      if (value.parts) {
        return `${rubySymbolKey(name)} ${this.convertTemplateLiteralPartsToRuby(value.parts)}`
      }
      // Inline object-literal child prop (carousel's `opts={{ align: 'start' }}`):
      // lower to a Ruby Hash so the child can serialize it (`data-opts`),
      // instead of refusing the bare object with BF101. Read the
      // IR-carried structured `ParsedExpr` tree instead of re-parsing
      // `value.expr`; the lowering returns null for any non-object-literal
      // shape, so the common non-object case falls straight through to the
      // bare-expression path below.
      if (value.parsed) {
        const hashRuby = objectLiteralExprToRubyHash(this.spreadCtx, value.parsed)
        if (hashRuby !== null) return `${rubySymbolKey(name)} ${hashRuby}`
      }
      return `${rubySymbolKey(name)} ${this.convertExpressionToRuby(value.expr)}`
    },
    emitSpread: (value) => {
      // Ruby's `**hash` double-splat flattens a Hash's entries into a
      // surrounding Hash literal — the direct analog of Perl's `%{$props}`
      // deref, but native syntax rather than a deref workaround.
      const rubyExpr = this.convertExpressionToRuby(value.expr)
      return `**${rubyExpr}`
    },
    emitTemplate: (value, name) =>
      `${rubySymbolKey(name)} ${this.convertTemplateLiteralPartsToRuby(value.parts)}`,
    emitBooleanAttr: (_value, name) => `${rubySymbolKey(name)} true`,
    emitBooleanShorthand: (_value, name) => `${rubySymbolKey(name)} true`,
    // JSX children flow through the ERB buffer-slice capture below; they're
    // not part of the props Hash.
    emitJsxChildren: () => '',
  }

  renderComponent(comp: IRComponent): string {
    const propParts: string[] = []
    for (const p of comp.props) {
      // Skip callback props (onXxx) and `ref` — both are client-only for
      // SSR (Hono renders neither; the client JS wires them at hydration).
      if ((p.name.match(/^on[A-Z]/) || p.name === 'ref') && p.value.kind === 'expression') continue
      const lowered = emitAttrValue(p.value, this.componentPropEmitter, p.name)
      if (lowered) propParts.push(lowered)
    }
    // Pass slot ID so the child renderer can set correct scope ID for
    // hydration. Skip for loop children — they use ComponentName_random
    // pattern instead.
    if (comp.slotId && !this.inLoop) {
      propParts.push(`${rubySymbolKey('_bf_slot')} '${comp.slotId}'`)
    }
    const tplName = this.toTemplateName(comp.name)
    // Resolve the effective children: a nested `<Box>…</Box>` populates
    // `comp.children`; an attribute-form `<Box children={<jsx/>} />`
    // lands in a `jsx-children` AttrValue on the corresponding prop. The
    // parent's scope marker is already attached to each hoisted root by
    // the IR collector (`needsScope: true`), so the adapter just needs to
    // render the IR through the same children pipeline as the nested form.
    const effectiveChildren: IRNode[] = comp.children.length > 0
      ? comp.children
      : resolveJsxChildrenProp(comp.props)
    if (effectiveChildren.length > 0) {
      // Forward JSX children via an ERB output-buffer slice so dynamic
      // segments inside the children (signals, conditionals) get evaluated
      // in the parent's template scope before reaching the child renderer.
      // Mark the buffer position, render the children inline (they append
      // straight to `_erbout`, the same buffer the surrounding template
      // uses — `ERB.new(src, eoutvar: '_erbout')`), then slice everything
      // appended since the mark back OUT of the buffer into a local. No
      // literal text (not even a newline) may sit between the mark/slice
      // tags and the children — the slice captures byte-for-byte whatever
      // `_erbout` gained in between, so any interposed template text would
      // leak into (or out of) the capture.
      const prevInLoop = this.inLoop
      this.inLoop = false
      const childrenBody = this.renderChildren(effectiveChildren)
      this.inLoop = prevInLoop
      const suffix = comp.slotId ?? `c${this.childrenCaptureCounter++}`
      const lenVar = `__bf_len_${suffix}`
      const capVar = `__bf_children_${suffix}`
      const propsHash = `{ ${[...propParts, `children: ${capVar}`].join(', ')} }`
      return `<% ${lenVar} = _erbout.length %>${childrenBody}<% ${capVar} = _erbout.slice!(${lenVar}..) %><%= bf.render_child('${tplName}', ${propsHash}) %>`
    }
    const propsHash = propParts.length > 0 ? `{ ${propParts.join(', ')} }` : '{}'
    return `<%= bf.render_child('${tplName}', ${propsHash}) %>`
  }

  private childrenCaptureCounter = 0

  private toTemplateName(componentName: string): string {
    // Convert PascalCase to snake_case for ERB template naming
    return componentName
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '')
  }

  // ===========================================================================
  // If-Statement (Conditional Return) Rendering
  // ===========================================================================

  private renderIfStatement(ifStmt: IRIfStatement): string {
    const condition = this.convertExpressionToRuby(ifStmt.condition)
    const consequent = ifStmt.consequent.type === 'if-statement'
      ? this.renderIfStatement(ifStmt.consequent as IRIfStatement)
      : this.renderNode(ifStmt.consequent)
    let result = `<%- if bf.truthy?(${condition}) -%>\n${consequent}\n`

    if (ifStmt.alternate) {
      if (ifStmt.alternate.type === 'if-statement') {
        const altResult = this.renderIfStatement(ifStmt.alternate as IRIfStatement)
        // Replace the leading "<%- if" with "<%- elsif" — operating on
        // already-emitted ERB text we constructed above (the exact literal
        // prefix every `renderIfStatement` call emits), not on JS/TS source.
        result += altResult.replace(/^<%- if /, '<%- elsif ')
      } else {
        const alternate = this.renderNode(ifStmt.alternate)
        result += `<%- else -%>\n${alternate}\n`
      }
    }

    result += `<%- end -%>`
    return result
  }

  // ===========================================================================
  // Fragment & Slot Rendering
  // ===========================================================================

  private renderFragment(fragment: IRFragment): string {
    const children = this.renderChildren(fragment.children)
    if (fragment.needsScopeComment) {
      return `<%= bf.scope_comment %>${children}`
    }
    return children
  }

  private renderSlot(_slot: IRSlot): string {
    // ERB's native layout-content mechanism is `yield` (the partial/layout
    // convention closest to Mojo's implicit `content` helper).
    return `<%= yield %>`
  }

  override renderAsync(node: IRAsync): string {
    const fallback = this.renderNode(node.fallback)
    const children = this.renderChildren(node.children)
    // Use the BarefootJS runtime's streaming helpers for OOS streaming.
    // bf.async_boundary() wraps the fallback in a <div bf-async="aX">
    // placeholder. The resolved content is rendered below for
    // non-streaming fallback; in streaming mode the backend's write_chunk
    // delivers it as a resolve chunk.
    //
    // The fallback is captured via the same output-buffer slice
    // `renderComponent` uses for forwarded children — see that method's
    // docstring for why no literal text may sit between the mark/slice
    // tags and the fallback markup.
    const lenVar = `__bf_alen_${node.id}`
    const fallbackVar = `bf_async_fallback_${node.id}`
    return `<% ${lenVar} = _erbout.length %>${fallback}<% ${fallbackVar} = _erbout.slice!(${lenVar}..) %><%= bf.async_boundary('${node.id}', ${fallbackVar}) %>\n${children}`
  }

  // ===========================================================================
  // Attribute Rendering
  // ===========================================================================

  /**
   * AttrValue lowering for intrinsic-element attributes (ERB template).
   * Routed through the shared dispatcher.
   */
  private readonly elementAttrEmitter: AttrValueEmitter = {
    emitLiteral: (value, name) => `${name}="${value.value}"`,
    emitExpression: (value, name) => {
      // `style={{ … }}` object literal → a CSS string with dynamic values
      // interpolated, instead of refusing the bare object with BF101.
      if (name === 'style') {
        const css = this.tryLowerStyleObject(value.expr)
        if (css !== null) return `style="${css}"`
      }
      // Refuse shapes that have no idiomatic ERB template representation.
      // Tagged-template-literal call expressions (`cn\`base \${tone()}\``)
      // have no idiomatic ERB template form; the Go adapter raises BF101
      // here via `convertExpressionToGo` + `isSupported`. Lift the same
      // gate so the user gets a clear diagnostic instead of broken output.
      if (this.refuseUnsupportedAttrExpression(value.expr, name)) {
        return ''
      }
      // Hono-style nullish-attribute omission (#textarea rows): when the
      // attribute value is a BARE reference to an optional, no-default
      // prop (which reads `nil` when the caller omits it), guard the
      // attribute with a Ruby nil-check so it DROPS rather than rendering
      // `attr=""`. The guarded body reuses the exact normal emission, so
      // value escaping is unchanged; only the presence is conditional.
      const bareId = value.expr.trim()
      // Normalize a props-object access (`props.id`) to its bare prop name
      // (`id`) so the nullable-optional set — keyed by bare name — matches
      // the SolidJS props-object pattern, not just destructured params
      // (#checkbox `id={props.id}`).
      const normalizedBareId =
        this.propsObjectName && bareId.startsWith(`${this.propsObjectName}.`)
          ? bareId.slice(this.propsObjectName.length + 1)
          : bareId
      if (
        !isBooleanAttr(name) &&
        !value.presenceOrUndefined &&
        /^[A-Za-z_$][\w$]*$/.test(normalizedBareId) &&
        this.nullableOptionalProps.has(normalizedBareId)
      ) {
        const ruby = this.convertExpressionToRuby(value.expr)
        const body =
          this.shouldWrapBoolStr(value.expr, name)
            ? `${name}="<%= bf.h(bf.bool_str(${ruby})) %>"`
            : `${name}="<%= bf.h(${ruby}) %>"`
        return `<% if !(${ruby}).nil? %>${body}<% end %>`
      }
      if (isBooleanAttr(name)) {
        // Boolean attributes: render conditionally (present or absent).
        return `<%= bf.truthy?(${this.convertExpressionToRuby(value.expr)}) ? '${name}' : '' %>`
      }
      if (value.presenceOrUndefined) {
        // `attr={expr || undefined}` on a NON-boolean attribute: Hono
        // renders the attr with its stringified value when truthy and
        // omits it otherwise (`aria-disabled={isDisabled() || undefined}`
        // → `aria-disabled="true"`), so bare presence would diverge. Route
        // through `bool_str` when the name/shape witnesses a boolean
        // value, same as the unconditional path below. Bind to a temp
        // first so the expression evaluates once, not in both the guard
        // and the value.
        const ruby = this.convertExpressionToRuby(value.expr)
        const tmp = `__bf_pu${this.presenceVarCounter++}`
        const body =
          this.shouldWrapBoolStr(value.expr, name)
            ? `${name}="<%= bf.h(bf.bool_str(${tmp})) %>"`
            : `${name}="<%= bf.h(${tmp}) %>"`
        return `<% ${tmp} = ${ruby}; if bf.truthy?(${tmp}) %>${body}<% end %>`
      }
      // Boolean-result handling: see `shouldWrapBoolStr`'s docstring for
      // the three wrap witnesses and the `String(...)`-call exception.
      //
      // `attr={cond ? value : undefined}` OMITS the attribute on the falsy
      // branch (Hono drops undefined-valued attributes) — wrap the whole
      // attribute in the condition instead of rendering `attr=""`.
      {
        const m = this.parseUndefinedAlternateTernary(value.expr)
        if (m) {
          const cond = this.convertExpressionToRuby(m.condition)
          const val = this.convertExpressionToRuby(m.consequent)
          return `<% if bf.truthy?(${cond}) %>${name}="<%= bf.h(${val}) %>"<% end %>`
        }
      }
      const ruby = this.convertExpressionToRuby(value.expr)
      if (this.shouldWrapBoolStr(value.expr, name)) {
        return `${name}="<%= bf.h(bf.bool_str(${ruby})) %>"`
      }
      return `${name}="<%= bf.h(${ruby}) %>"`
    },
    emitBooleanAttr: (_value, name) => name,
    emitTemplate: (value, name) =>
      `${name}="<%= bf.h(${this.convertTemplateLiteralPartsToRuby(value.parts)}) %>"`,
    // Spread attributes (`<div {...attrs()} />`) lower through the
    // `bf.spread_attrs` Ruby runtime helper, mirroring the Go adapter's
    // `bf_spread_attrs` and the JS `spreadAttrs` from
    // `@barefootjs/client/runtime`. The bag's source JS expression is
    // translated to a Ruby expression via `convertExpressionToRuby`
    // (e.g. `attrs()` → `v[:attrs]`, `props.bag` → `v[:bag]`); the helper
    // accepts a Hash and emits pre-escaped, sorted `key="value"` pairs.
    //
    // `IRAttribute.slotId` is set by the IR pass but the ERB adapter
    // ignores it — the slot field exists only for the Go adapter's
    // static-typed Props struct.
    emitSpread: (value) => {
      if (this.refuseUnsupportedAttrExpression(value.expr, '...')) {
        return ''
      }
      // SolidJS-style props identifier (`(props: P) { <el {...props}/> }`)
      // has no matching `v[:props]` entry in the ERB vars Hash — props
      // arrive as one vars-Hash key per `propsParams` entry, not as a
      // single nested Hash. Emit an inline Hash literal that enumerates
      // the analyzer-extracted props params so `bf.spread_attrs(...)` gets
      // a real Hash (matches the Go adapter's same-shape map-literal
      // path). For `restPropsName` and other identifier shapes, the
      // standard `convertExpressionToRuby` translation handles it (rest
      // binding name → `v[:<name>]` resolves against the Hash the caller /
      // harness placed under that key).
      const trimmed = value.expr.trim()
      if (this.propsObjectName && this.propsObjectName === trimmed) {
        const entries = this.propsParams.map(p =>
          `${rubySymbolKey(p.name)} v[${rubySymbolLiteral(p.name)}]`,
        )
        return `<%= bf.spread_attrs({${entries.join(', ')}}) %>`
      }
      // Conditional inline-object spread:
      //   `{...(COND ? { 'aria-describedby': describedBy } : {})}`
      // Emit a Ruby inline ternary of Hashes — the falsy `{}` branch OMITS
      // the key (`bf.spread_attrs` does NOT filter empty strings, so we
      // cannot always-include it). Mirrors the Go adapter's IIFE-of-maps
      // lowering (#textarea).
      const ternaryHash = conditionalSpreadToRuby(this.spreadCtx, value.parsed)
      if (ternaryHash !== null) {
        return `<%= bf.spread_attrs(${ternaryHash}) %>`
      }
      // Function-scope local const holding a conditional inline-object
      //   `const sizeAttrs = size ? {…} : {}` then `{...sizeAttrs}`
      // (#checkbox / icon). Resolve the bare identifier to its initializer
      // text and route through the same conditional-spread lowering. Only
      // function-scope (`!isModule`) consts whose value is NOT itself a
      // bare identifier (loop guard) are considered.
      if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)) {
        const localConst = this.localConstants.find(
          c => c.name === trimmed && !c.isModule,
        )
        if (localConst?.value !== undefined) {
          const initTrimmed = localConst.value.trim()
          if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(initTrimmed)) {
            const resolved = conditionalSpreadToRuby(
              this.spreadCtx,
              parseExpression(initTrimmed),
            )
            if (resolved !== null) {
              return `<%= bf.spread_attrs(${resolved}) %>`
            }
          }
        }
      }
      const rubyExpr = this.convertExpressionToRuby(value.expr)
      return `<%= bf.spread_attrs(${rubyExpr}) %>`
    },
    // Neither variant is legal on intrinsic elements.
    emitBooleanShorthand: () => '',
    emitJsxChildren: () => '',
  }

  /**
   * Uniquifies the `presenceOrUndefined` temp binding (`__bf_puN`) so two
   *  presence-folded attrs in one template don't collide.
   */
  private presenceVarCounter = 0

  /**
   * Lower a `style={{ … }}` object literal to a CSS string with dynamic
   * values interpolated as ERB tags, e.g. `{ backgroundColor: color,
   * padding: '8px' }` → `background-color:<%= bf.h(v[:color]) %>;padding:8px`.
   * Returns null when the shape is unsupported or any value can't be
   * lowered (caller then falls through to the BF101 refusal).
   */
  private tryLowerStyleObject(expr: string): string | null {
    const entries = parseStyleObjectEntries(expr)
    if (!entries) return null
    for (const e of entries) {
      if (e.kind === 'expr' && !isSupported(parseExpression(e.expr)).supported) return null
    }
    // The static CSS key + literal value are inlined into a double-quoted
    // `style="..."` attribute as raw template text, so HTML-attr escape
    // them (a value like `'"'` would otherwise break the attribute /
    // inject markup). The dynamic arm's `<%= bf.h(...) %>` is explicitly
    // escaped (stdlib ERB doesn't auto-escape).
    return entries
      .map(e =>
        e.kind === 'literal'
          ? `${this.escapeAttrText(e.cssKey)}:${this.escapeAttrText(e.value)}`
          : `${this.escapeAttrText(e.cssKey)}:<%= bf.h(${this.convertExpressionToRuby(e.expr)}) %>`,
      )
      .join(';')
  }

  /** HTML-attribute escape for static text inlined into a `"..."` attribute. */
  private escapeAttrText(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }

  private renderAttributes(element: IRElement): string {
    const parts: string[] = []

    for (const attr of element.attrs) {
      // `/* @client */` attribute bindings are deferred to hydrate: the
      // client runtime sets/patches the attribute in a mount effect (the
      // CSR template omits it; ir-to-client-js emits the setAttribute
      // effect). Skip SSR emission so the server omits the attribute and
      // the unsupported-expression lowering is never reached for a
      // deferred predicate (no BF101 / BF102).
      if (attr.clientOnly) continue
      // Rewrite JSX special-prop names to their HTML-attribute
      // counterparts. `className` → `class`; `key` → `data-key` matches
      // the canonical Hono attribute name the client runtime reconciles
      // against. Hono SSR strips raw `key` via its JSX runtime; the ERB
      // template path has no such layer so the rewrite happens at
      // attribute-emit time.
      let attrName: string
      if (attr.name === 'className') attrName = 'class'
      else if (attr.name === 'key') attrName = 'data-key'
      else attrName = attr.name
      const lowered = emitAttrValue(attr.value, this.elementAttrEmitter, attrName)
      if (lowered) parts.push(lowered)
    }

    return parts.length > 0 ? ' ' + parts.join(' ') : ''
  }

  // ===========================================================================
  // Hydration Markers
  // ===========================================================================

  renderScopeMarker(_instanceIdExpr: string): string {
    // bf-s is the addressable scope id. hydration_attrs adds bf-h / bf-m /
    // bf-r conditionally; props_attr adds bf-p when props are present.
    // These are all runtime-generated markup (raw helper output, not user
    // text), so no `bf.h` wrap — mirrors mojo's `<%==` raw-output tags.
    return `bf-s="<%= bf.scope_attr %>" <%= bf.hydration_attrs %> <%= bf.props_attr %>`
  }

  renderSlotMarker(slotId: string): string {
    return `${BF_SLOT}="${slotId}"`
  }

  renderCondMarker(condId: string): string {
    return `${BF_COND}="${condId}"`
  }

  // ===========================================================================
  // Filter Predicate Rendering (ParsedExpr → Ruby)
  // ===========================================================================

  /**
   * Convert a ParsedExpr AST to Ruby expression string for filter
   * predicates. Wraps the shared ParsedExpr dispatcher with an
   * `ErbFilterEmitter` carrying the predicate's loop param and any
   * block-body local var aliases.
   */
  private renderRubyFilterExpr(
    expr: ParsedExpr,
    param: string,
    localVarMap: Map<string, string> = new Map(),
  ): string {
    return emitParsedExpr(
      expr,
      new ErbFilterEmitter(
        param,
        localVarMap,
        n => this.isLoopBoundName(n),
        n => this._isStringValueName(n),
        (message, reason) => this._recordExprBF101(message, reason),
      ),
    )
  }

  // ===========================================================================
  // Expression Conversion: JS → Ruby
  // ===========================================================================

  private convertTemplateLiteralPartsToRuby(literalParts: IRTemplatePart[]): string {
    const parts: string[] = []
    for (const part of literalParts) {
      if (part.type === 'string') {
        // The IR producer may leave `${ident}` / `${_p.ident}`
        // interpolations in `string` parts when it can't statically inline
        // them (typically a destructured prop the caller will supply at
        // hydrate time, e.g. `${className}` in shadcn-style composition).
        // Substitute those to their Ruby variable form before quoting,
        // otherwise the single-quoted literal here passes the JS-shape
        // interpolation through verbatim into the rendered HTML.
        parts.push(this.substituteJsInterpolationsToRuby(part.value))
      } else if (part.type === 'ternary') {
        const cond = this.convertExpressionToRuby(part.condition)
        parts.push(`(bf.truthy?(${cond}) ? ${rubyStringLiteral(part.whenTrue)} : ${rubyStringLiteral(part.whenFalse)})`)
      } else if (part.type === 'lookup') {
        // `${MAP[KEY]}` against a Record<T, string> literal — emit a Ruby
        // Hash literal with an immediate symbol-key lookup, `|| ''`
        // guarded so a miss turns into an empty string, matching the
        // go-template adapter's "empty when no case matches" semantics.
        // Pass `key` through `convertExpressionToRuby` so its
        // top-level-identifier tail (`variant` → `v[:variant]`) and
        // existing `props.x` rule apply uniformly.
        const keyExpr = this.convertExpressionToRuby(part.key)
        const entries = Object.entries(part.cases)
          .map(([k, v]) => `${rubySymbolKey(k)} ${rubyStringLiteral(v)}`)
          .join(', ')
        parts.push(`({ ${entries} }[(${keyExpr}).to_sym] || '')`)
      }
    }
    // Join with Ruby string concatenation
    return parts.length === 1 ? parts[0] : `(${parts.join(' + ')})`
  }

  /**
   * Translate `${EXPR}` interpolations in a static template-part string
   * into Ruby variable references and concatenate them with the
   * surrounding literal text. Used by `convertTemplateLiteralPartsToRuby`
   * when a `string` part still carries unresolved interpolations (e.g.
   * `${className}` from a destructured prop the IR analyzer couldn't
   * inline statically).
   */
  private substituteJsInterpolationsToRuby(s: string): string {
    const segments: string[] = []
    const re = /\$\{([^}]+)\}/g
    let lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(s)) !== null) {
      if (m.index > lastIndex) {
        segments.push(rubyStringLiteral(s.slice(lastIndex, m.index)))
      }
      segments.push(`bf.string(${this.convertExpressionToRuby(m[1].trim())})`)
      lastIndex = re.lastIndex
    }
    if (lastIndex < s.length) {
      segments.push(rubyStringLiteral(s.slice(lastIndex)))
    }
    if (segments.length === 0) return `''`
    return segments.length === 1 ? segments[0] : `(${segments.join(' + ')})`
  }

  /**
   * Refuse JS expression shapes that have no idiomatic ERB template
   * representation. Currently catches:
   *
   *   - Object literals (`style={{ background: bg(), color: fg() }}`):
   *     the regex pipeline strips signal calls but leaves the surrounding
   *     `{ k: v, ... }` syntax intact, producing invalid Ruby inside
   *     `<%= ... %>`.
   *   - Tagged-template-literal call expressions
   *     (`className={cn\`base \${tone()}\`}`): regex translation
   *     produces malformed Ruby with no callable target.
   *
   * Records `BF101` with the same shape the Go/Mojo adapters emit, so
   * cross-adapter diagnostics stay consistent. Returns `true` when the
   * shape was rejected (caller should drop the attribute / skip the emit).
   */
  private refuseUnsupportedAttrExpression(expr: string, attrName: string): boolean {
    let probe = expr.trim()
    while (probe.startsWith('(')) probe = probe.slice(1).trimStart()
    const startsAsObjectLiteral = probe.startsWith('{')
    const hasTaggedTemplate = /[A-Za-z_$][\w$]*\s*`/.test(probe)
    if (!startsAsObjectLiteral && !hasTaggedTemplate) return false
    const parsed = parseExpression(expr.trim())
    const support = isSupported(parsed)
    if (parsed.kind !== 'unsupported' && support.supported) return false
    const reason = support.reason ?? (parsed.kind === 'unsupported' ? parsed.reason : undefined)
    const reasonLine = reason ? `\n${reason}` : ''
    this.errors.push({
      code: 'BF101',
      severity: 'error',
      message: `Expression not supported on attribute '${attrName}': ${expr.trim()}${reasonLine}`,
      loc: { file: this.componentName + '.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
      suggestion: {
        message: 'The ERB adapter cannot lower JS object literals or tagged-template-literal expressions into Embedded Ruby. Move the expression into a `\'use client\'` component (so hydration computes it), or expand it into discrete attributes whose values are values the adapter can lower.',
      },
    })
    return true
  }

  /**
   * Build the EmitContext seam the top-level `ParsedExpr` emitter depends on.
   * Built as a private object (the adapter does NOT `implements ErbEmitContext`)
   * so the wrapped bookkeeping — `_searchParamsLocals`, the const/record
   * resolvers, the loop-bound-name predicate, BF101 recording, the
   * filter-predicate entry — stays private and off the exported adapter's
   * public type, matching the Mojo/Go adapters' `emitCtx`.
   */
  private get emitCtx(): ErbEmitContext {
    return {
      _searchParamsLocals: this._searchParamsLocals,
      resolveModuleStringConst: (name) => this.resolveModuleStringConst(name),
      resolveLiteralConst: (name) => this.resolveLiteralConst(name),
      resolveStaticRecordLiteral: (o, k) => this.resolveStaticRecordLiteral(o, k),
      isLoopBoundName: (name) => this.isLoopBoundName(name),
      _isStringValueName: (name) => this._isStringValueName(name),
      _recordExprBF101: (message, reason) => this._recordExprBF101(message, reason),
      _renderRubyFilterExprPublic: (e, p) => this._renderRubyFilterExprPublic(e, p),
    }
  }

  /**
   * Build the narrow context the extracted spread lowering depends on.
   * Passing a purpose-built object (rather than `this`) keeps the
   * adapter's bookkeeping members private.
   */
  private get spreadCtx(): ErbSpreadContext {
    return {
      componentName: this.componentName,
      errors: this.errors,
      localConstants: this.localConstants,
      propsParams: this.propsParams,
      convertExpressionToRuby: (e, preParsed) => this.convertExpressionToRuby(e, preParsed),
    }
  }

  /** Build the narrow context the extracted memo seeding depends on. */
  private get memoCtx(): ErbMemoContext {
    return { convertExpressionToRuby: (e, preParsed) => this.convertExpressionToRuby(e, preParsed) }
  }

  private convertExpressionToRuby(expr: string, preParsed?: ParsedExpr): string {
    // Parse-first lowering — parity with the Go adapter's
    // `convertExpressionToGo`. Parse the JS expression once, gate it on
    // the shared `isSupported`, and render every supported shape through
    // the AST emitter (`renderParsedExprToRuby`). The parser's
    // `UNSUPPORTED_METHODS` is the single source of truth for what's
    // refused — there are no per-method routing regexes and no regex
    // string-rewriting pipeline. Unsupported shapes (un-lowered methods,
    // unparseable hand-written JS, etc.) surface as BF101 with the
    // `/* @client */` escape hatch instead of being silently mangled.
    //
    // `preParsed` is the IR-carried `ParsedExpr` tree (cf. go-template's
    // `convertExpressionToGo(jsExpr, out?, preParsed?)`); when present it is
    // used directly instead of re-parsing `expr`, so spread condition/value
    // lowering threads the carried tree through without a stringify→re-parse
    // round-trip. The diagnostic text is then derived from the tree
    // (`stringifyParsedExpr`) so callers can pass `''` for `expr`.
    let parsed: ParsedExpr
    if (preParsed) {
      parsed = preParsed
    } else {
      const trimmed = expr.trim()
      if (trimmed === '') return "''"
      parsed = parseExpression(trimmed)
    }

    // Registered call lowerings, including the built-in `queryHref` plugin,
    // which lowers `queryHref(base, { … })` to a neutral `guard-list` on
    // the `query` helper → `bf.query(base, <triples>)`. Recognised before
    // the support gate because the object-literal arg is otherwise
    // `unsupported` (BF101). The `bf.query` helper includes a pair iff its
    // guard is truthy AND its value is a non-empty string (the client's
    // `if (value)`): a plain `key: v` passes guard `true`, a conditional
    // `key: cond ? v : undefined` passes the lowered cond. Only the
    // `query` helper renders to `bf.query`; another guard-list helper must
    // not be silently mis-rendered as a query.
    if (parsed.kind === 'call') {
      for (const matcher of this._loweringMatchers) {
        const node = matcher(parsed.callee, parsed.args)
        if (node?.kind === 'guard-list' && node.helper === 'query') {
          const argsRuby = queryHrefArgs(node, n => this.renderParsedExprToRuby(n))
          return `bf.query(${argsRuby.join(', ')})`
        }
      }
    }

    const support = isSupported(parsed)
    if (!support.supported) {
      this.errors.push({
        code: 'BF101',
        severity: 'error',
        message: `Expression not supported: ${preParsed ? stringifyParsedExpr(parsed) : expr.trim()}`,
        loc: { file: this.componentName + '.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
        suggestion: {
          message: support.reason
            ? `${support.reason}\n\nOptions:\n1. Use /* @client */ for client-side evaluation\n2. Pre-compute the value in Ruby`
            : 'Options:\n1. Use /* @client */ for client-side evaluation\n2. Pre-compute the value in Ruby',
        },
      })
      // Safe Ruby empty-string literal — valid in every context the
      // result might land in (`<%= '' %>`, `if bf.truthy?('')`, attribute
      // interpolation, template-literal substitution).
      return "''"
    }

    return this.renderParsedExprToRuby(parsed)
  }

  /**
   * Render a full ParsedExpr tree to Ruby for top-level (non-filter)
   * expressions where identifiers are signals / vars-Hash entries.
   * Delegates to the shared ParsedExpr dispatcher with `ErbTopLevelEmitter`.
   */
  private renderParsedExprToRuby(expr: ParsedExpr): string {
    return emitParsedExpr(expr, new ErbTopLevelEmitter(this.emitCtx))
  }

  /** Whether `name` (a signal getter or prop) holds a string value — gates
   *  index-access Hash-vs-Array lowering (see `expr/operand.ts`). */
  private _isStringValueName(name: string): boolean {
    return this.stringValueNames.has(name)
  }

  private _recordExprBF101(message: string, reason?: string): void {
    this.errors.push({
      code: 'BF101',
      severity: 'error',
      message,
      loc: { file: this.componentName + '.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
      suggestion: {
        message: reason
          ? `${reason}\n\nOptions:\n1. Use /* @client */ for client-side evaluation\n2. Pre-compute the value in Ruby`
          : 'Options:\n1. Use /* @client */ for client-side evaluation\n2. Pre-compute the value in Ruby',
      },
    })
  }

  /** Internal hook for higher-order: predicate body re-uses the filter emitter. */
  private _renderRubyFilterExprPublic(expr: ParsedExpr, param: string): string {
    return this.renderRubyFilterExpr(expr, param)
  }
}

export const erbAdapter = new ErbAdapter()

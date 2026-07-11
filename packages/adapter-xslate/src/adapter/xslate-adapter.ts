/**
 * BarefootJS Text::Xslate (Kolon) Template Adapter
 *
 * Generates Text::Xslate Kolon template files (.tx) from BarefootJS IR.
 *
 * Near-mechanical port of the Mojolicious EP adapter
 * (packages/adapter-mojolicious/src/adapter/mojo-adapter.ts) from Mojo EP
 * syntax to Kolon syntax. The expression-lowering pipeline (JS → Perl
 * scalars / `$bf.helper(...)` calls) is shared in spirit with the Mojo
 * adapter; only the surrounding template syntax differs:
 *
 *   Mojo `<%= EXPR %>`        → Kolon `<: EXPR :>`            (HTML-escaped)
 *   Mojo `<%== EXPR %>`       → Kolon `<: EXPR | mark_raw :>` (raw)
 *   Mojo `bf->method(args)`   → Kolon `$bf.method(args)`
 *   Mojo `% if (C) { ... % }` → Kolon `: if (C) { ... : }`    (line statements)
 *   Mojo `% for ... { ... % }`→ Kolon `: for $arr -> $x { ... : }`
 *
 * Kolon auto-escapes `<: ... :>` interpolations (the backend builds the
 * engine with `type => 'html'`); helpers that emit markup are piped through
 * `| mark_raw` so they survive verbatim — mirroring Mojo EP's `<%==` vs `<%=`.
 */

import type {
  ComponentIR,
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
  CompilerError,
  TypeInfo,
  TemplatePrimitiveRegistry,
  IRMetadata,
  LoopBindingPathSegment,
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
  exprToString,
  parseProviderObjectLiteral,
  parseStyleObjectEntries,
  isSupported,
  emitParsedExpr,
  emitIRNode,
  emitAttrValue,
  augmentInheritedPropAccesses,
  parseRecordIndexAccess,
  collectModuleStringConsts,
  extractArrowBodyExpression,
  collectContextConsumers,
  type ContextConsumer,
  lookupStaticRecordLiteral,
  searchParamsLocalNames,
  prepareLoweringMatchers,
  queryHrefArgs,
  isValidHelperId,
  sortComparatorFromArrow,
  isLowerableLoopDestructure,
  isDangerousInnerHtmlAttr,
  resolveDangerousInnerHtml,
  dangerousInnerHtmlMetacharViolation,
  dangerousInnerHtmlDiagnostic,
} from '@barefootjs/jsx'
import { isAriaBooleanAttr, isBooleanResultExpr } from './boolean-result.ts'
import ts from 'typescript'
import type { ParsedExpr, LoweringMatcher } from '@barefootjs/jsx'
import { BF_SLOT, BF_COND, BF_REGION, escapeHtml } from '@barefootjs/shared'

import type { XslateRenderCtx } from './lib/types.ts'
import { XSLATE_PRIMITIVE_EMIT_MAP } from './lib/constants.ts'
import { kolonHashKey, escapeKolonSingleQuoted } from './lib/kolon-naming.ts'
import {
  resolveJsxChildrenProp,
  collectRootScopeNodes,
} from './lib/ir-scope.ts'
import { renderSortMethod, renderSortEval } from './expr/array-method.ts'
import { XslateFilterEmitter, XslateTopLevelEmitter } from './expr/emitters.ts'
import type { XslateEmitContext, XslateSpreadContext, XslateMemoContext } from './emit-context.ts'
import {
  hasClientInteractivity,
  collectImportedLoopChildComponentErrors,
} from './analysis/component-tree.ts'
import {
  conditionalSpreadToKolon,
  objectLiteralExprToKolonHashref,
} from './spread/spread-codegen.ts'
import {
  generateContextConsumerSeed,
  generateDerivedMemoSeed,
} from './memo/seed.ts'
import {
  collectBooleanTypedProps,
  collectNullableOptionalProps,
  collectStringValueNames,
} from './props/prop-classes.ts'

export type { XslateAdapterOptions } from './lib/types.ts'
import type { XslateAdapterOptions } from './lib/types.ts'

/**
 * Build a Kolon accessor expression for a `.map()` destructure binding's
 * structured `segments` path (#2087 Phase B), walking `field` (`.key` for an
 * identifier-safe name, `["key"]` — quoted with `kolonHashKey`'s convention —
 * otherwise, since Kolon parses `$x.data-priority` as a subtraction) /
 * `index` (`[N]`) steps onto `base`. Verified against real Text::Xslate that
 * dot- and bracket-access chain freely (`$x.cells[0]`, `$x["cells"][0]`).
 * Never string-parses `LoopParamBinding.path` — see the repo-wide rule
 * against regex-parsing JS/TS-derived syntax.
 *
 * Used both for a fixed binding's FULL accessor (`base` = `$__bf_item`,
 * `segments` = the whole path) and a rest binding's PARENT-prefix accessor
 * (`segments` may be empty, at the loop root, in which case this returns
 * `base` unchanged) — see `LoopParamBinding.segments` jsdoc for which case
 * a binding is in.
 */
function kolonSegmentAccessor(base: string, segments: readonly LoopBindingPathSegment[]): string {
  let expr = base
  for (const seg of segments) {
    expr +=
      seg.kind === 'field'
        ? seg.isIdent
          ? `.${seg.key}`
          : `[${kolonHashKey(seg.key)}]`
        : `[${seg.index}]`
  }
  return expr
}

/**
 * Quote a string as a Kolon single-quoted literal, unconditionally — unlike
 * `kolonHashKey` (which leaves an identifier-safe name unquoted for `key =>
 * val` hashref-literal position), a plain array-literal element
 * (`$bf.omit($x, [id, title])`) is NOT hash-key position: Kolon has no
 * bareword-as-string convention there, so every object-rest exclude key
 * needs an explicit string literal.
 */
function kolonStringLiteral(s: string): string {
  return `'${escapeKolonSingleQuoted(s)}'`
}

export class XslateAdapter extends BaseAdapter implements IRNodeEmitter<XslateRenderCtx> {
  name = 'xslate'
  extension = '.tx'
  templatesPerComponent = true
  // Template-string target with no component layer: `bf build` emits a static
  // import-map HTML snippet to include into the page <head>.
  importMapInjection = 'html-snippet' as const

  /**
   * Identifier-path callees the Xslate runtime can render in template scope.
   * The relocate pass consults this map to mark matching calls as
   * template-safe; the SSR template emitter substitutes the JS call with the
   * registered `$bf.NAME(...)` helper invocation.
   */
  templatePrimitives: TemplatePrimitiveRegistry = XSLATE_PRIMITIVE_EMIT_MAP

  private componentName: string = ''
  /** Component root scope element(s) — each carries `data-key` for a keyed loop
   *  item (set by the child renderer from the JSX `key` prop). A plain element
   *  root is one node; an `if-statement` (early-return) root contributes the
   *  top element of every branch. */
  private rootScopeNodes: Set<IRNode> = new Set()
  private options: Required<XslateAdapterOptions>
  private errors: CompilerError[] = []
  private inLoop: boolean = false
  /**
   * `IRLoop.depth` of the loop currently being rendered (save/restore
   * around `renderChildren(loop.children)`, mirroring `inLoop` above).
   * `renderAttributes` reads this to derive the `key` → `data-key`/
   * `data-key-N` suffix — the depth is IR-computed (jsx-to-ir.ts), not
   * re-derived here (#2168 nested-loop-outer-binding).
   */
  private currentLoopKeyDepth = 0
  /**
   * SolidJS-style props identifier (`function(props: P)`) and the
   * analyzer-extracted prop names. Stashed at `generate()` entry so the
   * per-attribute `emitSpread` callback can build a propsObject spread bag as
   * an inline Kolon hashref literal without re-walking the IR.
   */
  private propsObjectName: string | null = null
  private propsParams: { name: string }[] = []
  private booleanTypedProps: Set<string> = new Set()
  /**
   * Names (signal getters + props) whose value is a string. In the Mojo
   * adapter this drives choosing Perl `eq`/`ne` over numeric `==`/`!=` for a
   * string `===`/`!==`. The Kolon emitters do NOT consume this: Kolon's
   * `==`/`!=` are value-equality operators that compare strings and numbers
   * correctly, so `===`/`!==` always map to `==`/`!=`. The set is populated
   * and threaded for parity with the Mojo adapter (and as groundwork for a
   * shared Perl-family codegen surface), not because Kolon needs it today.
   */
  private stringValueNames: Set<string> = new Set()

  /**
   * Module-scope pure-string consts (`const x = 'literal'`), keyed by name →
   * unescaped value. A className template literal that references such a const
   * (`className={`${x} ${className}`}`) must inline the literal: the const is
   * module-scope, so it never reaches the per-render template stash and a bare
   * `$x` reference would render empty. Mirrors the Mojo adapter's
   * `moduleStringConsts` fix.
   */
  private moduleStringConsts: Map<string, string> = new Map()

  /**
   * (#1922) Local binding names the request-scoped `searchParams()` env signal
   * is imported under (handles `import { searchParams as sp }`). When non-empty
   * the emitter lowers a `<binding>().get(k)` call to a real method call on the
   * per-request `$searchParams` reader (`$searchParams.get('sort')`) instead of
   * the generic dot deref. Set at `generate()` entry from `ir.metadata.imports`;
   * read by the top-level ParsedExpr emitter.
   */
  private _searchParamsLocals: Set<string> = new Set()

  /**
   * Call-lowering matchers active for this component (#2057). Bound at
   * `generate()` entry via `prepareLoweringMatchers` and read by the top-level
   * emitter. Covers both userland plugins and the compiler's built-in plugins
   * (e.g. `queryHref` → `$bf.query`, #2042) — one uniform path, no per-API branch.
   */
  private _loweringMatchers: LoweringMatcher[] = []

  /**
   * Local + module constants from the IR, used by the conditional-spread and
   * `Record<staticKeys, scalar>[propKey]` lowering paths (#textarea / #checkbox).
   * Stashed at `generate()` entry so `emitSpread` can resolve a bare local
   * const (`const sizeAttrs = size ? {…} : {}`) to its initializer text.
   */
  private localConstants: IRMetadata['localConstants'] = []

  /**
   * Optional, no-default props that are `undef` when the caller omits them.
   * Their bare-reference attribute emission is guarded with Kolon `defined` so
   * the attribute DROPS rather than rendering `attr=""` (Hono-style nullish
   * omission, e.g. textarea's `rows`). The filter excludes destructure-
   * defaulted, rest, and concrete-primitive props.
   */
  private nullableOptionalProps: Set<string> = new Set()

  constructor(options: XslateAdapterOptions = {}) {
    super()
    this.options = {
      clientJsBasePath: options.clientJsBasePath ?? '/static/components/',
      barefootJsPath: options.barefootJsPath ?? '/static/components/barefoot.js',
    }
  }

  generate(ir: ComponentIR, options?: AdapterGenerateOptions): AdapterOutput {
    this.componentName = ir.metadata.componentName
    this.propsObjectName = ir.metadata.propsObjectName ?? null
    // (#checkbox) Enumerate the props-object pattern's inherited attribute
    // accesses (`props.className`/`id`/`disabled`) into propsParams via the
    // shared helper, before deriving `nullableOptionalProps` below.
    augmentInheritedPropAccesses(ir)
    this.propsParams = ir.metadata.propsParams.map(p => ({ name: p.name }))
    // Props whose declared TS type is boolean — a bare binding of one
    // (`data-active={props.isActive}`) must stringify as JS
    // `String(boolean)` ("true"/"false"), not Perl's native `1`/`''`
    // (#1897, pagination's data-active).
    // Per-compile prop classifications (see `props/prop-classes.ts`).
    this.booleanTypedProps = collectBooleanTypedProps(ir)
    this.localConstants = ir.metadata.localConstants ?? []
    this.nullableOptionalProps = collectNullableOptionalProps(ir)
    this.stringValueNames = collectStringValueNames(ir)
    this.moduleStringConsts = collectModuleStringConsts(ir.metadata.localConstants)
    this._searchParamsLocals = searchParamsLocalNames(ir.metadata)
    this._loweringMatchers = prepareLoweringMatchers(ir.metadata)
    this.errors = []
    this.childrenCaptureCounter = 0

    // Mirror of the Mojo adapter's BF103 check: a child component referenced
    // inside a loop body that is imported from a sibling .tsx emits a
    // cross-template `$bf.render_child(...)` call that resolves only if the
    // sibling template is registered alongside the parent at render time.
    // Surface it loudly here. Suppressed when the caller guarantees that all
    // sibling templates are registered on the same instance at render time.
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
    // from the active provider value (or the `createContext` default). The
    // provider side pushes the value via `emitProvider`. (#1297)
    const ctxSeed = generateContextConsumerSeed(ir)

    // Prop/signal-derived memos with a `null` static SSR default (e.g.
    // `createMemo(() => props.value * 10)`) are computed in-template from the
    // already-seeded prop/signal vars — mirroring Go's generated child
    // constructor. (#1297)
    const memoSeed = generateDerivedMemoSeed(this.memoCtx, ir)

    const template = `${scriptReg}${ctxSeed}${memoSeed}${templateBody}\n`

    // Merge collected errors into IR errors
    if (this.errors.length > 0) {
      ir.errors.push(...this.errors)
    }

    // Kolon templates have no JS-style imports / types / default-export
    // sections. The `templatesPerComponent` mode emits one file per component
    // using the raw `template` value; sections are populated for contract
    // uniformity so the compiler never has to string-parse the template.
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

  // ===========================================================================
  // Script Registration
  // ===========================================================================

  private generateScriptRegistrations(ir: ComponentIR, scriptBaseName?: string): string {
    const hasInteractivity = hasClientInteractivity(ir)
    if (!hasInteractivity) return ''

    const name = scriptBaseName ?? ir.metadata.componentName
    const runtimePath = this.options.barefootJsPath
    const clientJsPath = `${this.options.clientJsBasePath}${name}.client.js`

    // Kolon's `:` line marker PRINTS the statement's value, so a bare
    // `: $bf.register_script(...)` would leak `register_script`'s return value
    // (the new script count) into the rendered HTML. Bind the result to a
    // throwaway `my` local — `: my $_ = EXPR;` evaluates the call for its
    // side effect without emitting anything. (Kolon forbids re-`my` of the
    // same name in one scope, so each registration gets a distinct var.)
    const lines: string[] = []
    lines.push(`: my $_bf_reg0 = $bf.register_script('${runtimePath}');`)
    lines.push(`: my $_bf_reg1 = $bf.register_script('${clientJsPath}');`)
    lines.push('')
    return lines.join('\n')
  }

  // ===========================================================================
  // Node Rendering
  // ===========================================================================

  /**
   * Public entry point for node rendering. Delegates to the shared
   * `IRNodeEmitter` dispatcher; per-kind logic lives in the `IRNodeEmitter`
   * methods below.
   */
  renderNode(node: IRNode): string {
    return emitIRNode<XslateRenderCtx>(node, this, {} as XslateRenderCtx)
  }

  // ===========================================================================
  // IRNodeEmitter implementation (Xslate / Kolon)
  // ===========================================================================

  emitElement(node: IRElement, _ctx: XslateRenderCtx, _emit: EmitIRNode<XslateRenderCtx>): string {
    return this.renderElement(node)
  }

  emitText(node: IRText): string {
    // IRText carries the entity-DECODED value (Phase 1 decodes JSX
    // character references); re-escape for direct HTML emission.
    return escapeHtml(node.value)
  }

  emitExpression(node: IRExpression): string {
    return this.renderExpression(node)
  }

  emitConditional(node: IRConditional, _ctx: XslateRenderCtx, _emit: EmitIRNode<XslateRenderCtx>): string {
    return this.renderConditional(node)
  }

  emitLoop(node: IRLoop, _ctx: XslateRenderCtx, _emit: EmitIRNode<XslateRenderCtx>): string {
    return this.renderLoop(node)
  }

  emitComponent(node: IRComponent, _ctx: XslateRenderCtx, _emit: EmitIRNode<XslateRenderCtx>): string {
    return this.renderComponent(node)
  }

  emitFragment(node: IRFragment, _ctx: XslateRenderCtx, _emit: EmitIRNode<XslateRenderCtx>): string {
    return this.renderFragment(node)
  }

  emitSlot(node: IRSlot): string {
    return this.renderSlot(node)
  }

  emitIfStatement(node: IRIfStatement, _ctx: XslateRenderCtx, _emit: EmitIRNode<XslateRenderCtx>): string {
    return this.renderIfStatement(node)
  }

  emitProvider(node: IRProvider, _ctx: XslateRenderCtx, _emit: EmitIRNode<XslateRenderCtx>): string {
    // SSR context propagation (#1297): bracket the children with a
    // provide/revoke pair on the shared controller-stash context stack so a
    // descendant `useContext` consumer reads the value during the same
    // render. Both helpers return '' (empty), so the inline `<: … :>`
    // expression form discards their output cleanly — no extra whitespace,
    // no line-statement needed inside the element body.
    const value = this.providerValueKolon(node.valueProp)
    const children = this.renderChildren(node.children)
    const name = node.contextName
    return (
      `<: $bf.provide_context('${name}', ${value}) :>` +
      children +
      `<: $bf.revoke_context('${name}') :>`
    )
  }

  /** Lower a `<Ctx.Provider value>` value prop to a Kolon expression. */
  private providerValueKolon(valueProp: IRProvider['valueProp']): string {
    const v = valueProp.value
    if (v.kind === 'literal') {
      return typeof v.value === 'string'
        ? `'${v.value.replace(/[\\']/g, m => `\\${m}`)}'`
        : String(v.value)
    }
    if (v.kind === 'expression') {
      const hashref = this.providerObjectLiteralKolon(v.expr)
      if (hashref !== null) return hashref
      return this.convertExpressionToKolon(v.expr)
    }
    if (v.kind === 'template') return this.convertTemplateLiteralPartsToKolon(v.parts)
    // Out-of-shape value (spread / jsx-children) — nil; consumer defaults.
    return 'nil'
  }

  /**
   * Lower an object-literal provider value (`value={{ open: () => props.open
   * ?? false, onOpenChange: … }}`) to a Kolon hashref literal (#1897). The
   * SSR lowering is a per-member snapshot of what a consumer would READ
   * during the same render:
   *
   * - zero-param expression-body arrows are getters — lower the body (the
   *   value is fixed for the render, so the call-time indirection drops out)
   * - `on[A-Z]`-named members and function-shaped values are client-only
   *   behavior SSR never invokes — lower to `nil`
   * - anything else lowers through the normal expression pipeline (so an
   *   unsupported getter body still refuses loudly with BF101)
   *
   * Keys keep their JS names verbatim so a consumer-side `ctx.open` access
   * maps onto the same key. Returns `null` when the expression is not a
   * plain object literal (spread / computed key) — the caller falls back to
   * the whole-expression path, which refuses those shapes with BF101.
   */
  private providerObjectLiteralKolon(expr: string): string | null {
    const members = parseProviderObjectLiteral(expr.trim())
    if (members === null) return null
    const entries = members.map(m => {
      // String-literal JS keys can carry `'` / `\` — escape for the
      // single-quoted Kolon key string.
      const key = `'${m.name.replace(/[\\']/g, c => `\\${c}`)}'`
      if (m.kind === 'function' || /^on[A-Z]/.test(m.name)) return `${key} => nil`
      const src = m.kind === 'getter' ? m.body : m.expr
      return `${key} => ${this.convertExpressionToKolon(src)}`
    })
    return `{ ${entries.join(', ')} }`
  }

  emitAsync(node: IRAsync, _ctx: XslateRenderCtx, _emit: EmitIRNode<XslateRenderCtx>): string {
    return this.renderAsync(node)
  }

  // ===========================================================================
  // Element Rendering
  // ===========================================================================

  renderElement(element: IRElement): string {
    const tag = element.tag
    const attrs = this.renderAttributes(element)
    const dangerousHtml = this.renderDangerousInnerHtml(element)
    const children = dangerousHtml !== null ? dangerousHtml : this.renderChildren(element.children)

    let hydrationAttrs = ''
    if (element.needsScope) {
      hydrationAttrs += ` ${this.renderScopeMarker('')}`
    }
    // A root scope element carries `data-key` for a keyed loop item (set on the
    // bf instance by the child renderer from the JSX `key` prop); non-keyed
    // renders add nothing. Mirrors Hono stamping data-key on each loop item's
    // root, including early-return (if-statement) roots. (#1297)
    if (this.rootScopeNodes.has(element) && element.needsScope) {
      hydrationAttrs += ` <: $bf.data_key_attr() | mark_raw :>`
    }
    if (element.slotId) {
      hydrationAttrs += ` ${this.renderSlotMarker(element.slotId)}`
    }
    // Page-lifecycle boundary lowered from `<Region>` (spec/router.md). The id
    // is a deterministic static string (`<file scope>:<index>`), so it emits as
    // a plain literal attribute — no Xslate template tag.
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

  /**
   * `dangerouslySetInnerHTML={{ __html: '...' }}` (#2207) — see the Blade
   * adapter's identical helper for the full rationale. `null` means the
   * attribute is absent (caller falls through to normal `renderChildren`);
   * a non-`null` string (possibly `''`) replaces the children outright.
   */
  private renderDangerousInnerHtml(element: IRElement): string | null {
    const resolution = resolveDangerousInnerHtml(element)
    if (!resolution) return null
    if (resolution.kind === 'dynamic') {
      this.errors.push(dangerousInnerHtmlDiagnostic(resolution.expr, resolution.loc))
      return ''
    }
    const violation = dangerousInnerHtmlMetacharViolation(resolution.html, this.name)
    if (violation) {
      const attr = element.attrs.find(isDangerousInnerHtmlAttr)!
      this.errors.push(dangerousInnerHtmlDiagnostic(`{ __html: ${JSON.stringify(resolution.html)} }`, attr.loc, violation))
      return ''
    }
    return resolution.html
  }

  // ===========================================================================
  // Expression Rendering
  // ===========================================================================

  renderExpression(expr: IRExpression): string {
    if (expr.clientOnly) {
      if (expr.slotId) {
        return `<: $bf.comment("client:${expr.slotId}") | mark_raw :>`
      }
      return ''
    }

    // Thread the IR-carried `.parsed` tree through (mirrors go-template's
    // `convertExpressionToGo(expr.expr, classify, expr.parsed)`) so a
    // resolved bare-identifier `.map`/`.filter`/… callback
    // (`resolveCallbackMethodFunctionReferences`, #2206) isn't lost to a
    // fresh, unresolved re-parse of the raw string.
    const perlExpr = this.convertExpressionToKolon(expr.expr, expr.parsed)

    if (expr.slotId) {
      return `<: $bf.text_start("${expr.slotId}") | mark_raw :><: ${perlExpr} :><: $bf.text_end() | mark_raw :>`
    }

    return `<: ${perlExpr} :>`
  }

  // ===========================================================================
  // Conditional Rendering
  // ===========================================================================

  renderConditional(cond: IRConditional): string {
    if (cond.clientOnly && cond.slotId) {
      return `<: $bf.comment("cond-start:${cond.slotId}") | mark_raw :><: $bf.comment("cond-end:${cond.slotId}") | mark_raw :>`
    }

    const condition = this.convertExpressionToKolon(cond.condition)
    const whenTrue = this.renderNode(cond.whenTrue)
    const whenFalse = this.renderNodeOrNull(cond.whenFalse)

    // When slotId is present, add bf-c marker.
    // Use comment markers for fragments (multiple sibling elements), attribute
    // for single elements.
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
        ? `\n: if (${condition}) {\n${whenTrue}\n: } else {\n${whenFalse}\n: }\n`
        : `\n: if (${condition}) {\n${whenTrue}\n: }\n`
      result = `<: $bf.comment("cond-start:${cond.slotId}") | mark_raw :>${inner}<: $bf.comment("cond-end:${cond.slotId}") | mark_raw :>`
    } else if (markedFalse) {
      result = `\n: if (${condition}) {\n${markedTrue}\n: } else {\n${markedFalse}\n: }\n`
    } else if (cond.slotId) {
      // Conditional with no else: wrap with comment markers for client hydration
      result = `<: $bf.comment("cond-start:${cond.slotId}") | mark_raw :>\n: if (${condition}) {\n${whenTrue}\n: }\n<: $bf.comment("cond-end:${cond.slotId}") | mark_raw :>`
    } else {
      result = `\n: if (${condition}) {\n${whenTrue}\n: }\n`
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
   * Add bf-c attribute to the first HTML element in a branch.
   * If no element found, wrap with comment markers.
   */
  private addCondMarkerToFirstElement(content: string, condId: string): string {
    // Match first HTML open tag
    const match = content.match(/^(<\w+)([\s>])/)
    if (match) {
      return content.replace(/^(<\w+)([\s>])/, `$1 ${BF_COND}="${condId}"$2`)
    }
    // Fall back to comment markers for non-element content
    return `<: $bf.comment("cond-start:${condId}") | mark_raw :>${content}<: $bf.comment("cond-end:${condId}") | mark_raw :>`
  }

  // ===========================================================================
  // Loop Rendering
  // ===========================================================================

  renderLoop(loop: IRLoop): string {
    // clientOnly loops must not render items at SSR time, but must still emit
    // the `loop:`/`/loop:` boundary marker pair (Hono and Go parity) so the
    // client runtime's mapArray() can locate the insertion anchor when
    // hydrating the array. Without the markers, mapArray() resolves
    // anchor = null and appends after sibling markers (#872). The marker id
    // disambiguates sibling `.map()` calls under the same parent (#1087).
    if (loop.clientOnly) {
      return `<: $bf.comment("loop:${loop.markerId}") | mark_raw :><: $bf.comment("/loop:${loop.markerId}") | mark_raw :>`
    }

    // A `.map()` destructure loop param (`([k, v]) => ...` / `({ id, user: {
    // name } }) => ...` / `({ id, ...rest }) => ...`) lowers to a Kolon `: my`
    // local per binding, walking each binding's structured `segments` path
    // (#2087 Phase B) into a native `.key` / `["key"]` / `[N]` accessor off
    // the per-item var — so the body's `$id` / `$name` / `$rest.flag` /
    // `{...rest}` all resolve natively, at any nesting depth.
    //
    // Check the IR's structured `paramBindings` field rather than
    // string-matching `loop.param`: Phase 1 populates `paramBindings`
    // iff the param is a destructure pattern (array or object); a
    // simple identifier leaves it `undefined`. The structured check is
    // robust to whitespace / formatting variants in the source.
    //
    // `isLowerableLoopDestructure` (#2087) still refuses: an object-rest
    // binding used any way other than member access (`rest.flag`) or a
    // `{...rest}` spread onto an intrinsic element (that needs the actual
    // residual *object*, which isn't always safe to materialize — see the
    // gate's own jsdoc for the full list); a `.filter().map(destructure)`
    // chain (the filter-param rewrite is out of scope here); and a
    // computed property key (`{ [k]: v }`, refused earlier as BF025).
    const destructure = !!(loop.paramBindings && loop.paramBindings.length > 0)
    const supportableDestructure = destructure && isLowerableLoopDestructure(loop)
    if (destructure && !supportableDestructure) {
      this.errors.push({
        code: 'BF104',
        severity: 'error',
        message: `Loop callback uses a destructure pattern (\`${loop.param}\`) that the Xslate adapter cannot lower — see the diagnostic detail for the specific shape.`,
        loc: loop.loc ?? { file: this.componentName + '.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
        suggestion: {
          message:
            `Options:\n` +
            `  1. If this is an object-rest binding (\`{ ...rest }\`), only reading \`rest.field\` or spreading \`{...rest}\` onto an intrinsic element lowers — other uses (passing \`rest\` to a function, rendering it as text) need the client runtime.\n` +
            `  2. If this is chained \`.filter().map(({ ... }) => ...)\`, hoist the destructure into a variable inside the callback body instead.\n` +
            `  3. Mark the loop position as @client-only so the destructure runs in JS on the client.\n` +
            `  4. Move the loop into a primitive that the adapter registers explicitly.`,
        },
      })
    }

    // A `.map()` loop whose array is a bare identifier bound to a
    // FUNCTION-scope local const with a non-statically-evaluable initializer
    // that reads props/signals (e.g. `const entries =
    // Object.entries(props.x ?? {}).filter(...)`) can't render correctly.
    // Module-scope consts (`isModule`, e.g. `const payments = [...]` at the
    // top of the file) are a DIFFERENT, already-working case handled
    // elsewhere. Function-scope locals get no per-render stash slot — this
    // adapter's only "elsewhere" for a local const is inlining its value at
    // the use site (`_resolveLiteralConst`'s numeric/single-quoted-string
    // fast path, or a static-record-literal lookup), never binding one as a
    // `: my` template local. Left unchecked, `: for $entries -> $__bf_item {`
    // over an undeclared `$entries` faults at request time instead of
    // failing loudly at build time. Pre-existing, general limitation,
    // orthogonal to #2087's destructure-binding work — newly reachable in
    // this adapter's test corpus only because the widened destructure gate
    // (#2087 Phase A/B) no longer refuses this fixture's `([emoji, users])
    // => ...` param first.
    const arrayName = loop.array.trim()
    if (/^[A-Za-z_$][\w$]*$/.test(arrayName)) {
      const arrayConst = (this.localConstants ?? []).find(c => c.name === arrayName)
      if (arrayConst && !arrayConst.isModule && this._resolveLiteralConst(arrayName) === null) {
        this.errors.push({
          code: 'BF101',
          severity: 'error',
          message: `Loop array \`${arrayName}\` is a local computed value (\`${arrayConst.value}\`) that the Xslate adapter cannot bind as a template variable — only numeric/string-literal locals inline at their use site.`,
          loc: loop.loc ?? { file: this.componentName + '.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
          suggestion: {
            message:
              'Pre-compute the array server-side and pass it as a prop, or mark the loop position as @client-only so it runs in JS on the client.',
          },
        })
      }
    }

    const rawArray = this.convertExpressionToKolon(loop.array)
    // Apply sort if present: wrap the loop array in the shared `$bf.sort`
    // helper, binding the sorted result to a per-iteration local so the
    // helper runs once.
    let array = rawArray
    if (loop.sortComparator) {
      // Evaluator-first (#2018 P3): serialize the comparator arrow body + emit
      // `$bf.sort_eval`; fall back to the structured `$bf.sort` for a
      // comparator the evaluator can't model (e.g. `localeCompare`). The
      // comparator now arrives as an `IRLoopSort` carrying the generic
      // `arrow` + its params.
      const sort = loop.sortComparator
      const sortEmit = (e: ParsedExpr) => this.convertExpressionToKolon('', e)
      const arrow = sort.arrow
      const params =
        arrow.kind === 'arrow' ? arrow.params : [sort.paramA, sort.paramB]
      const structured = sortComparatorFromArrow(arrow)
      array =
        renderSortEval(rawArray, arrow.kind === 'arrow' ? arrow.body : arrow, params, sortEmit) ??
        (structured !== null ? renderSortMethod(rawArray, structured) : rawArray)
    }
    const param = loop.param
    // Kolon binds the item directly via `for LIST -> $item`. The index, when
    // needed (`.keys().map(k => ...)` or an explicit `index` param), comes
    // from Text::Xslate's loop variable `$~param.index`.
    const renderedChildren = this.renderChildren(loop.children)

    // For `keys`-shape iterations the callback param IS the index. We iterate
    // the array but bind the loop var to a throwaway and expose the index as
    // `$param`. Kolon's `$~loopvar.index` provides the 0-based index.
    const loopVar = loop.objectIteration === 'entries'
      ? '__bf_pair'
      : loop.objectIteration
        ? param
        : loop.iterationShape === 'keys'
          ? '__bf_item'
          : supportableDestructure ? '__bf_item' : param

    // Index alias: when an explicit `index` param is present (`.map((x, i) =>
    // ...)`) or the iteration is `keys`-shaped, expose it via a `: my` Kolon
    // local bound to the loop variable's `.index` accessor. A supported
    // destructure param adds one `: my` local per binding, walking each
    // binding's `segments` path (#2087 Phase B):
    //   - fixed (`b.rest` unset): the FULL accessor from `$__bf_item`.
    //   - array-rest: `$bf.slice(parent, from, nil)` — the same runtime
    //     helper `.slice()` JS-method calls lower to (see `array-method.ts`),
    //     so the "no end → to length" arithmetic stays in one place. Kolon's
    //     undefined literal is `nil`, not Perl's `undef`.
    //   - object-rest: `$bf.omit(parent, [...excluded keys...])` — a TRUE
    //     residual hashref (not the whole item aliased), so both
    //     `$rest.flag` (member-access use) and `$bf.spread_attrs($rest)`
    //     (spread-onto-element use) see only the non-destructured keys.
    // `parent` is `$__bf_item` walked through the binding's PARENT-prefix
    // `segments` (empty at the loop root, per the `LoopParamBinding` jsdoc) —
    // NOT the same as a fixed binding's full-accessor segments.
    const indexLocalLines: string[] = []
    if (loop.objectIteration === 'entries') {
      // `key`/`value` bind off the `.kv()` pair (see the for-header below)
      // — no derived `.index` local needed, unlike the array
      // `iterationShape` cases.
      indexLocalLines.push(`: my $${loop.index ?? param} = $${loopVar}.key;`)
      indexLocalLines.push(`: my $${param} = $${loopVar}.value;`)
    } else if (loop.objectIteration) {
      // 'keys'/'values': `.keys()`/`.values()` already yield the bound
      // value directly — no derived local needed either.
    } else if (loop.iterationShape === 'keys') {
      indexLocalLines.push(`: my $${param} = $~${loopVar}.index;`)
    } else if (loop.index) {
      indexLocalLines.push(`: my $${loop.index} = $~${loopVar}.index;`)
    }
    if (supportableDestructure) {
      for (const b of loop.paramBindings ?? []) {
        const parent = kolonSegmentAccessor(`$${loopVar}`, b.segments ?? [])
        if (b.rest?.kind === 'object') {
          const exclude = b.rest.exclude.map(k => kolonStringLiteral(k.key)).join(', ')
          indexLocalLines.push(`: my $${b.name} = $bf.omit(${parent}, [${exclude}]);`)
        } else if (b.rest?.kind === 'array') {
          indexLocalLines.push(`: my $${b.name} = $bf.slice(${parent}, ${b.rest.from}, nil);`)
        } else {
          indexLocalLines.push(
            `: my $${b.name} = ${kolonSegmentAccessor(`$${loopVar}`, b.segments ?? [])};`,
          )
        }
      }
    }

    const prevInLoop = this.inLoop
    this.inLoop = true
    const prevLoopKeyDepth = this.currentLoopKeyDepth
    this.currentLoopKeyDepth = loop.depth
    // Re-render children now that inLoop is set (so nested components use the
    // loop-child naming convention). renderedChildren above was computed with
    // the previous flag; recompute under the loop flag.
    const childrenUnderLoop = this.renderChildren(loop.children)
    this.currentLoopKeyDepth = prevLoopKeyDepth
    this.inLoop = prevInLoop
    void renderedChildren

    // Whole-item conditional: prepend an always-present `<!--bf-loop-i:KEY-->`
    // anchor before each item's (possibly empty) conditional content so the
    // client's `mapArrayAnchored` can hydrate every SSR-rendered item by its
    // anchor.
    const bodyChildren =
      loop.bodyIsItemConditional && loop.key
        ? `<: $bf.comment("loop-i:" ~ ${this.convertExpressionToKolon(loop.key)}) | mark_raw :>\n${childrenUnderLoop}`
        : childrenUnderLoop

    const lines: string[] = []
    // Scoped per-call-site marker so sibling `.map()`s under the same parent
    // each get their own reconciliation range.
    lines.push(`<: $bf.comment("loop:${loop.markerId}") | mark_raw :>`)
    // `objectIteration` (#2168 object-entries-map): Kolon has no built-in
    // hash-destructure `for` target, so `'entries'` iterates `.kv()`
    // (yielding `{key, value}` pair objects, unpacked via the `: my`
    // locals above) while `'keys'`/`'values'` iterate `.keys()`/`.values()`
    // directly. All three are alphabetically sorted by Text::Xslate itself
    // (verified empirically) — not JS insertion order, a documented known
    // limitation for out-of-alphabetical-order data, same as Go/Rust.
    const forHeader = loop.objectIteration === 'entries'
      ? `: for ${array}.kv() -> $${loopVar} {`
      : loop.objectIteration === 'keys'
        ? `: for ${array}.keys() -> $${loopVar} {`
        : loop.objectIteration === 'values'
          ? `: for ${array}.values() -> $${loopVar} {`
          : `: for ${array} -> $${loopVar} {`
    lines.push(forHeader)
    for (const il of indexLocalLines) lines.push(il)

    // Handle filter().map() pattern by wrapping children in if-condition
    if (loop.filterPredicate) {
      let filterCond: string
      if (loop.filterPredicate.predicate) {
        filterCond = this.renderKolonFilterExpr(
          loop.filterPredicate.predicate,
          loop.filterPredicate.param
        )
      } else {
        filterCond = '1'
      }
      // Map filter param to loop param (e.g., $t → $todo)
      if (loop.filterPredicate.param !== param) {
        filterCond = filterCond.replace(
          new RegExp(`\\$${loop.filterPredicate.param}\\b`, 'g'),
          `$${param}`
        )
      }
      lines.push(`: if (${filterCond}) {`)
      lines.push(bodyChildren)
      lines.push(`: }`)
    } else {
      lines.push(bodyChildren)
    }

    lines.push(`: }`)
    lines.push(`<: $bf.comment("/loop:${loop.markerId}") | mark_raw :>`)

    return lines.join('\n')
  }

  // ===========================================================================
  // Component Rendering
  // ===========================================================================

  /**
   * AttrValue lowering for component invocation props (Kolon hashref-entry
   * form). Kolon CANNOT splat a hash into positional args, so every prop is
   * emitted as a `key => value` entry that the caller collects into ONE
   * hashref literal passed to `$bf.render_child(name, { ... })`.
   *
   * `jsx-children` returns empty — children are captured via a Kolon macro
   * below, not threaded through the hashref entry list.
   */
  private readonly componentPropEmitter: AttrValueEmitter = {
    emitLiteral: (value, name) => `${kolonHashKey(name)} => '${value.value}'`,
    emitExpression: (value, name) => {
      if (value.parts) {
        return `${kolonHashKey(name)} => ${this.convertTemplateLiteralPartsToKolon(value.parts)}`
      }
      // Inline object-literal child prop (carousel's `opts={{ align: 'start' }}`):
      // lower to a Kolon hashref so the child can serialize it (`data-opts`),
      // instead of refusing the bare object with BF101. (#1971 Perl) Read the
      // IR-carried structured `ParsedExpr` tree (#2018) instead of re-parsing
      // `value.expr` with `ts.createSourceFile`; the lowering returns null for
      // any non-object-literal shape, so the common non-object case falls
      // straight through to the bare-expression path below.
      if (value.parsed) {
        const hashref = objectLiteralExprToKolonHashref(this.spreadCtx, value.parsed)
        if (hashref !== null) return `${kolonHashKey(name)} => ${hashref}`
      }
      return `${kolonHashKey(name)} => ${this.convertExpressionToKolon(value.expr)}`
    },
    emitSpread: (value) => {
      // Kolon hashrefs can't be splatted into the entry list the way Perl
      // `%{...}` flattens into a list. `renderComponent` handles EVERY
      // spread shape itself (both the enumerated propsObject case and the
      // general chained `.merge(...)` fold — see its own docstring), so
      // this callback is never reached for `kind: 'spread'` props; it
      // only exists to satisfy the `AttrValueEmitter` interface.
      return this.convertExpressionToKolon(value.expr)
    },
    emitTemplate: (value, name) =>
      `${kolonHashKey(name)} => ${this.convertTemplateLiteralPartsToKolon(value.parts)}`,
    emitBooleanAttr: (_value, name) => `${kolonHashKey(name)} => 1`,
    emitBooleanShorthand: (_value, name) => `${kolonHashKey(name)} => 1`,
    // JSX children flow through the Kolon macro capture below; they're not
    // part of the hashref entry list.
    emitJsxChildren: () => '',
  }

  /**
   * A `renderComponent` props hashref, built as an ORDERED sequence of
   * segments so `{...before, ...spread, after: 1}` JSX spread semantics
   * (later entries win) survive the trip through Kolon, which has no
   * hash-splat syntax (no `%$h`-into-hashref-literal form — verified: parse
   * error). Each `'entries'` segment is a literal Kolon hashref
   * `{ k => v, ... }`; each `'spread'` segment is an arbitrary expression
   * lowered from a `{...expr}` prop. `combineComponentPropSegments` folds
   * the sequence into ONE expression via chained `.merge(...)` calls
   * (Kolon's builtin hash method, later argument wins on key conflict,
   * matching `Object.assign`/JSX order).
   */
  private componentPropSegmentEntries(
    segments: Array<{ kind: 'entries'; parts: string[] } | { kind: 'spread'; expr: string }>,
  ): string[] {
    const last = segments[segments.length - 1]
    if (last && last.kind === 'entries') return last.parts
    const seg = { kind: 'entries' as const, parts: [] as string[] }
    segments.push(seg)
    return seg.parts
  }

  /**
   * Fold ordered prop segments into a single Kolon expression via chained
   * `.merge(...)` calls — Kolon's builtin hash method, later argument wins
   * on key conflict, exactly like `{...a, ...b}`. A spread segment's
   * expression is wrapped `(EXPR // {})` before merging: `.merge(undef)`
   * warns "Merging value is not a HASH reference" (verified against real
   * Text::Xslate 3.5.9), so the defined-or guard normalises a missing bag
   * (e.g. `$children.props` when `children` was never passed — Kolon
   * tolerates the chained dot-access on an undefined value itself,
   * verified empirically) to an empty hashref first. If the fold starts
   * with a spread segment, the base is just `($SPREAD // {})`; a
   * following segment chains `.merge({...})` onto it. Empty `'entries'`
   * segments are dropped so a leading/trailing spread doesn't drag in a
   * needless `{}.merge(...)`. Returns `'{}'` when every segment is empty
   * (no props at all).
   */
  private combineComponentPropSegments(
    segments: ReadonlyArray<{ kind: 'entries'; parts: string[] } | { kind: 'spread'; expr: string }>,
  ): string {
    let acc: string | null = null
    for (const seg of segments) {
      if (seg.kind === 'entries') {
        if (seg.parts.length === 0) continue
        const text = `{ ${seg.parts.join(', ')} }`
        acc = acc === null ? text : `${acc}.merge(${text})`
      } else {
        const text = `(${seg.expr} // {})`
        acc = acc === null ? text : `${acc}.merge(${text})`
      }
    }
    return acc ?? '{}'
  }

  renderComponent(comp: IRComponent): string {
    type Segment = { kind: 'entries'; parts: string[] } | { kind: 'spread'; expr: string }
    const segments: Segment[] = [{ kind: 'entries', parts: [] }]
    const currentEntries = () => this.componentPropSegmentEntries(segments)
    // Named JSX-valued props OTHER than the reserved `children`
    // (`header={<strong>Title</strong>}`, #2168 jsx-element-prop) each get
    // their own macro, prepended to the final returned string below —
    // same mechanism as the reserved children macro, just keyed by the
    // prop's own name instead of `children`.
    const namedSlotMacros: string[] = []

    for (const p of comp.props) {
      // Skip callback props (onXxx) and `ref` — both are client-only for
      // SSR (Hono renders neither; the client JS wires them at hydration).
      if ((p.name.match(/^on[A-Z]/) || p.name === 'ref') && p.value.kind === 'expression') continue
      if (p.value.kind === 'jsx-children' && p.name !== 'children') {
        const prevInLoop = this.inLoop
        this.inLoop = false
        const slotBody = this.renderChildren(p.value.children)
        this.inLoop = prevInLoop
        // Purely counter-based — NOT derived from `p.name` or `comp.slotId`.
        // A JSX prop name can contain characters (`data-slot`) that aren't a
        // valid Kolon macro identifier, and `comp.slotId` alone would
        // collide across two named-slot props on the same component
        // invocation (unlike the reserved children slot, there's only ever
        // one of those per invocation).
        const macroName = `bf_prop_${this.childrenCaptureCounter++}`
        namedSlotMacros.push(`<: macro ${macroName} -> () { :>${slotBody}<: } :>`)
        currentEntries().push(`${kolonHashKey(p.name)} => ${macroName}()`)
        continue
      }
      if (p.value.kind === 'spread') {
        const trimmed = p.value.expr.trim()
        // SolidJS-style props identifier (`function(props: P)`) has no
        // matching runtime hash in Kolon scope — props arrive as a flat
        // set of top-level template vars, so enumerate the
        // analyzer-extracted props params into hashref entries instead of
        // treating it as a runtime spread expression.
        if (this.propsObjectName && this.propsObjectName === trimmed) {
          for (const pp of this.propsParams) {
            currentEntries().push(`${pp.name} => $${pp.name}`)
          }
          continue
        }
        // Every other spread shape (a destructure rest-bag `props`, a
        // member-access bag like `children.props`, an intrinsic-element
        // spread helper's own operand, …) — Kolon hashref literals can't
        // splat a runtime hash into named entries at a call site, but the
        // builtin `.merge` method can fold it into the accumulated
        // hashref at the right ordinal position, mirroring Twig's
        // `|merge` / Jinja's `dict(base, **top)`: no compile-time
        // filtering of onXxx/ref keys out of the runtime bag (the render
        // contract tolerates them, same as the other spread-lowering
        // adapters).
        segments.push({ kind: 'spread', expr: this.convertExpressionToKolon(p.value.expr) })
        continue
      }
      const lowered = emitAttrValue(p.value, this.componentPropEmitter, p.name)
      if (lowered) currentEntries().push(lowered)
    }
    // Pass slot ID so the child renderer can set correct scope ID for
    // hydration. Skip for loop children — they use ComponentName_random.
    // Appended to whatever the trailing entries segment is so a spread's
    // own `_bf_slot`/`children` keys (if any) never win over these
    // compiler-controlled entries.
    if (comp.slotId && !this.inLoop) {
      currentEntries().push(`_bf_slot => '${comp.slotId}'`)
    }
    const tplName = this.toTemplateName(comp.name)

    // Resolve the effective children: a nested `<Box>…</Box>` populates
    // `comp.children`; an attribute-form `<Box children={<jsx/>} />` lands in
    // a `jsx-children` AttrValue on the corresponding prop.
    const effectiveChildren: IRNode[] = comp.children.length > 0
      ? comp.children
      : resolveJsxChildrenProp(comp.props)

    if (effectiveChildren.length > 0) {
      // Forward JSX children via a Kolon macro. The macro body is evaluated in
      // the parent's template scope (signals, conditionals) and produces the
      // children HTML; the macro call result is passed as the `children` entry
      // of the render_child hashref. `render_child` materializes a CODE-ref
      // children value through the backend before handing it to the child.
      const prevInLoop = this.inLoop
      this.inLoop = false
      const childrenBody = this.renderChildren(effectiveChildren)
      this.inLoop = prevInLoop
      const macroName = `bf_children_${comp.slotId ?? 'c' + this.childrenCaptureCounter++}`
      currentEntries().push(`children => ${macroName}()`)
      const dict = this.combineComponentPropSegments(segments)
      return `${namedSlotMacros.join('')}<: macro ${macroName} -> () { :>${childrenBody}<: } :><: $bf.render_child('${tplName}', ${dict}) | mark_raw :>`
    }

    const isEmpty = segments.every(s => s.kind === 'entries' && s.parts.length === 0)
    const hashEntries = isEmpty ? '' : `, ${this.combineComponentPropSegments(segments)}`
    return `${namedSlotMacros.join('')}<: $bf.render_child('${tplName}'${hashEntries}) | mark_raw :>`
  }

  private childrenCaptureCounter = 0

  /** Uniquifies the `presenceOrUndefined` temp binding (`$bf_puN`) so two
   *  presence-folded attrs in one template don't collide. */
  private presenceVarCounter = 0

  private toTemplateName(componentName: string): string {
    // Convert PascalCase to snake_case for template naming.
    return componentName
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '')
  }

  // ===========================================================================
  // If-Statement (Conditional Return) Rendering
  // ===========================================================================

  private renderIfStatement(ifStmt: IRIfStatement): string {
    const condition = this.convertExpressionToKolon(ifStmt.condition)
    const consequent = ifStmt.consequent.type === 'if-statement'
      ? this.renderIfStatement(ifStmt.consequent as IRIfStatement)
      : this.renderNode(ifStmt.consequent)
    let result = `: if (${condition}) {\n${consequent}\n`

    if (ifStmt.alternate) {
      if (ifStmt.alternate.type === 'if-statement') {
        const altResult = this.renderIfStatement(ifStmt.alternate as IRIfStatement)
        // Replace leading ": if" with ": } elsif"
        result += altResult.replace(/^: if/, ': } elsif')
      } else {
        const alternate = this.renderNode(ifStmt.alternate)
        result += `: } else {\n${alternate}\n`
      }
    }

    result += `: }`
    return result
  }

  // ===========================================================================
  // Fragment & Slot Rendering
  // ===========================================================================

  private renderFragment(fragment: IRFragment): string {
    const children = this.renderChildren(fragment.children)
    if (fragment.needsScopeComment) {
      return `<: $bf.scope_comment() | mark_raw :>${children}`
    }
    return children
  }

  private renderSlot(_slot: IRSlot): string {
    // Captured children arrive under the `children` key (see renderComponent's
    // macro capture + render_child call), so the var is `$children`, not
    // `$content`. The content is already-rendered markup, so emit it raw —
    // otherwise Kolon's html-escape would entity-escape the child tags.
    // (The IR producer doesn't currently emit `slot` nodes — `{children}`
    // lowers to an expression whose macro-captured value is already raw — so
    // this is defensive correctness for if/when a slot node is produced.)
    return `<: $children | mark_raw :>`
  }

  override renderAsync(node: IRAsync): string {
    const fallback = this.renderNode(node.fallback)
    const children = this.renderChildren(node.children)
    // Capture the fallback into a Kolon macro and pass its rendered HTML to
    // `$bf.async_boundary`, which wraps it in a `<div bf-async="aX">`
    // placeholder. Same shape as `renderComponent`'s children capture.
    const macroName = `bf_async_fallback_${node.id}`
    return `<: macro ${macroName} -> () { :>${fallback}<: } :><: $bf.async_boundary('${node.id}', ${macroName}()) | mark_raw :>\n${children}`
  }

  // ===========================================================================
  // Attribute Rendering
  // ===========================================================================

  /**
   * AttrValue lowering for intrinsic-element attributes (Kolon).
   */
  private readonly elementAttrEmitter: AttrValueEmitter = {
    emitLiteral: (value, name) => `${name}="${escapeHtml(value.value)}"`,
    emitExpression: (value, name) => {
      // `style={{ … }}` object literal → a CSS string with dynamic values
      // interpolated, instead of refusing the bare object with BF101 (#1322).
      if (name === 'style') {
        const css = this.tryLowerStyleObject(value.expr)
        if (css !== null) return `style="${css}"`
      }
      // Refuse shapes that the lowering pipeline can't represent in Kolon —
      // tagged-template-literal call expressions (`cn\`base \${tone()}\``).
      // Same gate as the Mojo adapter.
      if (this.refuseUnsupportedAttrExpression(value.expr, name)) {
        return ''
      }
      // Hono-style nullish omission: a bare reference to an optional,
      // no-default prop (`nullableOptionalProps`) is `defined`-guarded so the
      // attribute drops instead of rendering `attr=""`. Narrowly scoped to bare
      // identifiers — member exprs, calls, and concrete/defaulted props are
      // unaffected.
      const bareId = value.expr.trim()
      // Normalize a props-object access (`props.id`) to its bare prop name
      // (`id`) so the nullable-optional set — keyed by bare name — matches the
      // SolidJS props-object pattern, not just destructured params.
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
        const perl = this.convertExpressionToKolon(value.expr)
        const body =
          isBooleanResultExpr(value.expr) || isAriaBooleanAttr(name) || this.isBooleanTypedPropRef(value.expr)
            ? `${name}="<: $bf.bool_str(${perl}) :>"`
            : `${name}="<: ${perl} :>"`
        // Kolon `:` line directives must each stand alone on their own line, so
        // wrap in newlines (`normalizeHTML` collapses the surrounding space).
        return `\n: if (defined ${perl}) {\n${body}\n: }\n`
      }
      if (isBooleanAttr(name)) {
        // Boolean attributes: render conditionally (present or absent).
        return `<: ${this.convertExpressionToKolon(value.expr)} ? '${name}' : '' :>`
      }
      if (value.presenceOrUndefined) {
        // `attr={expr || undefined}` on a NON-boolean attribute: Hono
        // renders the attr with its stringified value when truthy and
        // omits it otherwise (`aria-disabled={isDisabled() || undefined}`
        // → `aria-disabled="true"`), so bare presence would diverge.
        // Route through `bool_str` when the name/shape witnesses a
        // boolean value, same as the unconditional path below (#1897).
        // Bind to a temp first so the expression evaluates once, not in
        // both the guard and the value.
        const perl = this.convertExpressionToKolon(value.expr)
        const tmp = `$bf_pu${this.presenceVarCounter++}`
        const body =
          isBooleanResultExpr(value.expr) || isAriaBooleanAttr(name) || this.isBooleanTypedPropRef(value.expr)
            ? `${name}="<: $bf.bool_str(${tmp}) :>"`
            : `${name}="<: ${tmp} :>"`
        return `\n: my ${tmp} = ${perl};\n: if (${tmp}) {\n${body}\n: }\n`
      }
      // `attr={cond ? value : undefined}` OMITS the attribute on the
      // falsy branch (Hono drops undefined-valued attributes) — wrap the
      // whole attribute in the condition instead of rendering `attr=""`
      // (#1897, pagination's `aria-current={props.isActive ? 'page' :
      // undefined}`). Same parity rule the Go adapter applies.
      {
        const m = this.parseUndefinedAlternateTernary(value.expr)
        if (m) {
          const cond = this.convertExpressionToKolon(m.condition)
          const val = this.convertExpressionToKolon(m.consequent)
          return `\n: if (${cond}) {\n${name}="<: ${val} :>"\n: }\n`
        }
      }
      // Boolean-result handling: route boolean-shaped values through
      // `$bf.bool_str` so the wire bytes match JS `String(boolean)`.
      const perl = this.convertExpressionToKolon(value.expr)
      if (isBooleanResultExpr(value.expr) || isAriaBooleanAttr(name) || this.isBooleanTypedPropRef(value.expr)) {
        return `${name}="<: $bf.bool_str(${perl}) :>"`
      }
      return `${name}="<: ${perl} :>"`
    },
    emitBooleanAttr: (_value, name) => name,
    emitTemplate: (value, name) =>
      `${name}="<: ${this.convertTemplateLiteralPartsToKolon(value.parts)} :>"`,
    // Spread attributes (`<div {...attrs()} />`) lower through the
    // `$bf.spread_attrs` runtime helper, mirroring the Mojo adapter.
    emitSpread: (value) => {
      if (this.refuseUnsupportedAttrExpression(value.expr, '...')) {
        return ''
      }
      // SolidJS-style props identifier (`(props: P) { <el {...props}/> }`) has
      // no matching `$props` variable in Kolon's scope — props arrive as a
      // flat set of top-level vars. Emit an inline hashref literal enumerating
      // the analyzer-extracted props params.
      const trimmed = value.expr.trim()
      if (this.propsObjectName && this.propsObjectName === trimmed) {
        const entries = this.propsParams.map(p =>
          `${JSON.stringify(p.name)} => $${p.name}`,
        )
        return `<: $bf.spread_attrs({${entries.join(', ')}}) | mark_raw :>`
      }
      // Conditional inline-object spread (#textarea):
      //   `{...(COND ? { 'aria-describedby': describedBy } : {})}`
      // Emit a Kolon inline ternary of hashrefs — Perl truthiness handles the
      // condition for free, and the falsy `{}` branch OMITS the key
      // (`spread_attrs` does NOT emit empty hashref entries).
      // Read the spread's IR-carried `ParsedExpr` tree (#2018) instead of
      // re-parsing `trimmed` with `ts.createSourceFile`.
      const ternaryHashref = conditionalSpreadToKolon(this.spreadCtx, value.parsed)
      if (ternaryHashref !== null) {
        return `<: $bf.spread_attrs(${ternaryHashref}) | mark_raw :>`
      }
      // Function-scope local const holding a conditional inline-object
      //   `const sizeAttrs = size ? {…} : {}` then `{...sizeAttrs}`
      // (#checkbox / icon). Resolve the bare identifier to its initializer text
      // and route through the same conditional-spread lowering. Only
      // function-scope (`!isModule`) consts whose value is NOT itself a bare
      // identifier (loop guard) are considered.
      if (/^[A-Za-z_$][\w$]*$/.test(trimmed)) {
        const localConst = (this.localConstants ?? []).find(
          c => c.name === trimmed && !c.isModule,
        )
        if (localConst?.value !== undefined) {
          const initTrimmed = localConst.value.trim()
          if (!/^[A-Za-z_$][\w$]*$/.test(initTrimmed)) {
            // The local const's initializer text isn't carried as a structured
            // tree on the spread attr, so parse it once via the shared
            // `parseExpression` (the analyzer's own entry) — not
            // `ts.createSourceFile` — mirroring go-template's same local-const
            // resolution path.
            const resolved = conditionalSpreadToKolon(
              this.spreadCtx,
              parseExpression(initTrimmed),
            )
            if (resolved !== null) {
              return `<: $bf.spread_attrs(${resolved}) | mark_raw :>`
            }
          }
        }
      }
      const perlExpr = this.convertExpressionToKolon(value.expr)
      return `<: $bf.spread_attrs(${perlExpr}) | mark_raw :>`
    },
    // Neither variant is legal on intrinsic elements.
    emitBooleanShorthand: () => '',
    emitJsxChildren: () => '',
  }

  /**
   * Lower a `style={{ … }}` object literal to a CSS string with dynamic values
   * interpolated as Kolon actions, e.g. `{ backgroundColor: color }` →
   * `background-color:<: $color :>`. Returns null when the shape is unsupported
   * or any value can't be lowered (caller falls through to BF101). (#1322)
   */
  private tryLowerStyleObject(expr: string): string | null {
    const entries = parseStyleObjectEntries(expr)
    if (!entries) return null
    for (const e of entries) {
      if (e.kind === 'expr' && !isSupported(parseExpression(e.expr)).supported) return null
    }
    // The static CSS key + literal value are inlined into a double-quoted
    // `style="..."` attribute as raw template text, so HTML-attr escape them
    // (a value like `'"'` would otherwise break the attribute / inject
    // markup). The dynamic arm's `<: … :>` is HTML-escaped by Kolon.
    return entries
      .map(e =>
        e.kind === 'literal'
          ? `${this.escapeAttrText(e.cssKey)}:${this.escapeAttrText(e.value)}`
          : `${this.escapeAttrText(e.cssKey)}:<: ${this.convertExpressionToKolon(e.expr)} :>`,
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
      // the unsupported-expression lowering is never reached for a deferred
      // predicate (no BF101 / BF102). #1966
      if (attr.clientOnly) continue
      // `dangerouslySetInnerHTML` never renders as an HTML attribute — it's
      // handled by `renderDangerousInnerHtml` instead, which replaces the
      // element's children. Skip it here so its `{ __html: ... }` object
      // literal never reaches the generic object-literal BF101 refusal
      // (which would double-report alongside the purpose-built one).
      if (isDangerousInnerHtmlAttr(attr)) continue
      // Rewrite JSX special-prop names to their HTML-attribute counterparts.
      let attrName: string
      if (attr.name === 'className') attrName = 'class'
      else if (attr.name === 'key') {
        const depth = this.currentLoopKeyDepth
        attrName = depth > 0 ? `data-key-${depth}` : 'data-key'
      }
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
    return `bf-s="<: $bf.scope_attr() :>" <: $bf.hydration_attrs() | mark_raw :> <: $bf.props_attr() | mark_raw :>`
  }

  renderSlotMarker(slotId: string): string {
    return `${BF_SLOT}="${slotId}"`
  }

  renderCondMarker(condId: string): string {
    return `${BF_COND}="${condId}"`
  }

  // ===========================================================================
  // Filter Predicate Rendering (ParsedExpr → Kolon)
  // ===========================================================================

  /**
   * Convert a ParsedExpr AST to a Kolon expression string for filter
   * predicates. Wraps the shared ParsedExpr dispatcher with an
   * `XslateFilterEmitter` carrying the predicate's loop param and any
   * block-body local var aliases.
   */
  private renderKolonFilterExpr(
    expr: ParsedExpr,
    param: string,
    localVarMap: Map<string, string> = new Map(),
  ): string {
    return emitParsedExpr(
      expr,
      new XslateFilterEmitter(
        param,
        localVarMap,
        n => this._isStringValueName(n),
        // A nested callback method inside the predicate has no Kolon scalar
        // form — surface BF101 (#2038) instead of silently degrading it to
        // its receiver.
        (message, reason) => this._recordExprBF101(message, reason),
      ),
    )
  }

  // ===========================================================================
  // Expression Conversion: JS → Kolon
  // ===========================================================================

  private convertTemplateLiteralPartsToKolon(literalParts: IRTemplatePart[]): string {
    const parts: string[] = []
    for (const part of literalParts) {
      if (part.type === 'string') {
        parts.push(this.substituteJsInterpolationsToKolon(part.value))
      } else if (part.type === 'ternary') {
        const cond = this.convertExpressionToKolon(part.condition)
        parts.push(`(${cond} ? '${part.whenTrue}' : '${part.whenFalse}')`)
      } else if (part.type === 'lookup') {
        // `${MAP[KEY]}` against a Record<T, string> literal — emit a Kolon
        // hash literal with an immediate `{ ... }[$key]` lookup. Kolon's `//`
        // turns a miss into an empty string, matching the go-template
        // adapter's "empty when no case matches" semantics.
        const keyExpr = this.convertExpressionToKolon(part.key)
        const entries = Object.entries(part.cases)
          .map(([k, v]) => `'${k}' => '${v}'`)
          .join(', ')
        parts.push(`({ ${entries} }[${keyExpr}] // '')`)
      }
    }
    // Join with Kolon string concatenation (`~`).
    return parts.length === 1 ? parts[0] : parts.join(' ~ ')
  }

  /**
   * Translate `${EXPR}` interpolations in a static template-part string into
   * Kolon variable references and concatenate them with the surrounding
   * literal text.
   */
  private substituteJsInterpolationsToKolon(s: string): string {
    const segments: string[] = []
    const re = /\$\{([^}]+)\}/g
    let lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(s)) !== null) {
      if (m.index > lastIndex) {
        segments.push(`'${s.slice(lastIndex, m.index)}'`)
      }
      segments.push(this.convertExpressionToKolon(m[1].trim()))
      lastIndex = re.lastIndex
    }
    if (lastIndex < s.length) {
      segments.push(`'${s.slice(lastIndex)}'`)
    }
    if (segments.length === 0) return `''`
    return segments.length === 1 ? segments[0] : `(${segments.join(' ~ ')})`
  }

  /**
   * Refuse JS expression shapes that have no idiomatic Kolon representation:
   * object literals (`style={{...}}`) and tagged-template-literal call
   * expressions (`cn\`base \${tone()}\``). Records `BF101`. Returns `true`
   * when the shape was rejected (caller should drop the attribute).
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
        message: 'The Xslate adapter cannot lower JS object literals or tagged-template-literal expressions into Kolon. Move the expression into a `\'use client\'` component (so hydration computes it), or expand it into discrete attributes whose values are values the adapter can lower.',
      },
    })
    return true
  }

  /**
   * Build the EmitContext seam the top-level `ParsedExpr` emitter depends on.
   * Built as a private object (the adapter does NOT `implements XslateEmitContext`)
   * so the wrapped bookkeeping — `_searchParamsLocals`, the const/record
   * resolvers, BF101 recording, the filter-predicate entry — stays private and
   * off the exported adapter's public type, matching the Go adapter's
   * `emitCtx` and the `spreadCtx` / `memoCtx` seams below.
   */
  private get emitCtx(): XslateEmitContext {
    return {
      _searchParamsLocals: this._searchParamsLocals,
      _resolveModuleStringConst: (name) => this._resolveModuleStringConst(name),
      _resolveLiteralConst: (name) => this._resolveLiteralConst(name),
      _resolveStaticRecordLiteral: (o, k) => this._resolveStaticRecordLiteral(o, k),
      _isStringValueName: (name) => this._isStringValueName(name),
      _recordExprBF101: (message, reason) => this._recordExprBF101(message, reason),
      _renderKolonFilterExprPublic: (e, p) => this._renderKolonFilterExprPublic(e, p),
    }
  }

  /**
   * Build the narrow context the extracted spread lowering depends on. Passing
   * a purpose-built object (rather than `this`) keeps the adapter's bookkeeping
   * members private — they stay internal implementation detail, not part of the
   * exported class's public surface.
   */
  private get spreadCtx(): XslateSpreadContext {
    return {
      componentName: this.componentName,
      errors: this.errors,
      localConstants: this.localConstants,
      propsParams: this.propsParams,
      convertExpressionToKolon: (e, preParsed) => this.convertExpressionToKolon(e, preParsed),
    }
  }

  /** Build the narrow context the extracted memo seeding depends on. */
  private get memoCtx(): XslateMemoContext {
    return { convertExpressionToKolon: (e, preParsed) => this.convertExpressionToKolon(e, preParsed) }
  }

  private convertExpressionToKolon(expr: string, preParsed?: ParsedExpr): string {
    // Parse-first lowering — parity with the Mojo adapter's
    // `convertExpressionToPerl`. Parse the JS expression once, gate it on the
    // shared `isSupported`, and render every supported shape through the AST
    // emitter. Unsupported shapes surface as BF101.
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

    // Registered call lowerings (#2057) — including the built-in `queryHref`
    // plugin (#2042), which lowers `queryHref(base, { … })` to a neutral
    // `guard-list` on the `query` helper → `$bf.query(base, <triples>)`.
    // Recognised before the support gate because the object-literal arg is
    // otherwise `unsupported` (BF101). The `query` helper includes a pair iff its
    // guard is truthy AND its value is a non-empty string (the client's
    // `if (value)`): a plain `key: v` passes guard `1`, a conditional
    // `key: cond ? v : undefined` passes the lowered cond. Only the `query`
    // helper renders to `$bf.query`; another guard-list helper must not be
    // silently mis-rendered as a query.
    if (parsed.kind === 'call') {
      for (const matcher of this._loweringMatchers) {
        const node = matcher(parsed.callee, parsed.args)
        if (node?.kind === 'guard-list' && node.helper === 'query') {
          const qArgs = queryHrefArgs(node, n => this.renderParsedExprToKolon(n))
          return `$bf.query(${qArgs.join(', ')})`
        }
        // Generic `helper-call` (#2069) — the neutral vocabulary's escape
        // hatch for a userland `LoweringPlugin` that lowers to a single
        // runtime-helper invocation. `$bf.<helper>(args…)` mirrors the
        // `query` helper's own naming convention exactly: the framework
        // renders the call, the plugin author registers `<helper>` as a
        // Kolon-callable method on the `$bf` vars entry in their own
        // runtime — same contract as `$bf.query` itself, just not built in.
        if (node?.kind === 'helper-call' && isValidHelperId(node.helper)) {
          const argsX = node.args.map(a => this.renderParsedExprToKolon(a))
          return `$bf.${node.helper}(${argsX.join(', ')})`
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
            ? `${support.reason}\n\nOptions:\n1. Use /* @client */ for client-side evaluation\n2. Pre-compute the value in the backend`
            : 'Options:\n1. Use /* @client */ for client-side evaluation\n2. Pre-compute the value in the backend',
        },
      })
      // Safe Kolon empty-string literal — valid in every context the result
      // might land in.
      return "''"
    }

    return this.renderParsedExprToKolon(parsed)
  }

  /**
   * Render a full ParsedExpr tree to Kolon for top-level (non-filter)
   * expressions where identifiers are signals / template vars.
   */
  private renderParsedExprToKolon(expr: ParsedExpr): string {
    return emitParsedExpr(expr, new XslateTopLevelEmitter(this.emitCtx))
  }

  /** Whether `name` (a signal getter or prop) holds a string value, so an
   *  equality comparison against it should use Perl `eq`/`ne`. */
  private _isStringValueName(name: string): boolean {
    return this.stringValueNames.has(name)
  }

  /**
   * Resolve an identifier to its inlined Kolon single-quoted literal when it
   * names a module pure-string const, else `null` (caller falls back to the
   * normal `$name` stash lowering). Loop-bound names shadow module consts, so
   * never inline inside a loop body. Returns `'<escaped>'`.
   */
  /**
   * Resolve `IDENT.key` over a module object-literal const to its Kolon
   * literal (`variantClasses.ghost` in a class template literal —
   * #1897). Same compile-time inlining family as
   * `_resolveModuleStringConst`; returns `null` for any non-static shape.
   */
  /**
   * Whether `expr` is a bare reference to a boolean-TYPED prop
   * (`props.isActive` / destructured `isActive`) — used to route the
   * binding through `bool_str` even though the expression itself is
   * structurally opaque (#1897).
   */
  /**
   * Parse `cond ? value : undefined` (or `: null`), returning the
   * condition/consequent source spans, else `null`. Used for the
   * attribute-omission rule (#1897).
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

  isBooleanTypedPropRef(expr: string): boolean {
    let bare = expr.trim()
    if (this.propsObjectName && bare.startsWith(`${this.propsObjectName}.`)) {
      bare = bare.slice(this.propsObjectName.length + 1)
    }
    if (!/^[A-Za-z_$][\w$]*$/.test(bare)) return false
    return this.booleanTypedProps.has(bare)
  }

  /**
   * Inline a const (any scope) whose initializer is a pure numeric or
   * single-quoted string literal (`const totalPages = 5`, #1897
   * pagination) — function-scope consts never reach the per-render
   * stash, so a bare `$totalPages` renders empty.
   */
  private _resolveLiteralConst(name: string): string | null {
    const c = (this.localConstants ?? []).find(lc => lc.name === name)
    if (c?.value === undefined) return null
    const v = c.value.trim()
    if (/^-?\d+(\.\d+)?$/.test(v)) return v
    const strLit = /^'([^'\\]*)'$/.exec(v) ?? /^"([^"\\]*)"$/.exec(v)
    if (strLit) return `'${strLit[1].replace(/[\\']/g, m => `\\${m}`)}'`
    return null
  }

  private _resolveStaticRecordLiteral(objectName: string, key: string): string | null {
    const hit = lookupStaticRecordLiteral(objectName, key, this.localConstants)
    if (!hit) return null
    return hit.kind === 'number'
      ? hit.text
      : `'${hit.text.replace(/[\\']/g, m => `\\${m}`)}'`
  }

  private _resolveModuleStringConst(name: string): string | null {
    // A loop body may bind `my $<param>` that shadows a module const of the
    // same name; never inline inside one (conservative — drop to `$name`).
    if (this.inLoop) return null
    const value = this.moduleStringConsts.get(name)
    if (value === undefined) return null
    return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
  }

  private _recordExprBF101(message: string, reason?: string): void {
    this.errors.push({
      code: 'BF101',
      severity: 'error',
      message,
      loc: { file: this.componentName + '.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
      suggestion: {
        message: reason
          ? `${reason}\n\nOptions:\n1. Use /* @client */ for client-side evaluation\n2. Pre-compute the value in the backend`
          : 'Options:\n1. Use /* @client */ for client-side evaluation\n2. Pre-compute the value in the backend',
      },
    })
  }

  /** Internal hook for higher-order: predicate body re-uses the filter emitter. */
  private _renderKolonFilterExprPublic(expr: ParsedExpr, param: string): string {
    return this.renderKolonFilterExpr(expr, param)
  }
}

export const xslateAdapter = new XslateAdapter()

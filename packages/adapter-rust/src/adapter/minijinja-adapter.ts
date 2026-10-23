/**
 * BarefootJS minijinja (Rust) Template Adapter
 *
 * Generates Jinja2-compatible template files (.j2) from BarefootJS IR,
 * rendered at conformance-test / runtime by the `minijinja` Rust crate
 * (`packages/adapter-rust/runtime/`) instead of Python's `jinja2` package.
 *
 * Near-verbatim port of the Jinja2 adapter
 * (packages/adapter-jinja/src/adapter/jinja-adapter.ts), itself a
 * near-mechanical port of the Text::Xslate (Kolon) adapter
 * (packages/adapter-xslate/src/adapter/xslate-adapter.ts). The EMITTED
 * TEMPLATE SYNTAX IS IDENTICAL to adapter-jinja's output — minijinja 2.21 is
 * Jinja2-compatible for everything this adapter emits (verified by an
 * orchestrator spike; see the Environment contract below). Only identity
 * fields differ (`MinijinjaAdapter`, `name = 'minijinja'`, `extension =
 * '.j2'`) plus the render engine that interprets the syntax at request time.
 * The syntax table below is therefore inherited unchanged from the Jinja2
 * adapter's own header, which in turn documents its lineage from Kolon:
 *
 *   Kolon `<: EXPR :>`                → Jinja `{{ EXPR }}`                (HTML-escaped)
 *   Kolon `<: EXPR | mark_raw :>`     → Jinja `{{ EXPR | safe }}`         (raw)
 *   Kolon `$bf.method(args)`          → Jinja `bf.method(args)`
 *   Kolon `$name`                     → Jinja `name`
 *   Kolon `: if (C) { A : } else { B : }` → Jinja `{% if C %}A{% else %}B{% endif %}` (`elsif` → `{% elif %}`)
 *   Kolon `: for $arr -> $item { … : }`   → Jinja `{% for item in arr %}…{% endfor %}`
 *   Kolon `: my $x = e;`              → Jinja `{% set x = e %}`
 *   Kolon `{ k => v }` hashref        → Jinja `{'k': v}` dict literal (ALWAYS quoted key — see `lib/minijinja-naming.ts`)
 *   Kolon `~` concat                  → Jinja `~` concat
 *   Kolon `//` defined-or             → `(l if (l is defined and l is not none) else r)` inline (Jinja has no `//`; the `is defined` guard also treats a context var that was never seeded — Jinja's `ChainableUndefined`/minijinja's `UndefinedBehavior::Chainable` — as nullish, matching JS `??`'s null-OR-undefined check — see `expr/emitters.ts`'s `logical` for the full rationale)
 *   Kolon macro children capture      → Jinja `{% set NAME %}…{% endset %}` set-block (see "Children capture" below)
 *
 * The `minijinja::Environment` this adapter's output assumes (constructed in
 * the Rust runtime's `backend_minijinja.rs`, verified by the orchestrator
 * spike against minijinja 2.21.0 — see that crate's module docs for the
 * full verification notes):
 *
 *   env.set_loader(minijinja::path_loader(templates_dir));       // .j2 files
 *   env.set_undefined_behavior(UndefinedBehavior::Chainable);    // == Jinja2's ChainableUndefined; `missing.deep` renders '' — verified
 *   env.set_trim_blocks(true);
 *   env.set_lstrip_blocks(true);
 *   env.set_auto_escape_callback(|_| AutoEscape::Html);          // REQUIRED: .j2 is not auto-escaped by default in minijinja
 *   env.set_formatter(<custom formatter>);                       // MarkupSafe-compatible &#39; (not minijinja's default &#x27;), JS-shaped number formatting via format_js_number as a fallback, true/false for bools, undefined/none print nothing
 *
 * `trim_blocks`/`lstrip_blocks` are required because this adapter places
 * `{% … %}` control tags on their own source line (mirroring Kolon's
 * line-statement `:` mode, which consumes its own line for free); without
 * them every such line would leak a stray newline/indentation into the
 * rendered HTML. Templates are named `<snake_case_component>.j2` (same
 * convention as adapter-jinja's `.jinja` files and Xslate's `.tx` files).
 *
 * Divergences beyond the syntax table above (all uniform, not per-fixture —
 * see the individual definition sites for the full rationale):
 *
 *   1. **JS truthiness** (`@barefootjs/jsx`'s `adapters/boolean-result.ts`, `expr/emitters.ts`'s
 *      `truthyTest`, this file's `convertConditionToJinja`). Python's `[]` /
 *      `{}` are falsy; JS's are truthy. Perl doesn't have this problem (a
 *      Perl reference is always true), so Kolon needed no truthy-routing
 *      layer. Every condition-TEST position (an `{% if %}` / `{% elif %}`
 *      test, a ternary test, the left operand of `&&`/`||`) routes through
 *      `bf.truthy(...)` unless it is structurally already boolean-shaped.
 *   2. **Stringification** (`bf.string`, applied at every text/attribute
 *      interpolation position). Perl's default scalar stringification is
 *      close enough to JS's `String(x)` that Kolon only special-cases
 *      explicit `String()` calls and boolean-typed values (routed to
 *      `bf.bool_str`). Python's default `str()` diverges further —
 *      `str(True)` == `"True"`, `str(1.0)` == `"1.0"`, `str(None)` ==
 *      `"None"`, and Jinja's `~` concatenation operator calls `str()` on
 *      each operand internally — so this port explicitly routes EVERY
 *      text/attribute-position value (not already boolean-routed) through
 *      `bf.string(...)` before it reaches Jinja's own escaping/concat
 *      machinery. Verified empirically (`'a' ~ true ~ none` → `"aTrueNone"`
 *      under plain Jinja) — the reason this wrapping is mandatory, not
 *      cosmetic. This routing is retained unchanged for the minijinja port —
 *      the Rust runtime's own default `Display` formatting for a `Value`
 *      differs from CPython jinja2's `str()` in its own ways (float
 *      trailing-zero formatting in particular), so `bf.string(...)` stays
 *      the primary, uniform mechanism; the custom formatter's
 *      `format_js_number` (see the Environment contract above) is only a
 *      fallback for values that reach the formatter unrouted.
 *   3. **No Jinja lambda** (`expr/emitters.ts` header, divergence 2). Kolon's
 *      `-> $x { … }` lambda — the Xslate top-level emitter's fallback when a
 *      predicate callback can't be serialized to the runtime evaluator's
 *      JSON form — has no Jinja equivalent. This adapter uses ONE mechanism
 *      for every higher-order callback (the evaluator-JSON `*_eval`
 *      payload); an unserializable predicate surfaces `BF101` instead of a
 *      lambda fallback. `.sort`'s non-lambda STRUCTURED fallback
 *      (`bf.sort` with a `{keys: […]}` descriptor) is unaffected and ports
 *      unchanged.
 *   4. **Children/fallback capture via `{% set %}...{% endset %}`, never a
 *      macro.** Every Kolon macro-capture site in the ported adapter
 *      (`renderComponent`'s children forward, `renderAsync`'s fallback) is
 *      invoked immediately, in place, with zero arguments — never reused
 *      elsewhere or invoked lazily with different arguments. Jinja's
 *      set-block (`{% set NAME %}…{% endset %}`) captures exactly that
 *      shape as a safe HTML value (Python jinja2's `Markup`; minijinja's
 *      `Value::from_safe_string`, under the Environment's HTML
 *      auto-escape callback) with no macro indirection needed; the captured
 *      name is then referenced bare (`NAME`, not `NAME()`) everywhere the
 *      Kolon port called `NAME()`.
 *   5. **Reserved-word identifier mangling** (`lib/minijinja-naming.ts`). Every
 *      bare Jinja variable reference / `{% set %}` target is passed through
 *      `minijinjaIdent()`; the Rust runtime must apply the IDENTICAL mangling
 *      (`mangle_ident` in `render_named`) when it builds the per-render
 *      context (so a prop literally named e.g. `class` is threaded through
 *      as context key `'class_'` on both sides). Dict-LITERAL keys are a
 *      separate, unconditional concern — see `minijinjaHashKey`'s docstring
 *      for why they are always quoted (unlike Kolon's bareword-key sugar).
 *   6. **In-template signal/memo self-reference seeding is NOT skipped**
 *      (`memo/seed.ts`'s file header) — Jinja's `{% set x = x + 1 %}` safely
 *      resolves the right-hand `x` from the enclosing scope (verified
 *      empirically), unlike Kolon's `my`-shadowing hazard, so a same-name
 *      prop-derived signal/memo IS seeded in-template here (Xslate skips
 *      it). Strictly more correct, not merely a port artifact.
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
  TypeInfo,
  TemplatePrimitiveRegistry,
} from '@barefootjs/jsx'
import {
  DslTemplateAdapter,
  type IRNodeEmitter,
  type EmitIRNode,
  type AttrValueEmitter,
  parseExpression,
  stringifyParsedExpr,
  exprToString,
  parseProviderObjectLiteral,
  planStyleObject,
  type ExpressionAttr,
  isSupported,
  isSupportedValue,
  emitParsedExpr,
  emitIRNode,
  emitAttrValue,
  parseRecordIndexAccess,
  extractArrowBodyExpression,
  collectContextConsumers,
  isLowerableLoopDestructure,
  type ContextConsumer,
  lookupStaticRecordLiteral,
  lookupLiteralConst,
  childTemplateName,
  isEmptyComponentProps,
  isBooleanTypedPropRef,
  planAttrExpression,
  planLoop,
  spellDestructureLocals,
  type DestructureSpelling,
  planSpreadAttr,
  planComponentProps,
  spellComponentProps,
  renameFreeIdentifiers,
  rootPropAliasesForLoop,
  rootPropReadName,
  attrValueMayBeNullish,
  isAriaBooleanAttr,
  isBooleanResultExpr,
  isExplicitStringCall,
  hasClientInteractivity,
  emitCallbackEval,
  arithmeticOperandCoercion,
  renderElementShell,
  renderFragmentScope,
  renderDangerousInnerHtml,
  unsupportedAttrExpressionError,
  type ElementShellSpelling,
  inlineComputedConstAttr,
  inlineComputedConsts,
  missingFilterPredicateRefusal,
} from '@barefootjs/jsx'
import type { ParsedExpr, LoopBindingPathSegment } from '@barefootjs/jsx'
import { isOpaqueLocalAccessorName } from '@barefootjs/jsx'
import { BF_SLOT, BF_COND, escapeHtml } from '@barefootjs/shared'

import type { JinjaRenderCtx } from './lib/types.ts'
import { JINJA_PRIMITIVE_EMIT_MAP } from './lib/constants.ts'
import { minijinjaHashKey, minijinjaIdent, escapeMinijinjaSingleQuoted } from './lib/minijinja-naming.ts'
import { renderSortMethod, EVAL_SPELLING } from './expr/array-method.ts'
import { staticValueToMinijinja } from './lib/static-value.ts'
import { JinjaFilterEmitter, JinjaTopLevelEmitter, truthyTest, CALLBACK_LOWERING } from './expr/emitters.ts'
import type { JinjaEmitContext, JinjaSpreadContext, JinjaMemoContext } from './emit-context.ts'
import {
  conditionalSpreadToJinja,
  objectLiteralExprToJinjaDict,
} from './spread/spread-codegen.ts'
import {
  generateContextConsumerSeed,
  generateDerivedMemoSeed,
} from './memo/seed.ts'
import { collectStringValueNames } from './props/prop-classes.ts'

export type { MinijinjaAdapterOptions } from './lib/types.ts'
import type { MinijinjaAdapterOptions } from './lib/types.ts'

/**
 * Build a chained Jinja attribute/subscript accessor from a `.map()`
 * destructure binding's structured `segments` path (#2087 Phase B) — walking
 * `segments` instead of string-parsing `LoopParamBinding.path` (repo rule:
 * never parse JS/TS syntax with regex or string matching). Verified against
 * the real minijinja 2.21 engine (scratch spike): a `field` step with an
 * identifier key reads via native dotted access (`.name`, cheapest / most
 * idiomatic Jinja form); a non-identifier key (`data-priority`) reads via a
 * single-quoted bracket subscript (`['data-priority']`, same quoting
 * convention as `minijinjaHashKey`/`escapeMinijinjaSingleQuoted` — quotes are
 * mandatory here since a bareword subscript would be a variable lookup, not
 * this adapter's concern for a bracket step but kept consistent regardless);
 * an `index` step reads a numeric Array index (`[0]`). Empty `segments` (a
 * rest binding at the loop root) returns `base` unchanged.
 */
function minijinjaAccessorFromSegments(base: string, segments: readonly LoopBindingPathSegment[]): string {
  let accessor = base
  for (const seg of segments) {
    accessor +=
      seg.kind === 'index'
        ? `[${seg.index}]`
        : seg.isIdent
          ? `.${seg.key}`
          : `['${escapeMinijinjaSingleQuoted(seg.key)}']`
  }
  return accessor
}

/** How a lowered loop destructure binding reads off the row item. */
const DESTRUCTURE_SPELLING: DestructureSpelling = {
  accessor: minijinjaAccessorFromSegments,
  slice: (parent, from) => `bf.slice(${parent}, ${from})`,
  omit: (parent, keys) => `bf.omit(${parent}, [${keys.map((k) => `'${escapeMinijinjaSingleQuoted(k)}'`).join(', ')}])`,
}

/**
 * The `MinijinjaAdapter` template adapter. Pass an instance as the `adapter` option of `@barefootjs/vite`.
 *
 * @since 0.18.0
 * @stability alpha
 */
export class MinijinjaAdapter extends DslTemplateAdapter implements IRNodeEmitter<JinjaRenderCtx> {
  name = 'minijinja'
  extension = '.j2'
  templatesPerComponent = true

  /**
   * Identifier-path callees the Jinja runtime can render in template scope.
   * The relocate pass consults this map to mark matching calls as
   * template-safe; the SSR template emitter substitutes the JS call with the
   * registered `bf.NAME(...)` helper invocation.
   */
  templatePrimitives: TemplatePrimitiveRegistry = JINJA_PRIMITIVE_EMIT_MAP

  private options: Required<MinijinjaAdapterOptions>
  private inLoop: boolean = false

  constructor(options: MinijinjaAdapterOptions = {}) {
    super()
    this.options = {
      clientJsBasePath: options.clientJsBasePath ?? '/static/components/',
      barefootJsPath: options.barefootJsPath ?? '/static/components/barefoot.js',
    }
  }

  protected readonly loopChildDiagnosticName = 'Jinja'
  // Two source names that MiniJinja's renaming of reserved names turns into one
  // template variable would read the same value (#3404).
  protected override readonly templateIdentifierSpelling = { ident: minijinjaIdent, label: 'MiniJinja' }

  /**
   * Names (signal getters + props) whose value is a string. Carried for
   * parity with the Perl-family adapters (Mojo needs it for `eq`/`ne`
   * selection); the Jinja emitters don't consume it — Jinja's `==`/`!=`
   * compare strings and numbers correctly.
   */
  protected stringValueNamesFor(ir: ComponentIR): Set<string> {
    return collectStringValueNames(ir)
  }

  protected contextConsumerSeed(ir: ComponentIR): string {
    return generateContextConsumerSeed(ir)
  }

  protected derivedMemoSeed(ir: ComponentIR): string {
    return generateDerivedMemoSeed(this.memoCtx, ir)
  }

  // ===========================================================================
  // Script Registration
  // ===========================================================================

  protected generateScriptRegistrations(ir: ComponentIR, scriptBaseName?: string, scriptAssets?: string[], preloadAssets?: string[]): string {
    // `scriptAssets`, when present (including `[]`), fully supersedes the
    // adapter-computed `barefootJsPath` / `clientJsBasePath` pair — see
    // `AdapterGenerateOptions.scriptAssets`. The caller (e.g. the Vite
    // plugin) has already decided the exact ordered URL list, including
    // whether any script is needed at all.
    if (scriptAssets) {
      if (scriptAssets.length === 0) return ''
      const lines: string[] = []
      // `preloadAssets` is only meaningful alongside a non-empty
      // `scriptAssets` (see `AdapterGenerateOptions.preloadAssets`) — this
      // branch is only reached when that already holds. Emitted BEFORE the
      // script registrations: every preload hint must precede the script
      // tags it describes, or the hint is useless (see `register_preload`'s
      // docstring in the Rust runtime — `bf.register_preload`/`bf.scripts()`
      // preserve that ordering downstream, so codegen order is what fixes
      // it here).
      if (preloadAssets && preloadAssets.length > 0) {
        preloadAssets.forEach((url, i) => {
          lines.push(`{% set _bf_pre${i} = bf.register_preload('${url}') %}`)
        })
      }
      scriptAssets.forEach((url, i) => {
        lines.push(`{% set _bf_reg${i} = bf.register_script('${url}') %}`)
      })
      lines.push('')
      return lines.join('\n')
    }

    const hasInteractivity = hasClientInteractivity(ir)
    if (!hasInteractivity) return ''

    const name = scriptBaseName ?? ir.metadata.componentName
    const runtimePath = this.options.barefootJsPath
    const clientJsPath = `${this.options.clientJsBasePath}${name}.client.js`

    // Unlike Kolon's `:` line marker (which PRINTS a bare statement's value,
    // forcing a throwaway `my` bind so `register_script`'s return value
    // doesn't leak into the HTML), Jinja's `{% set %}` statement tag never
    // prints anything regardless — no throwaway-bind trick is needed here.
    // Distinct names are kept anyway for direct traceability with the Kolon
    // port (Jinja has no restriction on re-`{% set %}`ing the same name).
    const lines: string[] = []
    lines.push(`{% set _bf_reg0 = bf.register_script('${runtimePath}') %}`)
    lines.push(`{% set _bf_reg1 = bf.register_script('${clientJsPath}') %}`)
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
    return emitIRNode<JinjaRenderCtx>(node, this, {} as JinjaRenderCtx)
  }

  // ===========================================================================
  // IRNodeEmitter implementation (Jinja2)
  // ===========================================================================

  emitElement(node: IRElement, _ctx: JinjaRenderCtx, _emit: EmitIRNode<JinjaRenderCtx>): string {
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

  emitConditional(node: IRConditional, _ctx: JinjaRenderCtx, _emit: EmitIRNode<JinjaRenderCtx>): string {
    return this.renderConditional(node)
  }

  emitLoop(node: IRLoop, _ctx: JinjaRenderCtx, _emit: EmitIRNode<JinjaRenderCtx>): string {
    return this.renderLoop(node)
  }

  emitComponent(node: IRComponent, _ctx: JinjaRenderCtx, _emit: EmitIRNode<JinjaRenderCtx>): string {
    const rendered = this.renderComponent(node)
    // #3141: see `wrapComponentRootScopeComment`'s docstring.
    return node.needsScopeComment ? this.wrapComponentRootScopeComment(rendered) : rendered
  }

  emitFragment(node: IRFragment, _ctx: JinjaRenderCtx, _emit: EmitIRNode<JinjaRenderCtx>): string {
    return renderFragmentScope(node, children => this.renderChildren(children), rendered => this.wrapComponentRootScopeComment(rendered))
  }

  emitSlot(node: IRSlot): string {
    return this.renderSlot(node)
  }

  emitIfStatement(node: IRIfStatement, _ctx: JinjaRenderCtx, _emit: EmitIRNode<JinjaRenderCtx>): string {
    return this.renderIfStatement(node)
  }

  emitProvider(node: IRProvider, _ctx: JinjaRenderCtx, _emit: EmitIRNode<JinjaRenderCtx>): string {
    // SSR context propagation (#1297): bracket the children with a
    // provide/revoke pair on the shared controller-stash context stack so a
    // descendant `useContext` consumer reads the value during the same
    // render. Both helpers return '' (empty), so the inline `{{ … }}`
    // expression form discards their output cleanly — no extra whitespace,
    // no line-statement needed inside the element body.
    const value = this.providerValueJinja(node.valueProp)
    const children = this.renderChildren(node.children)
    const name = node.contextName
    return (
      `{{ bf.provide_context('${name}', ${value}) }}` +
      children +
      `{{ bf.revoke_context('${name}') }}`
    )
  }

  /** Lower a `<Ctx.Provider value>` value prop to a Jinja expression. */
  private providerValueJinja(valueProp: IRProvider['valueProp']): string {
    const v = valueProp.value
    if (v.kind === 'literal') {
      if (typeof v.value === 'string') {
        return `'${escapeMinijinjaSingleQuoted(v.value)}'`
      }
      if (typeof v.value === 'boolean') return v.value ? 'true' : 'false'
      return String(v.value)
    }
    if (v.kind === 'expression') {
      const dict = this.providerObjectLiteralJinja(v.expr)
      if (dict !== null) return dict
      return this.convertExpressionToJinja(v.expr)
    }
    if (v.kind === 'template') return this.convertTemplateLiteralPartsToJinja(v.parts)
    // Out-of-shape value (spread / jsx-children) — none; consumer defaults.
    return 'none'
  }

  /**
   * Lower an object-literal provider value (`value={{ open: () => props.open
   * ?? false, onOpenChange: … }}`) to a Jinja dict literal (#1897). The
   * SSR lowering is a per-member snapshot of what a consumer would READ
   * during the same render:
   *
   * - zero-param expression-body arrows are getters — lower the body (the
   *   value is fixed for the render, so the call-time indirection drops out)
   * - `on[A-Z]`-named members and function-shaped values are client-only
   *   behavior SSR never invokes — lower to `none`
   * - anything else lowers through the normal expression pipeline (so an
   *   unsupported getter body still refuses loudly with BF101)
   *
   * Keys keep their JS names verbatim so a consumer-side `ctx.open` access
   * maps onto the same dict key. Returns `null` when the expression is not a
   * plain object literal (spread / computed key) — the caller falls back to
   * the whole-expression path, which refuses those shapes with BF101.
   */
  private providerObjectLiteralJinja(expr: string): string | null {
    const members = parseProviderObjectLiteral(expr.trim())
    if (members === null) return null
    const entries = members.map(m => {
      const key = minijinjaHashKey(m.name)
      if (m.kind === 'function' || /^on[A-Z]/.test(m.name)) return `${key}: none`
      const src = m.kind === 'getter' ? m.body : m.expr
      return `${key}: ${this.convertExpressionToJinja(src)}`
    })
    return `{${entries.join(', ')}}`
  }

  emitAsync(node: IRAsync, _ctx: JinjaRenderCtx, _emit: EmitIRNode<JinjaRenderCtx>): string {
    return this.renderAsync(node)
  }

  // ===========================================================================
  // Element Rendering
  // ===========================================================================

  renderElement(element: IRElement): string {
    return renderElementShell(element, this.elementShell)
  }

  /**
   * Route an `ssrPortalOwnerScope`-flagged element's ALREADY-RENDERED
   * markup (the `bf-po` attribute already stamped on its own tag) into
   * `bf.register_portal_element` instead of leaving it at its source
   * position (#3119).
   *
   * Reuses minijinja's native `{% set NAME %}…{% endset %}` set-block —
   * the SAME mechanism `renderComponent` already uses to forward JSX
   * children (see this file's "Children capture" header notes): the
   * element renders inline as normal minijinja (its own `{{ }}`
   * interpolations evaluate exactly as they would anywhere else), the
   * set-block captures the fully-evaluated result into a local, and a
   * SEPARATE `{% set _ = … %}` statement (never `{{ }}`, so nothing prints
   * at the source position) hands that string to the portal collector —
   * mirroring how `register_script` calls are already threaded through
   * `{% set %}` purely for their side effect (`generateHead`/
   * `generateRuntimeScripts` above).
   */
  private wrapSsrPortalElement(rendered: string): string {
    const captureName = `bf_po_${this.childrenCaptureCounter++}`
    const sinkName = `bf_po_sink_${this.childrenCaptureCounter++}`
    return `{% set ${captureName} %}${rendered}{% endset %}{% set ${sinkName} = bf.register_portal_element(${captureName}) %}`
  }

  // ===========================================================================
  // Expression Rendering
  // ===========================================================================

  renderExpression(expr: IRExpression): string {
    // @client: an ordinary claimed 'text' slot pair (slot unification A3,
    // spec/slot-unification.md §5-A3), empty at SSR since the expression
    // can't be evaluated server-side — the client's claim creates the
    // missing Text node on first write (A2's create-if-absent semantics).
    // Replaces the old unpaired `client:sN` comment, which nothing adopted.
    if (expr.clientOnly) {
      // Slot unification Step B: `client-only-elision.ts` already proved
      // `elidedPath` alone is enough for the claim plan — drop the marker.
      if (expr.markerless) return ''
      if (expr.slotId) {
        return `{{ bf.text_start("${expr.slotId}") | safe }}{{ bf.text_end() | safe }}`
      }
      return ''
    }

    // Text-position interpolation of a possibly-non-string value — see the
    // file header, divergence 2. Thread the IR-carried `.parsed` tree
    // through (mirrors go-template's `convertExpressionToGo(expr.expr,
    // classify, expr.parsed)`) so a resolved bare-identifier
    // `.map`/`.filter`/… callback (`resolveCallbackMethodFunctionReferences`,
    // #2206) isn't lost to a fresh, unresolved re-parse of the raw string.
    const jinjaExpr = `bf.string(${this.convertExpressionToJinja(expr.expr, expr.parsed)})`

    if (expr.slotId) {
      return `{{ bf.text_start("${expr.slotId}") | safe }}{{ ${jinjaExpr} }}{{ bf.text_end() | safe }}`
    }

    return `{{ ${jinjaExpr} }}`
  }

  // ===========================================================================
  // Conditional Rendering
  // ===========================================================================

  renderConditional(cond: IRConditional): string {
    if (cond.clientOnly && cond.slotId) {
      return `{{ bf.comment("cond-start:${cond.slotId}") | safe }}{{ bf.comment("cond-end:${cond.slotId}") | safe }}`
    }

    // #3166: thread `cond.parsedCondition` through — a recognised
    // `<action>.isPending()` / `.error()` read has already been substituted
    // with its seed literal there; re-parsing `cond.condition` fresh here
    // would lose that and fall into the generic member-access lowering
    // (undefined at render time).
    const condition = this.convertConditionToJinja(cond.condition, cond.parsedCondition)
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

    // Inline, with no newline of our own around the tags (#3321): a newline
    // before `{% if %}` or ending a branch rendered as whitespace between the
    // conditional and adjacent text (`x: off` for `x:{c ? 'on' : 'off'}`).
    let result: string
    if (useCommentMarkers) {
      // Fragment branches: use comment markers
      const inner = whenFalse
        ? `{% if ${condition} %}${whenTrue}{% else %}${whenFalse}{% endif %}`
        : `{% if ${condition} %}${whenTrue}{% endif %}`
      result = `{{ bf.comment("cond-start:${cond.slotId}") | safe }}${inner}{{ bf.comment("cond-end:${cond.slotId}") | safe }}`
    } else if (markedFalse) {
      result = `{% if ${condition} %}${markedTrue}{% else %}${markedFalse}{% endif %}`
    } else if (cond.slotId) {
      // Conditional with no else: wrap with comment markers for client hydration
      result = `{{ bf.comment("cond-start:${cond.slotId}") | safe }}{% if ${condition} %}${whenTrue}{% endif %}{{ bf.comment("cond-end:${cond.slotId}") | safe }}`
    } else {
      result = `{% if ${condition} %}${whenTrue}{% endif %}`
    }

    return result
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
    return `{{ bf.comment("cond-start:${condId}") | safe }}${content}{{ bf.comment("cond-end:${condId}") | safe }}`
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
      return `{{ bf.comment("loop:${loop.markerId}") | safe }}{{ bf.comment("/loop:${loop.markerId}") | safe }}`
    }

    // An array/object-destructure loop param (`([emoji, users]) => ...` or
    // `({ name, age }) => ...`) lowers to invalid Jinja in general — Jinja's
    // `for item in list` binds a single loop variable and can't unpack a
    // tuple the way a Python `for` statement can. `isLowerableLoopDestructure`
    // (#2087) instead admits any FIXED-binding shape — single field, nested
    // field, array-index, any depth/mix (`{ user: { name } }`, `([k, v])`,
    // `{ cells: [head] }`) — by walking the binding's structured `segments`
    // path into a chained Jinja accessor (`__bf_item.user.name`,
    // `minijinjaAccessorFromSegments`), plus array-rest (`[first, ...tail]`,
    // native `bf.slice`) and object-rest (`{ id, ...rest }`, native
    // `bf.omit`) whose every use is a member read (`rest.flag`) or a
    // `{...rest}` spread onto an intrinsic element. Bare-value rest uses, a
    // spread onto a component/provider, and `.filter().map(destructure)`
    // still have no Jinja scalar form → BF104.
    const loopPlan = planLoop(loop, {
      scope: this.scope,
      localConstants: this.localConstants ?? [],
      resolveLiteralConst: (name) => this._resolveLiteralConst(name),
      callbackLowering: CALLBACK_LOWERING,
      spellStatic: staticValueToMinijinja,
    })
    if (loopPlan.destructure === 'unlowerable') {
      this.errors.push({
        code: 'BF104',
        severity: 'error',
        message: `Loop callback uses an array/object destructure pattern (\`${loop.param}\`) that the Jinja adapter cannot lower — the rest binding is used in a way (bare value, or spread onto a component) that has no native Jinja accessor form.`,
        loc: loop.loc ?? { file: this.componentName + '.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
        suggestion: {
          message:
            `Options:\n` +
            `  1. Read the rest binding as a member access (\`rest.field\`) or spread it onto an intrinsic element (\`<li {...rest}>\`) instead of using it as a bare value.\n` +
            `  2. Mark the loop position as @client-only so the destructure runs in JS on the client.\n` +
            `  3. Move the loop into a primitive that the adapter registers explicitly.`,
        },
      })
    }

    // A `.map()` loop whose array is a bare identifier bound to a local
    // const (module- or function-scope, #2946) with a non-statically-
    // evaluable initializer that reads props/signals/a function call (e.g.
    // `const entries = Object.entries(props.x ?? {}).filter(...)`) can't
    // render correctly. Locals get no per-render stash slot — this
    // adapter's only "elsewhere" is inlining a const's value at its use
    // site (`_resolveLiteralConst`'s numeric/single-quoted-string fast
    // path, or a static-record-literal lookup), never binding one as a
    // `{% set %}` template local. Left unchecked, `{% for item in entries
    // %}` over an unbound name would silently iterate zero times
    // (minijinja's `UndefinedBehavior::Chainable` tolerates it rather than
    // raising, same as Jinja's `ChainableUndefined`) instead of failing
    // loudly. Pre-existing, general limitation, orthogonal to #2087's
    // destructure-binding work — newly reachable in this adapter's test
    // corpus only because the widened destructure gate (#2087 Phase A/B)
    // no longer refuses this fixture's `([emoji, users]) => ...` param
    // first. Mirrors adapter-jinja's identical check.
    // #2208/#2946: a loop source that is a fully-static array literal —
    // either inline (`[{ label: 'Alpha' }, ...].map(...)`) or a bare
    // identifier bound to a local const (module- or function-scope) whose
    // initializer has no prop/signal/function-call dependency — inlines as
    // a native MiniJinja list/dict literal below. A runtime-computed local
    // (#2069, e.g. `Object.entries(props.tags).filter(...)`) still refuses
    // below, whichever scope it's declared in. `isNameShadowed` guards a
    // DIFFERENT, enclosing loop's own callback param shadowing this
    // identifier (fable review) — never resolve the static const in that
    // case. `rawArray` then falls through to the bare identifier expression
    // below, same as before #2208 — which still trips the pre-existing
    // BF101 gate for an unresolvable local const reference (a loud,
    // conservative refusal, not a silent wrong value). Canonical,
    // position-accurate predicate (#2482 Stage 2) — the enclosing loop
    // scope's own membership, not a coarse whole-component union.
    const staticArray = loopPlan.staticSource

    const arrayConst = loopPlan.unresolvableConst
    if (arrayConst) {
      this.errors.push({
        code: 'BF101',
        severity: 'error',
        message: `Loop array \`${arrayConst.name}\` is a const (module- or function-scope) computed value (\`${arrayConst.value}\`) that the MiniJinja adapter cannot bind as a template variable — only numeric/string-literal locals inline at their use site.`,
        loc: loop.loc ?? { file: this.componentName + '.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
        suggestion: {
          message:
            'Pre-compute the array server-side and pass it as a prop, or mark the loop position as @client-only so it runs in JS on the client.',
          escape: [{ kind: 'prop-precompute' }, { kind: 'client-directive' }],
        },
      })
    }

    const rawArray = staticArray ?? this.convertExpressionToJinja(loop.array)
    // Apply sort if present: wrap the loop array in the shared `bf.sort`
    // helper, binding the sorted result to a per-iteration local so the
    // helper runs once.
    let array = rawArray
    if (loop.sortComparator) {
      // The shared chain (`@barefootjs/jsx`'s `adapters/callback-method.ts`),
      // the same as `.sort(cmp)` at an expression position: the evaluator,
      // then the structured `{keys: …}` descriptor. jsx-to-ir only lifts a
      // comparator the descriptor models, so the refusal arm is defensive; it
      // keeps the array unsorted so the template stays valid.
      const sortEmit = (e: ParsedExpr) => this.convertExpressionToJinja('', e)
      const plan = loopPlan.sort!
      if (plan.kind === 'eval') array = emitCallbackEval(plan, rawArray, sortEmit, EVAL_SPELLING)
      else if (plan.kind === 'structured-sort') array = renderSortMethod(rawArray, plan.comparator)
      else if (plan.kind === 'refuse') this._recordExprBF101(plan.message, plan.suggestion)
    }
    const param = loop.param
    // Jinja's `{% for item in array %}` binds the item directly. The index,
    // when needed (`.keys().map(k => ...)` or an explicit `index` param),
    // comes from Jinja's own loop object (`loop.index0`, 0-based) — no
    // Kolon-style `$~loopvar.index` indirection needed.

    // A `.keys()` iteration's param is the index and a lowered destructure's
    // bindings read off the item, so either iterates a throwaway item var
    // (`loopPlan.itemVar`). The index local (a `.keys()` param or an explicit
    // index param) reads MiniJinja's `loop.index0`. Each destructure binding is a
    // local off the item var, spelled from its structured `segments` path
    // (#2087 Phase B, never `b.path`): a native accessor for a fixed binding,
    // the runtime's slice / omit for an array / object rest — a true
    // residual, not an alias of the whole item. An object iteration's key and value
    // bind through the for-header below instead.
    const loopVar = loopPlan.itemVar
    const indexLocalLines: string[] = []
    if (loopPlan.indexLocal) indexLocalLines.push(`{% set ${minijinjaIdent(loopPlan.indexLocal)} = loop.index0 %}`)
    for (const { name, value } of spellDestructureLocals(loopPlan, minijinjaIdent(loopVar), DESTRUCTURE_SPELLING)) {
      indexLocalLines.push(`{% set ${minijinjaIdent(name)} = ${value} %}`)
    }

    const prevInLoop = this.inLoop
    this.inLoop = true
    // The children render once, under the loop flag (so nested components use
    // the loop-child naming convention) and the row scope below.

    // This loop's row scope, for the position-accurate shadow guard
    // (#2488/#2489, canonicalized on `BindingScope` in #2482 Stage 2).
    // `IRLoop` already structurally satisfies `LoopBindingSource`
    // (`param`/`index`/`paramBindings`/`preamble`) — `enterLoopRow(loop)`
    // binds exactly the for-header target(s), each destructure binding,
    // the index (when present), and the `.map()` preamble's declared
    // locals, mirroring what THIS renderLoop's for-header + `indexLocalLines`
    // actually introduce. Restored by reference (immutable — no ref-count
    // bookkeeping) so nested loops compose for free. Entered BEFORE
    // `preambleLines`/`bodyChildren` are converted and popped AFTER, not
    // just around `renderChildren` — Copilot review on #2600 caught that
    // the narrower window silently regressed the module-const shadow guard
    // (`_resolveLiteralConst`/`_resolveStaticRecordLiteral`, now
    // scope-driven instead of the old coarse whole-component set) for two
    // row-context conversions that sit OUTSIDE `renderChildren`: a
    // `.map()` preamble local's own initializer (`d.raw`, below) and the
    // whole-item-conditional `loop-i:` key anchor (`loop.key`, in
    // `bodyChildren` below) — both genuinely evaluate PER ROW and must see
    // the row's own bindings. `loop.filterPredicate` deliberately stays
    // OUTSIDE this window (further down, after the pop): per the Stage 0
    // design a filter/sort callback's own param is a separate `callback`
    // frame, never folded into the `.map()` row — and empirically
    // `JinjaFilterEmitter` (the filter predicate's dedicated,
    // self-contained emitter) never consults `this.scope` at all, so its
    // position relative to the pop is inert either way.
    const prevScope = this.scope
    this.scope = prevScope.enterLoopRow(loop)
    // Props this row's bindings newly shadow, aliased before the loop header
    // so an explicit `props.X` inside still reads the root value (#3314).
    const rootAliases = rootPropAliasesForLoop(prevScope, this.scope, this.rootPropAliases)

    // Per-row locals for a `.map()` callback preamble (#2447), in source
    // order so a later initializer sees an earlier local — same as the
    // source block. Phase 1 refuses the loop outright when the preamble
    // isn't fully declarable, so there is no partial-lowering case: either
    // every statement is lowered here, or the build already failed.
    const preambleLines = (loop.preamble?.declarations ?? []).map(
      d => `{% set ${minijinjaIdent(d.name)} = ${this.convertExpressionToJinja(d.raw, d.valueParsed)} %}`,
    )
    const childrenUnderLoop = this.renderChildren(loop.children)
    this.inLoop = prevInLoop

    // Whole-item conditional: prepend an always-present `<!--bf-loop-i:KEY-->`
    // anchor before each item's (possibly empty) conditional content so the
    // client's `mapArrayAnchored` can hydrate every SSR-rendered item by its
    // anchor. Still under the row scope (see above) — `loop.key` is a
    // per-row expression.
    // `bf.escape_comment_key` (#2795 follow-up) both stringifies the key and
    // neutralizes `-` so it can't spell `-->` and close the comment early —
    // see its doc in `runtime.rs`.
    const bodyChildren =
      loop.bodyIsItemConditional && loop.key
        ? `{{ bf.comment("loop-i:" ~ bf.escape_comment_key(${this.convertExpressionToJinja(loop.key)})) | safe }}\n${childrenUnderLoop}`
        : childrenUnderLoop
    this.scope = prevScope

    // A name the filter predicate captures from an enclosing row that this
    // loop's own row binds again would read the row's item inside the loop;
    // keep the enclosing value under a loop-scoped alias (#3402).
    const captureAliases = loopPlan.captureAliases
    const captureRenames = new Map(captureAliases.map(({ name, alias }) => [name, alias]))
    const lines: string[] = []
    // Scoped per-call-site marker so sibling `.map()`s under the same parent
    // each get their own reconciliation range.
    for (const { name, alias } of rootAliases) lines.push(`{% set ${minijinjaIdent(alias)} = ${minijinjaIdent(name)} %}`)
    for (const { name, alias } of captureAliases) lines.push(`{% set ${minijinjaIdent(alias)} = ${minijinjaIdent(name)} %}`)
    lines.push(`{{ bf.comment("loop:${loop.markerId}") | safe }}`)
    // `objectIteration` (#2168 object-entries-map): minijinja has no
    // built-in `.items()` OBJECT METHOD (unlike Python's dict) — `|items`
    // is a FILTER, yielding `[key, value]` pairs, which the `for` tag's
    // own tuple-unpack target (`for a, b in ...`, mirroring Jinja2) binds
    // directly. There's no `|keys`/`|values` filter, so `'keys'`/`'values'`
    // reuse the SAME `|items` pairs and bind the unused half to a
    // throwaway name. Order is whatever the underlying `BTreeMap` gives —
    // sorted-by-key, not JS insertion order (a deliberate design choice
    // for a DIFFERENT feature, canonical JSON encoding — see `num.rs`);
    // this happens to satisfy the current fixture, but is a documented
    // known limitation for out-of-alphabetical-order data, same as Go.
    const forHeader = loop.objectIteration === 'entries'
      ? `{% for ${minijinjaIdent(loop.index ?? param)}, ${minijinjaIdent(param)} in ${array}|items %}`
      : loop.objectIteration === 'keys'
        ? `{% for ${minijinjaIdent(param)}, __bf_v in ${array}|items %}`
        : loop.objectIteration === 'values'
          ? `{% for __bf_k, ${minijinjaIdent(param)} in ${array}|items %}`
          : `{% for ${minijinjaIdent(loopVar)} in ${array} %}`
    lines.push(forHeader)
    for (const il of indexLocalLines) lines.push(il)

    // Handle filter().map() pattern by wrapping children in if-condition
    if (loop.filterPredicate) {
      let filterCond: string
      if (loop.filterPredicate.predicate) {
        // The filter param reads the row item, so rename its references in
        // the parsed predicate to the loop param. Renaming the AST, not the
        // rendered text, leaves a string literal with the same spelling and
        // a property key alone (#3404).
        const filterRenames = new Map(captureRenames)
        if (loop.filterPredicate.param !== param) filterRenames.set(loop.filterPredicate.param, param)
        // The aliases render and type like the enclosing names they keep (#3402).
        const scopeBeforeAliases = this.scope
        this.scope = this.scope.enterAliases(new Map(captureAliases.map(({ name, alias }) => [alias, name])))
        try {
          filterCond = this.renderJinjaFilterExpr(
            renameFreeIdentifiers(loop.filterPredicate.predicate, filterRenames),
            param
          )
        } finally {
          this.scope = scopeBeforeAliases
        }
        // See the file header, divergence 1: the loop-hoist filter test is a
        // condition position too.
        filterCond = truthyTest(loop.filterPredicate.predicate, filterCond)
      } else {
        // Phase 1 always attaches the predicate; a missing one is refused,
        // never stood in for by a truthy constant that renders every row (#3534).
        const refusal = missingFilterPredicateRefusal(loop.filterPredicate.raw, CALLBACK_LOWERING.adapterName)
        this._recordExprBF101(refusal.message, refusal.suggestion)
        filterCond = 'true'
      }
      lines.push(`{% if ${filterCond} %}`)
      lines.push(...preambleLines)
      lines.push(bodyChildren)
      lines.push(`{% endif %}`)
    } else {
      lines.push(...preambleLines)
      lines.push(bodyChildren)
    }

    lines.push(`{% endfor %}`)
    lines.push(`{{ bf.comment("/loop:${loop.markerId}") | safe }}`)

    return lines.join('\n')
  }

  // ===========================================================================
  // Component Rendering
  // ===========================================================================

  /**
   * AttrValue lowering for component invocation props (Jinja dict-entry
   * form). Jinja CANNOT splat a dict into positional args, so every prop is
   * emitted as a `'key': value` entry that the caller collects into ONE dict
   * literal passed to `bf.render_child(name, { ... })`.
   *
   * `jsx-children` returns empty — children are captured via a Jinja
   * set-block below, not threaded through the dict entry list.
   */
  private readonly componentPropEmitter: AttrValueEmitter = {
    emitLiteral: (value, name) => `${minijinjaHashKey(name)}: '${escapeMinijinjaSingleQuoted(value.value)}'`,
    emitExpression: (value, name) => {
      if (value.parts) {
        return `${minijinjaHashKey(name)}: ${this.convertTemplateLiteralPartsToJinja(value.parts)}`
      }
      // Inline object-literal child prop (carousel's `opts={{ align: 'start' }}`):
      // lower to a Jinja dict so the child can serialize it (`data-opts`),
      // instead of refusing the bare object with BF101. (#1971) Read the
      // IR-carried structured `ParsedExpr` tree (#2018) instead of
      // re-parsing `value.expr`; the lowering returns null for any
      // non-object-literal shape, so the common non-object case falls
      // straight through to the bare-expression path below.
      if (value.parsed) {
        const dict = objectLiteralExprToJinjaDict(this.spreadCtx, value.parsed)
        if (dict !== null) return `${minijinjaHashKey(name)}: ${dict}`
      }
      return `${minijinjaHashKey(name)}: ${this.convertExpressionToJinja(value.expr)}`
    },
    emitSpread: (value) => {
      // Jinja dicts can't be splatted into the entry list the way `**`
      // flattens Python kwargs into a call literal. `renderComponent`
      // handles EVERY spread shape itself (both the enumerated propsObject
      // case and the general nested `dict(base, **spread)` fold — see its
      // own docstring), so this callback is never reached for `kind:
      // 'spread'` props; it only exists to satisfy the `AttrValueEmitter`
      // interface.
      return this.convertExpressionToJinja(value.expr)
    },
    emitTemplate: (value, name) =>
      `${minijinjaHashKey(name)}: ${this.convertTemplateLiteralPartsToJinja(value.parts)}`,
    emitBooleanAttr: (_value, name) => `${minijinjaHashKey(name)}: true`,
    emitBooleanShorthand: (_value, name) => `${minijinjaHashKey(name)}: true`,
    // JSX children flow through the Jinja set-block capture below; they're
    // not part of the dict entry list.
    emitJsxChildren: () => '',
  }


  /**
   * Fold ordered prop segments into a single Jinja expression via nested
   * `dict(base, **top)` calls — matching the CPython Jinja2 adapter's
   * emitted syntax exactly (though minijinja itself tolerates more than
   * one `**` per call, this adapter emits the SAME single-`**`-per-call
   * nested form so the two engines stay syntax-identical): each
   * successive segment wraps the accumulator as the positional `base`
   * with the new segment `**`-unpacked on top, later argument wins on key
   * conflict — exactly like `{...a, ...b}`. A spread segment's expression
   * is wrapped `(EXPR or {})` before unpacking: minijinja's
   * `UndefinedBehavior::Chainable` lets a missing bag (e.g.
   * `children.props` when `children` was never passed) chain through
   * member access without raising, but `**`-unpacking an undefined/none
   * value still needs a concrete dict, so the `or {}` guard normalises it
   * first (verified against the real minijinja crate v2 `bf-render`
   * binary). Empty `'entries'` segments are dropped so a leading/trailing
   * spread doesn't drag in a needless `dict({}, **...)`. Returns `'{}'`
   * when every segment is empty (no props at all).
   */
  private combineComponentPropSegments(
    segments: ReadonlyArray<{ kind: 'entries'; parts: string[] } | { kind: 'spread'; expr: string }>,
  ): string {
    let acc: string | null = null
    for (const seg of segments) {
      if (seg.kind === 'entries') {
        if (seg.parts.length === 0) continue
        const text = `{${seg.parts.join(', ')}}`
        acc = acc === null ? text : `dict(${acc}, **${text})`
      } else {
        const text = `(${seg.expr} or {})`
        acc = acc === null ? text : `dict(${acc}, **${text})`
      }
    }
    return acc ?? '{}'
  }

  renderComponent(comp: IRComponent): string {
    // Each named JSX-valued prop (`header={<strong>Title</strong>}`, #2168)
    // and the forwarded children are captured with a set-block, evaluated in
    // the parent's template scope (signals, conditionals), and passed by
    // name; `render_child` materializes the children through the backend
    // before handing them to the child. See the file header, divergence 4,
    // for why a set-block (not a macro) is the uniform mechanism. A named
    // slot's capture name is counter-based: a prop name can contain
    // characters (`data-slot`) that are no valid `{% set %}` target.
    const tplName = childTemplateName(comp.name, this.importAliases)
    const captures: string[] = []
    const capture = (children: IRNode[], name: () => string) => {
      const body = this.renderChildren(children)
      const captured = name()
      captures.push(`{% set ${captured} %}${body}{% endset %}`)
      return captured
    }
    const plan = planComponentProps(comp, { propsObjectName: this.propsObjectName, propsParams: this.propsParams })
    const segments = spellComponentProps(plan, {
      entry: (entry) => {
        switch (entry.kind) {
          case 'value':
            return emitAttrValue(entry.value, this.componentPropEmitter, entry.name)
          case 'named-slot':
            return `${minijinjaHashKey(entry.name)}: ${capture(entry.children, () => `bf_prop_${this.childrenCaptureCounter++}`)}`
          case 'props-param':
            return `${minijinjaHashKey(entry.name)}: ${minijinjaIdent(entry.name)}`
          case 'slot-id':
            return `${minijinjaHashKey('_bf_slot')}: '${entry.slotId}'`
          case 'children':
            return `${minijinjaHashKey('children')}: ${capture(entry.children, () => `bf_children_${comp.slotId ?? 'c' + this.childrenCaptureCounter++}`)}`
        }
      },
      spread: (value) => this.convertExpressionToJinja(value.expr),
      // `is defined` too, as in the `??` lowering: a never-seeded variable is
      // undefined, which `is not none` alone lets through.
      presentParam: (name) => {
        const v = minijinjaIdent(name)
        return `({${minijinjaHashKey(name)}: ${v}} if (${v} is defined and ${v} is not none) else {})`
      },
    })
    const dict = isEmptyComponentProps(segments) ? '' : `, ${this.combineComponentPropSegments(segments)}`
    return `${captures.join('')}{{ bf.render_child('${tplName}'${dict}) | safe }}`
  }

  /** Uniquifies the `presenceOrUndefined` temp binding (`bf_puN`) so two
   *  presence-folded attrs in one template don't collide. */
  private presenceVarCounter = 0
  // ===========================================================================
  // If-Statement (Conditional Return) Rendering
  // ===========================================================================

  protected renderIfStatement(ifStmt: IRIfStatement): string {
    const condition = this.convertConditionToJinja(ifStmt.condition)
    const consequent = ifStmt.consequent.type === 'if-statement'
      ? this.renderIfStatement(ifStmt.consequent as IRIfStatement)
      : this.renderNode(ifStmt.consequent)
    let result = `{% if ${condition} %}\n${consequent}\n`

    if (ifStmt.alternate) {
      if (ifStmt.alternate.type === 'if-statement') {
        const altResult = this.renderIfStatement(ifStmt.alternate as IRIfStatement)
        // Replace leading "{% if" with "{% elif"
        result += altResult.replace(/^\{% if/, '{% elif')
      } else {
        const alternate = this.renderNode(ifStmt.alternate)
        result += `{% else %}\n${alternate}\n`
      }
    }

    result += `{% endif %}`
    return result
  }

  // ===========================================================================
  // Fragment & Slot Rendering
  // ===========================================================================

  /**
   * Wrap already-rendered output in the comment-based scope marker pair.
   * Shared by a `needsScopeComment` fragment root and a `needsScopeComment`
   * component root (#3141) — both are "this scope has no DOM element of its
   * own to carry bf-s/bf-p", so both lean on the same runtime helper pair.
   */
  private wrapComponentRootScopeComment(rendered: string): string {
    return `{{ bf.scope_comment() | safe }}${rendered}{{ bf.scope_comment_end() | safe }}`
  }

  private renderSlot(_slot: IRSlot): string {
    // Captured children arrive under the `children` context key (see
    // renderComponent's set-block capture + render_child call), so the var
    // is `children`. The content is already-rendered markup, so emit it
    // as-is via `| safe` — otherwise Jinja's autoescape would entity-escape
    // the child tags. (The IR producer doesn't currently emit `slot`
    // nodes — `{children}` lowers to an expression whose captured value is
    // already raw — so this is defensive correctness for if/when a slot
    // node is produced.)
    return `{{ ${minijinjaIdent('children')} | safe }}`
  }

  override renderAsync(node: IRAsync): string {
    const fallback = this.renderNode(node.fallback)
    const children = this.renderChildren(node.children)
    // Capture the fallback into a Jinja set-block and pass its rendered HTML
    // to `bf.async_boundary`, which wraps it in a `<div bf-async="aX">`
    // placeholder. Same shape as `renderComponent`'s children capture.
    const captureName = `bf_async_fallback_${node.id}`
    return `{% set ${captureName} %}${fallback}{% endset %}{{ bf.async_boundary('${node.id}', ${captureName}) | safe }}\n${children}`
  }

  // ===========================================================================
  // Attribute Rendering
  // ===========================================================================

  /**
   * AttrValue lowering for intrinsic-element attributes (Jinja).
   */
  private readonly elementAttrEmitter: AttrValueEmitter = {
    emitLiteral: (value, name) => `${name}="${escapeHtml(value.value)}"`,
    emitExpression: (source, name) => {
      // A computed const reads as its initializer (#3494).
      const value = inlineComputedConstAttr(source, this.computedConsts)
      // `style={{ … }}` object literal → a CSS string with dynamic values
      // interpolated, instead of refusing the bare object with BF101 (#1322).
      if (name === 'style') {
        const css = this.tryLowerStyleObject(value)
        if (css !== null) return `style="${css}"`
      }
      // Refuse shapes that the lowering pipeline can't represent in Jinja —
      // tagged-template-literal call expressions (`cn\`base \${tone()}\``).
      // Same gate as the Xslate adapter.
      if (this.refuseUnsupportedAttrExpression(value.expr, name)) {
        return ''
      }
      const plan = planAttrExpression(value, name, {
        propsObjectName: this.propsObjectName,
        restPropsName: this.restPropsName,
        nullableOptionalProps: this.nullableOptionalProps,
        nullableSignalGetters: this.nullableSignalGetters,
        nullishAttrCtx: this.nullishAttrCtx,
        isLoopBound: (n) => this.isLoopBoundName(n),
        boolStr: (expr, attr) => this.shouldBoolStr(expr, attr),
      })
      const attr = (v: string, boolStr: boolean) =>
        boolStr ? `${name}="{{ bf.bool_str(${v}) }}"` : `${name}="{{ bf.string(${v}) }}"`
      // Each kind is documented on `AttrExpressionPlan`.
      // The nil test is `is defined and is not none`: a var missing from the
      // context reads as Undefined, not `none` (see `providerValueJinja`).
      switch (plan.kind) {
        case 'omit-nullable': {
          // A bare read here, so it doubles as the guard test and the value.
          const v = this.convertExpressionToJinja(value.expr)
          return `\n{% if ${v} is defined and ${v} is not none %}\n${attr(v, plan.boolStr)}\n{% endif %}\n`
        }
        case 'boolean-attr': {
          const v = this.convertExpressionToJinja(value.expr, value.parsed)
          return `{{ ('${name}' if ${this.wrapConditionExpr(value.expr, v)} else '') }}`
        }
        case 'presence': {
          const v = this.convertExpressionToJinja(value.expr)
          const tmp = `bf_pu${this.presenceVarCounter++}`
          return `\n{% set ${tmp} = ${v} %}\n{% if ${this.wrapConditionExpr(value.expr, tmp)} %}\n${attr(tmp, plan.boolStr)}\n{% endif %}\n`
        }
        case 'undefined-alternate': {
          // Pass the parsed sub-trees through (#2843 review): the string forms
          // are `exprToString` debug text, which renders a nested object
          // literal as a non-reparseable placeholder.
          const m = plan.ternary
          const cond = this.convertConditionToJinja('', m.testParsed)
          const val = this.convertExpressionToJinja('', m.consequentParsed)
          return `\n{% if ${cond} %}\n${name}="{{ bf.string(${val}) }}"\n{% endif %}\n`
        }
        case 'omit-nil': {
          const v = this.convertExpressionToJinja(value.expr, value.parsed)
          const tmp = `bf_pu${this.presenceVarCounter++}`
          return `\n{% set ${tmp} = ${v} %}\n{% if ${tmp} is defined and ${tmp} is not none %}\n${attr(tmp, plan.boolStr)}\n{% endif %}\n`
        }
        case 'plain':
          return attr(this.convertExpressionToJinja(value.expr, value.parsed), plan.boolStr)
      }
    },
    emitBooleanAttr: (_value, name) => name,
    emitTemplate: (value, name) =>
      `${name}="{{ ${this.convertTemplateLiteralPartsToJinja(value.parts)} }}"`,
    // Spread attributes (`<div {...attrs()} />`) lower through the
    // `bf.spread_attrs` runtime helper, mirroring the Xslate adapter.
    emitSpread: (value) => {
      if (this.refuseUnsupportedAttrExpression(value.expr, '...')) {
        return ''
      }
      const plan = planSpreadAttr(value, {
        propsObjectName: this.propsObjectName,
        propsParams: this.propsParams,
        localConstants: this.localConstants ?? [],
        isBound: (n) => this.scope.isBound(n),
      })
      // `{...props}`: props arrive as separate template vars, so enumerate them.
      if (plan.kind === 'props-object') {
        const entries = plan.params.map((p) => `${minijinjaHashKey(p)}: ${minijinjaIdent(p)}`)
        return `{{ bf.spread_attrs({${entries.join(', ')}}) | safe }}`
      }
      // A conditional inline-object spread (`{...(cond ? {…} : {})}`) lowers to
      // a ternary of hashes; the falsy `{}` omits the key.
      for (const candidate of plan.candidates) {
        const lowered = conditionalSpreadToJinja(this.spreadCtx, candidate)
        if (lowered !== null) return `{{ bf.spread_attrs(${lowered}) | safe }}`
      }
      return `{{ bf.spread_attrs(${this.convertExpressionToJinja(value.expr)}) | safe }}`
    },
    // Neither variant is legal on intrinsic elements.
    emitBooleanShorthand: () => '',
    emitJsxChildren: () => '',
  }

  /** How this adapter spells the parts of an element `renderElementShell` writes. */
  private readonly elementShell: ElementShellSpelling = {
    attrEmitter: this.elementAttrEmitter,
    renderDangerousInnerHtml: element =>
      renderDangerousInnerHtml(element, this.errors, this.name, (expr, parsed) =>
        // Lower the `__html` expression and emit it through MiniJinja's `| safe`
        // filter, which suppresses autoescape for this one value. The runtime
        // evaluates the expression, so no template-metachar guard applies; the
        // element already carries its hydration slot marker. #2319.
        `{{ ${this.convertExpressionToJinja(expr, parsed)} | safe }}`,
      ),
    renderChildren: children => this.renderChildren(children),
    renderScopeMarker: instanceIdExpr => this.renderScopeMarker(instanceIdExpr),
    renderSlotMarker: slotId => this.renderSlotMarker(slotId),
    dataKeyRelay: `{{ bf.data_key_attr() | safe }}`,
    scopeIdValue: `{{ bf.scope_attr() }}`,
    wrapSsrPortalElement: rendered => this.wrapSsrPortalElement(rendered),
  }

  /**
   * Lower a `style={{ … }}` object literal to a `bf.style_object(...)` call,
   * e.g. `{ backgroundColor: color }` → `{{ bf.style_object("background-color",
   * color) }}`. `style_object` is the single oracle-matching sanitizer (ported
   * from Hono's `hasUnsafeStyleValue`): it drops any key:value pair whose
   * value could break out of a CSS declaration and HTML-escapes the rest,
   * returning a safe string so the custom minijinja formatter doesn't
   * re-escape it (#2261). Returns null when the shape is unsupported or any
   * value can't be lowered (caller falls through to BF101). (#1322)
   */
  private tryLowerStyleObject(value: ExpressionAttr): string | null {
    const entries = planStyleObject(value)
    if (!entries) return null
    const args = entries.flatMap(e => [
      JSON.stringify(e.cssKey),
      e.kind === 'literal' ? JSON.stringify(e.value) : this.convertExpressionToJinja(e.expr, e.parsed),
    ])
    return `{{ bf.style_object(${args.join(', ')}) }}`
  }

  // ===========================================================================
  // Hydration Markers
  // ===========================================================================

  renderScopeMarker(_instanceIdExpr: string): string {
    // bf-s is the addressable scope id. hydration_attrs adds bf-h / bf-m /
    // bf-r conditionally; props_attr adds bf-p when props are present.
    return `bf-s="{{ bf.scope_attr() }}" {{ bf.hydration_attrs() | safe }} {{ bf.props_attr() | safe }}`
  }

  renderSlotMarker(slotId: string): string {
    return `${BF_SLOT}="${slotId}"`
  }

  renderCondMarker(condId: string): string {
    return `${BF_COND}="${condId}"`
  }

  // ===========================================================================
  // Filter Predicate Rendering (ParsedExpr → Jinja)
  // ===========================================================================

  /**
   * Convert a ParsedExpr AST to a Jinja expression string for filter
   * predicates. Wraps the shared ParsedExpr dispatcher with a
   * `JinjaFilterEmitter` carrying the predicate's loop param and any
   * block-body local var aliases.
   */
  private renderJinjaFilterExpr(
    expr: ParsedExpr,
    param: string,
    localVarMap: Map<string, string> = new Map(),
  ): string {
    return emitParsedExpr(
      expr,
      new JinjaFilterEmitter(
        param,
        localVarMap,
        n => this._isStringValueName(n),
        // A nested callback method inside the predicate has no Jinja scalar
        // form — surface BF101 (#2038) instead of silently degrading it to
        // its receiver.
        (message, reason) => this._recordExprBF101(message, reason),
      ),
    )
  }

  // ===========================================================================
  // Expression Conversion: JS → Jinja
  // ===========================================================================

  private convertTemplateLiteralPartsToJinja(literalParts: IRTemplatePart[]): string {
    const parts: string[] = []
    for (const part of literalParts) {
      if (part.type === 'string') {
        parts.push(this.substituteJsInterpolationsToJinja(part.value))
      } else if (part.type === 'ternary') {
        const cond = this.convertConditionToJinja(part.condition)
        parts.push(
          `('${escapeMinijinjaSingleQuoted(part.whenTrue)}' if ${cond} else '${escapeMinijinjaSingleQuoted(part.whenFalse)}')`,
        )
      } else if (part.type === 'lookup') {
        // `${MAP[KEY]}` against a Record<T, string> literal — emit a
        // minijinja dict literal indexed by KEY, piped through the builtin
        // `default` filter for the "empty when no case matches" semantics
        // (mirrors the go-template adapter's fallback contract). This is a
        // minijinja divergence from the Jinja2 port: minijinja maps have no
        // `.get(key, default)` method (`unknown method: map has no method
        // named get`, verified) — Jinja2's dict `.get` doesn't exist here.
        // Instead, a missing-key index on a map returns `undefined` under
        // `UndefinedBehavior::Chainable`, and `| default('')` supplies the
        // fallback inline (verified: `{{ {'a':'x'}[k] | default('DD') }}` →
        // 'DD' on miss, 'x' on hit, incl. nested in call args/concat). See
        // README.md's divergence record.
        const keyExpr = this.convertExpressionToJinja(part.key)
        const entries = Object.entries(part.cases)
          .map(([k, v]) => `${minijinjaHashKey(k)}: '${escapeMinijinjaSingleQuoted(v)}'`)
          .join(', ')
        parts.push(`bf.string(({${entries}}[${keyExpr}] | default('')))`)
      }
    }
    // Join with Jinja string concatenation (`~`). Every term is already a
    // string (literal or `bf.string(...)`-wrapped), so `~`'s own `str()`
    // coercion is a no-op here.
    return parts.length === 1 ? parts[0] : parts.join(' ~ ')
  }

  /**
   * Translate `${EXPR}` interpolations in a static template-part string into
   * Jinja variable references and concatenate them with the surrounding
   * literal text. Each interpolated (non-literal) segment routes through
   * `bf.string(...)` — see the file header, divergence 2.
   */
  private substituteJsInterpolationsToJinja(s: string): string {
    const segments: string[] = []
    const re = /\$\{([^}]+)\}/g
    let lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(s)) !== null) {
      if (m.index > lastIndex) {
        segments.push(`'${escapeMinijinjaSingleQuoted(s.slice(lastIndex, m.index))}'`)
      }
      segments.push(`bf.string(${this.convertExpressionToJinja(m[1].trim())})`)
      lastIndex = re.lastIndex
    }
    if (lastIndex < s.length) {
      segments.push(`'${escapeMinijinjaSingleQuoted(s.slice(lastIndex))}'`)
    }
    if (segments.length === 0) return `''`
    return segments.length === 1 ? segments[0] : `(${segments.join(' ~ ')})`
  }

  /**
   * Refuse JS expression shapes that have no idiomatic Jinja representation:
   * object literals (`style={{...}}`) and tagged-template-literal call
   * expressions (`cn\`base \${tone()}\``). Records `BF101`. Returns `true`
   * when the shape was rejected (caller should drop the attribute).
   */
  private refuseUnsupportedAttrExpression(expr: string, attrName: string): boolean {
    const error = unsupportedAttrExpressionError(expr, attrName, this._loweringMatchers, this.componentName, 'Jinja', 'Jinja')
    if (error) this.errors.push(error)
    return error !== null
  }

  /**
   * Build the EmitContext seam the top-level `ParsedExpr` emitter depends on.
   * Built as a private object (the adapter does NOT `implements JinjaEmitContext`)
   * so the wrapped bookkeeping — `_searchParamsLocals`, the const/record
   * resolvers, BF101 recording, the filter-predicate entry — stays private and
   * off the exported adapter's public type, matching the Go adapter's
   * `emitCtx` and the `spreadCtx` / `memoCtx` seams below.
   */
  private get emitCtx(): JinjaEmitContext {
    return {
      _searchParamsLocals: this._searchParamsLocals,
      _propsObjectName: this.propsObjectName,
      _isGlobalName: (name: string) => this.computedConsts?.isGlobal(name) ?? false,
      _loweringMatchers: this._loweringMatchers,
      _resolveModuleStringConst: (name) => this._resolveModuleStringConst(name),
      _resolveLiteralConst: (name) => this._resolveLiteralConst(name),
      _rootPropReadName: (name) => rootPropReadName(name, this.scope, this.rootPropAliases),
      _resolveStaticRecordLiteral: (o, k) => this._resolveStaticRecordLiteral(o, k),
      _isOpaqueLocalAccessorCall: (name) => isOpaqueLocalAccessorName(name, this.localConstants),
      _arithmeticCoercion: (op, operand, other) => arithmeticOperandCoercion(op, operand, other, this.nullishAttrCtx, n => this.isLoopBoundName(n)),
      _recordExprBF101: (message, reason) => this._recordExprBF101(message, reason),
      _renderJinjaFilterExprPublic: (e, p) => this._renderJinjaFilterExprPublic(e, p),
    }
  }

  /**
   * Build the narrow context the extracted spread lowering depends on. Passing
   * a purpose-built object (rather than `this`) keeps the adapter's bookkeeping
   * members private — they stay internal implementation detail, not part of the
   * exported class's public surface.
   */
  private get spreadCtx(): JinjaSpreadContext {
    return {
      componentName: this.componentName,
      errors: this.errors,
      localConstants: this.localConstants,
      propsParams: this.propsParams,
      convertExpressionToJinja: (e, preParsed) => this.convertExpressionToJinja(e, preParsed),
      convertConditionToJinja: (e, preParsed) => this.convertConditionToJinja(e, preParsed),
    }
  }

  /** Build the narrow context the extracted memo seeding depends on. */
  private get memoCtx(): JinjaMemoContext {
    return {
      convertExpressionToJinja: (e, preParsed, pos) => this.convertExpressionToJinja(e, preParsed, pos),
      errors: this.errors,
    }
  }

  private convertExpressionToJinja(
    expr: string,
    preParsed?: ParsedExpr,
    pos: 'rendered' | 'value' = 'rendered',
  ): string {
    // Parse-first lowering — parity with the Xslate adapter's
    // `convertExpressionToKolon`. Parse the JS expression once, gate it on the
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
    parsed = inlineComputedConsts(parsed, this.computedConsts)

    // `pos` distinguishes a derived-seed RHS (an assignment, checked via
    // `isSupportedValue`) from every other, genuinely rendered call site —
    // the rendered gate would otherwise re-refuse a tree the seed plan
    // already classified `derived` at value position (#2696 review).
    // Registered call lowerings (#2057) — including the built-in `queryHref`
    // plugin — are consulted by this gate no matter where the call sits in
    // the tree (`JinjaTopLevelEmitter`'s `lowering` seam does the actual
    // rendering below, via `emitParsedExpr`'s shared `call` case).
    const supportOpts = { loweringMatchers: this._loweringMatchers }
    const support = pos === 'value' ? isSupportedValue(parsed, supportOpts) : isSupported(parsed, supportOpts)
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
      // Safe Jinja empty-string literal — valid in every context the result
      // might land in.
      return "''"
    }

    return this.renderParsedExprToJinja(parsed)
  }

  /**
   * Convert a JS condition (an `if` / ternary / loop-filter test) to a Jinja
   * boolean expression, routing through `bf.truthy(...)` unless the
   * expression is structurally already boolean-shaped. See the file header,
   * divergence 1.
   */
  private convertConditionToJinja(expr: string, preParsed?: ParsedExpr): string {
    const jinja = this.convertExpressionToJinja(expr, preParsed)
    return this.wrapConditionExpr(expr, jinja, preParsed)
  }

  /**
   * Shared helper: given the ORIGINAL JS expression (or its already-parsed
   * tree) and its ALREADY-RENDERED Jinja text, wrap the rendered text with
   * `bf.truthy(...)` unless the expression is structurally boolean-shaped.
   * Split from `convertConditionToJinja` so a caller that already lowered the
   * expression for another purpose (e.g. the `presenceOrUndefined` temp bind)
   * doesn't lower it twice.
   */
  private wrapConditionExpr(expr: string, jinja: string, preParsed?: ParsedExpr): string {
    const isBoolean = preParsed
      ? isBooleanResultExpr(stringifyParsedExpr(preParsed))
      : isBooleanResultExpr(expr)
    return isBoolean ? jinja : `bf.truthy(${jinja})`
  }

  /**
   * Render a full ParsedExpr tree to Jinja for top-level (non-filter)
   * expressions where identifiers are signals / template vars.
   */
  private renderParsedExprToJinja(expr: ParsedExpr): string {
    return emitParsedExpr(expr, new JinjaTopLevelEmitter(this.emitCtx))
  }

  /** Whether `name` (a signal getter or prop) holds a string value. Carried
   *  for parity with the Perl-family adapters; the Jinja emitters don't
   *  consume it (Jinja's `==`/`!=` compare strings and numbers correctly). */
  private _isStringValueName(name: string): boolean {
    return this.stringValueNames.has(name)
  }

  /**
   * Parse `cond ? value : undefined` (or `: null`), returning the
   * condition/consequent source spans, else `null`. Used for the
   * attribute-omission rule (#1897).
   */  /** Position-accurate loop-bound-name check — see `this.scope`'s docstring. */
  private isLoopBoundName(name: string): boolean {
    return this.scope.isBound(name)
  }

  /**
   * Whether an attribute-value expression should route through
   * `bf.bool_str` (vs. plain `bf.string`) at its interpolation site.
   * `isExplicitStringCall` is checked FIRST and short-circuits the other
   * three: an explicit `String(x)` call already lowers to `bf.string(x)`,
   * which — unlike Kolon's Perl port — correctly stringifies a real
   * boolean on its own (see `runtime.js_string`'s bool branch), so
   * layering `bf.bool_str` on top would run Python truthiness over the
   * ALREADY-STRINGIFIED text instead of the original boolean. See
   * `isExplicitStringCall`'s docstring in `@barefootjs/jsx`'s `adapters/boolean-result.ts` for the full
   * double-wrap failure mode this guards against.
   */
  private shouldBoolStr(expr: string, name: string): boolean {
    if (isExplicitStringCall(expr)) return false
    return isBooleanResultExpr(expr) || isAriaBooleanAttr(name) || isBooleanTypedPropRef(expr, { propsObjectName: this.propsObjectName, booleanTypedProps: this.booleanTypedProps, isBound: (n) => this.scope.isBound(n) })
  }

  /**
   * Inline a const (any scope) whose initializer is a pure numeric or
   * single-quoted string literal (`const totalPages = 5`, #1897
   * pagination) — function-scope consts never reach the per-render
   * context, so a bare reference would resolve to Undefined.
   *
   * The lookup is a flat name match with no notion of AST scope, so a
   * name bound by the CURRENTLY ENCLOSING loop's item/index/destructure/
   * preamble param never inlines (#2221) — the occurrence may be the
   * loop's own (shadowing) binding, and substituting the outer const's
   * value there renders every iteration with the same hard-coded literal.
   * Position-accurate via the threaded `this.scope` (#2482 Stage 2) — a
   * same-named const elsewhere in the component, outside any loop that
   * shadows it, still inlines.
   */
  private _resolveLiteralConst(name: string): string | null {
    const lit = lookupLiteralConst(name, this.localConstants, n => this.scope.isBound(n))
    if (lit === null) return null
    if (lit.kind === 'number') return lit.text
    if (lit.kind === 'boolean') return lit.text === 'true' ? 'true' : 'false'
    if (lit.kind === 'null') return 'none'
    return `'${escapeMinijinjaSingleQuoted(lit.text)}'`
  }

  /**
   * Resolve `IDENT.key` where `IDENT` is a module-scope object-literal const
   * (`variantClasses.ghost`, #1896/#1897) to the looked-up scalar.
   *
   * The lookup is a flat name match on `objectName` with no notion of AST
   * scope, so an enclosing loop callback's own param of the same name
   * (`.map((cfg) => <li>{cfg.x}</li>)` shadowing a module `const cfg = {…}`)
   * still resolved to the OUTER const's member value at every iteration
   * (#2237) — the sibling hazard to #2221's `_resolveLiteralConst`.
   * Position-accurate via the threaded `this.scope` (#2482 Stage 2), passed
   * as `lookupStaticRecordLiteral`'s required guard: a name the CURRENTLY
   * ENCLOSING loop binds never inlines, falling back to the bare `cfg.x`
   * member expression (which a minijinja `for` loop binds correctly at the
   * shadowed occurrence); a same-named const elsewhere, outside any loop
   * that shadows it, still inlines.
   */
  private _resolveStaticRecordLiteral(objectName: string, key: string): string | null {
    const hit = lookupStaticRecordLiteral(objectName, key, this.localConstants, name => this.scope.isBound(name))
    if (!hit) return null
    return hit.kind === 'number'
      ? hit.text
      : `'${escapeMinijinjaSingleQuoted(hit.text)}'`
  }

  private _resolveModuleStringConst(name: string): string | null {
    // A loop body may bind a `{% set %}` local that shadows a module const of
    // the same name; never inline inside one (conservative — drop to the
    // bare identifier).
    if (this.inLoop) return null
    const value = this.moduleStringConsts.get(name)
    if (value === undefined) return null
    return `'${escapeMinijinjaSingleQuoted(value)}'`
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
  private _renderJinjaFilterExprPublic(expr: ParsedExpr, param: string): string {
    return this.renderJinjaFilterExpr(expr, param)
  }
}

export const minijinjaAdapter = new MinijinjaAdapter()

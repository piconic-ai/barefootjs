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
  TypeInfo,
  TemplatePrimitiveRegistry,
  LoopBindingPathSegment,
} from '@barefootjs/jsx'
import {
  collectBooleanValueNames,
  DslTemplateAdapter,
  type IRNodeEmitter,
  type EmitIRNode,
  type AttrValueEmitter,
  parseExpression,
  stringifyParsedExpr,
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
  type ContextConsumer,
  lookupStaticRecordLiteral,
  lookupLiteralConst,
  isLowerableLoopDestructure,
  childTemplateName,
  isEmptyComponentProps,
  isBooleanTypedPropRef,
  planAttrExpression,
  spellDestructureLocals,
  spellFilteredRow,
  spellSortedSource,
  type DestructureSpelling,
  type LoopRefusalSpelling,
  type LoopPlan,
  planSpreadAttr,
  planComponentProps,
  spellComponentProps,
  type ScopeFrame,
  rootPropReadName,
  isRootPropsObject,
  attrValueMayBeNullish,
  isAriaBooleanAttr,
  isBooleanResultExpr,
  hasClientInteractivity,
  renderElementShell,
  renderFragmentScope,
  renderDangerousInnerHtml,
  type ElementShellSpelling,
  inlineComputedConstAttr,
  inlineComputedConsts,
} from '@barefootjs/jsx'
import ts from 'typescript'
import type { ParsedExpr } from '@barefootjs/jsx'
import {
  escapeLineStatementSigil,
  isBooleanResultParsed,
  isNumericArithmeticResult,
  isOpaqueLocalAccessorName,
  stringifyBooleanTernaryBranches,
} from '@barefootjs/jsx'
import { BF_SLOT, BF_COND, escapeHtml } from '@barefootjs/shared'

import type { XslateRenderCtx } from './lib/types.ts'
import { XSLATE_PRIMITIVE_EMIT_MAP } from './lib/constants.ts'
import { kolonHashKey, escapeKolonSingleQuoted } from './lib/kolon-naming.ts'
import { renderSortMethod, EVAL_SPELLING } from './expr/array-method.ts'
import { staticValueToKolon } from './lib/static-value.ts'
import { XslateFilterEmitter, XslateTopLevelEmitter, CALLBACK_LOWERING } from './expr/emitters.ts'
import type { XslateEmitContext, XslateSpreadContext, XslateMemoContext } from './emit-context.ts'
import {
  conditionalSpreadToKolon,
  objectLiteralExprToKolonHashref,
} from './spread/spread-codegen.ts'
import {
  generateContextConsumerSeed,
  generateDerivedMemoSeed,
  collectMemoKolonRenames,
} from './memo/seed.ts'
import { collectStringValueNames } from './props/prop-classes.ts'

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

/** A Kolon string or number literal, the whole of a lowered value. */
const KOLON_LITERAL = /^(?:'(?:[^'\\]|\\.)*'|-?\d+(?:\.\d+)?)$/

/** How a lowered loop destructure binding reads off the row item. */
const DESTRUCTURE_SPELLING: DestructureSpelling = {
  accessor: kolonSegmentAccessor,
  slice: (parent, from) => `$bf.slice(${parent}, ${from}, nil)`,
  omit: (parent, keys) => `$bf.omit(${parent}, [${keys.map(kolonStringLiteral).join(', ')}])`,
}

/** The wording of the loop refusals the plan decides (BF104 / BF101). */
const LOOP_REFUSALS: LoopRefusalSpelling = {
  destructureMessage: (param) =>
    `Loop callback uses a destructure pattern (\`${param}\`) that the Xslate adapter cannot lower — see the diagnostic detail for the specific shape.`,
  destructureSuggestion:
    `Options:\n` +
    `  1. If this is an object-rest binding (\`{ ...rest }\`), only reading \`rest.field\` or spreading \`{...rest}\` onto an intrinsic element lowers — other uses (passing \`rest\` to a function, rendering it as text) need the client runtime.\n` +
    `  2. If this is chained \`.filter().map(({ ... }) => ...)\`, hoist the destructure into a variable inside the callback body instead.\n` +
    `  3. Mark the loop position as @client-only so the destructure runs in JS on the client.\n` +
    `  4. Move the loop into a primitive that the adapter registers explicitly.`,
  unresolvableConst: 'Xslate',
}

/**
 * The `XslateAdapter` template adapter. Pass an instance as the `adapter` option of `@barefootjs/vite`.
 *
 * @since 0.9.1
 * @stability alpha
 */
export class XslateAdapter extends DslTemplateAdapter implements IRNodeEmitter<XslateRenderCtx> {
  name = 'xslate'
  extension = '.tx'
  templatesPerComponent = true

  /**
   * Identifier-path callees the Xslate runtime can render in template scope.
   * The relocate pass consults this map to mark matching calls as
   * template-safe; the SSR template emitter substitutes the JS call with the
   * registered `$bf.NAME(...)` helper invocation.
   */
  templatePrimitives: TemplatePrimitiveRegistry = XSLATE_PRIMITIVE_EMIT_MAP

  private options: Required<XslateAdapterOptions>
  private booleanValueNames: { names: Set<string>; props: Set<string> } = { names: new Set(), props: new Set() }

  constructor(options: XslateAdapterOptions = {}) {
    super()
    this.options = {
      clientJsBasePath: options.clientJsBasePath ?? '/static/components/',
      barefootJsPath: options.barefootJsPath ?? '/static/components/barefoot.js',
    }
  }

  protected readonly loopChildDiagnosticName = 'Xslate'

  /**
   * Names (signal getters + props) whose value is a string. In the Mojo
   * adapter this drives choosing Perl `eq`/`ne` over numeric `==`/`!=` for a
   * string `===`/`!==`. The Kolon emitters do NOT consume this: Kolon's
   * `==`/`!=` are value-equality operators that compare strings and numbers
   * correctly, so `===`/`!==` always map to `==`/`!=`. The set is populated
   * and threaded for parity with the Mojo adapter (and as groundwork for a
   * shared Perl-family codegen surface), not because Kolon needs it today.
   */
  protected stringValueNamesFor(ir: ComponentIR): Set<string> {
    return collectStringValueNames(ir)
  }

  protected override resetAdapterState(ir: ComponentIR): void {
    this.booleanValueNames = collectBooleanValueNames(ir.metadata)
    // Before any body rendering: memo reads in the body must use the same
    // local the memo seed declares (#3369).
    this.memoKolonNames = collectMemoKolonRenames(ir)
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

  protected generateScriptRegistrations(
    ir: ComponentIR,
    scriptBaseName?: string,
    scriptAssets?: string[],
    preloadAssets?: string[],
  ): string {
    // `scriptAssets`, when present (including `[]`), fully supersedes the
    // adapter-computed `barefootJsPath` / `clientJsBasePath` pair — see
    // `AdapterGenerateOptions.scriptAssets`. The caller (e.g. the Vite
    // plugin) has already decided the exact ordered URL list, including
    // whether any script is needed at all.
    if (scriptAssets) {
      if (scriptAssets.length === 0) return ''
      // `preloadAssets` is only meaningful alongside a non-empty
      // `scriptAssets` (see `AdapterGenerateOptions.preloadAssets`), and
      // every preload registration is emitted BEFORE every script
      // registration — a hint that arrives after the script it describes
      // is useless. Distinct `_bf_pre*` var prefix keeps these `my`
      // bindings from colliding with the `_bf_reg*` script ones below
      // (Kolon forbids re-`my` of the same name in one scope). Same
      // throwaway-`my` no-output trick as `register_script`:
      // `register_preload`'s return value is never printed.
      const lines = (preloadAssets ?? []).map(
        (url, i) => `: my $_bf_pre${i} = $bf.register_preload('${url}');`,
      )
      lines.push(
        ...scriptAssets.map((url, i) => `: my $_bf_reg${i} = $bf.register_script('${url}');`),
      )
      lines.push('')
      return lines.join('\n')
    }

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
    // character references); re-escape for direct HTML emission. A
    // line-leading `:` would be read as a line statement (#3311).
    return escapeLineStatementSigil(escapeHtml(node.value), ':', "<: ':' :>")
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
    const rendered = this.renderComponent(node)
    // #3141: see `wrapComponentRootScopeComment`'s docstring.
    return node.needsScopeComment ? this.wrapComponentRootScopeComment(rendered) : rendered
  }

  emitFragment(node: IRFragment, _ctx: XslateRenderCtx, _emit: EmitIRNode<XslateRenderCtx>): string {
    return renderFragmentScope(node, children => this.renderChildren(children), rendered => this.wrapComponentRootScopeComment(rendered))
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
    return renderElementShell(element, this.elementShell)
  }

  /**
   * Route an `ssrPortalOwnerScope`-flagged element's ALREADY-RENDERED
   * markup (the `bf-po` attribute already stamped on its own tag) into
   * `$bf.register_portal_element` instead of leaving it at its source
   * position (#3119).
   *
   * Reuses Kolon's own zero-arg `macro` block-capture — the SAME mechanism
   * `renderComponent` already uses to forward JSX children (see this
   * file's "Content capture" notes near the children-macro call sites):
   * the element renders inline as normal Kolon (its own `<: :>`
   * interpolations evaluate exactly as they would anywhere else), the
   * macro captures the nested render, and calling it (`NAME()`) produces
   * its already-rendered HTML. A `:`-line statement (never a bare `<: :>`
   * printing tag) hands that string to the portal collector, bound to a
   * throwaway `my` local so `register_portal_element`'s return value isn't
   * auto-printed by Kolon's line-statement marker — the SAME no-output
   * trick `register_script`/`register_preload` use above (see this file's
   * script-registration methods) — so nothing prints at the source
   * position. `\n` surrounds the `:`-line the same way every other
   * embedded line-statement in this file does (`: if (...) { ... : }`),
   * since Kolon recognizes `:` as a line marker only at the start of a
   * physical line.
   */
  private wrapSsrPortalElement(rendered: string): string {
    const macroName = `bf_po_${this.childrenCaptureCounter++}`
    const varName = `$_bf_po_reg_${this.childrenCaptureCounter++}`
    return `<: macro ${macroName} -> () { :>${rendered}<: } :>\n: my ${varName} = $bf.register_portal_element(${macroName}());\n`
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
        return `<: $bf.text_start("${expr.slotId}") | mark_raw :><: $bf.text_end() | mark_raw :>`
      }
      return ''
    }

    // Thread the IR-carried `.parsed` tree through (mirrors go-template's
    // `convertExpressionToGo(expr.expr, classify, expr.parsed)`) so a
    // resolved bare-identifier `.map`/`.filter`/… callback
    // (`resolveCallbackMethodFunctionReferences`, #2206) isn't lost to a
    // fresh, unresolved re-parse of the raw string.
    const perlExpr = this.jsNumberOutput(
      expr.parsed ?? parseExpression(expr.expr.trim()),
      this.convertExpressionToKolon(expr.expr, expr.parsed),
    )

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

    // #3166: thread `cond.parsedCondition` through — a recognised
    // `<action>.isPending()` / `.error()` read has already been substituted
    // with its seed literal there; re-parsing `cond.condition` fresh here
    // would lose that and fall into the generic member-access lowering
    // (undefined at render time).
    const condition = this.convertExpressionToKolon(cond.condition, cond.parsedCondition)
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

    // Tag statements (`<: if … { :>`), inline, rather than `:` line
    // statements (#3321): a line statement needs its own line, and the
    // newline ending the text line before it rendered as whitespace between
    // the conditional and adjacent text (`x: off` for `x:{c ? 'on' : 'off'}`).
    // A branch that itself begins or ends with a `:` line keeps that line
    // on its own.
    const branch = (content: string | null): string => {
      const text = content ?? ''
      const lines = text.split('\n')
      const isLine = (l: string | undefined) => l !== undefined && /^\s*:/.test(l)
      return `${isLine(lines[0]) ? '\n' : ''}${text}${isLine(lines[lines.length - 1]) ? '\n' : ''}`
    }
    let result: string
    if (useCommentMarkers) {
      // Fragment branches: use comment markers
      const inner = whenFalse
        ? `<: if (${condition}) { :>${branch(whenTrue)}<: } else { :>${branch(whenFalse)}<: } :>`
        : `<: if (${condition}) { :>${branch(whenTrue)}<: } :>`
      result = `<: $bf.comment("cond-start:${cond.slotId}") | mark_raw :>${inner}<: $bf.comment("cond-end:${cond.slotId}") | mark_raw :>`
    } else if (markedFalse) {
      result = `<: if (${condition}) { :>${branch(markedTrue)}<: } else { :>${branch(markedFalse)}<: } :>`
    } else if (cond.slotId) {
      // Conditional with no else: wrap with comment markers for client hydration
      result = `<: $bf.comment("cond-start:${cond.slotId}") | mark_raw :><: if (${condition}) { :>${branch(whenTrue)}<: } :><: $bf.comment("cond-end:${cond.slotId}") | mark_raw :>`
    } else {
      result = `<: if (${condition}) { :>${branch(whenTrue)}<: } :>`
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
    const loopPlan = this.loopPlanFor(loop, {
      resolveLiteralConst: (name) => this._resolveLiteralConst(name),
      callbackLowering: CALLBACK_LOWERING,
      spellStatic: staticValueToKolon,
    })
    this.recordLoopPlanRefusals(loop, loopPlan, LOOP_REFUSALS)

    // A `.map()` loop whose array is a bare identifier bound to a local
    // const (module- or function-scope, #2946) with a non-statically-
    // evaluable initializer that reads props/signals/a function call (e.g.
    // `const entries = Object.entries(props.x ?? {}).filter(...)`) can't
    // render correctly. Locals get no per-render stash slot — this
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
    // #2208/#2946: a loop source that is a fully-static array literal —
    // either inline (`[{ label: 'Alpha' }, ...].map(...)`) or a bare
    // identifier bound to a local const (module- or function-scope) whose
    // initializer has no prop/signal/function-call dependency — inlines as
    // a native Kolon array/hash literal below. A runtime-computed local
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

    const rawArray = staticArray ?? this.convertExpressionToKolon(loop.array)
    // The source sorted by the loop's comparator, when it has one: the
    // plan decides the evaluator, the structured `{keys: …}` descriptor or
    // the refusal, which keeps the source unsorted so the template stays
    // valid (#3473).
    const array = spellSortedSource(loopPlan.sort, rawArray, {
      emit: (e) => this.convertExpressionToKolon('', e),
      eval: EVAL_SPELLING,
      structured: renderSortMethod,
      refuse: (message, suggestion) => this._recordExprBF101(message, suggestion),
    })
    const param = loop.param
    // Kolon binds the item directly via `for LIST -> $item`. The index, when
    // needed (`.keys().map(k => ...)` or an explicit `index` param), comes
    // from Text::Xslate's loop variable `$~param.index`.

    const { loopVar, rowNames, locals: indexLocalLines } = this.kolonRowBindings(loop, loopPlan)
    const my = (name: string) => rowNames.get(name) ?? name

    // The row window (#3473): the row's scope around everything that
    // evaluates per row (the preamble locals' initializers, the children
    // under `inLoop`, the whole-item-conditional key anchor). The filter
    // predicate stays outside it: a filter callback's own param is a
    // separate frame, never folded into the `.map()` row.
    const { rootAliases, preamble: preambleLines, body: bodyChildren } = this.renderLoopRow(loop, {
      // A row local renamed off an enclosing row's binding (#3392) reads
      // under its new name wherever the row's frame resolves it.
      enter: (row) => {
        const [firstRenamed] = rowNames.keys()
        const rowFrame = firstRenamed !== undefined ? row.lookup(firstRenamed)?.frame : undefined
        if (rowFrame) this.rowKolonRenames.set(rowFrame, rowNames)
      },
      preamble: (d) => `: my $${my(d.name)} = ${this.convertExpressionToKolon(d.raw, d.valueParsed)};`,
      keyAnchor: (key) => `<: $bf.comment("loop-i:" ~ $bf.escape_comment_key(${this.convertExpressionToKolon(key)})) | mark_raw :>`,
    })

    const lines: string[] = []
    // Scoped per-call-site marker so sibling `.map()`s under the same parent
    // each get their own reconciliation range.
    lines.push(`<: $bf.comment("loop:${loop.markerId}") | mark_raw :>`)
    if (rootAliases.length > 0) {
      lines.push(': if (1) {')
      for (const { name, alias } of rootAliases) lines.push(`: my $${alias} = $${name};`)
    }
    lines.push(this.kolonForHeader(loop, array, loopVar))
    for (const il of indexLocalLines) lines.push(il)

    // The row, inside the filter's guard for a filter().map() loop; a
    // filter without a predicate is refused (#3534). Kolon renames a
    // shadowing row local instead of aliasing the captures, so the
    // predicate renders as written.
    lines.push(...spellFilteredRow(loopPlan.filter, [...preambleLines, bodyChildren], {
      // The filter's param reads as the loop's row local (`$t` →
      // `$todo`), under the row's renamed local when it has one (#3392).
      condition: (filter) => this.renderKolonFilterExpr(filter.predicate, filter.param, new Map(), rowNames.get(param) ?? param),
      refuse: (message, suggestion) => this._recordExprBF101(message, suggestion),
      refused: '1',
      open: (condition) => `: if (${condition}) {`,
      close: ': }',
    }))

    lines.push(`: }`)
    if (rootAliases.length > 0) lines.push(': }')
    lines.push(`<: $bf.comment("/loop:${loop.markerId}") | mark_raw :>`)

    return lines.join('\n')
  }

  /**
   * The for-target of `loop` and the row's `: my` locals, with each row
   * local an enclosing row already binds renamed (#3392): `rowNames` maps a
   * renamed source name to its row local. Reads the scope outside the loop.
   */
  private kolonRowBindings(
    loop: IRLoop,
    loopPlan: LoopPlan<unknown>,
  ): { loopVar: string; rowNames: Map<string, string>; locals: string[] } {
    // An array iteration's for-target is `loopPlan.itemVar`: a throwaway item
    // var when the param is not the item (a `.keys()` param is the index, a
    // lowered destructure's bindings read off the item). An entries iteration
    // walks `.kv()` pairs; `.keys()` / `.values()` yield the param directly.
    const param = loop.param
    let loopVar = loop.objectIteration === 'entries'
      ? '__bf_pair'
      : loop.objectIteration
        ? param
        : loopPlan.itemVar

    // The row's `: my` locals: an entries iteration's key and value off the
    // pair, the index local (a `.keys()` param or an explicit index param)
    // off the loop variable's `$~loopvar.index`, and one local per lowered
    // destructure binding, walking its `segments` path (#2087 Phase B) — the
    // full accessor for a fixed binding, `$bf.slice(parent, from, nil)` /
    // `$bf.omit(parent, [keys])` for an array / object rest (the same runtime
    // helpers the `.slice()` method lowers to; Kolon's undefined is `nil`),
    // a true residual rather than the whole item aliased.
    // A `my` local named like an enclosing row's binding is renamed (#3392).
    const myBoundNames = [
      ...(loop.objectIteration === 'entries' ? [loop.index ?? param, param] : []),
      ...(loopPlan.indexLocal ? [loopPlan.indexLocal] : []),
      ...loopPlan.destructureLocals.map(local => local.name),
      ...(loop.preamble?.declarations ?? []).map(d => d.name),
    ]
    const rowNames = new Map<string, string>()
    // Kolon refuses a `for` target that redeclares an enclosing local too.
    const renamed = (name: string) => this.scope.isBound(name) ? `__bf_row_${loop.markerId}_${name}` : name
    if (loopVar === param) {
      loopVar = renamed(param)
      if (loopVar !== param) rowNames.set(param, loopVar)
    }
    for (const name of myBoundNames) {
      if (renamed(name) !== name) rowNames.set(name, renamed(name))
    }
    const my = (name: string) => rowNames.get(name) ?? name
    const indexLocalLines: string[] = []
    if (loop.objectIteration === 'entries') {
      indexLocalLines.push(`: my $${my(loop.index ?? param)} = $${loopVar}.key;`)
      indexLocalLines.push(`: my $${my(param)} = $${loopVar}.value;`)
    }
    if (loopPlan.indexLocal) indexLocalLines.push(`: my $${my(loopPlan.indexLocal)} = $~${loopVar}.index;`)
    for (const { name, value } of spellDestructureLocals(loopPlan, `$${loopVar}`, DESTRUCTURE_SPELLING)) {
      indexLocalLines.push(`: my $${my(name)} = ${value};`)
    }
    return { loopVar, rowNames, locals: indexLocalLines }
  }

  /** The `: for … -> $loopVar {` header that iterates `array` for `loop`. */
  private kolonForHeader(loop: IRLoop, array: string, loopVar: string): string {
    // `objectIteration` (#2168 object-entries-map): Kolon has no built-in
    // hash-destructure `for` target, so `'entries'` iterates `.kv()`
    // (yielding `{key, value}` pair objects, unpacked via the `: my`
    // locals of `kolonRowBindings`) while `'keys'`/`'values'` iterate `.keys()`/`.values()`
    // directly. All three are alphabetically sorted by Text::Xslate itself
    // (verified empirically) — not JS insertion order, a documented known
    // limitation for out-of-alphabetical-order data, same as Go/Rust.
    return loop.objectIteration === 'entries'
      ? `: for ${array}.kv() -> $${loopVar} {`
      : loop.objectIteration === 'keys'
        ? `: for ${array}.keys() -> $${loopVar} {`
        : loop.objectIteration === 'values'
          ? `: for ${array}.values() -> $${loopVar} {`
          : `: for ${array} -> $${loopVar} {`
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
    // Each named JSX-valued prop (`header={<strong>Title</strong>}`, #2168)
    // and the forwarded children are captured with a Kolon macro, evaluated
    // in the parent's template scope (signals, conditionals), and passed as
    // the macro call's result; `render_child` materializes a CODE-ref
    // children value through the backend before handing it to the child. A
    // named slot's macro name is counter-based: a prop name can contain
    // characters (`data-slot`) that are no valid macro name.
    const tplName = childTemplateName(comp.name, this.importAliases)
    const captures: string[] = []
    const capture = (children: IRNode[], name: () => string) => {
      const body = this.renderChildren(children)
      const macroName = name()
      captures.push(`<: macro ${macroName} -> () { :>${body}<: } :>`)
      return `${macroName}()`
    }
    const plan = planComponentProps(comp, {
      propsObjectName: this.propsObjectName,
      propsParams: this.propsParams,
      callerKeys: true,
    })
    const segments = spellComponentProps(plan, {
      entry: (entry) => {
        switch (entry.kind) {
          case 'value':
            return emitAttrValue(entry.value, this.componentPropEmitter, entry.name)
          case 'named-slot':
            return `${kolonHashKey(entry.name)} => ${capture(entry.children, () => `bf_prop_${this.childrenCaptureCounter++}`)}`
          case 'props-param':
            return `${entry.name} => $${entry.name}`
          case 'slot-id':
            return `_bf_slot => '${entry.slotId}'`
          case 'children':
            return `children => ${capture(entry.children, () => `bf_children_${comp.slotId ?? 'c' + this.childrenCaptureCounter++}`)}`
        }
      },
      spread: (value) => this.convertExpressionToKolon(value.expr),
      presentParam: (name) =>
        `($bf.passed(${kolonStringLiteral(name)}, (defined $${name})) ? { ${name} => $${name} } : {})`,
    })
    const hashEntries = isEmptyComponentProps(segments) ? '' : `, ${this.combineComponentPropSegments(segments)}`
    return `${captures.join('')}<: $bf.render_child('${tplName}'${hashEntries}) | mark_raw :>`
  }
  /** Memos declared under a renamed Kolon local (`collectMemoKolonRenames`, #3369). */
  private memoKolonNames: Map<string, string> = new Map()
  /**
   * Renamed Kolon locals per loop row, keyed by the row's `BindingScope`
   * frame. Kolon refuses a `my` or `for` target that redeclares an enclosing
   * local, so such a row local is bound as `__bf_row_<marker>_<name>`; `scope`
   * still decides which row binds a name (#3392).
   */
  private rowKolonRenames = new WeakMap<ScopeFrame, Map<string, string>>()

  /** Uniquifies the `presenceOrUndefined` temp binding (`$bf_puN`) so two
   *  presence-folded attrs in one template don't collide. */
  private presenceVarCounter = 0
  // ===========================================================================
  // If-Statement (Conditional Return) Rendering
  // ===========================================================================

  protected renderIfStatement(ifStmt: IRIfStatement): string {
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

  /**
   * Wrap already-rendered output in the comment-based scope marker pair.
   * Shared by a `needsScopeComment` fragment root and a `needsScopeComment`
   * component root (#3141) — both are "this scope has no DOM element of its
   * own to carry bf-s/bf-p", so both lean on the same runtime helper pair.
   */
  private wrapComponentRootScopeComment(rendered: string): string {
    return `<: $bf.scope_comment() | mark_raw :>${rendered}<: $bf.scope_comment_end() | mark_raw :>`
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
    emitExpression: (source, name) => {
      // A computed const reads as its initializer (#3494).
      const value = inlineComputedConstAttr(source, this.computedConsts)
      // `style={{ … }}` object literal → a CSS string with dynamic values
      // interpolated, instead of refusing the bare object with BF101 (#1322).
      if (name === 'style') {
        const css = this.tryLowerStyleObject(value)
        if (css !== null) return `style="${css}"`
      }
      const plan = planAttrExpression(value, name, {
        propsObjectName: this.propsObjectName,
        restPropsName: this.restPropsName,
        nullableOptionalProps: this.nullableOptionalProps,
        nullableSignalGetters: this.nullableSignalGetters,
        nullishAttrCtx: this.nullishAttrCtx,
        isLoopBound: (n) => this.isLoopBoundName(n),
        boolStr: (expr, attr) => isBooleanResultExpr(expr) || isAriaBooleanAttr(attr) || isBooleanTypedPropRef(expr, { propsObjectName: this.propsObjectName, booleanTypedProps: this.booleanTypedProps, isBound: (n) => this.scope.isBound(n) }),
      })
      const attr = (v: string, boolStr: boolean) =>
        boolStr ? `${name}="<: $bf.bool_str(${v}) :>"` : `${name}="<: ${v} :>"`
      // Each kind is documented on `AttrExpressionPlan`.
      switch (plan.kind) {
        case 'omit-nullable': {
          // A bare read here, so it doubles as the guard test and the value.
          const v = this.convertExpressionToKolon(value.expr)
          return `\n: if (defined ${v}) {\n${attr(v, plan.boolStr)}\n: }\n`
        }
        case 'boolean-attr':
          return `<: ${this.convertExpressionToKolon(value.expr, value.parsed)} ? '${name}' : '' :>`
        case 'presence': {
          const v = this.convertExpressionToKolon(value.expr)
          const tmp = `$bf_pu${this.presenceVarCounter++}`
          return `\n: my ${tmp} = ${v};\n: if (${tmp}) {\n${attr(tmp, plan.boolStr)}\n: }\n`
        }
        case 'undefined-alternate': {
          // A mixed boolean / string branch renders its boolean as JS does.
          const m = plan.ternary
          const cond = this.convertExpressionToKolon('', m.testParsed)
          const val = this.convertExpressionToKolon('', stringifyBooleanTernaryBranches(m.consequentParsed))
          const shown = isBooleanResultParsed(m.consequentParsed)
            ? `$bf.bool_str(${val})`
            : this.jsNumberOutput(m.consequentParsed, val)
          return `\n: if (${cond}) {\n${name}="<: ${shown} :>"\n: }\n`
        }
        case 'omit-nil':
        case 'plain': {
          // A ternary with a boolean and a string branch renders its boolean
          // as JS does, unless the whole value goes through `bool_str`.
          const valueParsed = value.parsed ?? parseExpression(value.expr.trim())
          const mixedParsed = valueParsed && !plan.boolStr ? stringifyBooleanTernaryBranches(valueParsed) : value.parsed
          const v = this.convertExpressionToKolon(value.expr, mixedParsed)
          // A literal is never nil, and Text::Xslate folds `defined` of a
          // local bound to a string literal to false, which would drop the
          // attribute (a computed-key read resolved at compile time, #3497).
          if (plan.kind === 'plain' || KOLON_LITERAL.test(v)) {
            return plan.boolStr ? attr(v, true) : attr(this.jsNumberOutput(mixedParsed, v), false)
          }
          const tmp = `$bf_pu${this.presenceVarCounter++}`
          return `\n: my ${tmp} = ${v};\n: if (defined ${tmp}) {\n${attr(tmp, plan.boolStr)}\n: }\n`
        }
      }
    },
    emitBooleanAttr: (_value, name) => name,
    emitTemplate: (value, name) =>
      `${name}="<: ${this.convertTemplateLiteralPartsToKolon(value.parts)} :>"`,
    // Spread attributes (`<div {...attrs()} />`) lower through the
    // `$bf.spread_attrs` runtime helper, mirroring the Mojo adapter.
    emitSpread: (value) => {
      const plan = planSpreadAttr(value, {
        propsObjectName: this.propsObjectName,
        propsParams: this.propsParams,
        localConstants: this.localConstants ?? [],
        isBound: (n) => this.scope.isBound(n),
      })
      // `{...props}`: props arrive as separate template vars, so enumerate them.
      if (plan.kind === 'props-object') {
        const entries = plan.params.map((p) => `${JSON.stringify(p)} => $${p}`)
        return `<: $bf.spread_attrs({${entries.join(', ')}}) | mark_raw :>`
      }
      // A conditional inline-object spread (`{...(cond ? {…} : {})}`) lowers to
      // a ternary of hashes; the falsy `{}` omits the key.
      for (const candidate of plan.candidates) {
        const lowered = conditionalSpreadToKolon(this.spreadCtx, candidate)
        if (lowered !== null) return `<: $bf.spread_attrs(${lowered}) | mark_raw :>`
      }
      return `<: $bf.spread_attrs(${this.convertExpressionToKolon(value.expr)}) | mark_raw :>`
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
        // Lower the `__html` expression and emit it through Kolon's `mark_raw`
        // filter, which marks the value raw so the auto-escaping `<: … :>`
        // interpolation emits it verbatim. The runtime evaluates the
        // expression, so no template-metachar guard applies; the element
        // already carries its hydration slot marker. #2319.
        `<: ${this.convertExpressionToKolon(expr, parsed)} | mark_raw :>`,
      ),
    renderChildren: children => this.renderChildren(children),
    renderScopeMarker: instanceIdExpr => this.renderScopeMarker(instanceIdExpr),
    renderSlotMarker: slotId => this.renderSlotMarker(slotId),
    dataKeyRelay: `<: $bf.data_key_attr() | mark_raw :>`,
    scopeIdValue: `<: $bf.scope_attr() :>`,
    wrapSsrPortalElement: rendered => this.wrapSsrPortalElement(rendered),
  }

  /**
   * Lower a `style={{ … }}` object literal to a `$bf.style_object(...)` call,
   * e.g. `{ backgroundColor: color }` → `<: $bf.style_object('background-color',
   * $color) | mark_raw :>`. `style_object` is the single oracle-matching
   * sanitizer (ported from Hono's `hasUnsafeStyleValue`): it drops any
   * key:value pair whose value could break out of a CSS declaration and
   * HTML-escapes the rest, so the call is piped through `| mark_raw` (not
   * left to Kolon's own autoescape) to avoid double-encoding the
   * already-safe result (#2261). Returns null when the shape is unsupported
   * or any value can't be lowered (caller falls through to BF101). (#1322)
   */
  private tryLowerStyleObject(value: ExpressionAttr): string | null {
    const entries = planStyleObject(value)
    if (!entries) return null
    const args = entries.flatMap(e => [
      `'${escapeKolonSingleQuoted(e.cssKey)}'`,
      e.kind === 'literal' ? `'${escapeKolonSingleQuoted(e.value)}'` : this.convertExpressionToKolon(e.expr, e.parsed),
    ])
    return `<: $bf.style_object(${args.join(', ')}) | mark_raw :>`
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
    paramLocal = param,
    onRead?: (name: string) => void,
  ): string {
    // Arithmetic over a prop whose nil the type cannot classify (#3700).
    this.refuseAmbiguousNilArithmeticIn(expr, [param, ...localVarMap.keys()])
    return emitParsedExpr(
      expr,
      new XslateFilterEmitter(
        param,
        localVarMap,
        (n, property) => this._isStringValueName(n, property),
        // A nested callback method inside the predicate has no Kolon scalar
        // form — surface BF101 (#2038) instead of silently degrading it to
        // its receiver.
        (message, reason) => this._recordExprBF101(message, reason),
        name => this.memoKolonNames.get(name) ?? name,
        name => this.rowLocalName(name),
        paramLocal,
        onRead,
        n => this.scope.isBound(n),
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
        parts.push(kolonStringLiteral(part.value))
      } else if (part.type === 'expression') {
        parts.push(this.convertExpressionToKolon(part.expr, part.parsed))
      } else if (part.type === 'ternary') {
        const cond = this.convertExpressionToKolon(part.condition)
        parts.push(`(${cond} ? ${kolonStringLiteral(part.whenTrue)} : ${kolonStringLiteral(part.whenFalse)})`)
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
      _propsObjectName: this.propsObjectName,
      _isGlobalName: (name: string) => this.computedConsts?.isGlobal(name) ?? false,
      _loweringMatchers: this._loweringMatchers,
      _resolveModuleStringConst: (name) => this._resolveModuleStringConst(name),
      _resolveLiteralConst: (name) => this._resolveLiteralConst(name),
      _rootPropReadName: (name) => rootPropReadName(name, this.scope, this.rootPropAliases),
      _isRootPropsObject: (expr) => isRootPropsObject(expr, n => this.scope.isBound(n)),
      _resolveStaticRecordLiteral: (o, k) => this._resolveStaticRecordLiteral(o, k),
      _isStringValueName: (name, property) => this._isStringValueName(name, property),
      _isBooleanValueName: (name, property) => property ? !this.scope.shadowsPropsObject() && this.booleanValueNames.props.has(name) : !this.scope.isBound(name) && this.booleanValueNames.names.has(name),
      _arithmeticCoercion: (op, operand, other) => this.arithmeticCoercion(op, operand, other, n => this.isLoopBoundName(n)),
      _isOpaqueLocalAccessorCall: (name) => isOpaqueLocalAccessorName(name, this.localConstants),
      _memoKolonName: (name) => this.memoKolonNames.get(name) ?? name,
      _rowLocalName: (name) => this.rowLocalName(name),
      _recordExprBF101: (message, reason) => this._recordExprBF101(message, reason),
      _renderKolonFilterExprPublic: (e, p, onRead) => this._renderKolonFilterExprPublic(e, p, onRead),
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
    return {
      convertExpressionToKolon: (e, preParsed, pos, onRead) => this.convertExpressionToKolon(e, preParsed, pos, onRead),
      memoKolonName: (name) => this.memoKolonNames.get(name) ?? name,
    }
  }

  private convertExpressionToKolon(
    expr: string,
    preParsed?: ParsedExpr,
    pos: 'rendered' | 'value' = 'rendered',
    onRead?: (name: string) => void,
  ): string {
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
    parsed = inlineComputedConsts(parsed, this.computedConsts)

    // #2843: a registered lowering plugin's call (the built-in `queryHref`,
    // or any userland plugin) is recognised no matter where it sits in the
    // tree — a ternary branch, a template-literal interpolation, … — not
    // only when `parsed.kind === 'call'` directly. That recognition now
    // lives in `XslateTopLevelEmitter`'s `lowering` seam, consulted by
    // `emitParsedExpr`'s shared `call` dispatch; the support gate below is
    // passed `this._loweringMatchers` so a matched call's params (e.g.
    // `queryHref`'s object literal, otherwise `unsupported` at `rendered`
    // position) are admitted wherever the call is nested.
    //
    // `pos` distinguishes a derived-seed RHS (an assignment, checked via
    // `isSupportedValue`) from every other, genuinely rendered call site —
    // the rendered gate would otherwise re-refuse a tree the seed plan
    // already classified `derived` at value position (#2696 review).
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
      // Safe Kolon empty-string literal — valid in every context the result
      // might land in.
      return "''"
    }

    return this.renderParsedExprToKolon(parsed, onRead)
  }

  /**
   * Render a full ParsedExpr tree to Kolon for top-level (non-filter)
   * expressions where identifiers are signals / template vars. `onRead` is
   * told each template variable the rendering reads.
   */
  private renderParsedExprToKolon(expr: ParsedExpr, onRead?: (name: string) => void): string {
    return emitParsedExpr(expr, new XslateTopLevelEmitter(this.emitCtx, onRead))
  }

  /**
   * Print an arithmetic result with JS `Number::toString` (`$bf.string`)
   * rather than Perl's `%.15g`, which pads a small exponent
   * (`1.23456789e-06`) and drops digits past 15 (#3380).
   */
  private jsNumberOutput(parsed: ParsedExpr | null | undefined, kolon: string): string {
    return isNumericArithmeticResult(parsed, (n, c) => this._isStringValueName(n, c)) ? `$bf.string(${kolon})` : kolon
  }

  /** Whether `name` (a signal getter or prop) holds a string value, so an
   *  equality comparison against it should use Perl `eq`/`ne`. */
  private _isStringValueName(name: string, componentProperty = false): boolean {
    return this.scope.isStringValueName(name, n => this.stringValueNames.has(n), componentProperty)
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
   */  /** Position-accurate loop-bound-name check — see `this.scope`'s docstring. */
  /** The Kolon local the nearest binding of `name` in `scope` uses (#3392). */
  private rowLocalName(name: string): string {
    const hit = this.scope.lookup(name)
    return (hit && this.rowKolonRenames.get(hit.frame)?.get(name)) ?? name
  }

  private isLoopBoundName(name: string): boolean {
    return this.scope.isBound(name)
  }

  /**
   * Inline a const (any scope) whose initializer is a pure numeric or
   * single-quoted string literal (`const totalPages = 5`, #1897
   * pagination) — function-scope consts never reach the per-render
   * stash, so a bare `$totalPages` renders empty.
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
    if (lit.kind === 'boolean') return lit.text === 'true' ? '1' : '0'
    if (lit.kind === 'null') return 'nil'
    return `'${lit.text.replace(/[\\']/g, m => `\\${m}`)}'`
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
   * ENCLOSING loop binds never inlines, falling back to the bare `$cfg.x`
   * member expression (which an Xslate `: for` loop binds correctly at the
   * shadowed occurrence); a same-named const elsewhere, outside any loop
   * that shadows it, still inlines.
   */
  private _resolveStaticRecordLiteral(objectName: string, key: string): string | null {
    const hit = lookupStaticRecordLiteral(objectName, key, this.localConstants, name => this.scope.isBound(name))
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
  private _renderKolonFilterExprPublic(expr: ParsedExpr, param: string, onRead?: (name: string) => void): string {
    return this.renderKolonFilterExpr(expr, param, new Map(), param, onRead)
  }
}

export const xslateAdapter = new XslateAdapter()

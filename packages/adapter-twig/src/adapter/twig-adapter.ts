/**
 * BarefootJS Twig (PHP) Template Adapter
 *
 * Generates Twig template files (.twig) from BarefootJS IR.
 *
 * Near-mechanical port of the Jinja2 adapter
 * (packages/adapter-jinja/src/adapter/jinja-adapter.ts) — itself a
 * near-mechanical port of the Text::Xslate (Kolon) adapter — from Jinja2
 * syntax to Twig syntax. The expression-lowering PIPELINE (JS → scalar
 * values / `bf.helper(...)` calls) is shared in spirit across all three; the
 * surrounding template syntax differs:
 *
 *   Jinja `{{ EXPR }}`                     → Twig `{{ EXPR }}`                    (same; HTML-escaped)
 *   Jinja `{{ EXPR | safe }}`              → Twig `{{ EXPR | raw }}`              (raw)
 *   Jinja `bf.method(args)`                → Twig `bf.method(args)`               (same; Twig resolves `foo.bar(...)` to method `bar` directly)
 *   Jinja `name`                           → Twig `name`                          (same)
 *   Jinja `{% if C %}A{% elif D %}B{% else %}E{% endif %}` → Twig `{% if C %}A{% elseif D %}B{% else %}E{% endif %}` (`elif` → `elseif`)
 *   Jinja `{% for item in arr %}…{% endfor %}` → Twig (same)
 *   Jinja `{% set x = e %}`                → Twig (same)
 *   Jinja `{'k': v}` dict literal          → Twig `{'k': v}` hash literal (ALWAYS quoted key — see `lib/twig-naming.ts`)
 *   Jinja `~` concat                       → Twig `~` concat (same; every non-literal operand still routes `bf.string(...)`)
 *   Jinja `(a if t else b)` ternary        → Twig `(t ? a : b)` (Twig has no `X if T else Y` form — see `expr/emitters.ts`'s file header, divergence 1)
 *   Jinja `(l if (l is defined and l is not none) else r)` (`??`) → Twig `(l ?? r)` — **Twig-native**, covers undefined AND null in one operator (see divergence 3 below; no `is defined`/`is not none` dance)
 *   Jinja `==`/`!=` (for `===`/`!==`)      → Twig `bf.eq(l, r)` / `bf.neq(l, r)` — **NEVER** Twig's own `==`/`!=` (see divergence 4 below)
 *   Jinja macro children capture          → Twig `{% set NAME %}…{% endset %}` set-block (same construct; see "Children capture" below)
 *
 * The render Twig `Environment` this adapter's output assumes:
 * `FilesystemLoader`, `autoescape: 'html'`, `strict_variables: false`. Note
 * Twig's default `htmlspecialchars`-based escaper emits `&quot;`/`&#039;`
 * for `"`/`'`, where Perl/Go/markupsafe emit the numeric forms
 * `&#34;`/`&#39;` — a byte-form difference the PHP runtime side canonicalizes
 * at the conformance-harness layer rather than a custom Twig escaper (see
 * `packages/adapter-twig/php/`); this adapter's own HTML-attribute escaping
 * for STATIC text it inlines directly (`escapeAttrText`, e.g. `style="..."`
 * literal segments) still emits the numeric forms for parity with the other
 * adapters' static-text escaping. Unlike Jinja, Twig needs no
 * `undefined=ChainableUndefined` equivalent — `strict_variables: false`
 * alone makes an unset template var resolve to `null` for every purpose this
 * adapter cares about (member/index access, `is defined`, `??`). Templates
 * are named `<snake_case_component>.twig` (same convention as Jinja's
 * `.jinja` files).
 *
 * **Whitespace policy.** Twig's lexer strips the newline immediately after a
 * `{% … %}` block tag by default (Jinja's `trim_blocks=True`, built in, not
 * configurable off in a way this adapter's output depends on) but has NO
 * `lstrip_blocks` equivalent — leading whitespace/indentation BEFORE a block
 * tag on its own line leaks verbatim into the rendered output (verified
 * empirically against Twig 3.x: a block tag preceded by two spaces of
 * indentation reproduces those two spaces in the render). This adapter's
 * control-tag emission was ALREADY flush-left with no leading indentation
 * before this port started (every `{% … %}` line here is built via
 * `lines.push('{% … %}')` / plain template-string concatenation, never
 * prefixed with spaces) — the SAME structural convention the Jinja port
 * uses. So the single uniform policy is: **emit every control tag at column
 * 0 of its own source line, exactly as the Jinja adapter already does; never
 * introduce leading indentation before `{%`.** No `{%-`/`-%}` whitespace-
 * control modifiers are needed anywhere in this adapter, since the "leak"
 * failure mode the dash-modifiers would guard against never arises when
 * indentation is never emitted in the first place.
 *
 * Divergences beyond the syntax table above (all uniform, not per-fixture —
 * see the individual definition sites for the full rationale):
 *
 *   1. **JS truthiness** (`@barefootjs/jsx`'s `adapters/boolean-result.ts`, `expr/emitters.ts`'s
 *      `truthyTest`, this file's `convertConditionToTwig`). PHP's `''` /
 *      `'0'` / `0` / `[]` / `null` are falsy; JS's `'0'` and `[]`/`{}` are
 *      truthy. Every condition-TEST position (an `{% if %}` / `{% elseif %}`
 *      test, a ternary test, the left operand of `&&`/`||`) routes through
 *      `bf.truthy(...)` unless it is structurally already boolean-shaped.
 *   2. **Stringification** (`bf.string`, applied at every text/attribute
 *      interpolation position). PHP's `(string)` cast diverges from JS
 *      `String(x)`: `(string) true` == `"1"` (not `"true"`), `(string) null`
 *      == `""` (coincidentally matches JS here), and float formatting
 *      differs. Twig's `~` concatenation operator calls PHP's string
 *      coercion internally, so — exactly like the Jinja port — EVERY
 *      text/attribute-position value (not already boolean-routed) is routed
 *      through `bf.string(...)` before it reaches Twig's own
 *      escaping/concat machinery, not just values that "look" non-string.
 *   3. **`??` is Twig-native.** Twig's null-coalescing operator covers BOTH
 *      undefined (a template var Twig never received, under
 *      `strict_variables: false`) AND `null` in ONE operator — no
 *      `is defined and … is not none` guard is needed for the LOGICAL `??`
 *      lowering itself (`expr/emitters.ts`'s `logical`). This is strictly
 *      SIMPLER than the Jinja port, which needs the guard because Jinja's
 *      `ChainableUndefined` sentinel is a distinct object from `None` (so
 *      `is not none` alone doesn't catch it). Verified empirically against
 *      Twig 3.x. The SEPARATE `is defined and … is not null` guard still
 *      appears at ONE other call site — the nullable-optional-prop
 *      attribute-OMISSION rule in `elementAttrEmitter` below — because that
 *      rule needs to distinguish "render nothing" from "render a fallback
 *      value", which `??` alone doesn't express.
 *   4. **`===`/`!==` route through `bf.eq`/`bf.neq`, NEVER Twig's own
 *      `==`/`!=`.** This is a NEW divergence the Jinja/Kolon ports didn't
 *      have (Python/Perl's `==` already compares strings and numbers
 *      correctly for this adapter's purposes). Twig's `==` compiles to PHP's
 *      loose `==` (`'1' == 1` is `true` — wrong for JS strict equality), and
 *      Twig's `is same as` test (PHP `===`) is wrong the OTHER direction
 *      (`1 === 1.0` is `false` in PHP; JS has one number type, so
 *      `1 === 1.0` is `true`). `bf.eq`/`bf.neq` is the ONE shared
 *      JS-strict-equality implementation (mirrored by the PHP Evaluator's
 *      `_strict_eq`), so this adapter emits it unconditionally for
 *      `===`/`!==` — see `expr/emitters.ts`'s file header for the full
 *      rationale.
 *   5. **No Twig lambda** (`expr/emitters.ts` header, divergence 5). Kolon's
 *      `-> $x { … }` lambda has no Twig equivalent, same as it has no Jinja
 *      equivalent. This adapter uses ONE mechanism for every higher-order
 *      callback (the evaluator-JSON `*_eval` payload); an unserializable
 *      predicate surfaces `BF101` instead of a lambda fallback. `.sort`'s
 *      non-lambda STRUCTURED fallback (`bf.sort` with a `{keys: […]}`
 *      descriptor) is unaffected and ports unchanged.
 *   6. **Children/fallback capture via `{% set %}...{% endset %}`, never a
 *      macro.** Every set-block capture site in this adapter (`renderComponent`'s
 *      children forward, `renderAsync`'s fallback) is invoked immediately, in
 *      place, with zero arguments — never reused elsewhere or invoked lazily
 *      with different arguments. Twig's set-block (`{% set NAME %}…{% endset %}`)
 *      captures exactly that shape as a `Markup` string (verified empirically:
 *      under `autoescape: 'html'`, `{{ NAME }}` referencing a captured
 *      set-block does NOT re-escape its already-escaped content) with no
 *      macro indirection needed; the captured name is referenced bare
 *      (`NAME`, not `NAME()`) everywhere.
 *   7. **Reserved-word identifier mangling** (`lib/twig-naming.ts`). Every
 *      bare Twig variable reference / `{% set %}` target is passed through
 *      `twigIdent()`; the PHP runtime must apply the IDENTICAL mangling when
 *      it builds the per-render template-var array (so a prop literally
 *      named e.g. `if` is threaded through as template var `'if_'` on both
 *      sides). Hash-LITERAL keys are a separate, unconditional concern — see
 *      `twigHashKey`'s docstring for why they are always quoted (unlike
 *      Kolon's bareword-key sugar).
 *   8. **In-template signal/memo self-reference seeding is NOT skipped**
 *      (`memo/seed.ts`'s file header) — Twig's `{% set x = x + 1 %}` safely
 *      resolves the right-hand `x` from the enclosing scope (verified
 *      empirically, same as Jinja), unlike Kolon's `my`-shadowing hazard, so
 *      a same-name prop-derived signal/memo IS seeded in-template here.
 *   9. **`Record[key]` lookup has no `.get(key, default)` equivalent.**
 *      Jinja dicts expose a Python-style `.get(key, default)` method; Twig
 *      hashes do NOT (verified empirically: calling `.get('a')` on an inline
 *      Twig hash literal silently resolves to `null` under
 *      `strict_variables: false`, never the value). The `${MAP[KEY]}`
 *      template-literal lookup part (`convertTemplateLiteralPartsToTwig`)
 *      therefore lowers to `({...}[keyExpr]) ?? ''` instead — Twig's native
 *      `??` (divergence 3) supplies the exact same "empty string when no
 *      case matches" default `.get(key, '')` gave the Jinja port, with no
 *      extra runtime surface needed.
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
  loopHeaderTargets,
  savedLoopBindings,
  spellDestructureLocals,
  spellFilteredRow,
  spellSortedSource,
  type DestructureSpelling,
  type LoopRefusalSpelling,
  planSpreadAttr,
  planComponentProps,
  spellComponentProps,
  rootPropReadName,
  isRootPropsObject,
  attrValueMayBeNullish,
  isAriaBooleanAttr,
  isBooleanResultExpr,
  isExplicitStringCall,
  hasClientInteractivity,
  renderElementShell,
  renderFragmentScope,
  renderDangerousInnerHtml,
  type ElementShellSpelling,
  inlineComputedConstAttr,
  inlineComputedConsts,
} from '@barefootjs/jsx'
import type { ParsedExpr } from '@barefootjs/jsx'
import { isOpaqueLocalAccessorName } from '@barefootjs/jsx'
import { BF_SLOT, BF_COND, escapeHtml } from '@barefootjs/shared'

import type { TwigRenderCtx } from './lib/types.ts'
import { TWIG_PRIMITIVE_EMIT_MAP } from './lib/constants.ts'
import { twigHashKey, twigIdent, escapeTwigSingleQuoted, twigLoopBindingAccessor } from './lib/twig-naming.ts'
import { renderSortMethod, EVAL_SPELLING } from './expr/array-method.ts'
import { staticValueToTwig } from './lib/static-value.ts'
import { TwigFilterEmitter, TwigTopLevelEmitter, truthyTest, CALLBACK_LOWERING } from './expr/emitters.ts'
import type { TwigEmitContext, TwigSpreadContext, TwigMemoContext } from './emit-context.ts'
import {
  conditionalSpreadToTwig,
  objectLiteralExprToTwigDict,
} from './spread/spread-codegen.ts'
import {
  generateContextConsumerSeed,
  generateDerivedMemoSeed,
} from './memo/seed.ts'
import { collectStringValueNames } from './props/prop-classes.ts'

export type { TwigAdapterOptions } from './lib/types.ts'
import type { TwigAdapterOptions } from './lib/types.ts'

/** How a lowered loop destructure binding reads off the row item. */
const DESTRUCTURE_SPELLING: DestructureSpelling = {
  accessor: twigLoopBindingAccessor,
  slice: (parent, from) => `bf.slice(${parent}, ${from}, null)`,
  omit: (parent, keys) => `bf.omit(${parent}, [${keys.map((k) => `'${escapeTwigSingleQuoted(k)}'`).join(', ')}])`,
}

/** The wording of the loop refusals the plan decides (BF104 / BF101). */
const LOOP_REFUSALS: LoopRefusalSpelling = {
  destructureMessage: (param) =>
    `Loop callback uses a destructure pattern (\`${param}\`) that the Twig adapter cannot lower — e.g. an object-rest binding used as a bare value, a \`.filter().map(destructure)\` chain, or a reserved \`__bf_\`-prefixed binding name.`,
  destructureSuggestion:
    `Options:\n` +
    `  1. Read the rest binding via member access (\`rest.flag\`) or spread it onto the element (\`{...rest}\`) instead of using it as a bare value.\n` +
    `  2. Mark the loop position as @client-only so the destructure runs in JS on the client.\n` +
    `  3. Move the loop into a primitive that the adapter registers explicitly.`,
  unresolvableConst: 'Twig',
}

/**
 * The `TwigAdapter` template adapter. Pass an instance as the `adapter` option of `@barefootjs/vite`.
 *
 * @since 0.18.0
 * @stability alpha
 */
export class TwigAdapter extends DslTemplateAdapter implements IRNodeEmitter<TwigRenderCtx> {
  name = 'twig'
  extension = '.twig'
  templatesPerComponent = true

  /**
   * Identifier-path callees the Twig runtime can render in template scope.
   * The relocate pass consults this map to mark matching calls as
   * template-safe; the SSR template emitter substitutes the JS call with the
   * registered `bf.NAME(...)` helper invocation.
   */
  templatePrimitives: TemplatePrimitiveRegistry = TWIG_PRIMITIVE_EMIT_MAP

  private options: Required<TwigAdapterOptions>
  /** Names bound at template level (signals, memos, props, local constants):
   * a loop that binds one with `{% set %}` saves and restores it (#3391). */
  private templateLevelNames: Set<string> = new Set()

  constructor(options: TwigAdapterOptions = {}) {
    super()
    this.options = {
      clientJsBasePath: options.clientJsBasePath ?? '/static/components/',
      barefootJsPath: options.barefootJsPath ?? '/static/components/barefoot.js',
    }
  }

  protected readonly loopChildDiagnosticName = 'Twig'
  // Two source names that Twig's renaming of reserved names turns into one
  // template variable would read the same value (#3404).
  protected override readonly templateIdentifierSpelling = { ident: twigIdent, label: 'Twig' }

  /**
   * Names (signal getters + props) whose value is a string. Carried for
   * parity with the Perl-family adapters (Mojo needs it for `eq`/`ne`
   * selection); the Twig emitters don't consume it — `===`/`!==` always
   * routes through `bf.eq`/`bf.neq` regardless of operand type (see
   * `twig-adapter.ts`'s file header, divergence 4).
   */
  protected stringValueNamesFor(ir: ComponentIR): Set<string> {
    return collectStringValueNames(ir)
  }

  protected override resetAdapterState(ir: ComponentIR): void {
    this.templateLevelNames = new Set([
      ...ir.metadata.signals.map(sig => sig.getter),
      ...ir.metadata.memos.map(m => m.name),
      ...ir.metadata.propsParams.map(p => p.name),
      ...(ir.metadata.localConstants ?? []).map(c => c.name),
    ])
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
      // tags it describes, or the hint is useless.
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
    // doesn't leak into the HTML), Twig's `{% set %}` statement tag never
    // prints anything regardless — no throwaway-bind trick is needed here.
    // Distinct names are kept anyway for direct traceability with the Kolon
    // port (Twig has no restriction on re-`{% set %}`ing the same name).
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
    return emitIRNode<TwigRenderCtx>(node, this, {} as TwigRenderCtx)
  }

  // ===========================================================================
  // IRNodeEmitter implementation (Twig)
  // ===========================================================================

  emitElement(node: IRElement, _ctx: TwigRenderCtx, _emit: EmitIRNode<TwigRenderCtx>): string {
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

  emitConditional(node: IRConditional, _ctx: TwigRenderCtx, _emit: EmitIRNode<TwigRenderCtx>): string {
    return this.renderConditional(node)
  }

  emitLoop(node: IRLoop, _ctx: TwigRenderCtx, _emit: EmitIRNode<TwigRenderCtx>): string {
    return this.renderLoop(node)
  }

  emitComponent(node: IRComponent, _ctx: TwigRenderCtx, _emit: EmitIRNode<TwigRenderCtx>): string {
    const rendered = this.renderComponent(node)
    // #3141: see `wrapComponentRootScopeComment`'s docstring.
    return node.needsScopeComment ? this.wrapComponentRootScopeComment(rendered) : rendered
  }

  emitFragment(node: IRFragment, _ctx: TwigRenderCtx, _emit: EmitIRNode<TwigRenderCtx>): string {
    return renderFragmentScope(node, children => this.renderChildren(children), rendered => this.wrapComponentRootScopeComment(rendered))
  }

  emitSlot(node: IRSlot): string {
    return this.renderSlot(node)
  }

  emitIfStatement(node: IRIfStatement, _ctx: TwigRenderCtx, _emit: EmitIRNode<TwigRenderCtx>): string {
    return this.renderIfStatement(node)
  }

  emitProvider(node: IRProvider, _ctx: TwigRenderCtx, _emit: EmitIRNode<TwigRenderCtx>): string {
    // SSR context propagation (#1297): bracket the children with a
    // provide/revoke pair on the shared controller-stash context stack so a
    // descendant `useContext` consumer reads the value during the same
    // render. Both helpers return '' (empty), so the inline `{{ … }}`
    // expression form discards their output cleanly — no extra whitespace,
    // no line-statement needed inside the element body.
    const value = this.providerValueTwig(node.valueProp)
    const children = this.renderChildren(node.children)
    const name = node.contextName
    return (
      `{{ bf.provide_context('${name}', ${value}) }}` +
      children +
      `{{ bf.revoke_context('${name}') }}`
    )
  }

  /** Lower a `<Ctx.Provider value>` value prop to a Twig expression. */
  private providerValueTwig(valueProp: IRProvider['valueProp']): string {
    const v = valueProp.value
    if (v.kind === 'literal') {
      if (typeof v.value === 'string') {
        return `'${escapeTwigSingleQuoted(v.value)}'`
      }
      if (typeof v.value === 'boolean') return v.value ? 'true' : 'false'
      return String(v.value)
    }
    if (v.kind === 'expression') {
      const dict = this.providerObjectLiteralTwig(v.expr)
      if (dict !== null) return dict
      return this.convertExpressionToTwig(v.expr)
    }
    if (v.kind === 'template') return this.convertTemplateLiteralPartsToTwig(v.parts)
    // Out-of-shape value (spread / jsx-children) — null; consumer defaults.
    return 'null'
  }

  /**
   * Lower an object-literal provider value (`value={{ open: () => props.open
   * ?? false, onOpenChange: … }}`) to a Twig hash literal (#1897). The
   * SSR lowering is a per-member snapshot of what a consumer would READ
   * during the same render:
   *
   * - zero-param expression-body arrows are getters — lower the body (the
   *   value is fixed for the render, so the call-time indirection drops out)
   * - `on[A-Z]`-named members and function-shaped values are client-only
   *   behavior SSR never invokes — lower to `null`
   * - anything else lowers through the normal expression pipeline (so an
   *   unsupported getter body still refuses loudly with BF101)
   *
   * Keys keep their JS names verbatim so a consumer-side `ctx.open` access
   * maps onto the same hash key. Returns `null` when the expression is not a
   * plain object literal (spread / computed key) — the caller falls back to
   * the whole-expression path, which refuses those shapes with BF101.
   */
  private providerObjectLiteralTwig(expr: string): string | null {
    const members = parseProviderObjectLiteral(expr.trim())
    if (members === null) return null
    const entries = members.map(m => {
      const key = twigHashKey(m.name)
      if (m.kind === 'function' || /^on[A-Z]/.test(m.name)) return `${key}: null`
      const src = m.kind === 'getter' ? m.body : m.expr
      return `${key}: ${this.convertExpressionToTwig(src)}`
    })
    return `{${entries.join(', ')}}`
  }

  emitAsync(node: IRAsync, _ctx: TwigRenderCtx, _emit: EmitIRNode<TwigRenderCtx>): string {
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
   * Reuses Twig's native `{% set NAME %}…{% endset %}` set-block — the
   * SAME mechanism `renderComponent` already uses to forward JSX children
   * (see this file's "Children capture" header notes): the element
   * renders inline as normal Twig (its own `{{ }}` interpolations
   * evaluate exactly as they would anywhere else), the set-block captures
   * the fully-evaluated result into a local, and a SEPARATE
   * `{% set _ = … %}` statement (never `{{ }}`, so nothing prints at the
   * source position) hands that string to the portal collector —
   * mirroring how `register_script` calls are already threaded through
   * `{% set %}` purely for their side effect. `@barefootjs/php`'s
   * `register_portal_element` (shared with Blade, #3123) always returns
   * `''`, so this is belt-and-suspenders rather than strictly required,
   * but keeps the same idiom as every other `{% set %}`-sunk call in this
   * file.
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
        return `{{ bf.text_start("${expr.slotId}") | raw }}{{ bf.text_end() | raw }}`
      }
      return ''
    }

    // Text-position interpolation of a possibly-non-string value — see the
    // file header, divergence 2. Thread the IR-carried `.parsed` tree
    // through (mirrors go-template's `convertExpressionToGo(expr.expr,
    // classify, expr.parsed)`) so a resolved bare-identifier
    // `.map`/`.filter`/… callback (`resolveCallbackMethodFunctionReferences`,
    // #2206) isn't lost to a fresh, unresolved re-parse of the raw string.
    const twigExpr = `bf.string(${this.convertExpressionToTwig(expr.expr, expr.parsed)})`

    if (expr.slotId) {
      return `{{ bf.text_start("${expr.slotId}") | raw }}{{ ${twigExpr} }}{{ bf.text_end() | raw }}`
    }

    return `{{ ${twigExpr} }}`
  }

  // ===========================================================================
  // Conditional Rendering
  // ===========================================================================

  renderConditional(cond: IRConditional): string {
    if (cond.clientOnly && cond.slotId) {
      return `{{ bf.comment("cond-start:${cond.slotId}") | raw }}{{ bf.comment("cond-end:${cond.slotId}") | raw }}`
    }

    // #3166: thread `cond.parsedCondition` through — a recognised
    // `<action>.isPending()` / `.error()` read has already been substituted
    // with its seed literal there; re-parsing `cond.condition` fresh here
    // would lose that and fall into the generic member-access lowering
    // (undefined at render time).
    const condition = this.convertConditionToTwig(cond.condition, cond.parsedCondition)
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
      result = `{{ bf.comment("cond-start:${cond.slotId}") | raw }}${inner}{{ bf.comment("cond-end:${cond.slotId}") | raw }}`
    } else if (markedFalse) {
      result = `{% if ${condition} %}${markedTrue}{% else %}${markedFalse}{% endif %}`
    } else if (cond.slotId) {
      // Conditional with no else: wrap with comment markers for client hydration
      result = `{{ bf.comment("cond-start:${cond.slotId}") | raw }}{% if ${condition} %}${whenTrue}{% endif %}{{ bf.comment("cond-end:${cond.slotId}") | raw }}`
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
    return `{{ bf.comment("cond-start:${condId}") | raw }}${content}{{ bf.comment("cond-end:${condId}") | raw }}`
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
      return `{{ bf.comment("loop:${loop.markerId}") | raw }}{{ bf.comment("/loop:${loop.markerId}") | raw }}`
    }

    // A `.map()` destructure loop param (`([k, v]) => ...` / `({ id, title,
    // ...rest }) => ...`) lowers to a Twig `{% set %}` local per binding, off
    // a structured accessor built from `LoopParamBinding.segments` (#2087) —
    // see `twigLoopBindingAccessor`. `isLowerableLoopDestructure` (#2087
    // Phase A) admits: fixed bindings at any field/index depth (`.field`,
    // `[k, v]`, and nested combinations), array-rest (`[first, ...tail]` →
    // `bf.slice`), and object-rest (`{ id, ...rest }` → `bf.omit`) whose
    // every use is a member read (`rest.flag`) or a `{...rest}` spread onto
    // an intrinsic element. Still refused (→ BF104): any OTHER object-rest
    // use (needs the actual residual value some other way, e.g.
    // `String(rest)` or `{...fn(rest)}`), a `.filter().map(destructure)`
    // chain (needs the filter-param rewrite to retarget the synthetic
    // per-item var), and a binding name in the reserved `__bf_` namespace
    // (would collide with the synthetic per-item loop var). (#1310, #2087)
    const loopPlan = this.loopPlanFor(loop, {
      resolveLiteralConst: (name) => this._resolveLiteralConst(name),
      callbackLowering: CALLBACK_LOWERING,
      spellStatic: staticValueToTwig,
    })
    this.recordLoopPlanRefusals(loop, loopPlan, LOOP_REFUSALS)

    // A `.map()` loop whose array is a bare identifier bound to a local
    // const (module- or function-scope, #2946) with a non-statically-
    // evaluable initializer that reads props/signals/a function call (e.g.
    // `const entries = Object.entries(props.x ?? {}).filter(...)`) can't
    // render correctly. Locals get no per-render stash slot — this
    // adapter's only "elsewhere" is inlining a const's value at its use
    // site (`_resolveLiteralConst`'s numeric/single-quoted-string fast
    // path, or a static-record-literal lookup), never binding one as a
    // `{% set %}` template local. Left unchecked, `{% for item in entries
    // %}` over an unbound name would silently iterate zero times (Twig's
    // `strict_variables: false` resolves it to `null` rather than raising)
    // instead of failing loudly. Pre-existing, general limitation,
    // orthogonal to #2087's destructure-binding work — newly reachable in
    // this adapter's test corpus only because the widened destructure gate
    // (#2087 Phase A/B) no longer refuses this fixture's `([emoji, users])
    // => ...` param first. Same policy and shape as the Jinja / ERB
    // adapters' check.
    // #2208/#2946: a loop source that is a fully-static array literal —
    // either inline (`[{ label: 'Alpha' }, ...].map(...)`) or a bare
    // identifier bound to a local const (module- or function-scope) whose
    // initializer has no prop/signal/function-call dependency — inlines as
    // a native Twig array/hash literal below. A runtime-computed local
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

    const rawArray = staticArray ?? this.convertExpressionToTwig(loop.array)
    // The source sorted by the loop's comparator, when it has one: the
    // plan decides the evaluator, the structured `{keys: …}` descriptor or
    // the refusal, which keeps the source unsorted so the template stays
    // valid (#3473).
    const array = spellSortedSource(loopPlan.sort, rawArray, {
      emit: (e) => this.convertExpressionToTwig('', e),
      eval: EVAL_SPELLING,
      structured: renderSortMethod,
      refuse: (message, suggestion) => this._recordExprBF101(message, suggestion),
    })
    const param = loop.param
    // Twig's `{% for item in array %}` binds the item directly. The index,
    // when needed (`.keys().map(k => ...)` or an explicit `index` param),
    // comes from Twig's own loop object (`loop.index0`, 0-based) — no
    // Kolon-style `$~loopvar.index` indirection needed.

    // A `.keys()` iteration's param is the index and a lowered destructure's
    // bindings read off the item, so either iterates a throwaway item var
    // (`loopPlan.itemVar`). The index local (a `.keys()` param or an explicit
    // index param) reads Twig's `loop.index0`. Each destructure binding is a
    // local off the item var, spelled from its structured `segments` path
    // (#2087 Phase B, never `b.path`): a native accessor for a fixed binding,
    // the runtime's slice / omit for an array / object rest — a true
    // residual, not an alias of the whole item. An object iteration's key and value
    // bind through the for-header below instead.
    const loopVar = loopPlan.itemVar
    const indexLocalLines: string[] = []
    if (loopPlan.indexLocal) indexLocalLines.push(`{% set ${twigIdent(loopPlan.indexLocal)} = loop.index0 %}`)
    for (const { name, value } of spellDestructureLocals(loopPlan, twigIdent(loopVar), DESTRUCTURE_SPELLING)) {
      indexLocalLines.push(`{% set ${twigIdent(name)} = ${value} %}`)
    }

    // The row window (#3473): the row's scope around everything that
    // evaluates per row (the preamble locals' initializers, the children
    // under `inLoop`, the whole-item-conditional key anchor). The filter
    // predicate stays outside it: a filter callback's own param is a
    // separate frame, never folded into the `.map()` row.
    const { outside, row, rootAliases, preamble: preambleLines, body: bodyChildren } = this.renderLoopRow(loop, {
      preamble: (d) => `{% set ${twigIdent(d.name)} = ${this.convertExpressionToTwig(d.raw, d.valueParsed)} %}`,
      keyAnchor: (key) => `{{ bf.comment("loop-i:" ~ bf.escape_comment_key(${this.convertExpressionToTwig(key)})) | raw }}`,
    })
    const savedBindings = savedLoopBindings(
      { outside, row, templateLevelNames: this.templateLevelNames },
      loopHeaderTargets(loop, loopPlan),
      (_name, ordinal) => `__bf_saved_${loop.markerId}_${ordinal}`,
    )

    // A name the filter predicate captures from an enclosing row that this
    // loop's own row binds again would read the row's item inside the loop;
    // keep the enclosing value under a loop-scoped alias (#3402).
    const captureAliases = loopPlan.captureAliases
    const lines: string[] = []
    // Scoped per-call-site marker so sibling `.map()`s under the same parent
    // each get their own reconciliation range.
    for (const { name, alias } of rootAliases) lines.push(`{% set ${twigIdent(alias)} = ${twigIdent(name)} %}`)
    for (const { name, alias } of captureAliases) lines.push(`{% set ${twigIdent(alias)} = ${twigIdent(name)} %}`)
    for (const { name, temporary } of savedBindings) lines.push(`{% set ${temporary} = ${twigIdent(name)} %}`)
    lines.push(`{{ bf.comment("loop:${loop.markerId}") | raw }}`)
    // `objectIteration` (#2168 object-entries-map): Twig's own `for` tag
    // needs a plain PHP array to unpack `key, value` from (it can't iterate
    // a `stdClass` — the live representation for a `json_decode()`-sourced
    // object prop — directly, since `stdClass` isn't `Traversable`), so
    // this routes through the runtime's `bf.entries`/`bf.keys`/`bf.values`
    // (a `(array)` cast, which preserves the object's own insertion order
    // — see those methods' docstrings in `BarefootJS.php`).
    const forHeader = loop.objectIteration === 'entries'
      ? `{% for ${twigIdent(loop.index ?? param)}, ${twigIdent(param)} in bf.entries(${array}) %}`
      : loop.objectIteration === 'keys'
        ? `{% for ${twigIdent(param)} in bf.keys(${array}) %}`
        : loop.objectIteration === 'values'
          ? `{% for ${twigIdent(param)} in bf.values(${array}) %}`
          : `{% for ${twigIdent(loopVar)} in ${array} %}`
    lines.push(forHeader)
    for (const il of indexLocalLines) lines.push(il)

    // The row, inside the filter's guard for a filter().map() loop. The plan
    // renames the predicate's shadowed captures to their aliases (#3402) and
    // refuses a filter without a predicate (#3534).
    lines.push(...spellFilteredRow(loopPlan.filter, [...preambleLines, bodyChildren], {
      // See the file header, divergence 1: the loop-hoist filter test is a
      // condition position too.
      condition: (filter) =>
        truthyTest(
          filter.predicate,
          this.renderInScope(this.scope.enterAliases(filter.aliases), () => this.renderTwigFilterExpr(filter.onRow, param)),
        ),
      refuse: (message, suggestion) => this._recordExprBF101(message, suggestion),
      refused: 'true',
      open: (condition) => `{% if ${condition} %}`,
      close: '{% endif %}',
    }))

    lines.push(`{% endfor %}`)
    for (const { name, temporary } of savedBindings) lines.push(`{% set ${twigIdent(name)} = ${temporary} %}`)
    lines.push(`{{ bf.comment("/loop:${loop.markerId}") | raw }}`)

    return lines.join('\n')
  }

  // ===========================================================================
  // Component Rendering
  // ===========================================================================

  /**
   * AttrValue lowering for component invocation props (Twig hash-entry
   * form). Twig CANNOT splat a hash into positional args, so every prop is
   * emitted as a `'key': value` entry that the caller collects into ONE hash
   * literal passed to `bf.render_child(name, { ... })`.
   *
   * `jsx-children` returns empty — children are captured via a Twig
   * set-block below, not threaded through the hash entry list.
   */
  private readonly componentPropEmitter: AttrValueEmitter = {
    emitLiteral: (value, name) => `${twigHashKey(name)}: '${escapeTwigSingleQuoted(value.value)}'`,
    emitExpression: (value, name) => {
      if (value.parts) {
        return `${twigHashKey(name)}: ${this.convertTemplateLiteralPartsToTwig(value.parts)}`
      }
      // Inline object-literal child prop (carousel's `opts={{ align: 'start' }}`):
      // lower to a Twig hash so the child can serialize it (`data-opts`),
      // instead of refusing the bare object with BF101. (#1971) Read the
      // IR-carried structured `ParsedExpr` tree (#2018) instead of
      // re-parsing `value.expr`; the lowering returns null for any
      // non-object-literal shape, so the common non-object case falls
      // straight through to the bare-expression path below.
      if (value.parsed) {
        const dict = objectLiteralExprToTwigDict(this.spreadCtx, value.parsed)
        if (dict !== null) return `${twigHashKey(name)}: ${dict}`
      }
      return `${twigHashKey(name)}: ${this.convertExpressionToTwig(value.expr)}`
    },
    emitSpread: (value) => {
      // Twig hashes can't be splatted into the entry list the way `**`
      // flattens Ruby/Python kwargs into a call literal. `renderComponent`
      // handles EVERY spread shape itself (both the enumerated propsObject
      // case and the general `|merge(...)` chain — see its own docstring),
      // so this callback is never reached for `kind: 'spread'` props; it
      // only exists to satisfy the `AttrValueEmitter` interface.
      return this.convertExpressionToTwig(value.expr)
    },
    emitTemplate: (value, name) =>
      `${twigHashKey(name)}: ${this.convertTemplateLiteralPartsToTwig(value.parts)}`,
    emitBooleanAttr: (_value, name) => `${twigHashKey(name)}: true`,
    emitBooleanShorthand: (_value, name) => `${twigHashKey(name)}: true`,
    // JSX children flow through the Twig set-block capture below; they're
    // not part of the hash entry list.
    emitJsxChildren: () => '',
  }


  /**
   * Fold ordered prop segments into a single Twig expression via chained
   * `|merge(...)` calls — Twig's array/hash union filter, later argument
   * wins on key conflict, exactly like `{...a, ...b}`. Empty `'entries'`
   * segments are dropped so a leading/trailing spread doesn't drag in a
   * needless `{}|merge(...)`. Returns `'{}'` when every segment is empty
   * (no props at all).
   */
  private combineComponentPropSegments(
    segments: ReadonlyArray<{ kind: 'entries'; parts: string[] } | { kind: 'spread'; expr: string }>,
  ): string {
    let acc: string | null = null
    for (const seg of segments) {
      const text = seg.kind === 'entries'
        ? (seg.parts.length > 0 ? `{${seg.parts.join(', ')}}` : null)
        : seg.expr
      if (text === null) continue
      acc = acc === null ? text : `${acc}|merge(${text})`
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
            return `${twigHashKey(entry.name)}: ${capture(entry.children, () => `bf_prop_${this.childrenCaptureCounter++}`)}`
          case 'props-param':
            return `${twigHashKey(entry.name)}: ${twigIdent(entry.name)}`
          case 'slot-id':
            return `${twigHashKey('_bf_slot')}: '${entry.slotId}'`
          case 'children':
            return `${twigHashKey('children')}: ${capture(entry.children, () => `bf_children_${comp.slotId ?? 'c' + this.childrenCaptureCounter++}`)}`
        }
      },
      spread: (value) => `bf.omit(${this.convertExpressionToTwig(value.expr)}, [])`,
      presentParam: (name) =>
        `(bf.passed(${twigHashKey(name)}, ${twigIdent(name)} is not null) ? {${twigHashKey(name)}: ${twigIdent(name)}} : {})`,
    })
    const dict = isEmptyComponentProps(segments) ? '' : `, ${this.combineComponentPropSegments(segments)}`
    return `${captures.join('')}{{ bf.render_child('${tplName}'${dict}) | raw }}`
  }

  /** Uniquifies the `presenceOrUndefined` temp binding (`bf_puN`) so two
   *  presence-folded attrs in one template don't collide. */
  private presenceVarCounter = 0
  // ===========================================================================
  // If-Statement (Conditional Return) Rendering
  // ===========================================================================

  protected renderIfStatement(ifStmt: IRIfStatement): string {
    const condition = this.convertConditionToTwig(ifStmt.condition)
    const consequent = ifStmt.consequent.type === 'if-statement'
      ? this.renderIfStatement(ifStmt.consequent as IRIfStatement)
      : this.renderNode(ifStmt.consequent)
    let result = `{% if ${condition} %}\n${consequent}\n`

    if (ifStmt.alternate) {
      if (ifStmt.alternate.type === 'if-statement') {
        const altResult = this.renderIfStatement(ifStmt.alternate as IRIfStatement)
        // Replace leading "{% if" with "{% elseif" (Twig's `elif` spelling).
        result += altResult.replace(/^\{% if/, '{% elseif')
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
    return `{{ bf.scope_comment() | raw }}${rendered}{{ bf.scope_comment_end() | raw }}`
  }

  private renderSlot(_slot: IRSlot): string {
    // Captured children arrive under the `children` context key (see
    // renderComponent's set-block capture + render_child call), so the var
    // is `children`. The content is already-rendered markup, so emit it
    // as-is via `| raw` — otherwise Twig's autoescape would entity-escape
    // the child tags. (The IR producer doesn't currently emit `slot`
    // nodes — `{children}` lowers to an expression whose captured value is
    // already raw — so this is defensive correctness for if/when a slot
    // node is produced.)
    return `{{ ${twigIdent('children')} | raw }}`
  }

  override renderAsync(node: IRAsync): string {
    const fallback = this.renderNode(node.fallback)
    const children = this.renderChildren(node.children)
    // Capture the fallback into a Twig set-block and pass its rendered HTML
    // to `bf.async_boundary`, which wraps it in a `<div bf-async="aX">`
    // placeholder. Same shape as `renderComponent`'s children capture.
    const captureName = `bf_async_fallback_${node.id}`
    return `{% set ${captureName} %}${fallback}{% endset %}{{ bf.async_boundary('${node.id}', ${captureName}) | raw }}\n${children}`
  }

  // ===========================================================================
  // Attribute Rendering
  // ===========================================================================

  /**
   * AttrValue lowering for intrinsic-element attributes (Twig).
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
        boolStr: (expr, attr) => this.shouldBoolStr(expr, attr),
      })
      const attr = (v: string, boolStr: boolean) =>
        boolStr ? `${name}="{{ bf.bool_str(${v}) }}"` : `${name}="{{ bf.string(${v}) }}"`
      // Each kind is documented on `AttrExpressionPlan`.
      switch (plan.kind) {
        case 'omit-nullable': {
          // A bare read here, so it doubles as the guard test and the value.
          const v = this.convertExpressionToTwig(value.expr)
          return `\n{% if ${v} is defined and ${v} is not null %}\n${attr(v, plan.boolStr)}\n{% endif %}\n`
        }
        case 'boolean-attr': {
          const v = this.convertExpressionToTwig(value.expr, value.parsed)
          return `{{ (${this.wrapConditionExpr(value.expr, v)} ? '${name}' : '') }}`
        }
        case 'presence': {
          const v = this.convertExpressionToTwig(value.expr)
          const tmp = `bf_pu${this.presenceVarCounter++}`
          return `\n{% set ${tmp} = ${v} %}\n{% if ${this.wrapConditionExpr(value.expr, tmp)} %}\n${attr(tmp, plan.boolStr)}\n{% endif %}\n`
        }
        case 'undefined-alternate': {
          // Pass the parsed sub-trees through (#2843 review): the string forms
          // are `exprToString` debug text, which renders a nested object
          // literal as a non-reparseable placeholder.
          const m = plan.ternary
          const cond = this.convertConditionToTwig('', m.testParsed)
          const val = this.convertExpressionToTwig('', m.consequentParsed)
          return `\n{% if ${cond} %}\n${name}="{{ bf.string(${val}) }}"\n{% endif %}\n`
        }
        case 'omit-nil': {
          const v = this.convertExpressionToTwig(value.expr, value.parsed)
          const tmp = `bf_pu${this.presenceVarCounter++}`
          return `\n{% set ${tmp} = ${v} %}\n{% if ${tmp} is defined and ${tmp} is not null %}\n${attr(tmp, plan.boolStr)}\n{% endif %}\n`
        }
        case 'plain':
          return attr(this.convertExpressionToTwig(value.expr, value.parsed), plan.boolStr)
      }
    },
    emitBooleanAttr: (_value, name) => name,
    emitTemplate: (value, name) =>
      `${name}="{{ ${this.convertTemplateLiteralPartsToTwig(value.parts)} }}"`,
    // Spread attributes (`<div {...attrs()} />`) lower through the
    // `bf.spread_attrs` runtime helper, mirroring the Jinja adapter.
    emitSpread: (value) => {
      const plan = planSpreadAttr(value, {
        propsObjectName: this.propsObjectName,
        propsParams: this.propsParams,
        localConstants: this.localConstants ?? [],
        isBound: (n) => this.scope.isBound(n),
      })
      // `{...props}`: props arrive as separate template vars, so enumerate them.
      if (plan.kind === 'props-object') {
        const entries = plan.params.map((p) => `${twigHashKey(p)}: ${twigIdent(p)}`)
        return `{{ bf.spread_attrs({${entries.join(', ')}}) | raw }}`
      }
      // A conditional inline-object spread (`{...(cond ? {…} : {})}`) lowers to
      // a ternary of hashes; the falsy `{}` omits the key.
      for (const candidate of plan.candidates) {
        const lowered = conditionalSpreadToTwig(this.spreadCtx, candidate)
        if (lowered !== null) return `{{ bf.spread_attrs(${lowered}) | raw }}`
      }
      return `{{ bf.spread_attrs(${this.convertExpressionToTwig(value.expr)}) | raw }}`
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
        // Lower the `__html` expression and emit it through Twig's `| raw`
        // filter, which suppresses autoescape for this one value. The runtime
        // evaluates the expression, so no template-metachar guard applies; the
        // element already carries its hydration slot marker. #2319.
        `{{ ${this.convertExpressionToTwig(expr, parsed)} | raw }}`,
      ),
    renderChildren: children => this.renderChildren(children),
    renderScopeMarker: instanceIdExpr => this.renderScopeMarker(instanceIdExpr),
    renderSlotMarker: slotId => this.renderSlotMarker(slotId),
    dataKeyRelay: `{{ bf.data_key_attr() | raw }}`,
    scopeIdValue: `{{ bf.scope_attr() }}`,
    wrapSsrPortalElement: rendered => this.wrapSsrPortalElement(rendered),
  }

  /**
   * Lower a `style={{ … }}` object literal to a `bf.style_object(...)` call,
   * e.g. `{ backgroundColor: color }` → `{{ bf.style_object('background-color',
   * color) | raw }}`. `style_object` is the single oracle-matching sanitizer
   * (ported from Hono's `hasUnsafeStyleValue`): it drops any key:value pair
   * whose value could break out of a CSS declaration and HTML-escapes the
   * rest, so the call is piped through `| raw` (not left to Twig's own
   * autoescape) to avoid double-encoding the already-safe result (#2261).
   * Returns null when the shape is unsupported or any value can't be lowered
   * (caller falls through to BF101). (#1322)
   */
  private tryLowerStyleObject(value: ExpressionAttr): string | null {
    const entries = planStyleObject(value)
    if (!entries) return null
    const args = entries.flatMap(e => [
      `'${escapeTwigSingleQuoted(e.cssKey)}'`,
      e.kind === 'literal' ? `'${escapeTwigSingleQuoted(e.value)}'` : this.convertExpressionToTwig(e.expr, e.parsed),
    ])
    return `{{ bf.style_object(${args.join(', ')}) | raw }}`
  }

  // ===========================================================================
  // Hydration Markers
  // ===========================================================================

  renderScopeMarker(_instanceIdExpr: string): string {
    // bf-s is the addressable scope id. hydration_attrs adds bf-h / bf-m /
    // bf-r conditionally; props_attr adds bf-p when props are present.
    return `bf-s="{{ bf.scope_attr() }}" {{ bf.hydration_attrs() | raw }} {{ bf.props_attr() | raw }}`
  }

  renderSlotMarker(slotId: string): string {
    return `${BF_SLOT}="${slotId}"`
  }

  renderCondMarker(condId: string): string {
    return `${BF_COND}="${condId}"`
  }

  // ===========================================================================
  // Filter Predicate Rendering (ParsedExpr → Twig)
  // ===========================================================================

  /**
   * Convert a ParsedExpr AST to a Twig expression string for filter
   * predicates. Wraps the shared ParsedExpr dispatcher with a
   * `TwigFilterEmitter` carrying the predicate's loop param and any
   * block-body local var aliases.
   */
  private renderTwigFilterExpr(
    expr: ParsedExpr,
    param: string,
    localVarMap: Map<string, string> = new Map(),
  ): string {
    // Arithmetic over a prop whose nil the type cannot classify (#3700).
    this.refuseAmbiguousNilArithmeticIn(expr, [param, ...localVarMap.keys()])
    return emitParsedExpr(
      expr,
      new TwigFilterEmitter(
        param,
        localVarMap,
        (n, property) => this._isStringValueName(n, property),
        // A nested callback method inside the predicate has no Twig scalar
        // form — surface BF101 (#2038) instead of silently degrading it to
        // its receiver.
        (message, reason) => this._recordExprBF101(message, reason),
        n => this.scope.isBound(n),
      ),
    )
  }

  // ===========================================================================
  // Expression Conversion: JS → Twig
  // ===========================================================================

  private convertTemplateLiteralPartsToTwig(literalParts: IRTemplatePart[]): string {
    const parts: string[] = []
    for (const part of literalParts) {
      if (part.type === 'string') {
        parts.push(`'${escapeTwigSingleQuoted(part.value)}'`)
      } else if (part.type === 'expression') {
        parts.push(`bf.string(${this.convertExpressionToTwig(part.expr, part.parsed)})`)
      } else if (part.type === 'ternary') {
        const cond = this.convertConditionToTwig(part.condition)
        // Twig's symbolic ternary (see this file's header, divergence tied
        // to `expr/emitters.ts`'s divergence 1) — `(test ? a : b)`.
        parts.push(
          `(${cond} ? '${escapeTwigSingleQuoted(part.whenTrue)}' : '${escapeTwigSingleQuoted(part.whenFalse)}')`,
        )
      } else if (part.type === 'lookup') {
        // `${MAP[KEY]}` against a Record<T, string> literal — emit a Twig
        // hash literal with an immediate bracket lookup, coalesced with
        // Twig's native `??` (see the file header, divergence 9: Twig hashes
        // have no `.get(key, default)` method the way Jinja/Python dicts
        // do, so `??` supplies the same "empty when no case matches"
        // default).
        const keyExpr = this.convertExpressionToTwig(part.key)
        const entries = Object.entries(part.cases)
          .map(([k, v]) => `${twigHashKey(k)}: '${escapeTwigSingleQuoted(v)}'`)
          .join(', ')
        parts.push(`bf.string(({${entries}}[${keyExpr}]) ?? '')`)
      }
    }
    // Join with Twig string concatenation (`~`). Every term is already a
    // string (literal or `bf.string(...)`-wrapped), so `~`'s own coercion
    // is a no-op here.
    return parts.length === 1 ? parts[0] : parts.join(' ~ ')
  }

  /**
   * Build the EmitContext seam the top-level `ParsedExpr` emitter depends on.
   * Built as a private object (the adapter does NOT `implements TwigEmitContext`)
   * so the wrapped bookkeeping — `_searchParamsLocals`, the const/record
   * resolvers, BF101 recording, the filter-predicate entry — stays private and
   * off the exported adapter's public type, matching the Go adapter's
   * `emitCtx` and the `spreadCtx` / `memoCtx` seams below.
   */
  private get emitCtx(): TwigEmitContext {
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
      _arithmeticCoercion: (op, operand, other) => this.arithmeticCoercion(op, operand, other, n => this.isLoopBoundName(n)),
      _isOpaqueLocalAccessorCall: (name) => isOpaqueLocalAccessorName(name, this.localConstants),
      _recordExprBF101: (message, reason) => this._recordExprBF101(message, reason),
      _renderTwigFilterExprPublic: (e, p) => this._renderTwigFilterExprPublic(e, p),
    }
  }

  /**
   * Build the narrow context the extracted spread lowering depends on. Passing
   * a purpose-built object (rather than `this`) keeps the adapter's bookkeeping
   * members private — they stay internal implementation detail, not part of the
   * exported class's public surface.
   */
  private get spreadCtx(): TwigSpreadContext {
    return {
      componentName: this.componentName,
      errors: this.errors,
      localConstants: this.localConstants,
      propsParams: this.propsParams,
      convertExpressionToTwig: (e, preParsed) => this.convertExpressionToTwig(e, preParsed),
      convertConditionToTwig: (e, preParsed) => this.convertConditionToTwig(e, preParsed),
    }
  }

  /** Build the narrow context the extracted memo seeding depends on. */
  private get memoCtx(): TwigMemoContext {
    return {
      convertExpressionToTwig: (e, preParsed, pos) => this.convertExpressionToTwig(e, preParsed, pos),
      errors: this.errors,
    }
  }

  private convertExpressionToTwig(
    expr: string,
    preParsed?: ParsedExpr,
    pos: 'rendered' | 'value' = 'rendered',
  ): string {
    // Parse-first lowering — parity with the Jinja adapter's
    // `convertExpressionToJinja`. Parse the JS expression once, gate it on the
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
    // plugin (#2042) — are consulted by this gate no matter where the call
    // sits in the tree (`TwigTopLevelEmitter`'s `lowering` seam does the
    // actual rendering below, via `emitParsedExpr`'s shared `call` case).
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
      // Safe Twig empty-string literal — valid in every context the result
      // might land in.
      return "''"
    }

    return this.renderParsedExprToTwig(parsed)
  }

  /**
   * Convert a JS condition (an `if` / ternary / loop-filter test) to a Twig
   * boolean expression, routing through `bf.truthy(...)` unless the
   * expression is structurally already boolean-shaped. See the file header,
   * divergence 1.
   */
  private convertConditionToTwig(expr: string, preParsed?: ParsedExpr): string {
    const twig = this.convertExpressionToTwig(expr, preParsed)
    return this.wrapConditionExpr(expr, twig, preParsed)
  }

  /**
   * Shared helper: given the ORIGINAL JS expression (or its already-parsed
   * tree) and its ALREADY-RENDERED Twig text, wrap the rendered text with
   * `bf.truthy(...)` unless the expression is structurally boolean-shaped.
   * Split from `convertConditionToTwig` so a caller that already lowered the
   * expression for another purpose (e.g. the `presenceOrUndefined` temp bind)
   * doesn't lower it twice.
   */
  private wrapConditionExpr(expr: string, twig: string, preParsed?: ParsedExpr): string {
    const isBoolean = preParsed
      ? isBooleanResultExpr(stringifyParsedExpr(preParsed))
      : isBooleanResultExpr(expr)
    return isBoolean ? twig : `bf.truthy(${twig})`
  }

  /**
   * Render a full ParsedExpr tree to Twig for top-level (non-filter)
   * expressions where identifiers are signals / template vars.
   */
  private renderParsedExprToTwig(expr: ParsedExpr): string {
    return emitParsedExpr(expr, new TwigTopLevelEmitter(this.emitCtx))
  }

  /** Whether `name` (a signal getter or prop) holds a string value. Carried
   *  for parity with the Perl-family adapters; the Twig emitters don't
   *  consume it (`===`/`!==` always routes through `bf.eq`/`bf.neq`
   *  regardless of operand type). */
  private _isStringValueName(name: string, componentProperty = false): boolean {
    return this.scope.isStringValueName(name, n => this.stringValueNames.has(n), componentProperty)
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
   * which correctly stringifies a real boolean on its own (see the PHP
   * runtime's `string()` helper's bool branch), so layering `bf.bool_str`
   * on top would run PHP truthiness over the ALREADY-STRINGIFIED text
   * instead of the original boolean. See `isExplicitStringCall`'s docstring
   * in `@barefootjs/jsx`'s `adapters/boolean-result.ts` for the full double-wrap failure mode this
   * guards against.
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
    if (lit.kind === 'null') return 'null'
    return `'${escapeTwigSingleQuoted(lit.text)}'`
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
   * member expression (which a Twig for-loop binds correctly at the
   * shadowed occurrence); a same-named const elsewhere, outside any loop
   * that shadows it, still inlines.
   */
  private _resolveStaticRecordLiteral(objectName: string, key: string): string | null {
    const hit = lookupStaticRecordLiteral(objectName, key, this.localConstants, name => this.scope.isBound(name))
    if (!hit) return null
    return hit.kind === 'number'
      ? hit.text
      : `'${escapeTwigSingleQuoted(hit.text)}'`
  }

  private _resolveModuleStringConst(name: string): string | null {
    // A loop body may bind a `{% set %}` local that shadows a module const of
    // the same name; never inline inside one (conservative — drop to the
    // bare identifier).
    if (this.inLoop) return null
    const value = this.moduleStringConsts.get(name)
    if (value === undefined) return null
    return `'${escapeTwigSingleQuoted(value)}'`
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
  private _renderTwigFilterExprPublic(expr: ParsedExpr, param: string): string {
    return this.renderTwigFilterExpr(expr, param)
  }
}

export const twigAdapter = new TwigAdapter()

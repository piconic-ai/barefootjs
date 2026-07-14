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
 *   1. **JS truthiness** (`boolean-result.ts`, `expr/emitters.ts`'s
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
  CompilerError,
  TypeInfo,
  TemplatePrimitiveRegistry,
  IRMetadata,
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
  isLowerableLoopDestructure,
  type ContextConsumer,
  lookupStaticRecordLiteral,
  searchParamsLocalNames,
  prepareLoweringMatchers,
  queryHrefArgs,
  sortComparatorFromArrow,
  isValidHelperId,
  isDangerousInnerHtmlAttr,
  resolveDangerousInnerHtml,
  dangerousInnerHtmlMetacharViolation,
  dangerousInnerHtmlDiagnostic,
  resolveStaticLoopSource,
  collectLoopBoundNames,
} from '@barefootjs/jsx'
import { isAriaBooleanAttr, isBooleanResultExpr, isExplicitStringCall } from './boolean-result.ts'
import type { ParsedExpr, LoweringMatcher } from '@barefootjs/jsx'
import { BF_SLOT, BF_COND, BF_REGION, escapeHtml } from '@barefootjs/shared'

import type { TwigRenderCtx } from './lib/types.ts'
import { TWIG_PRIMITIVE_EMIT_MAP } from './lib/constants.ts'
import { twigHashKey, twigIdent, escapeTwigSingleQuoted, twigLoopBindingAccessor } from './lib/twig-naming.ts'
import {
  resolveJsxChildrenProp,
  collectRootScopeNodes,
} from './lib/ir-scope.ts'
import { renderSortMethod, renderSortEval } from './expr/array-method.ts'
import { staticValueToTwig } from './lib/static-value.ts'
import { TwigFilterEmitter, TwigTopLevelEmitter, truthyTest } from './expr/emitters.ts'
import type { TwigEmitContext, TwigSpreadContext, TwigMemoContext } from './emit-context.ts'
import {
  hasClientInteractivity,
  collectImportedLoopChildComponentErrors,
} from './analysis/component-tree.ts'
import {
  conditionalSpreadToTwig,
  objectLiteralExprToTwigDict,
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

export type { TwigAdapterOptions } from './lib/types.ts'
import type { TwigAdapterOptions } from './lib/types.ts'

export class TwigAdapter extends BaseAdapter implements IRNodeEmitter<TwigRenderCtx> {
  name = 'twig'
  extension = '.twig'
  templatesPerComponent = true
  // Template-string target with no component layer: `bf build` emits a static
  // import-map HTML snippet to include into the page <head>.
  importMapInjection = 'html-snippet' as const

  /**
   * Identifier-path callees the Twig runtime can render in template scope.
   * The relocate pass consults this map to mark matching calls as
   * template-safe; the SSR template emitter substitutes the JS call with the
   * registered `bf.NAME(...)` helper invocation.
   */
  templatePrimitives: TemplatePrimitiveRegistry = TWIG_PRIMITIVE_EMIT_MAP

  private componentName: string = ''
  /** Component root scope element(s) — each carries `data-key` for a keyed loop
   *  item (set by the child renderer from the JSX `key` prop). A plain element
   *  root is one node; an `if-statement` (early-return) root contributes the
   *  top element of every branch. */
  private rootScopeNodes: Set<IRNode> = new Set()
  private options: Required<TwigAdapterOptions>
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
   * an inline Twig hash literal without re-walking the IR.
   */
  private propsObjectName: string | null = null
  private propsParams: { name: string }[] = []
  private booleanTypedProps: Set<string> = new Set()
  /**
   * Names (signal getters + props) whose value is a string. Carried for
   * parity with the Perl-family adapters (Mojo needs it for `eq`/`ne`
   * selection); the Twig emitters don't consume it — `===`/`!==` always
   * routes through `bf.eq`/`bf.neq` regardless of operand type (see
   * `twig-adapter.ts`'s file header, divergence 4).
   */
  private stringValueNames: Set<string> = new Set()

  /**
   * Module-scope pure-string consts (`const x = 'literal'`), keyed by name →
   * unescaped value. A className template literal that references such a const
   * (`className={`${x} ${className}`}`) must inline the literal: the const is
   * module-scope, so it never reaches the per-render context, and a bare
   * reference to `x` would resolve to Undefined.
   */
  private moduleStringConsts: Map<string, string> = new Map()

  /**
   * (#1922) Local binding names the request-scoped `searchParams()` env signal
   * is imported under (handles `import { searchParams as sp }`). When non-empty
   * the emitter lowers a `<binding>().get(k)` call to a real method call on the
   * per-request `searchParams` reader (`searchParams.get('sort')`) instead of
   * the generic dot deref. Set at `generate()` entry from `ir.metadata.imports`;
   * read by the top-level ParsedExpr emitter.
   */
  private _searchParamsLocals: Set<string> = new Set()

  /**
   * Call-lowering matchers active for this component (#2057). Bound at
   * `generate()` entry via `prepareLoweringMatchers` and read by the top-level
   * emitter. Covers both userland plugins and the compiler's built-in plugins
   * (e.g. `queryHref` → `bf.query`, #2042) — one uniform path, no per-API branch.
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
   * Every name a `.map()`/`.filter()` loop callback binds as its item/index
   * parameter anywhere in the component (#2208 fable review). A static
   * loop-SOURCE name (e.g. a function-scope `const items = [...]`) must
   * never resolve through `resolveStaticLoopSource` at a use site where a
   * DIFFERENT, enclosing loop's own callback param shadows it — same
   * shadowing hazard, and same coarse-but-safe mitigation, as #2212's
   * `collectLoopBoundNames` use in `collectStringValueNames`.
   */
  private staticLoopSourceBoundNames: Set<string> = new Set()

  /**
   * Optional, no-default props that are `None` when the caller omits them.
   * Their bare-reference attribute emission is guarded with a Twig
   * `is defined and is not null` test so the attribute DROPS rather than
   * rendering `attr=""` (Hono-style nullish omission, e.g. textarea's
   * `rows`). The filter excludes destructure-defaulted, rest, and
   * concrete-primitive props.
   */
  private nullableOptionalProps: Set<string> = new Set()

  constructor(options: TwigAdapterOptions = {}) {
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
    // `String(boolean)` ("true"/"false"), not PHP's `(string) bool`
    // ("1"/"") (#1897, pagination's data-active).
    this.booleanTypedProps = collectBooleanTypedProps(ir)
    this.localConstants = ir.metadata.localConstants ?? []
    this.staticLoopSourceBoundNames = collectLoopBoundNames(ir)
    this.nullableOptionalProps = collectNullableOptionalProps(ir)
    this.stringValueNames = collectStringValueNames(ir)
    this.moduleStringConsts = collectModuleStringConsts(ir.metadata.localConstants)
    this._searchParamsLocals = searchParamsLocalNames(ir.metadata)
    this._loweringMatchers = prepareLoweringMatchers(ir.metadata)
    this.errors = []
    this.childrenCaptureCounter = 0

    // Mirror of the Jinja adapter's BF103 check: a child component referenced
    // inside a loop body that is imported from a sibling .tsx emits a
    // cross-template `bf.render_child(...)` call that resolves only if the
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

    // Twig templates have no JS-style imports / types / default-export
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
    return this.renderComponent(node)
  }

  emitFragment(node: IRFragment, _ctx: TwigRenderCtx, _emit: EmitIRNode<TwigRenderCtx>): string {
    return this.renderFragment(node)
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
      hydrationAttrs += ` {{ bf.data_key_attr() | raw }}`
    }
    if (element.slotId) {
      hydrationAttrs += ` ${this.renderSlotMarker(element.slotId)}`
    }
    // Page-lifecycle boundary lowered from `<Region>` (spec/router.md). The id
    // is a deterministic static string (`<file scope>:<index>`), so it emits as
    // a plain literal attribute — no Twig template tag.
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
        return `{{ bf.comment("client:${expr.slotId}") | raw }}`
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

    const condition = this.convertConditionToTwig(cond.condition)
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
        ? `\n{% if ${condition} %}\n${whenTrue}\n{% else %}\n${whenFalse}\n{% endif %}\n`
        : `\n{% if ${condition} %}\n${whenTrue}\n{% endif %}\n`
      result = `{{ bf.comment("cond-start:${cond.slotId}") | raw }}${inner}{{ bf.comment("cond-end:${cond.slotId}") | raw }}`
    } else if (markedFalse) {
      result = `\n{% if ${condition} %}\n${markedTrue}\n{% else %}\n${markedFalse}\n{% endif %}\n`
    } else if (cond.slotId) {
      // Conditional with no else: wrap with comment markers for client hydration
      result = `{{ bf.comment("cond-start:${cond.slotId}") | raw }}\n{% if ${condition} %}\n${whenTrue}\n{% endif %}\n{{ bf.comment("cond-end:${cond.slotId}") | raw }}`
    } else {
      result = `\n{% if ${condition} %}\n${whenTrue}\n{% endif %}\n`
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
    const destructure = !!(loop.paramBindings && loop.paramBindings.length > 0)
    const supportableDestructure = destructure && isLowerableLoopDestructure(loop)
    if (destructure && !supportableDestructure) {
      this.errors.push({
        code: 'BF104',
        severity: 'error',
        message: `Loop callback uses a destructure pattern (\`${loop.param}\`) that the Twig adapter cannot lower — e.g. an object-rest binding used as a bare value, a \`.filter().map(destructure)\` chain, or a reserved \`__bf_\`-prefixed binding name.`,
        loc: loop.loc ?? { file: this.componentName + '.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
        suggestion: {
          message:
            `Options:\n` +
            `  1. Read the rest binding via member access (\`rest.flag\`) or spread it onto the element (\`{...rest}\`) instead of using it as a bare value.\n` +
            `  2. Mark the loop position as @client-only so the destructure runs in JS on the client.\n` +
            `  3. Move the loop into a primitive that the adapter registers explicitly.`,
        },
      })
    }

    // A `.map()` loop whose array is a bare identifier bound to a
    // FUNCTION-scope local const with a non-statically-evaluable initializer
    // that reads props/signals (e.g. `const entries =
    // Object.entries(props.x ?? {}).filter(...)`) can't render correctly.
    // Module-scope consts (`isModule`, e.g. `const payments = [...]` at the
    // top of the file) are a DIFFERENT, already-working case — the shared
    // `ssr-defaults.ts` statically evaluates those and seeds them straight
    // into the render context, so a bare `payments` reference resolves for
    // free (data-table demo). Function-scope locals get no such seeding
    // (`ssr-defaults.ts`: "component-scope locals can depend on
    // signals/props and are evaluated lazily elsewhere") — and this
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
    // #2208: a loop source that is a fully-static array literal — either
    // inline (`[{ label: 'Alpha' }, ...].map(...)`) or a bare identifier
    // bound to a FUNCTION-scope local const whose initializer has no
    // prop/signal/function-call dependency — inlines as a native Twig
    // array/hash literal below, the same way a module-scope const's value
    // is already seeded. A runtime-computed local (#2069, e.g.
    // `Object.entries(props.tags).filter(...)`) still refuses below.
    // `isNameShadowed` guards a DIFFERENT, enclosing loop's own callback
    // param shadowing this identifier (fable review) — never resolve the
    // static const in that case. `rawArray` then falls through to the
    // bare identifier expression below, same as before #2208 — which
    // still trips the pre-existing BF101 gate for an unresolvable local
    // const reference (a loud, conservative refusal, not a silent wrong
    // value).
    const staticItems = resolveStaticLoopSource(loop.arrayParsed, this.localConstants, {
      isNameShadowed: name => this.staticLoopSourceBoundNames.has(name),
    })
    const staticArray = staticItems !== null ? staticValueToTwig(staticItems) : null

    const arrayName = loop.array.trim()
    if (staticArray === null && /^[A-Za-z_$][\w$]*$/.test(arrayName)) {
      const arrayConst = (this.localConstants ?? []).find(c => c.name === arrayName)
      if (arrayConst && !arrayConst.isModule && this._resolveLiteralConst(arrayName) === null) {
        this.errors.push({
          code: 'BF101',
          severity: 'error',
          message: `Loop array \`${arrayName}\` is a local computed value (\`${arrayConst.value}\`) that the Twig adapter cannot bind as a template variable — only numeric/string-literal locals inline at their use site.`,
          loc: loop.loc ?? { file: this.componentName + '.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
          suggestion: {
            message:
              'Pre-compute the array server-side and pass it as a prop, or mark the loop position as @client-only so it runs in JS on the client.',
          },
        })
      }
    }

    const rawArray = staticArray ?? this.convertExpressionToTwig(loop.array)
    // Apply sort if present: wrap the loop array in the shared `bf.sort`
    // helper, binding the sorted result to a per-iteration local so the
    // helper runs once.
    let array = rawArray
    if (loop.sortComparator) {
      // Evaluator-first (#2018 P3): serialize the comparator arrow body + emit
      // `bf.sort_eval`; fall back to the structured `bf.sort` for a
      // comparator the evaluator can't model (e.g. `localeCompare`). The
      // comparator now arrives as an `IRLoopSort` carrying the generic
      // `arrow` + its params.
      const sort = loop.sortComparator
      const sortEmit = (e: ParsedExpr) => this.convertExpressionToTwig('', e)
      const arrow = sort.arrow
      const params =
        arrow.kind === 'arrow' ? arrow.params : [sort.paramA, sort.paramB]
      const structured = sortComparatorFromArrow(arrow)
      array =
        renderSortEval(rawArray, arrow.kind === 'arrow' ? arrow.body : arrow, params, sortEmit) ??
        (structured !== null ? renderSortMethod(rawArray, structured) : rawArray)
    }
    const param = loop.param
    // Twig's `{% for item in array %}` binds the item directly. The index,
    // when needed (`.keys().map(k => ...)` or an explicit `index` param),
    // comes from Twig's own loop object (`loop.index0`, 0-based) — no
    // Kolon-style `$~loopvar.index` indirection needed.
    const renderedChildren = this.renderChildren(loop.children)

    // For `keys`-shape iterations the callback param IS the index. We iterate
    // the array but bind the loop var to a throwaway and expose the index as
    // the param name via Twig's built-in `loop.index0`.
    const loopVar = loop.iterationShape === 'keys'
      ? '__bf_item'
      : supportableDestructure ? '__bf_item' : param

    // Index alias: when an explicit `index` param is present (`.map((x, i) =>
    // ...)`) or the iteration is `keys`-shaped, expose it via a `{% set %}`
    // local bound to Twig's `loop.index0`. A supported destructure param adds
    // one `{% set %}` local per binding, built from the binding's structured
    // `segments` path (never `b.path` verbatim — see `twigLoopBindingAccessor`
    // for why a naive JS-accessor splice mis-lowers on Twig/stdClass):
    //   - fixed binding: the full accessor off the per-item var.
    //   - array-rest (`[first, ...tail]`): `bf.slice(parent, from, null)` —
    //     `parent` is the accessor for `segments` (the rest token's PARENT
    //     prefix, empty at the loop root), `from` is the rest's start index.
    //   - object-rest (`{ id, ...rest }`): `bf.omit(parent, [excludeKeys])` —
    //     a TRUE residual hash (not an alias of the whole item), so a use
    //     other than member-access / spread (already refused by the gate)
    //     can't observe a sibling field the pattern destructured explicitly.
    const indexLocalLines: string[] = []
    if (loop.objectIteration) {
      // `key`/`value` bind directly in the for-header (see below) via
      // `bf.entries`/`bf.keys`/`bf.values` — no derived `loop.index0`
      // local needed, unlike the array `iterationShape` cases.
    } else if (loop.iterationShape === 'keys') {
      indexLocalLines.push(`{% set ${twigIdent(param)} = loop.index0 %}`)
    } else if (loop.index) {
      indexLocalLines.push(`{% set ${twigIdent(loop.index)} = loop.index0 %}`)
    }
    if (supportableDestructure) {
      const loopVarIdent = twigIdent(loopVar)
      for (const b of loop.paramBindings ?? []) {
        const parentAccessor = twigLoopBindingAccessor(loopVarIdent, b.segments ?? [])
        if (b.rest?.kind === 'array') {
          indexLocalLines.push(
            `{% set ${twigIdent(b.name)} = bf.slice(${parentAccessor}, ${b.rest.from}, null) %}`,
          )
        } else if (b.rest?.kind === 'object') {
          const excludeList = b.rest.exclude
            .map(k => `'${escapeTwigSingleQuoted(k.key)}'`)
            .join(', ')
          indexLocalLines.push(
            `{% set ${twigIdent(b.name)} = bf.omit(${parentAccessor}, [${excludeList}]) %}`,
          )
        } else {
          indexLocalLines.push(`{% set ${twigIdent(b.name)} = ${parentAccessor} %}`)
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
        ? `{{ bf.comment("loop-i:" ~ bf.string(${this.convertExpressionToTwig(loop.key)})) | raw }}\n${childrenUnderLoop}`
        : childrenUnderLoop

    const lines: string[] = []
    // Scoped per-call-site marker so sibling `.map()`s under the same parent
    // each get their own reconciliation range.
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

    // Handle filter().map() pattern by wrapping children in if-condition
    if (loop.filterPredicate) {
      let filterCond: string
      if (loop.filterPredicate.predicate) {
        filterCond = this.renderTwigFilterExpr(
          loop.filterPredicate.predicate,
          loop.filterPredicate.param
        )
        // See the file header, divergence 1: the loop-hoist filter test is a
        // condition position too.
        filterCond = truthyTest(loop.filterPredicate.predicate, filterCond)
      } else {
        filterCond = 'true'
      }
      // Map filter param to loop param (e.g., t → todo). Word-boundary
      // rename over the RENDERED text — same mechanism Kolon uses (there
      // scoped to `$`-sigiled tokens; here scoped by plain word boundaries,
      // since Twig identifiers have no sigil). Bounded, pre-existing risk:
      // see `lib/ir-scope.ts`'s file header for the general sigil-less
      // text-scan caveat.
      if (loop.filterPredicate.param !== param) {
        filterCond = filterCond.replace(
          new RegExp(`\\b${loop.filterPredicate.param}\\b`, 'g'),
          twigIdent(param)
        )
      }
      lines.push(`{% if ${filterCond} %}`)
      lines.push(bodyChildren)
      lines.push(`{% endif %}`)
    } else {
      lines.push(bodyChildren)
    }

    lines.push(`{% endfor %}`)
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
   * A `renderComponent` props dict, built as an ORDERED sequence of
   * segments so `{...before, ...spread, after: 1}` JSX spread semantics
   * (later entries win) survive the trip through Twig, which has no
   * hash-splat syntax. Each `'entries'` segment is a literal Twig hash
   * `{k: v, ...}`; each `'spread'` segment is an arbitrary expression
   * lowered from a `{...expr}` prop. `combineComponentPropSegments` folds
   * the sequence into ONE expression via Twig's `merge` filter (later
   * segment wins on key conflict, matching `Object.assign`/JSX order).
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
    type Segment = { kind: 'entries'; parts: string[] } | { kind: 'spread'; expr: string }
    const segments: Segment[] = [{ kind: 'entries', parts: [] }]
    const currentEntries = () => this.componentPropSegmentEntries(segments)
    // Named JSX-valued props OTHER than the reserved `children`
    // (`header={<strong>Title</strong>}`, #2168 jsx-element-prop) each get
    // their own `{% set %}` capture, prepended to the final returned
    // string below — same mechanism as the reserved children capture,
    // just keyed by the prop's own name instead of `children`.
    const namedSlotSetBlocks: string[] = []

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
        // valid Twig variable name, and `comp.slotId` alone would collide
        // across two named-slot props on the same component invocation
        // (unlike the reserved children slot, there's only ever one of
        // those per invocation).
        const captureName = `bf_prop_${this.childrenCaptureCounter++}`
        namedSlotSetBlocks.push(`{% set ${captureName} %}${slotBody}{% endset %}`)
        currentEntries().push(`${twigHashKey(p.name)}: ${captureName}`)
        continue
      }
      if (p.value.kind === 'spread') {
        const trimmed = p.value.expr.trim()
        // SolidJS-style props identifier (`function(props: P)`) has no
        // matching runtime hash in Twig scope — props arrive as a flat
        // set of top-level template vars, so enumerate the
        // analyzer-extracted props params into hash entries instead of
        // treating it as a runtime spread expression.
        if (this.propsObjectName && this.propsObjectName === trimmed) {
          for (const pp of this.propsParams) {
            currentEntries().push(`${twigHashKey(pp.name)}: ${twigIdent(pp.name)}`)
          }
          continue
        }
        // Every other spread shape (a destructure rest-bag `props`, a
        // member-access bag like `children.props`, an intrinsic-element
        // spread helper's own operand, …) — Twig hash literals can't
        // splat a runtime hash into named entries at a call site, but
        // `|merge` can fold it into the accumulated dict at the right
        // ordinal position, mirroring ERB's `**hash` / Mojolicious's
        // `%{$props}` blind splat: no compile-time filtering of onXxx/ref
        // keys out of the runtime bag (the render contract tolerates
        // them, same as the other two adapters). The operand is routed
        // through `bf.omit(expr, [])` (the #2087 object-rest residual
        // helper, called with an empty exclude list) rather than a bare
        // `?? {}` guard: a request-scoped bag round-trips through
        // `json_decode` as a `stdClass`, and Twig's `merge` filter throws
        // `RuntimeError` on anything that isn't an array/Traversable
        // (verified empirically — `stdClass` is rejected even though
        // dot-access accepts it). `bf.omit` already normalises BOTH
        // shapes (`stdClass` → assoc array, `null`/non-object → `[]`)
        // into a plain PHP array `merge` accepts, exactly like the
        // `bf.spread_attrs(...)` runtime helper the intrinsic-element
        // spread path uses (that one tolerates any bag shape itself,
        // since it's a plain function call rather than a Twig filter).
        const spreadExpr = this.convertExpressionToTwig(p.value.expr)
        segments.push({ kind: 'spread', expr: `bf.omit(${spreadExpr}, [])` })
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
      currentEntries().push(`${twigHashKey('_bf_slot')}: '${comp.slotId}'`)
    }
    const tplName = this.toTemplateName(comp.name)

    // Resolve the effective children: a nested `<Box>…</Box>` populates
    // `comp.children`; an attribute-form `<Box children={<jsx/>} />` lands in
    // a `jsx-children` AttrValue on the corresponding prop.
    const effectiveChildren: IRNode[] = comp.children.length > 0
      ? comp.children
      : resolveJsxChildrenProp(comp.props)

    if (effectiveChildren.length > 0) {
      // Forward JSX children via a Twig set-block. The block body is
      // evaluated in the parent's template scope (signals, conditionals) and
      // produces the children HTML as a captured `Markup` string; the
      // captured name is passed as the `children` entry of the
      // render_child dict. `render_child` materializes it through the
      // backend before handing it to the child. See the file header,
      // divergence 6, for why a set-block (not a macro) is the uniform
      // mechanism here.
      const prevInLoop = this.inLoop
      this.inLoop = false
      const childrenBody = this.renderChildren(effectiveChildren)
      this.inLoop = prevInLoop
      const captureName = `bf_children_${comp.slotId ?? 'c' + this.childrenCaptureCounter++}`
      currentEntries().push(`${twigHashKey('children')}: ${captureName}`)
      const dict = this.combineComponentPropSegments(segments)
      return `${namedSlotSetBlocks.join('')}{% set ${captureName} %}${childrenBody}{% endset %}{{ bf.render_child('${tplName}', ${dict}) | raw }}`
    }

    const isEmpty = segments.every(s => s.kind === 'entries' && s.parts.length === 0)
    const dictEntries = isEmpty ? '' : `, ${this.combineComponentPropSegments(segments)}`
    return `${namedSlotSetBlocks.join('')}{{ bf.render_child('${tplName}'${dictEntries}) | raw }}`
  }

  private childrenCaptureCounter = 0

  /** Uniquifies the `presenceOrUndefined` temp binding (`bf_puN`) so two
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

  private renderFragment(fragment: IRFragment): string {
    const children = this.renderChildren(fragment.children)
    if (fragment.needsScopeComment) {
      return `{{ bf.scope_comment() | raw }}${children}`
    }
    return children
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
    emitExpression: (value, name) => {
      // `style={{ … }}` object literal → a CSS string with dynamic values
      // interpolated, instead of refusing the bare object with BF101 (#1322).
      if (name === 'style') {
        const css = this.tryLowerStyleObject(value.expr)
        if (css !== null) return `style="${css}"`
      }
      // Refuse shapes that the lowering pipeline can't represent in Twig —
      // tagged-template-literal call expressions (`cn\`base \${tone()}\``).
      // Same gate as the Jinja adapter.
      if (this.refuseUnsupportedAttrExpression(value.expr, name)) {
        return ''
      }
      // Hono-style nullish omission: a bare reference to an optional,
      // no-default prop (`nullableOptionalProps`) is guarded so the
      // attribute drops instead of rendering `attr=""`. Narrowly scoped to
      // bare identifiers — member exprs, calls, and concrete/defaulted
      // props are unaffected.
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
        const twig = this.convertExpressionToTwig(value.expr)
        const body = this.shouldBoolStr(value.expr, name)
            ? `${name}="{{ bf.bool_str(${twig}) }}"`
            : `${name}="{{ bf.string(${twig}) }}"`
        // `twig` is a bare identifier reference for this narrowly-gated
        // shape, so it doubles as both the guard test and the display
        // value — same "is defined and is not null" pair the file header's
        // divergence 3 explains is a SEPARATE concern from `??`: a var
        // missing from context entirely reads as undefined under
        // `strict_variables: false`, so `is defined` alone isn't enough
        // either — both tests are needed to distinguish "omit the
        // attribute" from "render a value".
        return `\n{% if ${twig} is defined and ${twig} is not null %}\n${body}\n{% endif %}\n`
      }
      if (isBooleanAttr(name)) {
        // Boolean attributes: render conditionally (present or absent).
        const twig = this.convertExpressionToTwig(value.expr)
        return `{{ (${this.wrapConditionExpr(value.expr, twig)} ? '${name}' : '') }}`
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
        const twig = this.convertExpressionToTwig(value.expr)
        const tmp = `bf_pu${this.presenceVarCounter++}`
        const body = this.shouldBoolStr(value.expr, name)
            ? `${name}="{{ bf.bool_str(${tmp}) }}"`
            : `${name}="{{ bf.string(${tmp}) }}"`
        return `\n{% set ${tmp} = ${twig} %}\n{% if ${this.wrapConditionExpr(value.expr, tmp)} %}\n${body}\n{% endif %}\n`
      }
      // `attr={cond ? value : undefined}` OMITS the attribute on the
      // falsy branch (Hono drops undefined-valued attributes) — wrap the
      // whole attribute in the condition instead of rendering `attr=""`
      // (#1897, pagination's `aria-current={props.isActive ? 'page' :
      // undefined}`). Same parity rule the Go adapter applies.
      {
        const m = this.parseUndefinedAlternateTernary(value.expr)
        if (m) {
          const cond = this.convertConditionToTwig(m.condition)
          const val = this.convertExpressionToTwig(m.consequent)
          return `\n{% if ${cond} %}\n${name}="{{ bf.string(${val}) }}"\n{% endif %}\n`
        }
      }
      // Boolean-result handling: route boolean-shaped values through
      // `bf.bool_str` so the wire bytes match JS `String(boolean)`. Every
      // other value is a text-position interpolation — route through
      // `bf.string` (see the file header, divergence 2).
      const twig = this.convertExpressionToTwig(value.expr)
      if (this.shouldBoolStr(value.expr, name)) {
        return `${name}="{{ bf.bool_str(${twig}) }}"`
      }
      return `${name}="{{ bf.string(${twig}) }}"`
    },
    emitBooleanAttr: (_value, name) => name,
    emitTemplate: (value, name) =>
      `${name}="{{ ${this.convertTemplateLiteralPartsToTwig(value.parts)} }}"`,
    // Spread attributes (`<div {...attrs()} />`) lower through the
    // `bf.spread_attrs` runtime helper, mirroring the Jinja adapter.
    emitSpread: (value) => {
      if (this.refuseUnsupportedAttrExpression(value.expr, '...')) {
        return ''
      }
      // SolidJS-style props identifier (`(props: P) { <el {...props}/> }`) has
      // no matching context hash in Twig scope — props arrive as a flat set
      // of top-level template vars. Emit an inline hash literal enumerating
      // the analyzer-extracted props params.
      const trimmed = value.expr.trim()
      if (this.propsObjectName && this.propsObjectName === trimmed) {
        const entries = this.propsParams.map(p =>
          `${twigHashKey(p.name)}: ${twigIdent(p.name)}`,
        )
        return `{{ bf.spread_attrs({${entries.join(', ')}}) | raw }}`
      }
      // Conditional inline-object spread (#textarea):
      //   `{...(COND ? { 'aria-describedby': describedBy } : {})}`
      // Emit a Twig inline ternary of hashes — the falsy `{}` branch OMITS
      // the key (`spread_attrs` does NOT emit empty-hash entries).
      // Read the spread's IR-carried `ParsedExpr` tree (#2018) instead of
      // re-parsing `trimmed`.
      const ternaryDict = conditionalSpreadToTwig(this.spreadCtx, value.parsed)
      if (ternaryDict !== null) {
        return `{{ bf.spread_attrs(${ternaryDict}) | raw }}`
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
            const resolved = conditionalSpreadToTwig(
              this.spreadCtx,
              parseExpression(initTrimmed),
            )
            if (resolved !== null) {
              return `{{ bf.spread_attrs(${resolved}) | raw }}`
            }
          }
        }
      }
      const twigExpr = this.convertExpressionToTwig(value.expr)
      return `{{ bf.spread_attrs(${twigExpr}) | raw }}`
    },
    // Neither variant is legal on intrinsic elements.
    emitBooleanShorthand: () => '',
    emitJsxChildren: () => '',
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
  private tryLowerStyleObject(expr: string): string | null {
    const entries = parseStyleObjectEntries(expr)
    if (!entries) return null
    for (const e of entries) {
      if (e.kind === 'expr' && !isSupported(parseExpression(e.expr)).supported) return null
    }
    const args = entries.flatMap(e => [
      `'${escapeTwigSingleQuoted(e.cssKey)}'`,
      e.kind === 'literal' ? `'${escapeTwigSingleQuoted(e.value)}'` : this.convertExpressionToTwig(e.expr),
    ])
    return `{{ bf.style_object(${args.join(', ')}) | raw }}`
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
    return emitParsedExpr(
      expr,
      new TwigFilterEmitter(
        param,
        localVarMap,
        n => this._isStringValueName(n),
        // A nested callback method inside the predicate has no Twig scalar
        // form — surface BF101 (#2038) instead of silently degrading it to
        // its receiver.
        (message, reason) => this._recordExprBF101(message, reason),
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
        parts.push(this.substituteJsInterpolationsToTwig(part.value))
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
   * Translate `${EXPR}` interpolations in a static template-part string into
   * Twig variable references and concatenate them with the surrounding
   * literal text. Each interpolated (non-literal) segment routes through
   * `bf.string(...)` — see the file header, divergence 2.
   */
  private substituteJsInterpolationsToTwig(s: string): string {
    const segments: string[] = []
    const re = /\$\{([^}]+)\}/g
    let lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(s)) !== null) {
      if (m.index > lastIndex) {
        segments.push(`'${escapeTwigSingleQuoted(s.slice(lastIndex, m.index))}'`)
      }
      segments.push(`bf.string(${this.convertExpressionToTwig(m[1].trim())})`)
      lastIndex = re.lastIndex
    }
    if (lastIndex < s.length) {
      segments.push(`'${escapeTwigSingleQuoted(s.slice(lastIndex))}'`)
    }
    if (segments.length === 0) return `''`
    return segments.length === 1 ? segments[0] : `(${segments.join(' ~ ')})`
  }

  /**
   * Refuse JS expression shapes that have no idiomatic Twig representation:
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
        message: 'The Twig adapter cannot lower JS object literals or tagged-template-literal expressions into Twig. Move the expression into a `\'use client\'` component (so hydration computes it), or expand it into discrete attributes whose values are values the adapter can lower.',
      },
    })
    return true
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
      _resolveModuleStringConst: (name) => this._resolveModuleStringConst(name),
      _resolveLiteralConst: (name) => this._resolveLiteralConst(name),
      _resolveStaticRecordLiteral: (o, k) => this._resolveStaticRecordLiteral(o, k),
      _isStringValueName: (name) => this._isStringValueName(name),
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
      convertExpressionToTwig: (e, preParsed) => this.convertExpressionToTwig(e, preParsed),
      errors: this.errors,
    }
  }

  private convertExpressionToTwig(expr: string, preParsed?: ParsedExpr): string {
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

    // Registered call lowerings (#2057) — including the built-in `queryHref`
    // plugin (#2042), which lowers `queryHref(base, { … })` to a neutral
    // `guard-list` on the `query` helper → `bf.query(base, <triples>)`.
    // Recognised before the support gate because the object-literal arg is
    // otherwise `unsupported` (BF101). The `query` helper includes a pair iff its
    // guard is truthy AND its value is a non-empty string (the client's
    // `if (value)`): a plain `key: v` passes guard `true`, a conditional
    // `key: cond ? v : undefined` passes the lowered cond. Only the `query`
    // helper renders to `bf.query`; another guard-list helper must not be
    // silently mis-rendered as a query.
    if (parsed.kind === 'call') {
      for (const matcher of this._loweringMatchers) {
        const node = matcher(parsed.callee, parsed.args)
        if (node?.kind === 'guard-list' && node.helper === 'query') {
          const qArgs = queryHrefArgs(node, n => this.renderParsedExprToTwig(n))
          return `bf.query(${qArgs.join(', ')})`
        }
        // Generic `helper-call` (#2069) — the neutral vocabulary's escape
        // hatch for a userland `LoweringPlugin` that lowers to a single
        // runtime-helper invocation. `bf.<helper>(args…)` mirrors the
        // `query` helper's own naming convention exactly: the framework
        // renders the call, the plugin author registers `<helper>` as a
        // Twig-callable function/filter in their own runtime — same
        // contract as `bf.query` itself, just not built in.
        if (node?.kind === 'helper-call' && isValidHelperId(node.helper)) {
          const argsX = node.args.map(a => this.renderParsedExprToTwig(a))
          return `bf.${node.helper}(${argsX.join(', ')})`
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
  private _isStringValueName(name: string): boolean {
    return this.stringValueNames.has(name)
  }

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
   * Whether an attribute-value expression should route through
   * `bf.bool_str` (vs. plain `bf.string`) at its interpolation site.
   * `isExplicitStringCall` is checked FIRST and short-circuits the other
   * three: an explicit `String(x)` call already lowers to `bf.string(x)`,
   * which correctly stringifies a real boolean on its own (see the PHP
   * runtime's `string()` helper's bool branch), so layering `bf.bool_str`
   * on top would run PHP truthiness over the ALREADY-STRINGIFIED text
   * instead of the original boolean. See `isExplicitStringCall`'s docstring
   * in `boolean-result.ts` for the full double-wrap failure mode this
   * guards against.
   */
  private shouldBoolStr(expr: string, name: string): boolean {
    if (isExplicitStringCall(expr)) return false
    return isBooleanResultExpr(expr) || isAriaBooleanAttr(name) || this.isBooleanTypedPropRef(expr)
  }

  /**
   * Inline a const (any scope) whose initializer is a pure numeric or
   * single-quoted string literal (`const totalPages = 5`, #1897
   * pagination) — function-scope consts never reach the per-render
   * context, so a bare reference would resolve to Undefined.
   *
   * The lookup is a flat name match with no notion of AST scope, so a
   * name that any loop callback binds as its item/index param never
   * inlines (#2221) — the occurrence may be the loop's own (shadowing)
   * binding, and substituting the outer const's value there renders every
   * iteration with the same hard-coded literal. Coarse (a genuinely
   * non-shadowed same-named const elsewhere in the component also stops
   * inlining, falling back to the bare identifier) but safe — the same
   * trade-off as #2212's `collectLoopBoundNames` use in
   * `collectStringValueNames`.
   */
  private _resolveLiteralConst(name: string): string | null {
    if (this.staticLoopSourceBoundNames.has(name)) return null
    const c = (this.localConstants ?? []).find(lc => lc.name === name)
    if (c?.value === undefined) return null
    const v = c.value.trim()
    if (/^-?\d+(\.\d+)?$/.test(v)) return v
    const strLit = /^'([^'\\]*)'$/.exec(v) ?? /^"([^"\\]*)"$/.exec(v)
    if (strLit) return `'${escapeTwigSingleQuoted(strLit[1])}'`
    return null
  }

  /**
   * Resolve `IDENT.key` where `IDENT` is a module-scope object-literal const
   * (`variantClasses.ghost`, #1896/#1897) to the looked-up scalar.
   *
   * The lookup is a flat name match on `objectName` with no notion of AST
   * scope, so an enclosing loop callback's own param of the same name
   * (`.map((cfg) => <li>{cfg.x}</li>)` shadowing a module `const cfg = {…}`)
   * still resolved to the OUTER const's member value at every iteration
   * (#2237) — the sibling hazard to #2221's `_resolveLiteralConst`. Same
   * coarse-but-safe `staticLoopSourceBoundNames` guard: any name a loop
   * binds anywhere in the component never inlines, falling back to the bare
   * `cfg.x` member expression (which a Twig for-loop binds correctly at the
   * shadowed occurrences).
   */
  private _resolveStaticRecordLiteral(objectName: string, key: string): string | null {
    if (this.staticLoopSourceBoundNames.has(objectName)) return null
    const hit = lookupStaticRecordLiteral(objectName, key, this.localConstants)
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

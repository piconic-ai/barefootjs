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
 *   1. **JS truthiness** (`boolean-result.ts`, `expr/emitters.ts`'s
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
  isValidHelperId,
  sortComparatorFromArrow,
} from '@barefootjs/jsx'
import { isAriaBooleanAttr, isBooleanResultExpr, isExplicitStringCall } from './boolean-result.ts'
import type { ParsedExpr, LoweringMatcher, LoopBindingPathSegment } from '@barefootjs/jsx'
import { BF_SLOT, BF_COND, BF_REGION } from '@barefootjs/shared'

import type { JinjaRenderCtx } from './lib/types.ts'
import { JINJA_PRIMITIVE_EMIT_MAP } from './lib/constants.ts'
import { minijinjaHashKey, minijinjaIdent, escapeMinijinjaSingleQuoted } from './lib/minijinja-naming.ts'
import {
  resolveJsxChildrenProp,
  collectRootScopeNodes,
} from './lib/ir-scope.ts'
import { renderSortMethod, renderSortEval } from './expr/array-method.ts'
import { JinjaFilterEmitter, JinjaTopLevelEmitter, truthyTest } from './expr/emitters.ts'
import type { JinjaEmitContext, JinjaSpreadContext, JinjaMemoContext } from './emit-context.ts'
import {
  hasClientInteractivity,
  collectImportedLoopChildComponentErrors,
} from './analysis/component-tree.ts'
import {
  conditionalSpreadToJinja,
  objectLiteralExprToJinjaDict,
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

export class MinijinjaAdapter extends BaseAdapter implements IRNodeEmitter<JinjaRenderCtx> {
  name = 'minijinja'
  extension = '.j2'
  templatesPerComponent = true
  // Template-string target with no component layer: `bf build` emits a static
  // import-map HTML snippet to include into the page <head>.
  importMapInjection = 'html-snippet' as const

  /**
   * Identifier-path callees the Jinja runtime can render in template scope.
   * The relocate pass consults this map to mark matching calls as
   * template-safe; the SSR template emitter substitutes the JS call with the
   * registered `bf.NAME(...)` helper invocation.
   */
  templatePrimitives: TemplatePrimitiveRegistry = JINJA_PRIMITIVE_EMIT_MAP

  private componentName: string = ''
  /** Component root scope element(s) — each carries `data-key` for a keyed loop
   *  item (set by the child renderer from the JSX `key` prop). A plain element
   *  root is one node; an `if-statement` (early-return) root contributes the
   *  top element of every branch. */
  private rootScopeNodes: Set<IRNode> = new Set()
  private options: Required<MinijinjaAdapterOptions>
  private errors: CompilerError[] = []
  private inLoop: boolean = false
  /**
   * SolidJS-style props identifier (`function(props: P)`) and the
   * analyzer-extracted prop names. Stashed at `generate()` entry so the
   * per-attribute `emitSpread` callback can build a propsObject spread bag as
   * an inline Jinja dict literal without re-walking the IR.
   */
  private propsObjectName: string | null = null
  private propsParams: { name: string }[] = []
  private booleanTypedProps: Set<string> = new Set()
  /**
   * Names (signal getters + props) whose value is a string. Carried for
   * parity with the Perl-family adapters (Mojo needs it for `eq`/`ne`
   * selection); the Jinja emitters don't consume it — Jinja's `==`/`!=`
   * compare strings and numbers correctly.
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
   * Optional, no-default props that are `None` when the caller omits them.
   * Their bare-reference attribute emission is guarded with a Jinja
   * `is defined and is not none` test so the attribute DROPS rather than
   * rendering `attr=""` (Hono-style nullish omission, e.g. textarea's
   * `rows`). The filter excludes destructure-defaulted, rest, and
   * concrete-primitive props.
   */
  private nullableOptionalProps: Set<string> = new Set()

  constructor(options: MinijinjaAdapterOptions = {}) {
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
    // `String(boolean)` ("true"/"false"), not Python's `str(bool)`
    // ("True"/"False") (#1897, pagination's data-active).
    this.booleanTypedProps = collectBooleanTypedProps(ir)
    this.localConstants = ir.metadata.localConstants ?? []
    this.nullableOptionalProps = collectNullableOptionalProps(ir)
    this.stringValueNames = collectStringValueNames(ir)
    this.moduleStringConsts = collectModuleStringConsts(ir.metadata.localConstants)
    this._searchParamsLocals = searchParamsLocalNames(ir.metadata)
    this._loweringMatchers = prepareLoweringMatchers(ir.metadata)
    this.errors = []
    this.childrenCaptureCounter = 0

    // Mirror of the Xslate adapter's BF103 check: a child component referenced
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

    // Jinja templates have no JS-style imports / types / default-export
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
    return node.value
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
    return this.renderComponent(node)
  }

  emitFragment(node: IRFragment, _ctx: JinjaRenderCtx, _emit: EmitIRNode<JinjaRenderCtx>): string {
    return this.renderFragment(node)
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
    const tag = element.tag
    const attrs = this.renderAttributes(element)
    const children = this.renderChildren(element.children)

    let hydrationAttrs = ''
    if (element.needsScope) {
      hydrationAttrs += ` ${this.renderScopeMarker('')}`
    }
    // A root scope element carries `data-key` for a keyed loop item (set on the
    // bf instance by the child renderer from the JSX `key` prop); non-keyed
    // renders add nothing. Mirrors Hono stamping data-key on each loop item's
    // root, including early-return (if-statement) roots. (#1297)
    if (this.rootScopeNodes.has(element) && element.needsScope) {
      hydrationAttrs += ` {{ bf.data_key_attr() | safe }}`
    }
    if (element.slotId) {
      hydrationAttrs += ` ${this.renderSlotMarker(element.slotId)}`
    }
    // Page-lifecycle boundary lowered from `<Region>` (spec/router.md). The id
    // is a deterministic static string (`<file scope>:<index>`), so it emits as
    // a plain literal attribute — no Jinja template tag.
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
        return `{{ bf.comment("client:${expr.slotId}") | safe }}`
      }
      return ''
    }

    // Text-position interpolation of a possibly-non-string value — see the
    // file header, divergence 2.
    const jinjaExpr = `bf.string(${this.convertExpressionToJinja(expr.expr)})`

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

    const condition = this.convertConditionToJinja(cond.condition)
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
      result = `{{ bf.comment("cond-start:${cond.slotId}") | safe }}${inner}{{ bf.comment("cond-end:${cond.slotId}") | safe }}`
    } else if (markedFalse) {
      result = `\n{% if ${condition} %}\n${markedTrue}\n{% else %}\n${markedFalse}\n{% endif %}\n`
    } else if (cond.slotId) {
      // Conditional with no else: wrap with comment markers for client hydration
      result = `{{ bf.comment("cond-start:${cond.slotId}") | safe }}\n{% if ${condition} %}\n${whenTrue}\n{% endif %}\n{{ bf.comment("cond-end:${cond.slotId}") | safe }}`
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
    const destructure = !!(loop.paramBindings && loop.paramBindings.length > 0)
    const supportableDestructure = destructure && isLowerableLoopDestructure(loop)
    if (destructure && !supportableDestructure) {
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
    // %}` over an unbound name would silently iterate zero times
    // (minijinja's `UndefinedBehavior::Chainable` tolerates it rather than
    // raising, same as Jinja's `ChainableUndefined`) instead of failing
    // loudly. Pre-existing, general limitation, orthogonal to #2087's
    // destructure-binding work — newly reachable in this adapter's test
    // corpus only because the widened destructure gate (#2087 Phase A/B)
    // no longer refuses this fixture's `([emoji, users]) => ...` param
    // first. Mirrors adapter-jinja's identical check.
    const arrayName = loop.array.trim()
    if (/^[A-Za-z_$][\w$]*$/.test(arrayName)) {
      const arrayConst = (this.localConstants ?? []).find(c => c.name === arrayName)
      if (arrayConst && !arrayConst.isModule && this._resolveLiteralConst(arrayName) === null) {
        this.errors.push({
          code: 'BF101',
          severity: 'error',
          message: `Loop array \`${arrayName}\` is a local computed value (\`${arrayConst.value}\`) that the MiniJinja adapter cannot bind as a template variable — only numeric/string-literal locals inline at their use site.`,
          loc: loop.loc ?? { file: this.componentName + '.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
          suggestion: {
            message:
              'Pre-compute the array server-side and pass it as a prop, or mark the loop position as @client-only so it runs in JS on the client.',
          },
        })
      }
    }

    const rawArray = this.convertExpressionToJinja(loop.array)
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
      const sortEmit = (e: ParsedExpr) => this.convertExpressionToJinja('', e)
      const arrow = sort.arrow
      const params =
        arrow.kind === 'arrow' ? arrow.params : [sort.paramA, sort.paramB]
      const structured = sortComparatorFromArrow(arrow)
      array =
        renderSortEval(rawArray, arrow.kind === 'arrow' ? arrow.body : arrow, params, sortEmit) ??
        (structured !== null ? renderSortMethod(rawArray, structured) : rawArray)
    }
    const param = loop.param
    // Jinja's `{% for item in array %}` binds the item directly. The index,
    // when needed (`.keys().map(k => ...)` or an explicit `index` param),
    // comes from Jinja's own loop object (`loop.index0`, 0-based) — no
    // Kolon-style `$~loopvar.index` indirection needed.
    const renderedChildren = this.renderChildren(loop.children)

    // For `keys`-shape iterations the callback param IS the index. We iterate
    // the array but bind the loop var to a throwaway and expose the index as
    // the param name via Jinja's built-in `loop.index0`.
    const loopVar = loop.iterationShape === 'keys'
      ? '__bf_item'
      : supportableDestructure ? '__bf_item' : param

    // Index alias: when an explicit `index` param is present (`.map((x, i) =>
    // ...)`) or the iteration is `keys`-shaped, expose it via a `{% set %}`
    // local bound to Jinja's `loop.index0`. A supported destructure param
    // adds one `{% set %}` local per binding (`rest` aliases the item so
    // `rest.flag` resolves).
    const indexLocalLines: string[] = []
    if (loop.iterationShape === 'keys') {
      indexLocalLines.push(`{% set ${minijinjaIdent(param)} = loop.index0 %}`)
    } else if (loop.index) {
      indexLocalLines.push(`{% set ${minijinjaIdent(loop.index)} = loop.index0 %}`)
    }
    if (supportableDestructure) {
      for (const b of loop.paramBindings ?? []) {
        // Built off the binding's structured `segments` path (never `b.path`
        // — repo rule: no string-parsing of a JS-shaped accessor). See
        // `minijinjaAccessorFromSegments`.
        const parent = minijinjaAccessorFromSegments(minijinjaIdent(loopVar), b.segments ?? [])
        if (b.rest?.kind === 'array') {
          // MiniJinja has no native slice syntax — route through the
          // runtime's `bf.slice` (matches the JS `.slice(from)` semantics,
          // including the past-end-length edge case) so the residual local
          // is the exact same tail array `tail === item.slice(from)`.
          indexLocalLines.push(`{% set ${minijinjaIdent(b.name)} = bf.slice(${parent}, ${b.rest.from}) %}`)
        } else if (b.rest?.kind === 'object') {
          // A TRUE residual dict (not an alias of the parent) via the
          // runtime's `bf.omit` helper (runtime.rs) — so a member read
          // (`rest.flag`) and the existing `{...rest}` spread emit
          // (`bf.spread_attrs`) both see only the non-destructured keys,
          // same as the Hono/CSR IIFE.
          const excludeKeys = b.rest.exclude.map(k => `'${escapeMinijinjaSingleQuoted(k.key)}'`).join(', ')
          indexLocalLines.push(`{% set ${minijinjaIdent(b.name)} = bf.omit(${parent}, [${excludeKeys}]) %}`)
        } else {
          indexLocalLines.push(`{% set ${minijinjaIdent(b.name)} = ${parent} %}`)
        }
      }
    }

    const prevInLoop = this.inLoop
    this.inLoop = true
    // Re-render children now that inLoop is set (so nested components use the
    // loop-child naming convention). renderedChildren above was computed with
    // the previous flag; recompute under the loop flag.
    const childrenUnderLoop = this.renderChildren(loop.children)
    this.inLoop = prevInLoop
    void renderedChildren

    // Whole-item conditional: prepend an always-present `<!--bf-loop-i:KEY-->`
    // anchor before each item's (possibly empty) conditional content so the
    // client's `mapArrayAnchored` can hydrate every SSR-rendered item by its
    // anchor.
    const bodyChildren =
      loop.bodyIsItemConditional && loop.key
        ? `{{ bf.comment("loop-i:" ~ bf.string(${this.convertExpressionToJinja(loop.key)})) | safe }}\n${childrenUnderLoop}`
        : childrenUnderLoop

    const lines: string[] = []
    // Scoped per-call-site marker so sibling `.map()`s under the same parent
    // each get their own reconciliation range.
    lines.push(`{{ bf.comment("loop:${loop.markerId}") | safe }}`)
    lines.push(`{% for ${minijinjaIdent(loopVar)} in ${array} %}`)
    for (const il of indexLocalLines) lines.push(il)

    // Handle filter().map() pattern by wrapping children in if-condition
    if (loop.filterPredicate) {
      let filterCond: string
      if (loop.filterPredicate.predicate) {
        filterCond = this.renderJinjaFilterExpr(
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
      // since Jinja identifiers have no sigil). Bounded, pre-existing risk:
      // see `lib/ir-scope.ts`'s file header for the general sigil-less
      // text-scan caveat.
      if (loop.filterPredicate.param !== param) {
        filterCond = filterCond.replace(
          new RegExp(`\\b${loop.filterPredicate.param}\\b`, 'g'),
          minijinjaIdent(param)
        )
      }
      lines.push(`{% if ${filterCond} %}`)
      lines.push(bodyChildren)
      lines.push(`{% endif %}`)
    } else {
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
   * A `renderComponent` props dict, built as an ORDERED sequence of
   * segments so `{...before, ...spread, after: 1}` JSX spread semantics
   * (later entries win) survive the trip through Jinja, which has no
   * dict-splat syntax for anything past a SINGLE `**` per `dict(...)`
   * call. Each `'entries'` segment is a literal Jinja dict `{'k': v, ...}`;
   * each `'spread'` segment is an arbitrary expression lowered from a
   * `{...expr}` prop. `combineComponentPropSegments` folds the sequence
   * into ONE expression via nested `dict(base, **top)` calls (later
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
    type Segment = { kind: 'entries'; parts: string[] } | { kind: 'spread'; expr: string }
    const segments: Segment[] = [{ kind: 'entries', parts: [] }]
    const currentEntries = () => this.componentPropSegmentEntries(segments)

    for (const p of comp.props) {
      // Skip callback props (onXxx) and `ref` — both are client-only for
      // SSR (Hono renders neither; the client JS wires them at hydration).
      if ((p.name.match(/^on[A-Z]/) || p.name === 'ref') && p.value.kind === 'expression') continue
      if (p.value.kind === 'spread') {
        const trimmed = p.value.expr.trim()
        // SolidJS-style props identifier (`function(props: P)`) has no
        // matching runtime dict in Jinja scope — props arrive as a flat
        // set of top-level template vars, so enumerate the
        // analyzer-extracted props params into dict entries instead of
        // treating it as a runtime spread expression.
        if (this.propsObjectName && this.propsObjectName === trimmed) {
          for (const pp of this.propsParams) {
            currentEntries().push(`${minijinjaHashKey(pp.name)}: ${minijinjaIdent(pp.name)}`)
          }
          continue
        }
        // Every other spread shape (a destructure rest-bag `props`, a
        // member-access bag like `children.props`, an intrinsic-element
        // spread helper's own operand, …) — Jinja dict literals can't
        // splat a runtime dict into named entries at a call site, but a
        // nested `dict(base, **top)` call can fold it into the
        // accumulated dict at the right ordinal position (kept
        // single-`**`-per-call, matching Jinja/CPython's stricter grammar
        // — see `combineComponentPropSegments`). No compile-time
        // filtering of onXxx/ref keys out of the runtime bag (the render
        // contract tolerates them, same as the other spread-lowering
        // adapters).
        segments.push({ kind: 'spread', expr: this.convertExpressionToJinja(p.value.expr) })
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
      currentEntries().push(`${minijinjaHashKey('_bf_slot')}: '${comp.slotId}'`)
    }
    const tplName = this.toTemplateName(comp.name)

    // Resolve the effective children: a nested `<Box>…</Box>` populates
    // `comp.children`; an attribute-form `<Box children={<jsx/>} />` lands in
    // a `jsx-children` AttrValue on the corresponding prop.
    const effectiveChildren: IRNode[] = comp.children.length > 0
      ? comp.children
      : resolveJsxChildrenProp(comp.props)

    if (effectiveChildren.length > 0) {
      // Forward JSX children via a Jinja set-block. The block body is
      // evaluated in the parent's template scope (signals, conditionals) and
      // produces the children HTML as a captured safe-string value; the
      // captured name is passed as the `children` entry of the
      // render_child dict. `render_child` materializes it through the
      // backend before handing it to the child. See the file header,
      // divergence 4, for why a set-block (not a macro) is the uniform
      // mechanism here.
      const prevInLoop = this.inLoop
      this.inLoop = false
      const childrenBody = this.renderChildren(effectiveChildren)
      this.inLoop = prevInLoop
      const captureName = `bf_children_${comp.slotId ?? 'c' + this.childrenCaptureCounter++}`
      currentEntries().push(`${minijinjaHashKey('children')}: ${captureName}`)
      const dict = this.combineComponentPropSegments(segments)
      return `{% set ${captureName} %}${childrenBody}{% endset %}{{ bf.render_child('${tplName}', ${dict}) | safe }}`
    }

    const isEmpty = segments.every(s => s.kind === 'entries' && s.parts.length === 0)
    const dictEntries = isEmpty ? '' : `, ${this.combineComponentPropSegments(segments)}`
    return `{{ bf.render_child('${tplName}'${dictEntries}) | safe }}`
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

  private renderFragment(fragment: IRFragment): string {
    const children = this.renderChildren(fragment.children)
    if (fragment.needsScopeComment) {
      return `{{ bf.scope_comment() | safe }}${children}`
    }
    return children
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
    emitLiteral: (value, name) => `${name}="${value.value}"`,
    emitExpression: (value, name) => {
      // `style={{ … }}` object literal → a CSS string with dynamic values
      // interpolated, instead of refusing the bare object with BF101 (#1322).
      if (name === 'style') {
        const css = this.tryLowerStyleObject(value.expr)
        if (css !== null) return `style="${css}"`
      }
      // Refuse shapes that the lowering pipeline can't represent in Jinja —
      // tagged-template-literal call expressions (`cn\`base \${tone()}\``).
      // Same gate as the Xslate adapter.
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
        const jinja = this.convertExpressionToJinja(value.expr)
        const body = this.shouldBoolStr(value.expr, name)
            ? `${name}="{{ bf.bool_str(${jinja}) }}"`
            : `${name}="{{ bf.string(${jinja}) }}"`
        // `jinja` is a bare identifier reference for this narrowly-gated
        // shape, so it doubles as both the guard test and the display
        // value — same "is defined and is not none" pair the Kolon port's
        // `defined` check maps to (see `providerValueJinja`'s header for
        // why `is not none` alone isn't enough: a var missing from context
        // entirely reads as Undefined, not `none`).
        return `\n{% if ${jinja} is defined and ${jinja} is not none %}\n${body}\n{% endif %}\n`
      }
      if (isBooleanAttr(name)) {
        // Boolean attributes: render conditionally (present or absent).
        const jinja = this.convertExpressionToJinja(value.expr)
        return `{{ ('${name}' if ${this.wrapConditionExpr(value.expr, jinja)} else '') }}`
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
        const jinja = this.convertExpressionToJinja(value.expr)
        const tmp = `bf_pu${this.presenceVarCounter++}`
        const body = this.shouldBoolStr(value.expr, name)
            ? `${name}="{{ bf.bool_str(${tmp}) }}"`
            : `${name}="{{ bf.string(${tmp}) }}"`
        return `\n{% set ${tmp} = ${jinja} %}\n{% if ${this.wrapConditionExpr(value.expr, tmp)} %}\n${body}\n{% endif %}\n`
      }
      // `attr={cond ? value : undefined}` OMITS the attribute on the
      // falsy branch (Hono drops undefined-valued attributes) — wrap the
      // whole attribute in the condition instead of rendering `attr=""`
      // (#1897, pagination's `aria-current={props.isActive ? 'page' :
      // undefined}`). Same parity rule the Go adapter applies.
      {
        const m = this.parseUndefinedAlternateTernary(value.expr)
        if (m) {
          const cond = this.convertConditionToJinja(m.condition)
          const val = this.convertExpressionToJinja(m.consequent)
          return `\n{% if ${cond} %}\n${name}="{{ bf.string(${val}) }}"\n{% endif %}\n`
        }
      }
      // Boolean-result handling: route boolean-shaped values through
      // `bf.bool_str` so the wire bytes match JS `String(boolean)`. Every
      // other value is a text-position interpolation — route through
      // `bf.string` (see the file header, divergence 2).
      const jinja = this.convertExpressionToJinja(value.expr)
      if (this.shouldBoolStr(value.expr, name)) {
        return `${name}="{{ bf.bool_str(${jinja}) }}"`
      }
      return `${name}="{{ bf.string(${jinja}) }}"`
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
      // SolidJS-style props identifier (`(props: P) { <el {...props}/> }`) has
      // no matching context dict in Jinja scope — props arrive as a flat set
      // of top-level context vars. Emit an inline dict literal enumerating
      // the analyzer-extracted props params.
      const trimmed = value.expr.trim()
      if (this.propsObjectName && this.propsObjectName === trimmed) {
        const entries = this.propsParams.map(p =>
          `${minijinjaHashKey(p.name)}: ${minijinjaIdent(p.name)}`,
        )
        return `{{ bf.spread_attrs({${entries.join(', ')}}) | safe }}`
      }
      // Conditional inline-object spread (#textarea):
      //   `{...(COND ? { 'aria-describedby': describedBy } : {})}`
      // Emit a Jinja inline ternary of dicts — the falsy `{}` branch OMITS
      // the key (`spread_attrs` does NOT emit empty-dict entries).
      // Read the spread's IR-carried `ParsedExpr` tree (#2018) instead of
      // re-parsing `trimmed`.
      const ternaryDict = conditionalSpreadToJinja(this.spreadCtx, value.parsed)
      if (ternaryDict !== null) {
        return `{{ bf.spread_attrs(${ternaryDict}) | safe }}`
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
            const resolved = conditionalSpreadToJinja(
              this.spreadCtx,
              parseExpression(initTrimmed),
            )
            if (resolved !== null) {
              return `{{ bf.spread_attrs(${resolved}) | safe }}`
            }
          }
        }
      }
      const jinjaExpr = this.convertExpressionToJinja(value.expr)
      return `{{ bf.spread_attrs(${jinjaExpr}) | safe }}`
    },
    // Neither variant is legal on intrinsic elements.
    emitBooleanShorthand: () => '',
    emitJsxChildren: () => '',
  }

  /**
   * Lower a `style={{ … }}` object literal to a CSS string with dynamic values
   * interpolated as Jinja expressions, e.g. `{ backgroundColor: color }` →
   * `background-color:{{ bf.string(color) }}`. Returns null when the shape is
   * unsupported or any value can't be lowered (caller falls through to
   * BF101). (#1322)
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
    // markup). The dynamic arm's `{{ … }}` is HTML-escaped by Jinja.
    return entries
      .map(e =>
        e.kind === 'literal'
          ? `${this.escapeAttrText(e.cssKey)}:${this.escapeAttrText(e.value)}`
          : `${this.escapeAttrText(e.cssKey)}:{{ bf.string(${this.convertExpressionToJinja(e.expr)}) }}`,
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
      // Rewrite JSX special-prop names to their HTML-attribute counterparts.
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
        message: 'The Jinja adapter cannot lower JS object literals or tagged-template-literal expressions into Jinja. Move the expression into a `\'use client\'` component (so hydration computes it), or expand it into discrete attributes whose values are values the adapter can lower.',
      },
    })
    return true
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
      _resolveModuleStringConst: (name) => this._resolveModuleStringConst(name),
      _resolveLiteralConst: (name) => this._resolveLiteralConst(name),
      _resolveStaticRecordLiteral: (o, k) => this._resolveStaticRecordLiteral(o, k),
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
      convertExpressionToJinja: (e, preParsed) => this.convertExpressionToJinja(e, preParsed),
      errors: this.errors,
    }
  }

  private convertExpressionToJinja(expr: string, preParsed?: ParsedExpr): string {
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
          const qArgs = queryHrefArgs(node, n => this.renderParsedExprToJinja(n))
          return `bf.query(${qArgs.join(', ')})`
        }
        // Generic `helper-call` (#2069) — the neutral vocabulary's escape
        // hatch for a userland `LoweringPlugin` that lowers to a single
        // runtime-helper invocation. `bf.<helper>(args…)` mirrors the
        // `query` helper's own naming convention exactly: the framework
        // renders the call, the plugin author registers `<helper>` as a
        // MiniJinja-callable function in their own runtime — same contract
        // as `bf.query` itself, just not built in.
        if (node?.kind === 'helper-call' && isValidHelperId(node.helper)) {
          const argsX = node.args.map(a => this.renderParsedExprToJinja(a))
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
   * which — unlike Kolon's Perl port — correctly stringifies a real
   * boolean on its own (see `runtime.js_string`'s bool branch), so
   * layering `bf.bool_str` on top would run Python truthiness over the
   * ALREADY-STRINGIFIED text instead of the original boolean. See
   * `isExplicitStringCall`'s docstring in `boolean-result.ts` for the full
   * double-wrap failure mode this guards against.
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
   */
  private _resolveLiteralConst(name: string): string | null {
    const c = (this.localConstants ?? []).find(lc => lc.name === name)
    if (c?.value === undefined) return null
    const v = c.value.trim()
    if (/^-?\d+(\.\d+)?$/.test(v)) return v
    const strLit = /^'([^'\\]*)'$/.exec(v) ?? /^"([^"\\]*)"$/.exec(v)
    if (strLit) return `'${escapeMinijinjaSingleQuoted(strLit[1])}'`
    return null
  }

  private _resolveStaticRecordLiteral(objectName: string, key: string): string | null {
    const hit = lookupStaticRecordLiteral(objectName, key, this.localConstants)
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

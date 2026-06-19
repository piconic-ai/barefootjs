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
} from '@barefootjs/jsx'
import {
  BaseAdapter,
  type AdapterOutput,
  type AdapterGenerateOptions,
  type TemplateSections,
  type ParsedExprEmitter,
  type HigherOrderMethod,
  type ArrayMethod,
  type LiteralType,
  type IRNodeEmitter,
  type EmitIRNode,
  type AttrValueEmitter,
  isBooleanAttr,
  parseExpression,
  exprToString,
  parseProviderObjectLiteral,
  parseStyleObjectEntries,
  isSupported,
  identifierPath,
  emitParsedExpr,
  emitIRNode,
  emitAttrValue,
  augmentInheritedPropAccesses,
  parseRecordIndexAccess,
  evalStringArrayJoin,
  collectModuleStringConsts,
  extractArrowBodyExpression,
  collectContextConsumers,
  isLowerableObjectRestDestructure,
  type ContextConsumer,
  lookupStaticRecordLiteral,
  searchParamsLocalNames,
  matchSearchParamsMethodCall
} from '@barefootjs/jsx'
import { isAriaBooleanAttr, isBooleanResultExpr } from './boolean-result.ts'
import ts from 'typescript'

/**
 * Xslate adapter's IRNode render context. Like the Mojo adapter, Kolon's
 * lowering doesn't consume any render-position flags, so the Ctx is empty.
 * Kept as a named alias so future flags can extend it without changing the
 * `IRNodeEmitter` interface.
 */
type XslateRenderCtx = Record<string, never>
import type { ParsedExpr, ParsedStatement, SortComparator, ReduceOp, FlatDepth, FlatMapOp, TemplatePart } from '@barefootjs/jsx'
import { BF_SLOT, BF_COND, BF_REGION } from '@barefootjs/shared'

interface PrimitiveSpec {
  arity: number
  emit: (args: string[]) => string
}

/**
 * Single source of truth for the Xslate adapter's template-primitive
 * surface. Each entry pairs the expected arity with the emit function.
 *
 * The emit fn returns a Kolon expression (no surrounding `<: :>`) suitable
 * for embedding inside an interpolation — `$bf.json($val)`,
 * `$bf.floor($val)`, etc. The same primitive names as the Mojo adapter, but
 * invoked as `$bf.NAME(args)` on the runtime instance instead of `bf->NAME`.
 */
const XSLATE_TEMPLATE_PRIMITIVES: Record<string, PrimitiveSpec> = {
  'JSON.stringify': { arity: 1, emit: (args) => `$bf.json(${args[0]})` },
  'String':         { arity: 1, emit: (args) => `$bf.string(${args[0]})` },
  'Number':         { arity: 1, emit: (args) => `$bf.number(${args[0]})` },
  'Math.floor':     { arity: 1, emit: (args) => `$bf.floor(${args[0]})` },
  'Math.ceil':      { arity: 1, emit: (args) => `$bf.ceil(${args[0]})` },
  'Math.round':     { arity: 1, emit: (args) => `$bf.round(${args[0]})` },
}

/**
 * Module-scope `templatePrimitives` map derived once from the spec record.
 */
const XSLATE_PRIMITIVE_EMIT_MAP: Record<string, (args: string[]) => string> =
  Object.fromEntries(
    Object.entries(XSLATE_TEMPLATE_PRIMITIVES).map(([k, v]) => [k, v.emit])
  )

/**
 * Find the `children` prop's `jsx-children` payload. Narrowed via the
 * AttrValue `kind` discriminator so adapter code stays type-safe if the IR
 * shape evolves.
 */
/**
 * Escape a string for a Kolon/Perl single-quoted literal: backslash first
 * (so it doesn't double-escape the quote we add next), then the quote. Used
 * by every `'…'` hashref key/value emitter below.
 */
function escapeKolonSingleQuoted(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

/**
 * Quote a hashref KEY for Kolon when it isn't a bare-identifier-safe name.
 * Kolon parses `data-slot` as `data - slot` (subtraction) and faults on the
 * undefined `data` symbol, so a hyphenated key (`data-slot`, `aria-label`)
 * must be single-quoted: `'data-slot'`. Bare identifiers pass through unquoted.
 */
function kolonHashKey(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `'${escapeKolonSingleQuoted(name)}'`
}

function resolveJsxChildrenProp(props: readonly IRProp[]): IRNode[] {
  const prop = props.find(p => p.name === 'children')
  if (!prop) return []
  if (prop.value.kind !== 'jsx-children') return []
  return prop.value.children
}

/**
 * Collect the component's root scope element node(s) — the elements that
 * become the rendered root and so carry `data-key` for a keyed loop item. A
 * plain element root is itself; an `if-statement` (early-return) root
 * contributes the top element of each branch, since exactly one renders at
 * runtime. (#1297)
 */
function collectRootScopeNodes(node: IRNode): Set<IRNode> {
  const out = new Set<IRNode>()
  const visit = (n: IRNode | null): void => {
    if (!n) return
    if (n.type === 'element') { out.add(n); return }
    if (n.type === 'if-statement') {
      const s = n as IRIfStatement
      visit(s.consequent)
      visit(s.alternate)
      return
    }
    if (n.type === 'fragment') {
      for (const c of (n as IRFragment).children) visit(c)
    }
  }
  visit(node)
  return out
}

/**
 * True when every `$var` the lowered Kolon expression references is already in
 * scope — guards in-template memo seeding against an out-of-scope binding. (#1297)
 */
function referencedVarsAreAvailable(expr: string, available: ReadonlySet<string>): boolean {
  for (const m of expr.matchAll(/\$([A-Za-z_]\w*)/g)) {
    if (!available.has(m[1])) return false
  }
  return true
}

export interface XslateAdapterOptions {
  /** Base path for client JS files (default: '/static/components/') */
  clientJsBasePath?: string

  /** Path to barefoot.js runtime (default: '/static/components/barefoot.js') */
  barefootJsPath?: string
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
   * SolidJS-style props identifier (`function(props: P)`) and the
   * analyzer-extracted prop names. Stashed at `generate()` entry so the
   * per-attribute `emitSpread` callback can build a propsObject spread bag as
   * an inline Kolon hashref literal without re-walking the IR.
   */
  private propsObjectName: string | null = null
  private propsParams: { name: string }[] = []
  private booleanTypedProps: Set<string> = new Set()
  /**
   * Names (signal getters + props) whose value is a string, so `===`/`!==`
   * against them lowers to Perl `eq`/`ne` rather than numeric `==`/`!=`.
   * Kolon comparison operators delegate to Perl semantics, so the same
   * string-vs-numeric distinction the Mojo adapter makes applies here.
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
  _searchParamsLocals: Set<string> = new Set()

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
    this.booleanTypedProps = new Set(
      ir.metadata.propsParams
        .filter(prop => prop.type?.primitive === 'boolean' || prop.type?.raw === 'boolean')
        .map(prop => prop.name),
    )
    this.localConstants = ir.metadata.localConstants ?? []
    // Bare references to optional, no-default, non-primitive props (e.g.
    // textarea's `rows`) are `undef` when omitted → `defined`-guarded in
    // `emitExpression`. See the `nullableOptionalProps` field docstring.
    this.nullableOptionalProps = new Set(
      ir.metadata.propsParams
        .filter(
          p =>
            p.defaultValue === undefined &&
            !p.isRest &&
            p.type?.kind !== 'primitive',
        )
        .map(p => p.name),
    )
    // Record string-typed signals and props so equality comparisons against
    // them lower to `eq`/`ne`. A signal is string-typed when its inferred
    // type is `string` (or, defensively, when its initial value is a bare
    // string literal); a prop when its annotated type is `string`.
    this.stringValueNames = new Set<string>()
    for (const s of ir.metadata.signals) {
      if (isStringTypeInfo(s.type) || isBareStringLiteral(s.initialValue)) {
        this.stringValueNames.add(s.getter)
      }
    }
    for (const p of ir.metadata.propsParams) {
      if (isStringTypeInfo(p.type)) this.stringValueNames.add(p.name)
    }
    this.moduleStringConsts = collectModuleStringConsts(ir.metadata.localConstants)
    this._searchParamsLocals = searchParamsLocalNames(ir.metadata)
    this.errors = []
    this.childrenCaptureCounter = 0

    // Mirror of the Mojo adapter's BF103 check: a child component referenced
    // inside a loop body that is imported from a sibling .tsx emits a
    // cross-template `$bf.render_child(...)` call that resolves only if the
    // sibling template is registered alongside the parent at render time.
    // Surface it loudly here. Suppressed when the caller guarantees that all
    // sibling templates are registered on the same instance at render time.
    if (!options?.siblingTemplatesRegistered) {
      this.checkImportedLoopChildComponents(ir)
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
    const ctxSeed = this.generateContextConsumerSeed(ir)

    // Prop/signal-derived memos with a `null` static SSR default (e.g.
    // `createMemo(() => props.value * 10)`) are computed in-template from the
    // already-seeded prop/signal vars — mirroring Go's generated child
    // constructor. (#1297)
    const memoSeed = this.generateDerivedMemoSeed(ir)

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
    const hasInteractivity = this.hasClientInteractivity(ir)
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

  private hasClientInteractivity(ir: ComponentIR): boolean {
    return (
      ir.metadata.signals.length > 0 ||
      ir.metadata.effects.length > 0 ||
      ir.metadata.onMounts.length > 0 ||
      (ir.metadata.clientAnalysis?.needsInit ?? false)
    )
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
    return node.value
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

  /** Kolon literal for a context-consumer's `createContext` default. */
  private contextDefaultKolon(c: ContextConsumer): string {
    const d = c.defaultValue
    if (d === null || d === undefined) return 'nil'
    if (typeof d === 'string') return `'${d.replace(/[\\']/g, m => `\\${m}`)}'`
    if (typeof d === 'boolean') return d ? '1' : '0'
    return String(d)
  }

  /**
   * Emit one `: my $<local> = $bf.use_context(...)` line-statement per
   * context consumer so the body's bare `$<local>` resolves to the active
   * provider value (or the `createContext` default). (#1297)
   */
  private generateContextConsumerSeed(ir: ComponentIR): string {
    const consumers = collectContextConsumers(ir.metadata)
    if (consumers.length === 0) return ''
    return (
      consumers
        .map(
          c =>
            `: my $${c.localName} = $bf.use_context('${c.contextName}', ${this.contextDefaultKolon(c)});`,
        )
        .join('\n') + '\n'
    )
  }

  /**
   * Seed memos whose SSR default is `null` (not statically evaluable) by
   * computing them in-template from the already-seeded prop / signal vars
   * (`createMemo(() => props.value * 10)` → `: my $x = $value * 10;`). Without
   * this the memo's `$x` renders empty — the reason
   * `props-reactivity-comparison` was skipped. Only emitted when every var the
   * lowering references is already in scope. (#1297)
   */
  private generateDerivedMemoSeed(ir: ComponentIR): string {
    const memos = ir.metadata.memos ?? []
    const signals = ir.metadata.signals ?? []
    if (memos.length === 0 && signals.length === 0) return ''
    // Props seed first; each signal/memo adds its own name as it lands.
    const available = new Set<string>(ir.metadata.propsParams.map(p => p.name))
    const lines: string[] = []

    // Prop/signal-derived signals (`createSignal(props.defaultOn ?? false)`):
    // a loop-child render gets no stash seed, so its `$on` would render nil;
    // and the static default can't capture the per-call prop. Seed it
    // in-template when the init lowers cleanly AND references an in-scope var.
    // Object/array/constant inits keep the existing ssr-defaults seeding.
    for (const signal of signals) {
      const kolon = this.tryLowerToKolon(signal.initialValue, available)
      // Kolon can't express `: my $x = … $x …` — declaring `my $x` makes the
      // RHS `$x` an undefined lexical rather than the render var. A same-name
      // signal (`createSignal(props.x ?? d)`, getter == prop) is just the prop
      // with a default, which the harness already seeds correctly from the
      // passed prop — skip the in-template seed for it. (Different-name
      // prop-derived signals like toggle's `on` from `defaultOn` are unaffected.)
      const refsSelf = kolon !== null && new RegExp(`\\$${signal.getter}\\b`).test(kolon)
      if (kolon !== null && !refsSelf) lines.push(`: my $${signal.getter} = ${kolon};`)
      available.add(signal.getter)
    }

    for (const memo of memos) {
      // Seed every memo whose body lowers cleanly — not just the ones whose
      // static SSR default is null. A statically-foldable prop-derived memo
      // (`createMemo(() => props.disabled ?? false)` → default `false`)
      // still depends on the per-call prop: the static stash seed bakes in
      // the absent-prop fold, so a caller passing `disabled => 1` would
      // render the default branch (#1897, select's disabled item). The
      // in-template recomputation reads the prop lexical already in scope;
      // block-bodied arrows / out-of-scope references fall back to the
      // static ssr-defaults seed. Same self-reference guard as the signal
      // loop above — Kolon's `my` shadows the render var on the RHS.
      const body = extractArrowBodyExpression(memo.computation)
      if (body !== null) {
        const kolon = this.tryLowerToKolon(body, available)
        const refsSelf = kolon !== null && new RegExp(`\\$${memo.name}\\b`).test(kolon)
        if (kolon !== null && !refsSelf) lines.push(`: my $${memo.name} = ${kolon};`)
      }
      available.add(memo.name)
    }
    return lines.length > 0 ? lines.join('\n') + '\n' : ''
  }

  /**
   * Lower a signal init / memo body to Kolon for an in-template SSR seed, or
   * `null` when it shouldn't be seeded this way: not a supported shape
   * (`isSupported` pre-check, so object/array literals don't fail the build),
   * references no in-scope var (a constant — keep ssr-defaults seeding), or
   * references an out-of-scope binding. (#1297)
   */
  private tryLowerToKolon(expr: string, available: ReadonlySet<string>): string | null {
    const trimmed = expr.trim()
    if (!trimmed) return null
    if (!isSupported(parseExpression(trimmed)).supported) return null
    const kolon = this.convertExpressionToKolon(trimmed)
    if (kolon === '' || !/\$[A-Za-z_]\w*/.test(kolon)) return null
    return referencedVarsAreAvailable(kolon, available) ? kolon : null
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

    const perlExpr = this.convertExpressionToKolon(expr.expr)

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
  // Imported-component-in-loop check (BF103)
  // ===========================================================================

  /**
   * Push a `BF103` diagnostic for every component reference inside a loop body
   * whose name is imported from a relative-path module. Mirror of the Mojo
   * adapter's check — the Xslate adapter has the same cross-template-
   * registration constraint at request time.
   */
  private checkImportedLoopChildComponents(ir: ComponentIR): void {
    const relativeImports = new Set<string>()
    for (const imp of ir.metadata.templateImports ?? ir.metadata.imports ?? []) {
      if (!imp.source.startsWith('./') && !imp.source.startsWith('../')) continue
      if (imp.isTypeOnly) continue
      for (const spec of imp.specifiers) {
        relativeImports.add(spec.alias ?? spec.name)
      }
    }
    if (relativeImports.size === 0) return

    const loc = { file: this.componentName + '.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } }
    const visit = (node: IRNode, inLoop: boolean): void => {
      switch (node.type) {
        case 'component': {
          const comp = node as IRComponent
          if (inLoop && relativeImports.has(comp.name)) {
            this.errors.push({
              code: 'BF103',
              severity: 'error',
              message: `Component <${comp.name}> is imported from a sibling module and used inside a loop. The Xslate adapter emits a cross-template call; the child template must be registered alongside the parent at render time.`,
              loc: comp.loc ?? loc,
              suggestion: {
                message:
                  `Options:\n` +
                  `  1. Compile '${comp.name}' (its source file) with the same adapter and register the resulting Xslate template alongside the parent at render time.\n` +
                  `  2. Inline <${comp.name}> directly inside the loop body so no cross-file template lookup is needed.\n` +
                  `  3. Mark the loop position as @client-only so the template is materialised on the client instead of at SSR time.`,
              },
            })
          }
          for (const child of comp.children) visit(child, inLoop)
          break
        }
        case 'element':
          for (const child of (node as IRElement).children) visit(child, inLoop)
          break
        case 'fragment':
          for (const child of (node as IRFragment).children) visit(child, inLoop)
          break
        case 'conditional': {
          const cond = node as IRConditional
          visit(cond.whenTrue, inLoop)
          if (cond.whenFalse) visit(cond.whenFalse, inLoop)
          break
        }
        case 'loop':
          for (const child of (node as IRLoop).children) visit(child, true)
          break
        case 'if-statement': {
          const stmt = node as IRIfStatement
          visit(stmt.consequent, inLoop)
          if (stmt.alternate) visit(stmt.alternate, inLoop)
          break
        }
        case 'provider':
          for (const child of (node as IRProvider).children) visit(child, inLoop)
          break
        case 'async': {
          const a = node as IRAsync
          visit(a.fallback, inLoop)
          for (const child of a.children) visit(child, inLoop)
          break
        }
      }
    }
    visit(ir.root, false)
  }

  // ===========================================================================
  // Loop Rendering
  // ===========================================================================

  renderLoop(loop: IRLoop): string {
    // Client-only loops: skip SSR rendering entirely
    if (loop.clientOnly) return ''

    // An array/object-destructure loop param (`([emoji, users]) => ...` or
    // `({ name, age }) => ...`) lowers to invalid Kolon — Kolon's `for LIST
    // -> $item` binds a single scalar and can't unpack a tuple. Surface this
    // at build time instead of shipping a broken template line.
    // A destructure loop param is lowerable for the object-rest / simple-field
    // shape (`.map(({ id, title, ...rest }) => …)`, `rest` read via member
    // access): each binding becomes a Kolon `: my` local off the per-item var,
    // so the body's `$id` / `$rest.flag` resolve. Array-index / nested /
    // rest-spread shapes still can't unpack a tuple → BF104. (#1310)
    const destructure = !!(loop.paramBindings && loop.paramBindings.length > 0)
    const supportableDestructure = destructure && isLowerableObjectRestDestructure(loop)
    if (destructure && !supportableDestructure) {
      this.errors.push({
        code: 'BF104',
        severity: 'error',
        message: `Loop callback uses an array/object destructure pattern (\`${loop.param}\`) that the Xslate adapter cannot lower — Kolon \`for LIST -> $item\` binds a single scalar and can't unpack a tuple.`,
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

    const rawArray = this.convertExpressionToKolon(loop.array)
    // Apply sort if present: wrap the loop array in the shared `$bf.sort`
    // helper, binding the sorted result to a per-iteration local so the
    // helper runs once.
    let array = rawArray
    if (loop.sortComparator) {
      array = renderSortMethod(rawArray, loop.sortComparator)
    }
    const param = loop.param
    // Kolon binds the item directly via `for LIST -> $item`. The index, when
    // needed (`.keys().map(k => ...)` or an explicit `index` param), comes
    // from Text::Xslate's loop variable `$~param.index`.
    const renderedChildren = this.renderChildren(loop.children)

    // For `keys`-shape iterations the callback param IS the index. We iterate
    // the array but bind the loop var to a throwaway and expose the index as
    // `$param`. Kolon's `$~loopvar.index` provides the 0-based index.
    const loopVar = loop.iterationShape === 'keys'
      ? '__bf_item'
      : supportableDestructure ? '__bf_item' : param

    // Index alias: when an explicit `index` param is present (`.map((x, i) =>
    // ...)`) or the iteration is `keys`-shaped, expose it via a `: my` Kolon
    // local bound to the loop variable's `.index` accessor. A supported
    // destructure param adds one `: my` local per binding (`rest` aliases the
    // item so `$rest.flag` resolves).
    const indexLocalLines: string[] = []
    if (loop.iterationShape === 'keys') {
      indexLocalLines.push(`: my $${param} = $~${loopVar}.index;`)
    } else if (loop.index) {
      indexLocalLines.push(`: my $${loop.index} = $~${loopVar}.index;`)
    }
    if (supportableDestructure) {
      for (const b of loop.paramBindings ?? []) {
        indexLocalLines.push(
          b.rest
            ? `: my $${b.name} = $${loopVar};`
            : `: my $${b.name} = $${loopVar}${b.path};`,
        )
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
        ? `<: $bf.comment("loop-i:" ~ ${this.convertExpressionToKolon(loop.key)}) | mark_raw :>\n${childrenUnderLoop}`
        : childrenUnderLoop

    const lines: string[] = []
    // Scoped per-call-site marker so sibling `.map()`s under the same parent
    // each get their own reconciliation range.
    lines.push(`<: $bf.comment("loop:${loop.markerId}") | mark_raw :>`)
    lines.push(`: for ${array} -> $${loopVar} {`)
    for (const il of indexLocalLines) lines.push(il)

    // Handle filter().map() pattern by wrapping children in if-condition
    if (loop.filterPredicate) {
      let filterCond: string
      if (loop.filterPredicate.blockBody) {
        filterCond = this.renderBlockBodyCondition(
          loop.filterPredicate.blockBody,
          loop.filterPredicate.param
        )
      } else if (loop.filterPredicate.predicate) {
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
      return `${kolonHashKey(name)} => ${this.convertExpressionToKolon(value.expr)}`
    },
    emitSpread: (value) => {
      // Kolon hashrefs can't be splatted into the entry list the way Perl
      // `%{...}` flattens into a list. The propsObject case is handled in
      // `renderComponent` (it enumerates the analyzer's props params); any
      // other spread shape is refused there via the unsupported gate. Emit
      // the lowered expression so a downstream consumer sees something
      // coherent, but renderComponent only routes the enumerated case here.
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

  renderComponent(comp: IRComponent): string {
    const propParts: string[] = []
    for (const p of comp.props) {
      // Skip callback props (onXxx) and `ref` — both are client-only for
      // SSR (Hono renders neither; the client JS wires them at hydration).
      if ((p.name.match(/^on[A-Z]/) || p.name === 'ref') && p.value.kind === 'expression') continue
      // Spread props: enumerate the analyzer's props params into hashref
      // entries (the propsObject case) — Kolon can't flatten a hashref into
      // the entry list. Other spread shapes are refused with BF101.
      if (p.value.kind === 'spread') {
        const trimmed = p.value.expr.trim()
        if (this.propsObjectName && this.propsObjectName === trimmed) {
          for (const pp of this.propsParams) {
            propParts.push(`${pp.name} => $${pp.name}`)
          }
          continue
        }
        this.errors.push({
          code: 'BF101',
          severity: 'error',
          message: `Spread props (\`{...${trimmed}}\`) on a child component cannot be lowered to Kolon — Kolon hashref method args can't splat a runtime hash into named entries.`,
          loc: comp.loc ?? { file: this.componentName + '.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
          suggestion: {
            message: 'Pass the child component its props explicitly rather than spreading a runtime object.',
          },
        })
        continue
      }
      const lowered = emitAttrValue(p.value, this.componentPropEmitter, p.name)
      if (lowered) propParts.push(lowered)
    }
    // Pass slot ID so the child renderer can set correct scope ID for
    // hydration. Skip for loop children — they use ComponentName_random.
    if (comp.slotId && !this.inLoop) {
      propParts.push(`_bf_slot => '${comp.slotId}'`)
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
      const childrenEntry = `children => ${macroName}()`
      const allParts = [...propParts, childrenEntry]
      return `<: macro ${macroName} -> () { :>${childrenBody}<: } :><: $bf.render_child('${tplName}', { ${allParts.join(', ')} }) | mark_raw :>`
    }

    const hashEntries = propParts.length > 0 ? `, { ${propParts.join(', ')} }` : ''
    return `<: $bf.render_child('${tplName}'${hashEntries}) | mark_raw :>`
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
    emitLiteral: (value, name) => `${name}="${value.value}"`,
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
      const ternaryHashref = this.conditionalSpreadToKolon(trimmed)
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
            const resolved = this.conditionalSpreadToKolon(initTrimmed)
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
    return emitParsedExpr(expr, new XslateFilterEmitter(param, localVarMap, n => this._isStringValueName(n)))
  }

  /**
   * Render a complex block body filter into a Kolon condition.
   * Handles patterns like: filter(t => { const f = filter(); if (...) return ...; })
   */
  private renderBlockBodyCondition(
    statements: ParsedStatement[],
    param: string
  ): string {
    const localVarMap = new Map<string, string>()
    const paths = this.collectReturnPaths(statements, [], localVarMap, param)

    if (paths.length === 0) return '1'
    if (paths.length === 1) return this.buildSinglePathCondition(paths[0], param, localVarMap)

    // Multiple paths: build OR condition
    const parts: string[] = []
    for (const path of paths) {
      if (path.result.kind === 'literal' && path.result.literalType === 'boolean' && path.result.value === false) continue
      const cond = this.buildSinglePathCondition(path, param, localVarMap)
      if (cond !== '0') parts.push(cond)
    }

    if (parts.length === 0) return '0'
    if (parts.length === 1) return parts[0]
    return `(${parts.join(' || ')})`
  }

  private collectReturnPaths(
    statements: ParsedStatement[],
    currentConditions: ParsedExpr[],
    localVarMap: Map<string, string>,
    param: string
  ): Array<{ conditions: ParsedExpr[]; result: ParsedExpr }> {
    const paths: Array<{ conditions: ParsedExpr[]; result: ParsedExpr }> = []

    for (const stmt of statements) {
      if (stmt.kind === 'var-decl') {
        if (stmt.init.kind === 'call' && stmt.init.callee.kind === 'identifier') {
          localVarMap.set(stmt.name, stmt.init.callee.name)
        }
      } else if (stmt.kind === 'return') {
        paths.push({ conditions: [...currentConditions], result: stmt.value })
        break
      } else if (stmt.kind === 'if') {
        const thenPaths = this.collectReturnPaths(stmt.consequent, [...currentConditions, stmt.condition], localVarMap, param)
        paths.push(...thenPaths)

        if (stmt.alternate) {
          const negated: ParsedExpr = { kind: 'unary', op: '!', argument: stmt.condition }
          const elsePaths = this.collectReturnPaths(stmt.alternate, [...currentConditions, negated], localVarMap, param)
          paths.push(...elsePaths)
        } else {
          currentConditions.push({ kind: 'unary', op: '!', argument: stmt.condition })
        }
      }
    }

    return paths
  }

  private buildSinglePathCondition(
    path: { conditions: ParsedExpr[]; result: ParsedExpr },
    param: string,
    localVarMap: Map<string, string>
  ): string {
    if (path.result.kind === 'literal' && path.result.literalType === 'boolean') {
      if (path.result.value === true) {
        if (path.conditions.length === 0) return '1'
        return this.renderConditionsAnd(path.conditions, param, localVarMap)
      }
      return '0'
    }

    if (path.conditions.length === 0) {
      return this.renderKolonFilterExpr(path.result, param, localVarMap)
    }

    const condPart = this.renderConditionsAnd(path.conditions, param, localVarMap)
    const resultPart = this.renderKolonFilterExpr(path.result, param, localVarMap)
    return `(${condPart} && ${resultPart})`
  }

  private renderConditionsAnd(
    conditions: ParsedExpr[],
    param: string,
    localVarMap: Map<string, string>
  ): string {
    if (conditions.length === 0) return '1'
    if (conditions.length === 1) return this.renderKolonFilterExpr(conditions[0], param, localVarMap)
    const parts = conditions.map(c => this.renderKolonFilterExpr(c, param, localVarMap))
    return `(${parts.join(' && ')})`
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
   * Lower a conditional inline-object spread
   *   `COND ? { 'aria-describedby': describedBy } : {}`
   * to a Kolon inline ternary of hashrefs
   *   `$describedBy ? { 'aria-describedby' => $describedBy } : {}`.
   * Both branches must be object literals; the condition + values route through
   * `convertExpressionToKolon`. Returns `null` for any other shape so the caller
   * falls back to its normal lowering. Mirror of `conditionalSpreadToPerl`.
   */
  private conditionalSpreadToKolon(expr: string): string | null {
    const sf = ts.createSourceFile('__spread.ts', `(${expr})`, ts.ScriptTarget.Latest, true)
    if (sf.statements.length !== 1) return null
    const stmt = sf.statements[0]
    if (!ts.isExpressionStatement(stmt)) return null
    let node: ts.Expression = stmt.expression
    while (ts.isParenthesizedExpression(node)) node = node.expression
    if (!ts.isConditionalExpression(node)) return null
    const unwrap = (e: ts.Expression): ts.Expression => {
      let n = e
      while (ts.isParenthesizedExpression(n)) n = n.expression
      return n
    }
    const whenTrue = unwrap(node.whenTrue)
    const whenFalse = unwrap(node.whenFalse)
    if (!ts.isObjectLiteralExpression(whenTrue) || !ts.isObjectLiteralExpression(whenFalse)) {
      return null
    }
    const condPerl = this.convertExpressionToKolon(node.condition.getText(sf))
    const truePerl = this.objectLiteralToKolonHashref(whenTrue, sf)
    const falsePerl = this.objectLiteralToKolonHashref(whenFalse, sf)
    if (truePerl === null || falsePerl === null) return null
    return `${condPerl} ? ${truePerl} : ${falsePerl}`
  }

  /**
   * Convert a static object literal into a Kolon hashref string for a
   * conditional spread. Only static string/identifier keys are allowed; values
   * resolve via `convertExpressionToKolon` (or the `Record[propKey]` index
   * lowering). Returns `null` for any computed/spread/dynamic key. Empty object
   * → `{}`. Mirror of `objectLiteralToPerlHashref`.
   */
  private objectLiteralToKolonHashref(
    obj: ts.ObjectLiteralExpression,
    sf: ts.SourceFile,
  ): string | null {
    const entries: string[] = []
    for (const prop of obj.properties) {
      if (!ts.isPropertyAssignment(prop)) return null
      let key: string
      if (ts.isIdentifier(prop.name)) {
        key = prop.name.text
      } else if (ts.isStringLiteral(prop.name) || ts.isNoSubstitutionTemplateLiteral(prop.name)) {
        key = prop.name.text
      } else {
        return null
      }
      const initNode = (() => {
        let n: ts.Expression = prop.initializer
        while (ts.isParenthesizedExpression(n)) n = n.expression
        return n
      })()
      const indexed = this.recordIndexAccessToKolon(initNode)
      if (
        indexed === null &&
        ts.isElementAccessExpression(initNode) &&
        initNode.argumentExpression &&
        !ts.isNumericLiteral(initNode.argumentExpression) &&
        !ts.isStringLiteral(initNode.argumentExpression)
      ) {
        // Variable-index record access (`sizeMap[size]`) the static-inline
        // path couldn't resolve (non-scalar value / non-const receiver).
        // Since #1897 made variable indices parseable (`index-access`),
        // the generic value lowering would emit `$sizeMap[$size]` against
        // an UNBOUND module const instead of refusing — record BF101 and
        // bail so the spread surfaces the out-of-shape diagnostic,
        // matching pre-#1897 behaviour. (Mirrors the Mojo adapter.)
        this.errors.push({
          code: 'BF101',
          severity: 'error',
          message: `Spread object value '${initNode.getText(sf)}' indexes a record map whose values aren't scalar literals — it can't lower to an inline Kolon hashref.`,
          loc: { file: this.componentName + '.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
          suggestion: {
            message: 'Index a record whose values are number/string literals, or move the spread into a `\'use client\'` component so hydration computes it.',
          },
        })
        return null
      }
      const valPerl =
        indexed !== null
          ? indexed
          : this.convertExpressionToKolon(prop.initializer.getText(sf))
      entries.push(`'${escapeKolonSingleQuoted(key)}' => ${valPerl}`)
    }
    return entries.length === 0 ? '{}' : `{ ${entries.join(', ')} }`
  }

  /**
   * Lower a spread-object VALUE of the form `IDENT[KEY]` (CheckIcon's
   * `sizeMap[size]`) to an inline indexed Kolon hashref
   *   `{ 'sm' => 16, 'md' => 20, ... }[$size]`.
   * Reuses the shared structural parse (`parseRecordIndexAccess`); this wrapper
   * only does the single-quote escaping + Kolon index emit. NB: Kolon indexes a
   * hashref literal with bracket syntax `{…}[$key]`, NOT Perl's arrow-deref
   * `{…}->{$key}` (which Kolon's parser rejects) — this is the one divergence
   * from the Mojo `recordIndexAccessToPerl` emit.
   */
  private recordIndexAccessToKolon(val: ts.Expression): string | null {
    const parsed = parseRecordIndexAccess(val, this.localConstants ?? [], this.propsParams)
    if (!parsed) return null
    const entries = parsed.entries.map(e => {
      const mapVal =
        e.value.kind === 'number' ? e.value.text : `'${escapeKolonSingleQuoted(e.value.text)}'`
      return `'${escapeKolonSingleQuoted(e.key)}' => ${mapVal}`
    })
    return `{ ${entries.join(', ')} }[$${parsed.indexPropName}]`
  }

  private convertExpressionToKolon(expr: string): string {
    // Parse-first lowering — parity with the Mojo adapter's
    // `convertExpressionToPerl`. Parse the JS expression once, gate it on the
    // shared `isSupported`, and render every supported shape through the AST
    // emitter. Unsupported shapes surface as BF101.
    const trimmed = expr.trim()
    if (trimmed === '') return "''"

    const parsed = parseExpression(trimmed)
    const support = isSupported(parsed)
    if (!support.supported) {
      this.errors.push({
        code: 'BF101',
        severity: 'error',
        message: `Expression not supported: ${trimmed}`,
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
    return emitParsedExpr(expr, new XslateTopLevelEmitter(this))
  }

  /** Whether `name` (a signal getter or prop) holds a string value, so an
   *  equality comparison against it should use Perl `eq`/`ne`. */
  _isStringValueName(name: string): boolean {
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
  _resolveLiteralConst(name: string): string | null {
    const c = (this.localConstants ?? []).find(lc => lc.name === name)
    if (c?.value === undefined) return null
    const v = c.value.trim()
    if (/^-?\d+(\.\d+)?$/.test(v)) return v
    const strLit = /^'([^'\\]*)'$/.exec(v) ?? /^"([^"\\]*)"$/.exec(v)
    if (strLit) return `'${strLit[1].replace(/[\\']/g, m => `\\${m}`)}'`
    return null
  }

  _resolveStaticRecordLiteral(objectName: string, key: string): string | null {
    const hit = lookupStaticRecordLiteral(objectName, key, this.localConstants)
    if (!hit) return null
    return hit.kind === 'number'
      ? hit.text
      : `'${hit.text.replace(/[\\']/g, m => `\\${m}`)}'`
  }

  _resolveModuleStringConst(name: string): string | null {
    // A loop body may bind `my $<param>` that shadows a module const of the
    // same name; never inline inside one (conservative — drop to `$name`).
    if (this.inLoop) return null
    const value = this.moduleStringConsts.get(name)
    if (value === undefined) return null
    return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
  }

  _recordExprBF101(message: string, reason?: string): void {
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
  _renderKolonFilterExprPublic(expr: ParsedExpr, param: string): string {
    return this.renderKolonFilterExpr(expr, param)
  }
}

// ===========================================================================
// ParsedExpr emitters
// ===========================================================================

/**
 * Lowering for `array-method` IR nodes — shared between the filter and
 * top-level emitters so the emitted Kolon form stays consistent regardless of
 * which context the chain lands in. The receiver/array helpers are the same
 * runtime methods the Mojo adapter calls, invoked as `$bf.NAME(...)` on the
 * Kolon `$bf` object instead of `bf->NAME`.
 *
 * Perl-native string ops the Mojo adapter inlines (`lc`, `uc`) have no Kolon
 * builtin, so they route through dedicated runtime helpers — but those
 * helpers aren't part of the validated v1 surface, so they're emitted as
 * `$bf.NAME(...)` calls consistent with the rest. Array methods whose Mojo
 * form relied on Perl `@{...}` deref (`join`) route through `$bf` helpers.
 */
function renderArrayMethod(
  method: ArrayMethod,
  object: ParsedExpr,
  args: ParsedExpr[],
  emit: (e: ParsedExpr) => string,
): string {
  switch (method) {
    case 'join': {
      // Route through the runtime (`$bf.join`) rather than Kolon's builtin
      // `.join`, so the JS-compat element handling (undef → empty, default
      // separator) is applied consistently — same reasoning as $bf.lc / etc.
      const obj = emit(object)
      const sep = args.length >= 1 ? emit(args[0]) : `','`
      return `$bf.join(${obj}, ${sep})`
    }
    case 'includes': {
      const obj = emit(object)
      const needle = emit(args[0])
      return `$bf.includes(${obj}, ${needle})`
    }
    case 'indexOf':
    case 'lastIndexOf': {
      const fn = method === 'indexOf' ? 'index_of' : 'last_index_of'
      const obj = emit(object)
      const needle = emit(args[0])
      return `$bf.${fn}(${obj}, ${needle})`
    }
    case 'at': {
      const obj = emit(object)
      const idx = args.length >= 1 ? emit(args[0]) : '0'
      return `$bf.at(${obj}, ${idx})`
    }
    case 'concat': {
      if (args.length === 0) {
        return emit(object)
      }
      const a = emit(object)
      const b = emit(args[0])
      return `$bf.concat(${a}, ${b})`
    }
    case 'slice': {
      const recv = emit(object)
      const start = args.length >= 1 ? emit(args[0]) : '0'
      // Kolon's undefined literal is `nil`, not Perl's `undef` — the
      // runtime `slice` treats it as "to end".
      const end = args.length >= 2 ? emit(args[1]) : 'nil'
      return `$bf.slice(${recv}, ${start}, ${end})`
    }
    case 'reverse':
    case 'toReversed': {
      const recv = emit(object)
      return `$bf.reverse(${recv})`
    }
    case 'toLowerCase': {
      // Kolon has no builtin string `lc` / `uc`, so these go through the
      // runtime object (consistent with $bf.includes / $bf.slice / etc.).
      const recv = emit(object)
      return `$bf.lc(${recv})`
    }
    case 'toUpperCase': {
      const recv = emit(object)
      return `$bf.uc(${recv})`
    }
    case 'trim': {
      const recv = emit(object)
      return `$bf.trim(${recv})`
    }
    case 'toFixed': {
      // `.toFixed(digits?)` — `$bf.to_fixed` mirrors JS rounding +
      // zero-padding (default 0 digits). #1897.
      const recv = emit(object)
      const digits = args.length >= 1 ? emit(args[0]) : '0'
      return `$bf.to_fixed(${recv}, ${digits})`
    }
    case 'split': {
      const recv = emit(object)
      if (args.length === 0) {
        return `$bf.split(${recv})`
      }
      const sep = emit(args[0])
      if (args.length === 1) {
        return `$bf.split(${recv}, ${sep})`
      }
      const limit = emit(args[1])
      return `$bf.split(${recv}, ${sep}, ${limit})`
    }
    case 'startsWith':
    case 'endsWith': {
      const fn = method === 'startsWith' ? 'starts_with' : 'ends_with'
      const recv = emit(object)
      const arg = emit(args[0])
      if (args.length >= 2) {
        return `$bf.${fn}(${recv}, ${arg}, ${emit(args[1])})`
      }
      return `$bf.${fn}(${recv}, ${arg})`
    }
    case 'replace': {
      const recv = emit(object)
      const oldS = emit(args[0])
      const newS = emit(args[1])
      return `$bf.replace(${recv}, ${oldS}, ${newS})`
    }
    case 'repeat': {
      const recv = emit(object)
      const count = args.length === 0 ? '0' : emit(args[0])
      return `$bf.repeat(${recv}, ${count})`
    }
    case 'padStart':
    case 'padEnd': {
      const fn = method === 'padStart' ? 'pad_start' : 'pad_end'
      const recv = emit(object)
      if (args.length === 0) {
        return `$bf.${fn}(${recv}, 0)`
      }
      const target = emit(args[0])
      if (args.length === 1) {
        return `$bf.${fn}(${recv}, ${target})`
      }
      const pad = emit(args[1])
      return `$bf.${fn}(${recv}, ${target}, ${pad})`
    }
    default: {
      // TS-level exhaustiveness guard.
      const _exhaustive: never = method
      throw new Error(
        `renderArrayMethod: unhandled ArrayMethod '${(_exhaustive as string)}'`,
      )
    }
  }
}

/**
 * Shared Kolon emit for `.sort(cmp)` / `.toSorted(cmp)`. Used by both the
 * filter-context emitter and the top-level emitter, plus the loop-array
 * wrap in `renderLoop`. The runtime `$bf.sort` accepts a hashref opts bag and
 * returns a fresh array ref.
 */
function renderSortMethod(recv: string, c: SortComparator): string {
  const keyHashes = c.keys.map((k) => {
    const keyEntry =
      k.key.kind === 'self'
        ? `key_kind => 'self'`
        : `key_kind => 'field', key => '${k.key.field}'`
    return `{ ${keyEntry}, compare_type => '${k.type}', direction => '${k.direction}' }`
  })
  return `$bf.sort(${recv}, { keys => [${keyHashes.join(', ')}] })`
}

/**
 * Render a `.reduce(fn, init)` arithmetic fold as a `$bf.reduce(...)` call.
 */
function renderReduceMethod(recv: string, op: ReduceOp, direction: 'left' | 'right'): string {
  const keyEntry =
    op.key.kind === 'self'
      ? `key_kind => 'self'`
      : `key_kind => 'field', key => '${op.key.field}'`
  const init =
    op.type === 'string'
      ? `'${op.init.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
      : op.init
  return `$bf.reduce(${recv}, { op => '${op.op}', ${keyEntry}, type => '${op.type}', init => ${init}, direction => '${direction}' })`
}

// `.flat(depth?)` → `$bf.flat($recv, $depth)`.
function renderFlatMethod(recv: string, depth: FlatDepth): string {
  const d = depth === 'infinity' ? -1 : depth
  return `$bf.flat(${recv}, ${d})`
}

// `.flatMap(...)` → `$bf.flat_map(...)` / `$bf.flat_map_tuple(...)`.
function renderFlatMapMethod(recv: string, op: FlatMapOp): string {
  const proj = op.projection
  if (proj.kind === 'tuple') {
    const specs = proj.elements
      .map(l => (l.kind === 'self' ? `['self', '']` : `['field', '${l.field}']`))
      .join(', ')
    return `$bf.flat_map_tuple(${recv}, ${specs})`
  }
  if (proj.kind === 'self') return `$bf.flat_map(${recv}, 'self', '')`
  return `$bf.flat_map(${recv}, 'field', '${proj.field}')`
}

/**
 * Parse a const initializer's source text. Returns the unescaped string value
 * when the whole initializer is a single pure string literal — single/double
 * quoted, or a no-substitution backtick template (no `${}`) — else `null`.
 * Only such a value can be inlined byte-for-byte; template literals with
 * interpolation, numbers, objects, and `Record<T,string>` maps are excluded.
 */
function parsePureStringLiteral(source: string): string | null {
  let s = source.trim()
  // Peel a single layer of wrapping parens.
  while (s.startsWith('(') && s.endsWith(')')) s = s.slice(1, -1).trim()
  const quote = s[0]
  if ((quote === "'" || quote === '"') && s[s.length - 1] === quote) {
    const body = s.slice(1, -1)
    // Reject if an unescaped matching quote appears inside (not a single
    // literal then).
    if (containsUnescaped(body, quote)) return null
    return unescapeStringLiteralBody(body)
  }
  if (quote === '`' && s[s.length - 1] === '`') {
    const body = s.slice(1, -1)
    if (body.includes('${')) return null
    if (containsUnescaped(body, '`')) return null
    return unescapeStringLiteralBody(body)
  }
  // `[<literals>].join(' ')` module consts (e.g. Switch's `trackStateClasses`)
  // → inline the flattened string byte-for-byte. See `evalStringArrayJoin`.
  return evalStringArrayJoin(source)
}

/** Whether `s` contains an unescaped occurrence of `ch`. */
function containsUnescaped(s: string, ch: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\') { i++; continue }
    if (s[i] === ch) return true
  }
  return false
}

/** Unescape a JS string-literal body's common escape sequences. */
function unescapeStringLiteralBody(s: string): string {
  return s.replace(/\\(.)/g, (_, c) => {
    switch (c) {
      case 'n': return '\n'
      case 'r': return '\r'
      case 't': return '\t'
      case '0': return '\0'
      default: return c
    }
  })
}


/** True when `type` is the `string` primitive. */
function isStringTypeInfo(type: TypeInfo | undefined): boolean {
  return type?.kind === 'primitive' && type.primitive === 'string'
}

/** True when `initialValue` is a bare string-literal expression. */
function isBareStringLiteral(initialValue: string | undefined): boolean {
  if (!initialValue) return false
  const v = initialValue.trim()
  return (v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))
}

/**
 * Whether a comparison operand is string-typed, so JS `===`/`!==` against it
 * must lower to Perl `eq`/`ne` instead of numeric `==`/`!=`.
 */
function isStringTypedOperand(expr: ParsedExpr, isStringName: (n: string) => boolean): boolean {
  if (expr.kind === 'literal' && expr.literalType === 'string') return true
  if (expr.kind === 'call' && expr.callee.kind === 'identifier' && expr.args.length === 0) {
    return isStringName(expr.callee.name)
  }
  if (expr.kind === 'member' && expr.object.kind === 'identifier' && expr.object.name === 'props') {
    return isStringName(expr.property)
  }
  return false
}

/**
 * Lowering for the predicate body of a filter / every / some / find, plus the
 * same shape used by `renderBlockBodyCondition` for complex block-body
 * filters. Higher-order predicates are emitted using Kolon's own scalar
 * comparison operators (which delegate to Perl semantics).
 *
 * NOTE: Kolon has no `grep { } @{...}` form, so nested higher-order chains
 * (`x.tags.filter(...).length`) inside a predicate route through the
 * top-level emitter's `$bf`-helper higher-order lowering. This emitter keeps
 * the scalar-comparison surface the predicates the adapter accepts actually
 * use; richer nested shapes fall back to the helper or surface as BF101 via
 * the top-level emitter.
 */
class XslateFilterEmitter implements ParsedExprEmitter {
  constructor(
    private readonly param: string,
    private readonly localVarMap: Map<string, string>,
    private readonly isStringName: (n: string) => boolean = () => false,
  ) {}

  identifier(name: string): string {
    if (name === this.param) return `$${this.param}`
    const signal = this.localVarMap.get(name)
    if (signal) return `$${signal}`
    return `$${name}`
  }

  literal(value: string | number | boolean | null, literalType: LiteralType): string {
    if (literalType === 'string') return `'${value}'`
    if (literalType === 'boolean') return value ? '1' : '0'
    if (literalType === 'null') return 'nil'
    return String(value)
  }

  member(object: ParsedExpr, property: string, _computed: boolean, emit: (e: ParsedExpr) => string): string {
    // `.length` — route through `$bf.length` (handles both array element
    // count and string char count, JS-compatibly). Kolon's builtin `.size()`
    // is array-only and faults on a string.
    if (property === 'length') {
      return `$bf.length(${emit(object)})`
    }
    // Hash field access — Kolon dot works on hash refs.
    return `${emit(object)}.${property}`
  }

  indexAccess(object: ParsedExpr, index: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    // Kolon's `[]` postfix is polymorphic (array index or hash key),
    // mirroring JS — no array/hash split is needed (unlike Perl's
    // `->[]` vs `->{}`). #1897 (data-table's `selected()[index]`).
    return `${emit(object)}[${emit(index)}]`
  }

  call(callee: ParsedExpr, args: ParsedExpr[], emit: (e: ParsedExpr) => string): string {
    // Signal getter calls: filter() → $filter
    if (callee.kind === 'identifier' && args.length === 0) {
      return `$${callee.name}`
    }
    return emit(callee)
  }

  unary(op: string, argument: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    const arg = emit(argument)
    if (op === '!') {
      const needsParens = argument.kind === 'binary' || argument.kind === 'logical'
      return needsParens ? `!(${arg})` : `!${arg}`
    }
    if (op === '-') return `-${arg}`
    return arg
  }

  binary(op: string, left: ParsedExpr, right: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    const l = emit(left)
    const r = emit(right)
    // Kolon's `==` / `!=` are value-equality operators that compare strings
    // and numbers correctly — unlike Perl's numeric `==` (which the Mojo
    // adapter must steer around with `eq`/`ne`). Kolon has no `eq`/`ne`
    // operator at all, so string comparisons stay on `==` / `!=` here.
    const opMap: Record<string, string> = {
      '===': '==', '!==': '!=', '>': '>', '<': '<', '>=': '>=', '<=': '<=',
      '+': '+', '-': '-', '*': '*', '/': '/',
    }
    return `${l} ${opMap[op] ?? op} ${r}`
  }

  logical(op: '&&' | '||' | '??', left: ParsedExpr, right: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    const l = emit(left)
    const r = emit(right)
    if (op === '&&') return `(${l} && ${r})`
    if (op === '||') return `(${l} || ${r})`
    return `(${l} // ${r})`
  }

  higherOrder(
    method: HigherOrderMethod,
    object: ParsedExpr,
    param: string,
    predicate: ParsedExpr,
    emit: (e: ParsedExpr) => string,
  ): string {
    // Nested higher-order inside a filter predicate has no Kolon scalar form;
    // defer to the receiver so the predicate at least references a real value
    // (a richer chain would surface its own diagnostic at the top level).
    void method
    void param
    void predicate
    return emit(object)
  }

  arrayLiteral(elements: ParsedExpr[], emit: (e: ParsedExpr) => string): string {
    return `[${elements.map(emit).join(', ')}]`
  }

  arrayMethod(
    method: ArrayMethod,
    object: ParsedExpr,
    args: ParsedExpr[],
    emit: (e: ParsedExpr) => string,
  ): string {
    return renderArrayMethod(method, object, args, emit)
  }

  sortMethod(
    _method: 'sort' | 'toSorted',
    object: ParsedExpr,
    comparator: SortComparator,
    emit: (e: ParsedExpr) => string,
  ): string {
    return renderSortMethod(emit(object), comparator)
  }

  reduceMethod(method: 'reduce' | 'reduceRight', object: ParsedExpr, reduceOp: ReduceOp, emit: (e: ParsedExpr) => string): string {
    return renderReduceMethod(emit(object), reduceOp, method === 'reduceRight' ? 'right' : 'left')
  }

  flatMethod(object: ParsedExpr, depth: FlatDepth, emit: (e: ParsedExpr) => string): string {
    return renderFlatMethod(emit(object), depth)
  }

  flatMapMethod(object: ParsedExpr, op: FlatMapOp, emit: (e: ParsedExpr) => string): string {
    return renderFlatMapMethod(emit(object), op)
  }

  conditional(_test: ParsedExpr, _consequent: ParsedExpr, _alternate: ParsedExpr): string {
    return '1'
  }

  templateLiteral(_parts: TemplatePart[]): string {
    return '1'
  }

  arrowFn(_param: string, _body: ParsedExpr): string {
    return '1'
  }

  unsupported(_raw: string, _reason: string): string {
    return '1'
  }
}

/**
 * Lowering for top-level expressions whose identifiers resolve against the
 * Kolon template's per-render vars (signals, props, locals introduced by `:
 * my $x = ...` lines). Differs from the filter emitter mainly in
 *   - `.length` → `.size()` (Kolon array length),
 *   - `conditional` is supported (filter predicates can't return ternaries),
 *   - higher-order methods route through `$bf` array helpers.
 */
class XslateTopLevelEmitter implements ParsedExprEmitter {
  constructor(private readonly adapter: XslateAdapter) {}

  identifier(name: string): string {
    // `undefined` / `null` nested inside a larger expression tree —
    // Kolon `nil` (#1897).
    if (name === 'undefined' || name === 'null') return 'nil'
    // Inline a module-scope pure-string const (`const x = 'literal'`) — it
    // never reaches the per-render stash, so a bare `$x` would render empty.
    const inlined = this.adapter._resolveModuleStringConst(name)
    if (inlined !== null) return inlined
    // Same for a literal const of any scope (`const totalPages = 5`,
    // #1897 pagination's `Page {currentPage()} of {totalPages}`).
    const literalConst = this.adapter._resolveLiteralConst(name)
    if (literalConst !== null) return literalConst
    return `$${name}`
  }

  literal(value: string | number | boolean | null, literalType: LiteralType): string {
    if (literalType === 'string') return `'${value}'`
    if (literalType === 'boolean') return value ? '1' : '0'
    if (literalType === 'null') return 'nil'
    return String(value)
  }

  member(object: ParsedExpr, property: string, _computed: boolean, emit: (e: ParsedExpr) => string): string {
    // `props.x` flattens to the bare `$x` the SSR caller binds each prop to
    // (props arrive as individual top-level vars, not a `$props` hashref).
    if (object.kind === 'identifier' && object.name === 'props') {
      return `$${property}`
    }
    // Static property access on a module object-literal const
    // (`variantClasses.ghost`, #1897) resolves at compile time — the
    // generic dot lowering below would reference a Kolon var that
    // doesn't exist server-side and silently render ''.
    if (object.kind === 'identifier') {
      const staticValue = this.adapter._resolveStaticRecordLiteral(object.name, property)
      if (staticValue !== null) return staticValue
    }
    const obj = emit(object)
    // `.length` → `$bf.length` (array count or string char count, JS-compat);
    // Kolon's builtin `.size()` is array-only and faults on a string.
    if (property === 'length') return `$bf.length(${obj})`
    // Kolon dot access works for hash refs.
    return `${obj}.${property}`
  }

  indexAccess(object: ParsedExpr, index: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    // Kolon's `[]` postfix is polymorphic (array index or hash key),
    // mirroring JS. #1897 (data-table's `selected()[index]`).
    return `${emit(object)}[${emit(index)}]`
  }

  call(callee: ParsedExpr, args: ParsedExpr[], emit: (e: ParsedExpr) => string): string {
    // Signal getter: count() → $count
    if (callee.kind === 'identifier' && args.length === 0) {
      return `$${callee.name}`
    }
    // Env-signal method call (#1922): `searchParams().get('sort')` is a real
    // method call on the per-request `$searchParams` reader object, not the
    // generic dot deref `member` would emit (`$searchParams.get`, which drops
    // the arg). Matches the local import binding (incl. an alias).
    if (this.adapter._searchParamsLocals.size > 0) {
      const sp = matchSearchParamsMethodCall(callee, args, this.adapter._searchParamsLocals)
      if (sp) {
        return `$searchParams.${sp.method}(${sp.args.map(emit).join(', ')})`
      }
    }
    // Identifier-path templatePrimitive: `JSON.stringify(x)` / `Math.floor(x)`
    // → `$bf.json($x)` / `$bf.floor($x)`. Args render recursively through this
    // same emitter. A wrong-arity call records BF101 and returns `''`.
    const path = identifierPath(callee)
    const spec = path ? XSLATE_TEMPLATE_PRIMITIVES[path] : undefined
    if (path && spec) {
      if (args.length === spec.arity) {
        return spec.emit(args.map(emit))
      }
      this.adapter._recordExprBF101(
        `templatePrimitive '${path}' expects ${spec.arity} arg(s), got ${args.length}`,
        `Call '${path}' with exactly ${spec.arity} argument(s).`,
      )
      return "''"
    }
    return emit(callee)
  }

  unary(op: string, argument: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    const arg = emit(argument)
    if (op === '!') return `!${arg}`
    if (op === '-') return `-${arg}`
    return arg
  }

  binary(op: string, left: ParsedExpr, right: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    const l = emit(left)
    const r = emit(right)
    // Kolon's `==` / `!=` are value-equality operators handling both strings
    // and numbers (unlike Perl's numeric `==`, which the Mojo adapter must
    // route around with `eq`/`ne`). Kolon has no `eq`/`ne` operator, so all
    // equality comparisons — string or numeric — stay on `==` / `!=`.
    const opMap: Record<string, string> = {
      '===': '==', '!==': '!=', '>': '>', '<': '<', '>=': '>=', '<=': '<=',
      '+': '+', '-': '-', '*': '*',
    }
    return `${l} ${opMap[op] ?? op} ${r}`
  }

  logical(op: '&&' | '||' | '??', left: ParsedExpr, right: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    const l = emit(left)
    const r = emit(right)
    if (op === '&&') return `(${l} && ${r})`
    if (op === '||') return `(${l} || ${r})`
    return `(${l} // ${r})`
  }

  higherOrder(
    method: HigherOrderMethod,
    object: ParsedExpr,
    param: string,
    predicate: ParsedExpr,
    emit: (e: ParsedExpr) => string,
  ): string {
    // Higher-order array methods all take a JS arrow predicate, lowered to a
    // Kolon lambda `-> $param { PRED }` (callable from Perl as a code ref), and
    // go through the runtime object — consistent with the other array helpers
    // ($bf.includes / $bf.slice / ...). `.find*` map to snake_case runtime
    // methods (like index_of / last_index_of). The `.filter(...).map(...)`
    // *loop* form is handled separately by renderLoop's inline predicate.
    const arrayExpr = emit(object)
    const predBody = this.adapter._renderKolonFilterExprPublic(predicate, param)
    const lambda = `-> $${param} { ${predBody} }`
    const fn: Record<string, string> = {
      filter: 'filter',
      every: 'every',
      some: 'some',
      find: 'find',
      findIndex: 'find_index',
      findLast: 'find_last',
      findLastIndex: 'find_last_index',
    }
    if (fn[method]) return `$bf.${fn[method]}(${arrayExpr}, ${lambda})`
    void predicate
    void param
    return emit(object)
  }

  arrayLiteral(elements: ParsedExpr[], emit: (e: ParsedExpr) => string): string {
    return `[${elements.map(emit).join(', ')}]`
  }

  arrayMethod(
    method: ArrayMethod,
    object: ParsedExpr,
    args: ParsedExpr[],
    emit: (e: ParsedExpr) => string,
  ): string {
    return renderArrayMethod(method, object, args, emit)
  }

  sortMethod(
    _method: 'sort' | 'toSorted',
    object: ParsedExpr,
    comparator: SortComparator,
    emit: (e: ParsedExpr) => string,
  ): string {
    return renderSortMethod(emit(object), comparator)
  }

  reduceMethod(method: 'reduce' | 'reduceRight', object: ParsedExpr, reduceOp: ReduceOp, emit: (e: ParsedExpr) => string): string {
    return renderReduceMethod(emit(object), reduceOp, method === 'reduceRight' ? 'right' : 'left')
  }

  flatMethod(object: ParsedExpr, depth: FlatDepth, emit: (e: ParsedExpr) => string): string {
    return renderFlatMethod(emit(object), depth)
  }

  flatMapMethod(object: ParsedExpr, op: FlatMapOp, emit: (e: ParsedExpr) => string): string {
    return renderFlatMapMethod(emit(object), op)
  }

  conditional(
    test: ParsedExpr,
    consequent: ParsedExpr,
    alternate: ParsedExpr,
    emit: (e: ParsedExpr) => string,
  ): string {
    return `(${emit(test)} ? ${emit(consequent)} : ${emit(alternate)})`
  }

  templateLiteral(parts: TemplatePart[], emit: (e: ParsedExpr) => string): string {
    // `` `n=${count() + 1}` `` → Kolon string concatenation (`~`):
    // `'n=' ~ ($count + 1)`. Kolon's `~` is the explicit concat operator.
    const terms: string[] = []
    for (const part of parts) {
      if (part.type === 'string') {
        if (part.value !== '') {
          terms.push(`'${part.value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`)
        }
      } else {
        const rendered = emit(part.expr)
        const needsParens =
          part.expr.kind === 'binary' ||
          part.expr.kind === 'logical' ||
          part.expr.kind === 'conditional'
        terms.push(needsParens ? `(${rendered})` : rendered)
      }
    }
    if (terms.length === 0) return `''`
    return terms.join(' ~ ')
  }

  arrowFn(_param: string, _body: ParsedExpr): string {
    return "''"
  }

  unsupported(_raw: string, _reason: string): string {
    return "''"
  }
}

export const xslateAdapter = new XslateAdapter()

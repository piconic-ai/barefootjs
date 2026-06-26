/**
 * BarefootJS Mojolicious EP Template Adapter
 *
 * Generates Mojolicious EP template files (.html.ep) from BarefootJS IR.
 */

import ts from 'typescript'
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
  type ParsedExprEmitter,
  type HigherOrderMethod,
  type ArrayMethod,
  type LiteralType,
  type IRNodeEmitter,
  type EmitIRNode,
  type AttrValueEmitter,
  isBooleanAttr,
  parseExpression,
  parseStyleObjectEntries,
  isSupported,
  exprToString,
  parseProviderObjectLiteral,
  identifierPath,
  emitParsedExpr,
  emitIRNode,
  emitAttrValue,
  augmentInheritedPropAccesses,
  parseRecordIndexAccess,
  evalStringArrayJoin,
  extractArrowBodyExpression,
  collectContextConsumers,
  isLowerableObjectRestDestructure,
  type ContextConsumer,
  collectModuleStringConsts,
  lookupStaticRecordLiteral,
  searchParamsLocalNames,
  matchSearchParamsMethodCall
} from '@barefootjs/jsx'
import { isAriaBooleanAttr, isBooleanResultExpr } from './boolean-result.ts'

/**
 * Mojo adapter's IRNode render context. Mojo's lowering currently
 * doesn't consume any render-position flags (`isRootOfClientComponent`
 * is handled differently here than in Hono/Go), so the Ctx is empty.
 * Kept as a named alias so future flags can extend it without changing
 * the `IRNodeEmitter` interface.
 */
type MojoRenderCtx = Record<string, never>
import type { ParsedExpr, ObjectLiteralProperty, ParsedStatement, SortComparator, ReduceOp, FlatDepth, FlatMapOp, TemplatePart } from '@barefootjs/jsx'
import { BF_SLOT, BF_COND, BF_REGION } from '@barefootjs/shared'

interface PrimitiveSpec {
  arity: number
  emit: (args: string[]) => string
}

/**
 * Single source of truth for the Mojolicious adapter's
 * template-primitive surface. Each entry pairs the expected arity
 * with the emit function. Adding / removing a primitive is a
 * one-line change.
 *
 * The emit fn returns a Perl expression (no surrounding `<%= %>`)
 * suitable for embedding inside the Mojo template action —
 * `bf->json($val)`, `bf->floor($val)`, etc. Args arrive already
 * Perl-rendered via `convertExpressionToPerl` recursion, so a
 * caller passing `props.config` reaches the emit fn as `$config`.
 */
const MOJO_TEMPLATE_PRIMITIVES: Record<string, PrimitiveSpec> = {
  'JSON.stringify': { arity: 1, emit: (args) => `bf->json(${args[0]})` },
  'String':         { arity: 1, emit: (args) => `bf->string(${args[0]})` },
  'Number':         { arity: 1, emit: (args) => `bf->number(${args[0]})` },
  'Math.floor':     { arity: 1, emit: (args) => `bf->floor(${args[0]})` },
  'Math.ceil':      { arity: 1, emit: (args) => `bf->ceil(${args[0]})` },
  'Math.round':     { arity: 1, emit: (args) => `bf->round(${args[0]})` },
}

/**
 * Module-scope `templatePrimitives` map derived once from the spec
 * record. Per-instance derivation would re-build the same Map on
 * every `new MojoAdapter()` call.
 */
const MOJO_PRIMITIVE_EMIT_MAP: Record<string, (args: string[]) => string> =
  Object.fromEntries(
    Object.entries(MOJO_TEMPLATE_PRIMITIVES).map(([k, v]) => [k, v.emit])
  )

/**
 * Find the `children` prop's `jsx-children` payload (#1326). Narrowed
 * via the AttrValue `kind` discriminator so adapter code stays type-
 * safe if the IR shape evolves — adding a new AttrValue variant or
 * renaming `children` to `jsxChildren` becomes a TS compile error
 * here instead of silently dropping the children at runtime.
 */
function resolveJsxChildrenProp(props: readonly IRProp[]): IRNode[] {
  const prop = props.find(p => p.name === 'children')
  if (!prop) return []
  if (prop.value.kind !== 'jsx-children') return []
  return prop.value.children
}

export interface MojoAdapterOptions {
  /** Base path for client JS files (default: '/static/components/') */
  clientJsBasePath?: string

  /** Path to barefoot.js runtime (default: '/static/components/barefoot.js') */
  barefootJsPath?: string
}

/**
 * Parse a const initializer's source text. Returns the unescaped string
 * value when the whole initializer is a single string literal (or a
 * no-substitution template literal), else `null`. Uses the TS parser so
 * escapes/quotes resolve exactly as JS would, matching the value the Hono
 * reference inlines at runtime.
 */
function parsePureStringLiteral(source: string): string | null {
  const sf = ts.createSourceFile(
    '__const.ts',
    `const __x = (${source});`,
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ false,
  )
  const stmt = sf.statements[0]
  if (!stmt || !ts.isVariableStatement(stmt)) return null
  const decl = stmt.declarationList.declarations[0]
  let init = decl?.initializer
  while (init && ts.isParenthesizedExpression(init)) init = init.expression
  if (!init) return null
  if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) {
    return init.text
  }
  // `[<literals>].join(' ')` module consts (e.g. Switch's `trackStateClasses`)
  // → inline the flattened string byte-for-byte. See `evalStringArrayJoin`.
  return evalStringArrayJoin(source)
}

/**
 * (#checkbox) Quote a `render_child` named-arg / hashref key when it isn't a
 * bare Perl identifier. A JSX attribute name like `data-slot` would otherwise
 * emit `data-slot => '...'`, which Perl parses as the subtraction
 * `data - slot`. Identifier-safe names (`className`, `size`, `_bf_slot`) pass
 * through unquoted to keep the generated template readable.
 */
function perlHashKey(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `'${name.replace(/'/g, "\\'")}'`
}

/**
 * Collect the component's root scope element node(s) — the elements that
 * become the rendered root and so carry `data-key` for a keyed loop item. A
 * plain element root is itself; an `if-statement` (early-return) root
 * contributes the top element of each branch (`consequent` + the `alternate`
 * chain), since exactly one branch renders at runtime. Non-element branch
 * tops (fragments / nested shapes) are walked one level so an
 * `if (…) return <A/>` still resolves to `<A>`. (#1297)
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
 * True when every `$var` the lowered (Perl / Kolon) expression references is
 * in the available set — i.e. the template already has that var in scope.
 * Guards in-template memo seeding from referencing an out-of-scope binding
 * (which would trip Perl strict mode). (#1297)
 */
function referencedVarsAreAvailable(expr: string, available: ReadonlySet<string>): boolean {
  for (const m of expr.matchAll(/\$([A-Za-z_]\w*)/g)) {
    if (!available.has(m[1])) return false
  }
  return true
}

export class MojoAdapter extends BaseAdapter implements IRNodeEmitter<MojoRenderCtx> {
  name = 'mojolicious'
  extension = '.html.ep'
  templatesPerComponent = true
  // Template-string target with no component layer: `bf build` emits a static
  // `barefoot-importmap.html` to `%= include` into the page <head> (#1644).
  importMapInjection = 'html-snippet' as const

  /**
   * Identifier-path callees the Mojo runtime can render in template
   * scope. The relocate pass consults this map to mark matching
   * calls as template-safe so the surrounding expression stays
   * inlinable; the SSR template emitter substitutes the JS call
   * with the registered Perl helper invocation.
   *
   * The per-callee arity is read directly off `MOJO_TEMPLATE_PRIMITIVES`
   * at substitution time, so this exposed shape stays as the
   * `TemplateAdapter` interface expects (`emit`-only) without
   * carrying a parallel arity map.
   */
  templatePrimitives: TemplatePrimitiveRegistry = MOJO_PRIMITIVE_EMIT_MAP

  private componentName: string = ''
  /** The component's root scope element(s) — each carries `data-key` for a
   *  keyed loop item (set by the child renderer from the JSX `key` prop). A
   *  plain element root is a single node; an `if-statement` (early-return) root
   *  contributes the top element of every branch, since any one of them can be
   *  the rendered root at runtime. */
  private rootScopeNodes: Set<IRNode> = new Set()
  private options: Required<MojoAdapterOptions>
  private errors: CompilerError[] = []
  private inLoop: boolean = false
  /**
   * SolidJS-style props identifier (`function(props: P)`) and the
   * analyzer-extracted prop names. Stashed at `generate()` entry so
   * the per-attribute `emitSpread` callback can build a propsObject
   * spread bag as an inline Perl hashref literal without re-walking
   * the IR (#1407 follow-up).
   */
  private propsObjectName: string | null = null
  private propsParams: { name: string }[] = []
  private booleanTypedProps: Set<string> = new Set()
  /**
   * (#1971) Names that resolve to a real SSR template var — prop param, signal
   * getter, or memo. A `<Ctx.Provider value>` member referencing a name NOT in
   * this set is a client-only function (a local handler const like `scrollPrev`
   * or a signal setter like `setCanScrollPrev`) with no SSR value: it would
   * emit an undeclared `$var`, so it's lowered to `undef` instead.
   */
  private providerDataNames: Set<string> = new Set()
  /**
   * Names (signal getters + props) whose value is a string, so `===`/`!==`
   * against them lowers to Perl `eq`/`ne` rather than numeric `==`/`!=`.
   * Perl's numeric `==` coerces non-numeric strings to 0, making `"b" == "a"`
   * true — selecting the string operator from the operand's type avoids that.
   */
  private stringValueNames: Set<string> = new Set()
  /**
   * (#1922) Local binding names the request-scoped `searchParams()` env signal
   * is imported under (handles `import { searchParams as sp }`). When non-empty
   * the emitter lowers a `<binding>().get(k)` call to a real method call on the
   * per-request `$searchParams` reader (`$searchParams->get('sort')`) instead of
   * the generic hash deref. Set at `generate()` entry from `ir.metadata.imports`;
   * read by the top-level ParsedExpr emitter.
   */
  _searchParamsLocals: Set<string> = new Set()
  /**
   * Module-scope pure string-literal constants (`const X = 'literal'` at
   * file top-level), keyed by name → resolved literal value. Populated at
   * `generate()` entry from `ir.metadata.localConstants`. When an identifier
   * in an expression resolves to one of these, the adapter inlines the
   * literal instead of emitting `$X` against a stash variable that is never
   * bound (a module const isn't a prop, signal, or local — the value would
   * render empty). Hono inlines it for free; this restores parity. Only
   * module-scope pure string literals qualify (see `collectModuleStringConsts`).
   */
  private moduleStringConsts: Map<string, string> = new Map()
  /**
   * Full local-constant metadata from the entry IR, kept so spread
   * lowering can resolve a bare-identifier spread (`{...sizeAttrs}`) to
   * its initializer text and a `Record[propKey]` spread value to the
   * module-const object literal it indexes (#checkbox / icon). Populated
   * at `generate()` entry alongside `moduleStringConsts`.
   */
  private localConstants: IRMetadata['localConstants'] = []
  /**
   * Names currently bound by an enclosing loop body — the `my $<param>` and
   * `my $<index>` bindings `renderLoop` introduces — ref-counted so nested
   * loops compose. `resolveModuleStringConst` consults this so a loop
   * variable whose name happens to match a module string const is NOT
   * inlined as the const literal (mirrors the Go adapter's loop-param /
   * loop-var shadowing guards). (#1749 review)
   */
  private loopBoundNames: Map<string, number> = new Map()
  /**
   * Prop names whose value is `undef` in the template body when the caller
   * omits them — so a bare-reference attribute should be dropped rather
   * than rendered as `attr=""`. The actual population criterion (see
   * `generate()`) is: NO destructure default (`defaultValue === undefined`)
   * AND non-rest (`!isRest`) AND non-primitive type (`type.kind !==
   * 'primitive'`). It deliberately does NOT consult `p.optional`: the
   * analyzer derives `optional` from the presence of a default initializer,
   * not the `?` token, so it's not the right witness here. Excluding
   * concrete primitives (`string`/`number`/`boolean`) mirrors the Go
   * adapter's scope, which guards only `interface{}` (nillable) fields.
   * Used by `elementAttrEmitter.emitExpression` to guard such an attribute
   * with a Perl `defined $x` check (`<textarea>` omits `rows`), matching
   * Hono's nullish-attribute omission. Concrete/defaulted props are
   * excluded and always emit unconditionally.
   */
  private nullableOptionalProps: Set<string> = new Set()

  constructor(options: MojoAdapterOptions = {}) {
    super()
    this.options = {
      clientJsBasePath: options.clientJsBasePath ?? '/static/components/',
      barefootJsPath: options.barefootJsPath ?? '/static/components/barefoot.js',
    }
  }

  generate(ir: ComponentIR, options?: AdapterGenerateOptions): AdapterOutput {
    this.componentName = ir.metadata.componentName
    this.propsObjectName = ir.metadata.propsObjectName ?? null
    // (#checkbox) Enumerate inherited-attribute accesses for the props-object
    // pattern (`function Checkbox(props: CheckboxProps)`) before deriving
    // `nullableOptionalProps`, so a bare optional attribute like
    // `id={props.id}` gets the Perl `defined`-guard (Hono-style omission).
    // Shared with the Go adapter (single source of truth in `@barefootjs/jsx`).
    // The harness separately declares the matching stash vars (Pass-1 IR
    // serialization happens before `generate`, so this mutation doesn't reach it).
    augmentInheritedPropAccesses(ir)
    this.propsParams = ir.metadata.propsParams.map(p => ({ name: p.name }))
    // (#1971) SSR-resolvable context-value names: props, signal getters, memos.
    this.providerDataNames = new Set<string>([
      ...ir.metadata.propsParams.map(p => p.name),
      ...(ir.metadata.signals ?? []).map(s => s.getter),
      ...(ir.metadata.memos ?? []).map(m => m.name),
    ])
    // Props whose declared TS type is boolean — a bare binding of one
    // (`data-active={props.isActive}`) must stringify as JS
    // `String(boolean)` ("true"/"false"), not Perl's native `1`/`''`
    // (#1897, pagination's data-active).
    this.booleanTypedProps = new Set(
      ir.metadata.propsParams
        .filter(prop => prop.type?.primitive === 'boolean' || prop.type?.raw === 'boolean')
        .map(prop => prop.name),
    )
    // No-destructure-default props → `undef` when the caller omits them
    // → guard their bare-reference attribute emission with Perl `defined`
    // so the attribute drops instead of rendering `attr=""` (Hono-style
    // nullish omission). A prop WITH a destructure default (`value = ''`)
    // is never `undef` in the body and must stay unconditional, so it is
    // excluded. This mirrors the Go adapter's nillable-field guard: there
    // the witness is the resolved `interface{}` field type; here it is
    // the absence of a default (the analyzer reports `rows` — a
    // `TextareaHTMLAttributes` member destructured without a default — as
    // no-default, `type.kind: 'unknown'`).
    // Excludes concrete-primitive types (`string`/`number`/`boolean`)
    // to match the Go adapter's scope, which guards only `interface{}`
    // (nillable) fields and leaves concrete fields unconditional. So a
    // required, no-default `string` prop still emits `attr=""` like Hono,
    // and only nillable (`unknown`/object/array) no-default props guard.
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
    // them lower to `eq`/`ne` (#1672). A signal is string-typed when its
    // inferred type is `string` (the analyzer infers this from a string-literal
    // initial value) or, defensively, when its initial value is a bare string
    // literal; a prop when its annotated type is `string`.
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
    this.localConstants = ir.metadata.localConstants ?? []
    this.loopBoundNames.clear()
    this.errors = []
    this.childrenCaptureCounter = 0

    // Mirror of the Go adapter's BF103 check (#1266): when a child
    // component referenced inside a loop body is imported from a
    // sibling .tsx, the Mojo adapter emits a `<%== bf->render(...)
    // %>`-style cross-template call that resolves only if the user
    // has compiled the sibling file and registered the resulting
    // template alongside the parent. When that doesn't happen the
    // failure is silent at build time and surfaces at request time —
    // surface it loudly here so the user can act on it. Suppressed
    // when the caller (e.g. the barefoot CLI) guarantees that all
    // sibling templates are registered on the same template instance
    // at render time.
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
    // from the active provider value (or the `createContext` default) so the
    // body's `$x` resolves. The provider side pushes the value via
    // `emitProvider`; here the consumer reads it. (#1297)
    const ctxSeed = this.generateContextConsumerSeed(ir)

    // Prop/signal-derived memos that aren't statically evaluable (e.g.
    // `createMemo(() => props.value * 10)`) have a `null` SSR default, so
    // their `$x` would render empty. Compute them in-template from the
    // already-seeded prop/signal vars — mirroring Go's generated child
    // constructor that evaluates the memo from the passed prop. (#1297)
    const memoSeed = this.generateDerivedMemoSeed(ir)

    const template = `${scriptReg}${ctxSeed}${memoSeed}${templateBody}\n`

    // Merge collected errors into IR errors
    if (this.errors.length > 0) {
      ir.errors.push(...this.errors)
    }

    // Mojo templates have no JS-style imports / types / default-export sections.
    // The `templatesPerComponent` mode emits one file per component using the
    // raw `template` value; sections are populated for contract uniformity so
    // the compiler never has to fall back to string-parsing the template.
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
   * Resolve an identifier to its inlined Perl single-quoted string literal
   * when it names a module pure-string const, else `null` (the caller then
   * falls back to its normal `$name` stash lowering). Returns the Perl
   * literal form `'<escaped>'` ready to drop into an expression.
   */
  /**
   * Resolve `IDENT.key` over a module object-literal const to its Perl
   * literal (`variantClasses.ghost` in a class template literal —
   * #1897). Same compile-time inlining family as
   * `resolveModuleStringConst`; returns `null` for any non-static shape.
   */
  /**
   * Whether `expr` is a bare reference to a boolean-TYPED prop
   * (`props.isActive` / destructured `isActive`) — used to route the
   * binding through `bool_str` even though the expression itself is
   * structurally opaque (#1897).
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
   * Parse `cond ? value : undefined` (or `: null`), returning the
   * condition/consequent source spans, else `null`. Used for the
   * attribute-omission rule (#1897); mirrors the Xslate adapter.
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
   * quoted string literal (`const totalPages = 5`, #1897 pagination) —
   * function-scope consts never reach the per-render stash, so a bare
   * `$totalPages` faults under strict mode.
   */
  resolveLiteralConst(name: string): string | null {
    if (this.loopBoundNames?.has?.(name)) return null
    const c = (this.localConstants ?? []).find(lc => lc.name === name)
    if (c?.value === undefined) return null
    const v = c.value.trim()
    if (/^-?\d+(\.\d+)?$/.test(v)) return v
    const strLit = /^'([^'\\]*)'$/.exec(v) ?? /^"([^"\\]*)"$/.exec(v)
    if (strLit) return `'${strLit[1].replace(/[\\']/g, m => `\\${m}`)}'`
    return null
  }

  resolveStaticRecordLiteral(objectName: string, key: string): string | null {
    if (this.loopBoundNames?.has?.(objectName)) return null
    const hit = lookupStaticRecordLiteral(objectName, key, this.localConstants)
    if (!hit) return null
    return hit.kind === 'number'
      ? hit.text
      : `'${hit.text.replace(/[\\']/g, m => `\\${m}`)}'`
  }

  resolveModuleStringConst(name: string): string | null {
    // A loop body introduces `my $<param>` / `my $<index>` bindings that
    // shadow a module const of the same name — never inline inside one.
    if (this.loopBoundNames.has(name)) return null
    const value = this.moduleStringConsts.get(name)
    if (value === undefined) return null
    return `'${value.replace(/[\\']/g, m => `\\${m}`)}'`
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

    const lines: string[] = []
    lines.push(`% bf->register_script('${runtimePath}');`)
    lines.push(`% bf->register_script('${clientJsPath}');`)
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
   * `IRNodeEmitter` dispatcher (#1290 step 1); per-kind logic lives in
   * the `IRNodeEmitter` methods below.
   */
  renderNode(node: IRNode): string {
    return emitIRNode<MojoRenderCtx>(node, this, {} as MojoRenderCtx)
  }

  // ===========================================================================
  // IRNodeEmitter implementation (Mojo / Perl)
  // ===========================================================================

  emitElement(node: IRElement, _ctx: MojoRenderCtx, _emit: EmitIRNode<MojoRenderCtx>): string {
    return this.renderElement(node)
  }

  emitText(node: IRText): string {
    return node.value
  }

  emitExpression(node: IRExpression): string {
    return this.renderExpression(node)
  }

  emitConditional(node: IRConditional, _ctx: MojoRenderCtx, _emit: EmitIRNode<MojoRenderCtx>): string {
    return this.renderConditional(node)
  }

  emitLoop(node: IRLoop, _ctx: MojoRenderCtx, _emit: EmitIRNode<MojoRenderCtx>): string {
    return this.renderLoop(node)
  }

  emitComponent(node: IRComponent, _ctx: MojoRenderCtx, _emit: EmitIRNode<MojoRenderCtx>): string {
    return this.renderComponent(node)
  }

  emitFragment(node: IRFragment, _ctx: MojoRenderCtx, _emit: EmitIRNode<MojoRenderCtx>): string {
    return this.renderFragment(node)
  }

  emitSlot(node: IRSlot): string {
    return this.renderSlot(node)
  }

  emitIfStatement(node: IRIfStatement, _ctx: MojoRenderCtx, _emit: EmitIRNode<MojoRenderCtx>): string {
    return this.renderIfStatement(node)
  }

  emitProvider(node: IRProvider, _ctx: MojoRenderCtx, _emit: EmitIRNode<MojoRenderCtx>): string {
    // SSR context propagation (#1297): push the provider value onto the
    // shared controller-stash context stack, render the children (descendant
    // `useContext` consumers read it via `bf->use_context`), then pop. The
    // push/pop bracket the children in the same render so the value scopes
    // exactly to the subtree — mirroring the client `provideContext`.
    const value = this.providerValuePerl(node.valueProp)
    const children = this.renderChildren(node.children)
    const name = node.contextName
    return (
      `<% bf->provide_context('${name}', ${value}); %>` +
      children +
      `<% bf->revoke_context('${name}'); %>`
    )
  }

  /** Lower a `<Ctx.Provider value>` value prop to a Perl expression. */
  private providerValuePerl(valueProp: IRProvider['valueProp']): string {
    const v = valueProp.value
    if (v.kind === 'literal') {
      return typeof v.value === 'string'
        ? `'${v.value.replace(/[\\']/g, m => `\\${m}`)}'`
        : String(v.value)
    }
    if (v.kind === 'expression') {
      const hashref = this.providerObjectLiteralPerl(v.expr)
      if (hashref !== null) return hashref
      return this.convertExpressionToPerl(v.expr)
    }
    if (v.kind === 'template') return this.convertTemplateLiteralPartsToPerl(v.parts)
    // Out-of-shape value (spread / jsx-children) — render as undef rather
    // than emit invalid Perl; the consumer falls back to its default.
    return 'undef'
  }

  /**
   * Lower an object-literal provider value (`value={{ open: () => props.open
   * ?? false, onOpenChange: … }}`) to a Perl hashref (#1897). The SSR
   * lowering is a per-member snapshot of what a consumer would READ during
   * the same render:
   *
   * - zero-param expression-body arrows are getters — lower the body (the
   *   value is fixed for the render, so the call-time indirection drops out)
   * - `on[A-Z]`-named members and function-shaped values are client-only
   *   behavior SSR never invokes — lower to `undef`
   * - anything else lowers through the normal expression pipeline (so an
   *   unsupported getter body still refuses loudly with BF101)
   *
   * Keys keep their JS names verbatim so a consumer-side `ctx.open` access
   * maps onto the same key. Returns `null` when the expression is not a
   * plain object literal (spread / computed key) — the caller falls back to
   * the whole-expression path, which refuses those shapes with BF101.
   */
  private providerObjectLiteralPerl(expr: string): string | null {
    const members = parseProviderObjectLiteral(expr.trim())
    if (members === null) return null
    const entries = members.map(m => {
      // String-literal JS keys can carry `'` / `\` — escape for the
      // single-quoted Perl key string.
      const key = `'${m.name.replace(/[\\']/g, c => `\\${c}`)}'`
      if (m.kind === 'function' || /^on[A-Z]/.test(m.name)) return `${key} => undef`
      const src = m.kind === 'getter' ? m.body : m.expr
      // (#1971) A member whose value is a bare identifier that doesn't resolve
      // to a prop/signal/memo is a client-only function reference (a local
      // handler const like `scrollPrev`, or a signal setter like
      // `setCanScrollPrev`) — no SSR value, and emitting `$scrollPrev` would
      // trip Perl strict mode on an undeclared var. Lower to undef.
      if (this.isClientOnlyContextIdentifier(src)) return `${key} => undef`
      return `${key} => ${this.convertExpressionToPerl(src)}`
    })
    return `{ ${entries.join(', ')} }`
  }

  /**
   * (#1971) True when `src` is a bare identifier that doesn't resolve to a
   * prop/signal/memo or an SSR-inlinable module string const — i.e. a
   * client-only function reference in a context value (a local handler const
   * like `scrollPrev`, or a signal setter like `setCanScrollPrev`). See
   * `providerDataNames`. Module-scope string consts (`carouselClasses`) ARE
   * SSR-resolvable via `moduleStringConsts`, so they're excluded here.
   */
  private isClientOnlyContextIdentifier(src: string): boolean {
    const t = src.trim()
    if (!/^[A-Za-z_$][\w$]*$/.test(t)) return false
    return !this.providerDataNames.has(t) && !this.moduleStringConsts.has(t)
  }

  /** Perl literal for a context-consumer's `createContext` default. */
  private contextDefaultPerl(c: ContextConsumer): string {
    const d = c.defaultValue
    if (d === null || d === undefined) return 'undef'
    if (typeof d === 'string') return `'${d.replace(/[\\']/g, m => `\\${m}`)}'`
    if (typeof d === 'boolean') return d ? '1' : '0'
    return String(d)
  }

  /**
   * Emit one `% my $<local> = bf->use_context(...)` seed line per context
   * consumer so the template body's bare `$<local>` resolves to the active
   * provider value (or the `createContext` default). (#1297)
   */
  private generateContextConsumerSeed(ir: ComponentIR): string {
    const consumers = collectContextConsumers(ir.metadata)
    if (consumers.length === 0) return ''
    return (
      consumers
        .map(
          c =>
            `% my $${c.localName} = bf->use_context('${c.contextName}', ${this.contextDefaultPerl(c)});`,
        )
        .join('\n') + '\n'
    )
  }

  /**
   * Seed memos whose SSR default is `null` (not statically evaluable) by
   * computing them in-template from the already-seeded prop / signal vars.
   * Targets the prop-derived memo shape (`createMemo(() => props.value * 10)`)
   * that the static `extractSsrDefaults` evaluator can't fold — without this
   * the memo's `$x` renders empty (the reason `props-reactivity-comparison`
   * was skipped). Only emitted when the lowered expression references vars the
   * template already has in scope (props params + signals + prior memos), so a
   * memo over an out-of-scope binding stays on the null path rather than
   * tripping Perl strict mode. (#1297)
   */
  private generateDerivedMemoSeed(ir: ComponentIR): string {
    const memos = ir.metadata.memos ?? []
    const signals = ir.metadata.signals ?? []
    if (memos.length === 0 && signals.length === 0) return ''
    // Props seed first; each signal/memo adds its own name as it lands so a
    // later one can reference an earlier one.
    const available = new Set<string>(ir.metadata.propsParams.map(p => p.name))
    const lines: string[] = []

    // Prop/signal-derived signals (`createSignal(props.defaultOn ?? false)`):
    // a loop-child render receives no stash seed for the signal, so its `$on`
    // would trip strict mode; and even when an entry render seeds it, the
    // static default can't capture the per-call prop. Seed it in-template from
    // the passed prop — but ONLY when the init lowers cleanly AND references an
    // in-scope var (i.e. it's genuinely derived). Object/array/constant inits
    // (`createSignal({…})`, `createSignal([…])`, `createSignal('b')`) keep the
    // existing ssr-defaults seeding, so the spread / loop fixtures are
    // untouched.
    for (const signal of signals) {
      const perl = this.tryLowerToPerl(signal.initialValue, available)
      if (perl !== null) lines.push(`% my $${signal.getter} = ${perl};`)
      available.add(signal.getter)
    }

    for (const memo of memos) {
      // Seed every memo whose body lowers cleanly — not just the ones whose
      // static SSR default is null. A statically-foldable prop-derived memo
      // (`createMemo(() => props.disabled ?? false)` → default `false`)
      // still depends on the per-call prop: the static stash seed bakes in
      // the absent-prop fold, so a caller passing `disabled => 1` would
      // render the default branch (#1897, select's disabled item). The
      // in-template recomputation reads the prop lexical the stash already
      // seeded, so it's correct per call; block-bodied arrows /
      // out-of-scope references fall back to the static ssr-defaults seed.
      const body = extractArrowBodyExpression(memo.computation)
      if (body !== null) {
        const perl = this.tryLowerToPerl(body, available)
        if (perl !== null) lines.push(`% my $${memo.name} = ${perl};`)
      }
      available.add(memo.name)
    }
    return lines.length > 0 ? lines.join('\n') + '\n' : ''
  }

  /**
   * Lower a signal init / memo body to Perl for an in-template SSR seed, or
   * `null` when it shouldn't be seeded this way. Returns null — without
   * recording a BF101 — when the expression isn't a supported shape
   * (`isSupported` pre-check, so object/array literals don't fail the build),
   * when the lowering references no in-scope var (a constant — keep the
   * existing ssr-defaults seeding), or when it references an out-of-scope
   * binding. (#1297)
   */
  private tryLowerToPerl(expr: string, available: ReadonlySet<string>): string | null {
    const trimmed = expr.trim()
    if (!trimmed) return null
    if (!isSupported(parseExpression(trimmed)).supported) return null
    const perl = this.convertExpressionToPerl(trimmed)
    if (perl === '' || !/\$[A-Za-z_]\w*/.test(perl)) return null
    return referencedVarsAreAvailable(perl, available) ? perl : null
  }

  emitAsync(node: IRAsync, _ctx: MojoRenderCtx, _emit: EmitIRNode<MojoRenderCtx>): string {
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
    // A root scope element carries `data-key` for a keyed loop item — emitted
    // from the bf instance (the child renderer sets it from the JSX `key`
    // prop), so a non-keyed render adds nothing. Mirrors Hono stamping
    // data-key on each loop item's scope root, including early-return
    // (if-statement) roots where every branch's top element qualifies. (#1297)
    if (this.rootScopeNodes.has(element) && element.needsScope) {
      hydrationAttrs += ` <%== bf->data_key_attr %>`
    }
    if (element.slotId) {
      hydrationAttrs += ` ${this.renderSlotMarker(element.slotId)}`
    }
    // Page-lifecycle boundary lowered from `<Region>` (spec/router.md). The id
    // is a deterministic static string (`<file scope>:<index>`), so it emits as
    // a plain literal attribute — no Mojolicious template tag.
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
        return `<%== bf->comment("client:${expr.slotId}") %>`
      }
      return ''
    }

    const perlExpr = this.convertExpressionToPerl(expr.expr)

    if (expr.slotId) {
      return `<%== bf->text_start("${expr.slotId}") %><%= ${perlExpr} %><%== bf->text_end %>`
    }

    return `<%= ${perlExpr} %>`
  }

  // ===========================================================================
  // Conditional Rendering
  // ===========================================================================

  renderConditional(cond: IRConditional): string {
    if (cond.clientOnly && cond.slotId) {
      return `<%== bf->comment("cond-start:${cond.slotId}") %><%== bf->comment("cond-end:${cond.slotId}") %>`
    }

    const condition = this.convertExpressionToPerl(cond.condition)
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
        ? `\n% if (${condition}) {\n${whenTrue}\n% } else {\n${whenFalse}\n% }\n`
        : `\n% if (${condition}) {\n${whenTrue}\n% }\n`
      result = `<%== bf->comment("cond-start:${cond.slotId}") %>${inner}<%== bf->comment("cond-end:${cond.slotId}") %>`
    } else if (markedFalse) {
      result = `\n% if (${condition}) {\n${markedTrue}\n% } else {\n${markedFalse}\n% }\n`
    } else if (cond.slotId) {
      // Conditional with no else: wrap with comment markers for client hydration
      result = `<%== bf->comment("cond-start:${cond.slotId}") %>\n% if (${condition}) {\n${whenTrue}\n% }\n<%== bf->comment("cond-end:${cond.slotId}") %>`
    } else {
      result = `\n% if (${condition}) {\n${whenTrue}\n% }\n`
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
    return `<%== bf->comment("cond-start:${condId}") %>${content}<%== bf->comment("cond-end:${condId}") %>`
  }

  // ===========================================================================
  // Imported-component-in-loop check (BF103, #1266)
  // ===========================================================================

  /**
   * Push a `BF103` diagnostic for every component reference inside a
   * loop body whose name is imported from a relative-path module.
   * Mirror of the Go adapter's check — the Mojo adapter has the same
   * cross-template-registration constraint at request time.
   */
  private checkImportedLoopChildComponents(ir: ComponentIR): void {
    // Collect every name imported from a relative-path module (no
    // case filter — `IRComponent` nodes only exist for PascalCase JSX
    // usages, so a lowercase utility import in the set can't match
    // anyway, and any heuristic on the import name itself would be
    // strictly less robust than the structural IR check below).
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
              message: `Component <${comp.name}> is imported from a sibling module and used inside a loop. The Mojo adapter emits a cross-template call; the child template must be registered alongside the parent at render time.`,
              loc: comp.loc ?? loc,
              suggestion: {
                message:
                  `Options:\n` +
                  `  1. Compile '${comp.name}' (its source file) with the same adapter and register the resulting Mojo template alongside the parent at render time.\n` +
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

    // An array/object-destructure loop param (`([emoji, users]) => ...`
    // or `({ name, age }) => ...`) lowers to invalid Perl — the adapter
    // would otherwise emit `% my $[emoji, users] = $entries->[$_i];`,
    // which is a parse error. Surface this at build time (#1266)
    // instead of shipping the broken template line for the user to
    // discover at request time.
    //
    // Check the IR's structured `paramBindings` field rather than
    // string-matching `loop.param`: Phase 1 populates `paramBindings`
    // iff the param is a destructure pattern (array or object); a
    // simple identifier leaves it `undefined`. The structured check is
    // robust to whitespace / formatting variants in the source.
    // A destructure loop param is lowerable for the object-rest / simple-field
    // shape (`.map(({ id, title, ...rest }) => …)`, `rest` read via member
    // access): each binding becomes a Perl `my` local off the per-item var, so
    // the body's `$id` / `$rest->{flag}` resolve natively. Array-index / nested
    // / rest-spread shapes still can't unpack into scalar `my`s → BF104. (#1310)
    const destructure = !!(loop.paramBindings && loop.paramBindings.length > 0)
    const supportableDestructure = destructure && isLowerableObjectRestDestructure(loop)
    if (destructure && !supportableDestructure) {
      this.errors.push({
        code: 'BF104',
        severity: 'error',
        message: `Loop callback uses an array/object destructure pattern (\`${loop.param}\`) that the Mojo adapter cannot lower — Perl scalar bindings can't unpack a tuple in a single \`my\` declaration.`,
        loc: loop.loc ?? { file: this.componentName + '.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
        suggestion: {
          message:
            `Options:\n` +
            `  1. Rename the parameter to a single name and access tuple elements with index syntax in the body (e.g. \`entry => entry->[0]\` instead of \`([k, v]) => ...\`).\n` +
            `  2. Mark the loop position as @client-only so the destructure runs in JS on the client.\n` +
            `  3. Move the loop into a primitive that the adapter registers explicitly.`,
        },
      })
    }

    const rawArray = this.convertExpressionToPerl(loop.array)
    // Apply sort if present (#1448 Tier B): wrap the loop array in
    // the shared `bf->sort` helper. The same `renderSortMethod`
    // feeds both this loop-chain hoist and the standalone
    // `sortMethod()` arm on the emitter, so a regression in either
    // path surfaces with the identical emit shape.
    //
    // Sort hoist: the loop bound (`0..$#{…}`) and the per-item
    // lookup (`…->[$_i]`) both reference the same array — if the
    // expression is a method call like `bf->sort(...)`, naive
    // splicing would call the helper twice per render. Bind the
    // sorted result to a `my` local so the helper runs once.
    let sortedHoist: string | null = null
    let array = rawArray
    if (loop.sortComparator) {
      sortedHoist = `bf_iter_${perlIdentifierFromMarkerId(loop.markerId)}`
      array = `$${sortedHoist}`
    }
    const param = loop.param
    // `.keys().map(k => ...)` — the callback param is the index.
    // Use it as the for-loop variable and skip the per-item value
    // assignment.
    const indexVar = loop.iterationShape === 'keys'
      ? `$${param}`
      : loop.index ? `$${loop.index}` : '$_i'
    // Names this loop binds in body scope. Guard module-const inlining for
    // the whole body (children + key + filter) so a same-named loop variable
    // isn't replaced by the const literal (#1749 review). Ref-counted for
    // nested loops; released after the body lines are assembled below.
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

    // Whole-item conditional (#1665): prepend an always-present
    // `<!--bf-loop-i:KEY-->` anchor before each item's (possibly empty)
    // conditional content so the client's `mapArrayAnchored` can hydrate
    // every SSR-rendered item by its anchor. `bf->comment` prepends `bf-`,
    // so `"loop-i:" . KEY` yields `<!--bf-loop-i:KEY-->`.
    const children =
      loop.bodyIsItemConditional && loop.key
        ? `<%== bf->comment("loop-i:" . ${this.convertExpressionToPerl(loop.key)}) %>\n${renderedChildren}`
        : renderedChildren

    const lines: string[] = []
    // Scoped per-call-site marker so sibling `.map()`s under the same parent
    // each get their own reconciliation range (#1087).
    lines.push(`<%== bf->comment("loop:${loop.markerId}") %>`)
    if (sortedHoist && loop.sortComparator) {
      lines.push(`% my $${sortedHoist} = ${renderSortMethod(rawArray, loop.sortComparator)};`)
    }
    lines.push(`% for my ${indexVar} (0..$#{${array}}) {`)
    if (loop.iterationShape !== 'keys') {
      if (supportableDestructure) {
        // Per-item var + one `my` local per binding; `rest` aliases the item
        // so `$rest->{flag}` resolves (object-rest read via member access).
        lines.push(`% my $__bf_item = ${array}->[${indexVar}];`)
        for (const b of loop.paramBindings ?? []) {
          lines.push(
            b.rest
              ? `% my $${b.name} = $__bf_item;`
              : `% my $${b.name} = $__bf_item->{${b.path.slice(1)}};`,
          )
        }
      } else {
        lines.push(`% my $${param} = ${array}->[${indexVar}];`)
      }
    }

    // Handle filter().map() pattern by wrapping children in if-condition
    if (loop.filterPredicate) {
      let filterCond: string
      if (loop.filterPredicate.blockBody) {
        filterCond = this.renderBlockBodyCondition(
          loop.filterPredicate.blockBody,
          loop.filterPredicate.param
        )
      } else if (loop.filterPredicate.predicate) {
        filterCond = this.renderPerlFilterExpr(
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
      lines.push(`% if (${filterCond}) {`)
      lines.push(children)
      lines.push(`% }`)
    } else {
      lines.push(children)
    }

    // Body fully rendered — release the loop-bound names.
    for (const n of loopBound) {
      const c = (this.loopBoundNames.get(n) ?? 1) - 1
      if (c <= 0) this.loopBoundNames.delete(n)
      else this.loopBoundNames.set(n, c)
    }

    lines.push(`% }`)
    lines.push(`<%== bf->comment("/loop:${loop.markerId}") %>`)

    return lines.join('\n')
  }

  // ===========================================================================
  // Component Rendering
  // ===========================================================================

  /**
   * AttrValue lowering for component invocation props (Mojo / Perl
   * named-arg form). Routed through the shared dispatcher so a new
   * AttrValue kind becomes a TS compile error here (#1290 step 2).
   *
   * `jsx-children` returns empty — children are captured via Mojo's
   * `begin %>…<% end` block below, not threaded through the
   * `render_child` named-arg list.
   */
  private readonly componentPropEmitter: AttrValueEmitter = {
    emitLiteral: (value, name) => `${perlHashKey(name)} => '${value.value}'`,
    emitExpression: (value, name) => {
      // The IR producer collapses component-prop `template` kinds
      // into `expression` for client-runtime reasons but preserves
      // the parsed parts on `v.parts`. Prefer the structured form
      // when available — the bare-expression path can't handle
      // `${MAP[KEY]}` shapes (the JS object literal leaks into the
      // Perl template).
      if (value.parts) {
        return `${perlHashKey(name)} => ${this.convertTemplateLiteralPartsToPerl(value.parts)}`
      }
      // Inline object-literal child prop (carousel's `opts={{ align: 'start' }}`):
      // lower to a Perl hashref so the child can serialize it (`data-opts`),
      // instead of refusing the bare object with BF101. (#1971 Perl) Cheap `{`
      // guard so the common non-object case skips the AST parse.
      if (value.expr.trim().startsWith('{')) {
        const hashref = this.objectLiteralExprToPerlHashref(value.expr)
        if (hashref !== null) return `${perlHashKey(name)} => ${hashref}`
      }
      return `${perlHashKey(name)} => ${this.convertExpressionToPerl(value.expr)}`
    },
    emitSpread: (value) => {
      // Perl has no JS-style spread — emit the source as a hash
      // dereference so its entries flatten into the named-arg list
      // `render_child` accepts. `$props` already comes in as a hashref
      // by `render_child`'s calling convention; deref with `%{}`. If
      // `convertExpressionToPerl` already produced a hash variable
      // (`%foo`), leave as-is.
      const perlExpr = this.convertExpressionToPerl(value.expr)
      return perlExpr.startsWith('%') ? perlExpr : `%{${perlExpr}}`
    },
    emitTemplate: (value, name) =>
      `${perlHashKey(name)} => ${this.convertTemplateLiteralPartsToPerl(value.parts)}`,
    emitBooleanAttr: (_value, name) => `${perlHashKey(name)} => 1`,
    emitBooleanShorthand: (_value, name) => `${perlHashKey(name)} => 1`,
    // JSX children flow through Mojo's `begin %>…<% end` capture
    // below; they're not part of the named-arg list.
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
    // Pass slot ID so the child renderer can set correct scope ID for hydration
    // Skip for loop children — they use ComponentName_random pattern instead
    if (comp.slotId && !this.inLoop) {
      propParts.push(`_bf_slot => '${comp.slotId}'`)
    }
    const propsStr = propParts.length > 0 ? ', ' + propParts.join(', ') : ''
    const tplName = this.toTemplateName(comp.name)
    // Resolve the effective children: a nested `<Box>…</Box>` populates
    // `comp.children`; an attribute-form `<Box children={<jsx/>} />`
    // lands in a `jsx-children` AttrValue on the corresponding prop
    // (#1326). The parent's scope marker is already attached to each
    // hoisted root by the IR collector (`needsScope: true`), so the
    // adapter just needs to render the IR through the same children
    // pipeline as the nested form. Narrow the prop value via the
    // `kind` discriminator instead of casting to a hand-written shape;
    // any future change to the `jsx-children` AttrValue surface will
    // surface here as a TS compile error.
    const effectiveChildren: IRNode[] = comp.children.length > 0
      ? comp.children
      : resolveJsxChildrenProp(comp.props)
    if (effectiveChildren.length > 0) {
      // Forward JSX children via Mojo's `begin %>...<% end` capture so
      // dynamic segments inside the children (signals, conditionals)
      // get evaluated in the parent's template scope before reaching
      // the child renderer. The capture has to live in a separate
      // action — embedding it inside the `<%== ... %>` that wraps
      // `render_child` would let the inner `%>` close the outer tag.
      // `render_child` materializes the resulting CODE ref into the
      // captured Mojo::ByteStream.
      const prevInLoop = this.inLoop
      this.inLoop = false
      const childrenBody = this.renderChildren(effectiveChildren)
      this.inLoop = prevInLoop
      const varName = `$bf_children_${comp.slotId ?? 'c' + this.childrenCaptureCounter++}`
      return `<% my ${varName} = begin %>${childrenBody}<% end %><%== bf->render_child('${tplName}'${propsStr}, children => ${varName}) %>`
    }
    return `<%== bf->render_child('${tplName}'${propsStr}) %>`
  }

  private childrenCaptureCounter = 0

  /** Uniquifies the `presenceOrUndefined` temp binding (`$bf_puN`) so two
   *  presence-folded attrs in one template don't collide. */
  private presenceVarCounter = 0

  private toTemplateName(componentName: string): string {
    // Convert PascalCase to snake_case for Mojo template naming
    return componentName
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '')
  }

  // ===========================================================================
  // If-Statement (Conditional Return) Rendering
  // ===========================================================================

  private renderIfStatement(ifStmt: IRIfStatement): string {
    const condition = this.convertExpressionToPerl(ifStmt.condition)
    const consequent = ifStmt.consequent.type === 'if-statement'
      ? this.renderIfStatement(ifStmt.consequent as IRIfStatement)
      : this.renderNode(ifStmt.consequent)
    let result = `% if (${condition}) {\n${consequent}\n`

    if (ifStmt.alternate) {
      if (ifStmt.alternate.type === 'if-statement') {
        const altResult = this.renderIfStatement(ifStmt.alternate as IRIfStatement)
        // Replace leading "% if" with "% } elsif"
        result += altResult.replace(/^% if/, '% } elsif')
      } else {
        const alternate = this.renderNode(ifStmt.alternate)
        result += `% } else {\n${alternate}\n`
      }
    }

    result += `% }`
    return result
  }

  // ===========================================================================
  // Fragment & Slot Rendering
  // ===========================================================================

  private renderFragment(fragment: IRFragment): string {
    const children = this.renderChildren(fragment.children)
    if (fragment.needsScopeComment) {
      return `<%== bf->scope_comment %>${children}`
    }
    return children
  }

  private renderSlot(_slot: IRSlot): string {
    return `<%= content %>`
  }

  override renderAsync(node: IRAsync): string {
    const fallback = this.renderNode(node.fallback)
    const children = this.renderChildren(node.children)
    // Use the BarefootJS.pm streaming helpers for OOS streaming.
    // bf->async_boundary() wraps the fallback in a <div bf-async="aX"> placeholder.
    // The resolved content is rendered below for non-streaming fallback;
    // in streaming mode, Mojo's write_chunk delivers it as a resolve chunk.
    //
    // The fallback is captured into a CODE ref via `begin %>…<% end` in
    // its own action — embedding the `begin/end` inside the `<%== ... %>`
    // that wraps `async_boundary` would let the inner `%>` close the
    // outer tag, leaving the trailing `)` in plain template text and
    // breaking Mojo's lexer (#1298). Same shape as `renderComponent`'s
    // children capture.
    const fallbackVar = `$bf_async_fallback_${node.id}`
    return `<% my ${fallbackVar} = begin %>${fallback}<% end %><%== bf->async_boundary('${node.id}', ${fallbackVar}) %>\n${children}`
  }

  // ===========================================================================
  // Attribute Rendering
  // ===========================================================================

  /**
   * AttrValue lowering for intrinsic-element attributes (Mojo / EP
   * template). Routed through the shared dispatcher (#1290 step 2).
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
      // Refuse shapes that the regex pipeline silently mangles into
      // invalid Perl (#1322). Tagged-template-literal call expressions
      // (`cn\`base \${tone()}\``) have no idiomatic Mojo template form; the Go
      // adapter raises BF101 here via `convertExpressionToGo` + `isSupported`.
      // Lift the same gate so the user gets a clear diagnostic instead of
      // broken output. The check runs before `convertExpressionToPerl` so the
      // regex pipeline never produces template-text fragments for a shape
      // we've already rejected.
      if (this.refuseUnsupportedAttrExpression(value.expr, name)) {
        return ''
      }
      // Hono-style nullish-attribute omission (#textarea rows): when the
      // attribute value is a BARE reference to an optional, no-default
      // prop (which is `undef` when the caller omits it), guard the
      // attribute with Perl `defined` so it DROPS rather than rendering
      // `attr=""`. The guarded body reuses the exact normal emission, so
      // value escaping (`<%= ... %>`) is unchanged; only the presence is
      // conditional. The `% if`/`% end` line directives surround the
      // attribute inline — the conformance comparator collapses the
      // resulting whitespace, exactly like the existing boolean-attr and
      // hydration-marker patterns. Scope is deliberately narrow (bare
      // identifiers resolving to an optional-no-default prop) so member
      // exprs, calls, concrete/defaulted props, and boolean attrs are
      // unaffected and still emit unconditionally.
      const bareId = value.expr.trim()
      // Normalize a props-object access (`props.id`) to its bare prop name
      // (`id`) so the nullable-optional set — keyed by bare name — matches the
      // SolidJS props-object pattern, not just destructured params (#checkbox
      // `id={props.id}`).
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
        const perl = this.convertExpressionToPerl(value.expr)
        const body =
          isBooleanResultExpr(value.expr) || isAriaBooleanAttr(name) || this.isBooleanTypedPropRef(value.expr)
            ? `${name}="<%= bf->bool_str(${perl}) %>"`
            : `${name}="<%= ${perl} %>"`
        return `<% if (defined ${perl}) { %>${body}<% } %>`
      }
      if (isBooleanAttr(name)) {
        // Boolean attributes: render conditionally (present or absent).
        return `<%= ${this.convertExpressionToPerl(value.expr)} ? '${name}' : '' %>`
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
        const perl = this.convertExpressionToPerl(value.expr)
        const tmp = `$bf_pu${this.presenceVarCounter++}`
        const body =
          isBooleanResultExpr(value.expr) || isAriaBooleanAttr(name) || this.isBooleanTypedPropRef(value.expr)
            ? `${name}="<%= bf->bool_str(${tmp}) %>"`
            : `${name}="<%= ${tmp} %>"`
        return `<% my ${tmp} = ${perl}; if (${tmp}) { %>${body}<% } %>`
      }
      // Boolean-result handling (#1466 follow-up). Two trigger paths:
      //
      //   - `isBooleanResultExpr(expr)` — the JS source structurally
      //     evaluates to a boolean (comparison, `!`, literal,
      //     both-sides-boolean logical / conditional).
      //   - `isAriaBooleanAttr(name)` — the attribute is one of the
      //     ARIA tri-state / boolean-state names whose spec values are
      //     `"true" | "false" (| "mixed")`. The expression itself can
      //     be opaque (e.g. `accepted()` — a call expression we can't
      //     classify from source text), so we lean on the attribute
      //     name as the type witness.
      //
      // Without either, Perl's auto-stringification turns a JS-false
      // comparison into `''` (and a JS-true comparison into `'1'`),
      // which renders as `attr=""` / `attr="1"` — diverging from
      // Hono's / Go's `attr="false"` / `attr="true"`. Routing through
      // the `bf->bool_str` Perl helper realigns the wire bytes with
      // JS `String(boolean)` semantics.
      // `attr={cond ? value : undefined}` OMITS the attribute on the
      // falsy branch (Hono drops undefined-valued attributes) — wrap the
      // whole attribute in the condition instead of rendering `attr=""`
      // (#1897, pagination's `aria-current={props.isActive ? 'page' :
      // undefined}`). Same parity rule as the Go / Xslate adapters.
      {
        const m = this.parseUndefinedAlternateTernary(value.expr)
        if (m) {
          const cond = this.convertExpressionToPerl(m.condition)
          const val = this.convertExpressionToPerl(m.consequent)
          return `<% if (${cond}) { %>${name}="<%= ${val} %>"<% } %>`
        }
      }
      const perl = this.convertExpressionToPerl(value.expr)
      if (isBooleanResultExpr(value.expr) || isAriaBooleanAttr(name) || this.isBooleanTypedPropRef(value.expr)) {
        return `${name}="<%= bf->bool_str(${perl}) %>"`
      }
      return `${name}="<%= ${perl} %>"`
    },
    emitBooleanAttr: (_value, name) => name,
    emitTemplate: (value, name) =>
      `${name}="<%= ${this.convertTemplateLiteralPartsToPerl(value.parts)} %>"`,
    // Spread attributes (`<div {...attrs()} />`) lower through the
    // `bf->spread_attrs` Perl runtime helper (#1407), mirroring the
    // Go adapter's `bf_spread_attrs` and the JS `spreadAttrs` from
    // `@barefootjs/client/runtime`. The bag's source JS expression
    // is translated to a Perl expression via `convertExpressionToPerl`
    // (e.g. `attrs()` → `$attrs`, `props.bag` → `$bag`); the helper
    // accepts a hashref and emits a Mojo::ByteStream with sorted,
    // escaped `key="value"` pairs.
    //
    // No struct-field plumbing is needed on Perl: templates evaluate
    // expressions inline against the props hash, so the spread
    // identifier resolves directly. `IRAttribute.slotId` is set by
    // the IR pass but the Mojo adapter ignores it — the slot field
    // exists only for the Go adapter's static-typed Props struct.
    //
    // Gate unsupported shapes (object literals, tagged-template
    // literals, etc.) up front via `refuseUnsupportedAttrExpression`
    // so a spread like `{...{id: 'x'}}` surfaces BF101 instead of
    // letting `convertExpressionToPerl` emit invalid Embedded Perl
    // that would crash at render time (#1413 review).
    emitSpread: (value) => {
      if (this.refuseUnsupportedAttrExpression(value.expr, '...')) {
        return ''
      }
      // SolidJS-style props identifier (`(props: P) { <el {...props}/> }`)
      // has no matching `$props` variable in Mojo's template scope —
      // Perl props arrive as a flat hash with one key per `propsParams`
      // entry, not as a single nested object. Emit an inline hashref
      // literal that enumerates the analyzer-extracted props params
      // so `$bf->spread_attrs(...)` gets a real hashref (#1407
      // follow-up; matches the Go adapter's same-shape map-literal
      // path). For `restPropsName` and other identifier shapes, the
      // standard `convertExpressionToPerl` translation handles it
      // (rest binding name → `$<name>` resolves against the hashref
      // the caller / harness placed under that key).
      const trimmed = value.expr.trim()
      if (this.propsObjectName && this.propsObjectName === trimmed) {
        const entries = this.propsParams.map(p =>
          `${JSON.stringify(p.name)} => $${p.name}`,
        )
        return `<%== bf->spread_attrs({${entries.join(', ')}}) %>`
      }
      // Conditional inline-object spread:
      //   `{...(COND ? { 'aria-describedby': describedBy } : {})}`
      // Emit a Perl inline ternary of hashrefs — Perl truthiness
      // handles the condition for free, and the falsy `{}` branch
      // OMITS the key (`bf->spread_attrs` does NOT filter empty
      // strings, so we cannot always-include it). Mirrors the Go
      // adapter's IIFE-of-maps lowering (#textarea).
      const ternaryHashref = this.conditionalSpreadToPerl(trimmed)
      if (ternaryHashref !== null) {
        return `<%== bf->spread_attrs(${ternaryHashref}) %>`
      }
      // Function-scope local const holding a conditional inline-object
      //   `const sizeAttrs = size ? {…} : {}` then `{...sizeAttrs}`
      // (#checkbox / icon). Resolve the bare identifier to its
      // initializer text and route through the same conditional-spread
      // lowering. Only function-scope (`!isModule`) consts whose value is
      // NOT itself a bare identifier (loop guard) are considered.
      if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)) {
        const localConst = this.localConstants.find(
          c => c.name === trimmed && !c.isModule,
        )
        if (localConst?.value !== undefined) {
          const initTrimmed = localConst.value.trim()
          if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(initTrimmed)) {
            const resolved = this.conditionalSpreadToPerl(initTrimmed)
            if (resolved !== null) {
              return `<%== bf->spread_attrs(${resolved}) %>`
            }
          }
        }
      }
      const perlExpr = this.convertExpressionToPerl(value.expr)
      return `<%== bf->spread_attrs(${perlExpr}) %>`
    },
    // Neither variant is legal on intrinsic elements.
    emitBooleanShorthand: () => '',
    emitJsxChildren: () => '',
  }

  /**
   * Lower a `style={{ … }}` object literal to a CSS string with dynamic values
   * interpolated as EP actions, e.g. `{ backgroundColor: color, padding: '8px' }`
   * → `background-color:<%= $color %>;padding:8px`. Returns null when the shape
   * is unsupported or any value can't be lowered (caller then falls through to
   * the BF101 refusal). (#1322)
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
    // markup). The dynamic arm's `<%= … %>` is HTML-escaped by Mojo's EP.
    return entries
      .map(e =>
        e.kind === 'literal'
          ? `${this.escapeAttrText(e.cssKey)}:${this.escapeAttrText(e.value)}`
          : `${this.escapeAttrText(e.cssKey)}:<%= ${this.convertExpressionToPerl(e.expr)} %>`,
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
      // Rewrite JSX special-prop names to their HTML-attribute
      // counterparts (#1475). `className` → `class` was already
      // wired in; the `key` → `data-key` rewrite matches the
      // canonical Hono attribute name the client runtime
      // reconciles against. Hono SSR strips raw `key` via its JSX
      // runtime; the Mojo template path has no such layer so the
      // rewrite happens at attribute-emit time.
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
    // bf-s is the addressable scope id (#1249 — bare, no `~` prefix).
    // hydration_attrs adds bf-h / bf-m / bf-r conditionally.
    return `bf-s="<%= bf->scope_attr %>" <%== bf->hydration_attrs %> <%== bf->props_attr %>`
  }

  renderSlotMarker(slotId: string): string {
    return `${BF_SLOT}="${slotId}"`
  }

  renderCondMarker(condId: string): string {
    return `${BF_COND}="${condId}"`
  }

  // ===========================================================================
  // Filter Predicate Rendering (ParsedExpr → Perl)
  // ===========================================================================

  /**
   * Convert a ParsedExpr AST to Perl expression string for filter
   * predicates. Wraps the shared ParsedExpr dispatcher with a
   * `MojoFilterEmitter` carrying the predicate's loop param and
   * any block-body local var aliases (#1250 phase 1B).
   */
  private renderPerlFilterExpr(
    expr: ParsedExpr,
    param: string,
    localVarMap: Map<string, string> = new Map(),
  ): string {
    // Nested higher-order in filter predicates was refused outright
    // until #1443 PR4 because the `member` emit produced
    // `[ ... ]->{length}` for `.length` on a `[grep ...]` anonymous
    // array ref — undef at runtime. With `MojoFilterEmitter.member`
    // now lowering `.length` on a higher-order object to
    // `scalar(@{...})`, the canonical
    // `x.tags.filter(t => t.active).length > 0` shape lowers
    // cleanly. Predicates that combine a nested higher-order with
    // something OTHER than `.length` (e.g. `.includes`, `.join`)
    // still fall back to whatever the emitter produces — most of
    // those would yield runtime errors in Perl, which is the user's
    // signal to refactor. Wholesale refusal would also block the
    // canonical case the issue exists to enable.
    return emitParsedExpr(expr, new MojoFilterEmitter(param, localVarMap, n => this._isStringValueName(n)))
  }

  /**
   * Render a complex block body filter into a Perl condition.
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
      return this.renderPerlFilterExpr(path.result, param, localVarMap)
    }

    const condPart = this.renderConditionsAnd(path.conditions, param, localVarMap)
    const resultPart = this.renderPerlFilterExpr(path.result, param, localVarMap)
    return `(${condPart} && ${resultPart})`
  }

  private renderConditionsAnd(
    conditions: ParsedExpr[],
    param: string,
    localVarMap: Map<string, string>
  ): string {
    if (conditions.length === 0) return '1'
    if (conditions.length === 1) return this.renderPerlFilterExpr(conditions[0], param, localVarMap)
    const parts = conditions.map(c => this.renderPerlFilterExpr(c, param, localVarMap))
    return `(${parts.join(' && ')})`
  }

  // ===========================================================================
  // Expression Conversion: JS → Perl
  // ===========================================================================

  private convertTemplateLiteralPartsToPerl(literalParts: IRTemplatePart[]): string {
    const parts: string[] = []
    for (const part of literalParts) {
      if (part.type === 'string') {
        // The IR producer may leave `${ident}` / `${_p.ident}`
        // interpolations in `string` parts when it can't statically
        // inline them (typically a destructured prop the caller will
        // supply at hydrate time, e.g. `${className}` in shadcn-style
        // composition). Substitute those to their Perl variable form
        // before quoting, otherwise the single-quoted literal here
        // passes the JS-shape interpolation through verbatim into the
        // rendered HTML.
        parts.push(this.substituteJsInterpolationsToPerl(part.value))
      } else if (part.type === 'ternary') {
        const cond = this.convertExpressionToPerl(part.condition)
        parts.push(`(${cond} ? '${part.whenTrue}' : '${part.whenFalse}')`)
      } else if (part.type === 'lookup') {
        // `${MAP[KEY]}` against a Record<T, string> literal — emit a
        // Perl anonymous hash with an immediate `->{ $key } // ''`
        // lookup. The `//''` guard turns a miss into an empty string,
        // matching the go-template adapter's "empty when no case
        // matches" semantics. Pass `key` through `convertExpressionToPerl`
        // so its top-level-identifier tail (`variant` → `$variant`) and
        // existing `props.x` rule apply uniformly.
        const keyExpr = this.convertExpressionToPerl(part.key)
        const entries = Object.entries(part.cases)
          .map(([k, v]) => `'${k}' => '${v}'`)
          .join(', ')
        parts.push(`({ ${entries} }->{${keyExpr}} // '')`)
      }
    }
    // Join with Perl string concatenation
    return parts.length === 1 ? parts[0] : parts.join(' . ')
  }

  /**
   * Translate `${EXPR}` interpolations in a static template-part string
   * into Perl variable references and concatenate them with the
   * surrounding literal text. Used by `convertTemplateLiteralPartsToPerl`
   * when a `string` part still carries unresolved interpolations (e.g.
   * `${className}` from a destructured prop the IR analyzer couldn't
   * inline statically).
   */
  private substituteJsInterpolationsToPerl(s: string): string {
    const segments: string[] = []
    const re = /\$\{([^}]+)\}/g
    let lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(s)) !== null) {
      if (m.index > lastIndex) {
        segments.push(`'${s.slice(lastIndex, m.index)}'`)
      }
      segments.push(this.convertExpressionToPerl(m[1].trim()))
      lastIndex = re.lastIndex
    }
    if (lastIndex < s.length) {
      segments.push(`'${s.slice(lastIndex)}'`)
    }
    if (segments.length === 0) return `''`
    return segments.length === 1 ? segments[0] : `(${segments.join(' . ')})`
  }

  /**
   * Refuse JS expression shapes that have no idiomatic Mojo template
   * representation (#1322). Currently catches:
   *
   *   - Object literals (`style={{ background: bg(), color: fg() }}`):
   *     the regex pipeline strips signal calls but leaves the
   *     surrounding `{ k: v, ... }` syntax intact, producing invalid
   *     Perl inside `<%= ... %>`.
   *   - Tagged-template-literal call expressions
   *     (`className={cn\`base \${tone()}\`}`): regex translation
   *     produces malformed Perl with no callable target.
   *
   * Records `BF101` with the same shape the Go adapter emits via
   * `convertExpressionToGo`, so cross-adapter diagnostics stay
   * consistent. Returns `true` when the shape was rejected (caller
   * should drop the attribute / skip the emit).
   */
  private refuseUnsupportedAttrExpression(expr: string, attrName: string): boolean {
    // Strip leading parens / whitespace so wrapped forms reach the
    // shape pre-check — `style={({ a: b() })}` and
    // `className={(cn`base ${tone()}`)}` are the same logical shape
    // as their unwrapped variants and should hit the same gate.
    let probe = expr.trim()
    while (probe.startsWith('(')) probe = probe.slice(1).trimStart()
    const startsAsObjectLiteral = probe.startsWith('{')
    const hasTaggedTemplate = /[A-Za-z_$][\w$]*\s*`/.test(probe)
    if (!startsAsObjectLiteral && !hasTaggedTemplate) return false
    const parsed = parseExpression(expr.trim())
    const support = isSupported(parsed)
    if (parsed.kind !== 'unsupported' && support.supported) return false
    // Surface the `isSupported` reason so the diagnostic is as
    // actionable as the Go adapter's BF101 — keeps cross-adapter
    // diagnostics aligned on the same expression-shape gate.
    const reason = support.reason ?? (parsed.kind === 'unsupported' ? parsed.reason : undefined)
    const reasonLine = reason ? `\n${reason}` : ''
    this.errors.push({
      code: 'BF101',
      severity: 'error',
      message: `Expression not supported on attribute '${attrName}': ${expr.trim()}${reasonLine}`,
      loc: { file: this.componentName + '.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
      suggestion: {
        message: 'The Mojo adapter cannot lower JS object literals or tagged-template-literal expressions into Embedded Perl. Move the expression into a `\'use client\'` component (so hydration computes it), or expand it into discrete attributes whose values are values the adapter can lower.',
      },
    })
    return true
  }


  /**
   * Lower a conditional inline-object spread expression
   *   `(COND ? { 'aria-describedby': describedBy } : {})`
   * (either branch possibly `{}`) into a Perl inline ternary of
   * hashrefs for `bf->spread_attrs`:
   *   `$describedBy ? { 'aria-describedby' => $describedBy } : {}`
   *
   * The condition is translated via `convertExpressionToPerl` (a bare
   * prop ident becomes `$describedBy`; Perl truthiness handles the
   * test). Object literals become Perl hashrefs with `=>`; string-
   * literal keys are quoted, values resolve via `convertExpressionToPerl`.
   *
   * Returns null when the expression is NOT this shape, or when a part
   * can't be faithfully lowered (non-static key, etc.) so the caller
   * falls back to the standard `convertExpressionToPerl` path (which
   * records BF101). Scoped strictly to ternary-of-object-literals so no
   * other spread shape regresses.
   */
  private conditionalSpreadToPerl(expr: string): string | null {
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
    const condPerl = this.convertExpressionToPerl(node.condition.getText(sf))
    const truePerl = this.objectLiteralToPerlHashref(whenTrue, sf)
    const falsePerl = this.objectLiteralToPerlHashref(whenFalse, sf)
    if (truePerl === null || falsePerl === null) return null
    return `${condPerl} ? ${truePerl} : ${falsePerl}`
  }

  /**
   * Convert a static object literal into a Perl hashref string for a
   * conditional spread. Only static string/identifier keys are allowed;
   * values resolve via `convertExpressionToPerl`. Returns null for any
   * computed/spread/dynamic key. Empty object → `{}`.
   */
  /**
   * (#1971 Perl) Parse a bare object-literal expression string
   * (`{ align: 'start' }`) and lower it to a Perl hashref via
   * `objectLiteralToPerlHashref`, or null when it isn't a plain object
   * literal. Used for inline object-literal child props (carousel `opts`).
   */
  private objectLiteralExprToPerlHashref(expr: string): string | null {
    const sf = ts.createSourceFile('__obj.ts', `(${expr})`, ts.ScriptTarget.Latest, true)
    if (sf.statements.length !== 1) return null
    const stmt = sf.statements[0]
    if (!ts.isExpressionStatement(stmt)) return null
    let node: ts.Expression = stmt.expression
    while (ts.isParenthesizedExpression(node)) node = node.expression
    if (!ts.isObjectLiteralExpression(node)) return null
    return this.objectLiteralToPerlHashref(node, sf)
  }

  private objectLiteralToPerlHashref(
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
      const indexed = this.recordIndexAccessToPerl(initNode)
      if (
        indexed === null &&
        ts.isElementAccessExpression(initNode) &&
        initNode.argumentExpression &&
        !ts.isNumericLiteral(initNode.argumentExpression) &&
        !ts.isStringLiteral(initNode.argumentExpression)
      ) {
        // Variable-index record access (`sizeMap[size]`) that the
        // static-inline path couldn't resolve — a non-scalar record
        // value, or a non-const receiver. Since #1897 made variable
        // indices parseable (`index-access`), the generic value lowering
        // would now emit `$sizeMap->{$size}` against an UNBOUND module
        // const instead of refusing. Record BF101 and bail so the whole
        // spread surfaces the out-of-shape diagnostic, matching the
        // pre-#1897 behaviour (the refusal then was a side effect of the
        // value lowering). (A bound receiver — a signal getter like
        // `selected()[index]` — is an attribute value, not a spread
        // member, and never reaches here.)
        this.errors.push({
          code: 'BF101',
          severity: 'error',
          message: `Spread object value '${initNode.getText(sf)}' indexes a record map whose values aren't scalar literals — it can't lower to an inline Perl hashref.`,
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
          : this.convertExpressionToPerl(prop.initializer.getText(sf))
      entries.push(`'${key.replace(/'/g, "\\'")}' => ${valPerl}`)
    }
    return entries.length === 0 ? '{}' : `{ ${entries.join(', ')} }`
  }

  /**
   * Lower a spread-object VALUE of the form `IDENT[KEY]` where:
   *   - `IDENT` resolves via `localConstants` to a MODULE-scope object
   *     literal whose property values are all scalar (number/string)
   *     literals under static (string-literal or identifier) keys
   *     (a `Record<staticKeys, scalar>` map like `sizeMap`), AND
   *   - `KEY` is a bare identifier that is a prop.
   * Emits an inline indexed Perl hashref:
   *   `{ 'sm' => 16, 'md' => 20, ... }->{$size}`
   *
   * Returns the Perl string when convertible, else `null` so the caller
   * falls back to its normal value lowering (which records BF101 for an
   * unsupported shape). Mirror of the Go adapter's `recordIndexAccessToGoMap`.
   */
  private recordIndexAccessToPerl(val: ts.Expression): string | null {
    // Shared structural parse (single source of truth in `@barefootjs/jsx`);
    // this wrapper only does the Perl-specific emit (single-quote escaping)
    // from the structured result.
    const parsed = parseRecordIndexAccess(val, this.localConstants, this.propsParams)
    if (!parsed) return null
    const entries = parsed.entries.map(e => {
      const mapVal =
        e.value.kind === 'number' ? e.value.text : `'${e.value.text.replace(/'/g, "\\'")}'`
      return `'${e.key.replace(/'/g, "\\'")}' => ${mapVal}`
    })
    return `{ ${entries.join(', ')} }->{$${parsed.indexPropName}}`
  }


  private convertExpressionToPerl(expr: string): string {
    // Parse-first lowering — parity with the Go adapter's
    // `convertExpressionToGo`. Parse the JS expression once, gate it on
    // the shared `isSupported`, and render every supported shape through
    // the AST emitter (`renderParsedExprToPerl`). The parser's
    // `UNSUPPORTED_METHODS` is the single source of truth for what's
    // refused — there are no per-method routing regexes and no regex
    // string-rewriting pipeline. Unsupported shapes (un-lowered methods,
    // unparseable hand-written JS, etc.) surface as BF101 with the
    // `/* @client */` escape hatch instead of being silently mangled.
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
            ? `${support.reason}\n\nOptions:\n1. Use /* @client */ for client-side evaluation\n2. Pre-compute the value in Perl`
            : 'Options:\n1. Use /* @client */ for client-side evaluation\n2. Pre-compute the value in Perl',
        },
      })
      // Safe Perl empty-string literal — valid in every context the
      // result might land in (`<%= '' %>`, `% if ('') {`, attribute
      // interpolation, template-literal substitution).
      return "''"
    }

    return this.renderParsedExprToPerl(parsed)
  }


  /**
   * Render a full ParsedExpr tree to Perl for top-level (non-filter)
   * expressions where identifiers are signals / stash vars. Delegates
   * to the shared ParsedExpr dispatcher with `MojoTopLevelEmitter`
   * (#1250 phase 1B).
   */
  private renderParsedExprToPerl(expr: ParsedExpr): string {
    return emitParsedExpr(expr, new MojoTopLevelEmitter(this))
  }

  /**
   * Hook for the ParsedExpr emitters to record a BF101 while walking
   * the AST — used for Mojo-specific gaps (`.find` / `.findIndex` have
   * no Embedded-Perl lowering) and templatePrimitive arity errors.
   */
  /** Whether `name` (a signal getter or prop) holds a string value, so an
   *  equality comparison against it should use Perl `eq`/`ne` (#1672). */
  _isStringValueName(name: string): boolean {
    return this.stringValueNames.has(name)
  }

  _recordExprBF101(message: string, reason?: string): void {
    this.errors.push({
      code: 'BF101',
      severity: 'error',
      message,
      loc: { file: this.componentName + '.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
      suggestion: {
        message: reason
          ? `${reason}\n\nOptions:\n1. Use /* @client */ for client-side evaluation\n2. Pre-compute the value in Perl`
          : 'Options:\n1. Use /* @client */ for client-side evaluation\n2. Pre-compute the value in Perl',
      },
    })
  }

  /** Internal hook for higher-order: predicate body re-uses the filter emitter. */
  _renderPerlFilterExprPublic(expr: ParsedExpr, param: string): string {
    return this.renderPerlFilterExpr(expr, param)
  }
}

// ===========================================================================
// ParsedExpr emitters (#1250 phase 1B)
// ===========================================================================

/**
 * Lowering for `array-method` IR nodes (#1443) — shared between the
 * filter and top-level emitters so the Embedded Perl form stays
 * consistent regardless of which context the chain lands in.
 *
 * The exhaustive switch on `method` paired with `assertNever` makes
 * adding a new variant to `ArrayMethod` a TS compile error here, not
 * a silent runtime no-op — the drift defence we already apply to
 * `ParsedExpr.kind` extended to its sub-discriminator.
 */
function renderArrayMethod(
  method: ArrayMethod,
  object: ParsedExpr,
  args: ParsedExpr[],
  emit: (e: ParsedExpr) => string,
): string {
  switch (method) {
    case 'join': {
      // arr.join(sep) → join(sep, @{arr}). The default `${obj}->{join}`
      // hash-lookup fallback would emit invalid Perl, which is why the
      // IR carves out a dedicated method node instead of routing
      // through the generic call dispatcher. `.join()` defaults the
      // separator to `,` (JS) and ignores any extra argument.
      const obj = emit(object)
      const sep = args.length >= 1 ? emit(args[0]) : `','`
      return `join(${sep}, @{${obj}})`
    }
    case 'includes': {
      // Both `arr.includes(x)` and `str.includes(sub)` route here —
      // the parser can't disambiguate the receiver type. The Mojo
      // runtime's `bf->includes($recv, $elem)` inspects `ref($recv)`
      // and dispatches: ARRAY ref scans the list with `eq`, scalar
      // falls back to `index(..., ...) != -1`. Helper lives in
      // packages/adapter-perl/lib/BarefootJS.pm.
      //
      // The `bf->` (no `$`) form matches every other helper emit —
      // in real Mojolicious `bf` is a controller helper; the
      // standalone test-render in test-render.ts rewrites the bare
      // `bf->` to `$bf->` so both render paths stay consistent.
      const obj = emit(object)
      const needle = emit(args[0])
      return `bf->includes(${obj}, ${needle})`
    }
    case 'indexOf':
    case 'lastIndexOf': {
      // Array `.indexOf(x)` / `.lastIndexOf(x)` value-equality
      // search. The Perl helpers (`bf->index_of`, `bf->last_index_of`)
      // walk the array forward / backward and compare with `eq`
      // (with defined/undef parity). The existing `.find` lowering
      // uses Perl `grep` for struct-field find — disjoint surface,
      // disjoint helpers.
      const fn = method === 'indexOf' ? 'index_of' : 'last_index_of'
      const obj = emit(object)
      const needle = emit(args[0])
      return `bf->${fn}(${obj}, ${needle})`
    }
    case 'at': {
      // `.at(i)` with negative-index support — `.at(-1)` is the
      // last element. The Mojo helper wraps the same `length + i`
      // arithmetic the Go `bf_at` does so the lowering stays
      // symmetric across adapters. `.at()` with no argument is `.at(0)`
      // (the first element); extra arguments are ignored.
      const obj = emit(object)
      const idx = args.length >= 1 ? emit(args[0]) : '0'
      return `bf->at(${obj}, ${idx})`
    }
    case 'concat': {
      // `.concat(other)` merges two arrays. Returns a new ARRAY
      // ref so the result composes with `.join(...)` / other
      // array-shape methods downstream (the canonical Tier A
      // conformance fixture chains `.concat(...).join(' ')`).
      // `.concat()` with no argument is a shallow copy — indistinguishable
      // from the receiver in an SSR snapshot, so it lowers to the receiver.
      if (args.length === 0) {
        return emit(object)
      }
      const a = emit(object)
      const b = emit(args[0])
      return `bf->concat(${a}, ${b})`
    }
    case 'slice': {
      // `.slice()` / `.slice(start)` / `.slice(start, end)`. The Mojo
      // helper mirrors the Go arithmetic (negative-index normalisation,
      // out-of-bounds clamping, empty result on start >= end). A
      // missing `start` defaults to 0 (full copy); an absent `end`
      // lowers as `undef`, which the helper treats as "to length". JS
      // ignores a third+ argument. Returns a new ARRAY ref so the
      // result composes with `.join(...)` downstream.
      const recv = emit(object)
      const start = args.length >= 1 ? emit(args[0]) : '0'
      const end = args.length >= 2 ? emit(args[1]) : 'undef'
      return `bf->slice(${recv}, ${start}, ${end})`
    }
    case 'reverse':
    case 'toReversed': {
      // Both shapes share a lowering — see the parser arm + Go
      // emit for the SSR-mutation-rationale. Returns a new ARRAY
      // ref so the result composes with `.join(...)` downstream.
      const recv = emit(object)
      return `bf->reverse(${recv})`
    }
    case 'toLowerCase': {
      // Perl's native `lc` is the obvious lowering — no helper
      // method needed. The receiver flows through `emit` so any
      // upstream coercion (`$value`, `$bf->string(...)`, etc.)
      // composes naturally.
      const recv = emit(object)
      return `lc(${recv})`
    }
    case 'toUpperCase': {
      // Perl's native `uc` — mirrors `toLowerCase` exactly.
      const recv = emit(object)
      return `uc(${recv})`
    }
    case 'trim': {
      // No Perl native `trim`; route through the `bf->trim`
      // helper so the regex stays in one place (and so an undef
      // receiver doesn't trigger a warning about applying `s///`
      // to undef).
      const recv = emit(object)
      return `bf->trim(${recv})`
    }
    case 'toFixed': {
      // `.toFixed(digits?)` — Number → fixed-decimal string. `bf->to_fixed`
      // mirrors JS rounding + zero-padding (default 0 digits). #1897.
      const recv = emit(object)
      const digits = args.length >= 1 ? emit(args[0]) : '0'
      return `bf->to_fixed(${recv}, ${digits})`
    }
    case 'split': {
      // `.split()` / `.split(sep)` / `.split(sep, limit)` — string →
      // ARRAY ref via `bf->split`. With no separator the helper returns
      // the whole string as a single element; otherwise it quotemetas
      // the separator (literal match, not regex) and keeps trailing
      // empties (`-1`), staying byte-equal with Go's `bf_split`. The
      // optional `limit` caps the pieces; JS ignores a third+ argument.
      // See #1448 Tier B.
      const recv = emit(object)
      if (args.length === 0) {
        return `bf->split(${recv})`
      }
      const sep = emit(args[0])
      if (args.length === 1) {
        return `bf->split(${recv}, ${sep})`
      }
      const limit = emit(args[1])
      return `bf->split(${recv}, ${sep}, ${limit})`
    }
    case 'startsWith':
    case 'endsWith': {
      // `.startsWith(prefix, position?)` / `.endsWith(suffix,
      // endPosition?)` — string → boolean. The Perl helpers
      // (`bf->starts_with` / `bf->ends_with`) do a `substr`-anchored
      // comparison so the search string is matched literally (no regex
      // metachar surprises) and undef receivers stay quiet. The optional
      // second argument re-anchors the test; JS ignores a third+
      // argument. See #1448 Tier B.
      const fn = method === 'startsWith' ? 'starts_with' : 'ends_with'
      const recv = emit(object)
      const arg = emit(args[0])
      if (args.length >= 2) {
        return `bf->${fn}(${recv}, ${arg}, ${emit(args[1])})`
      }
      return `bf->${fn}(${recv}, ${arg})`
    }
    case 'replace': {
      // `.replace(old, new)` — string-pattern form, first occurrence.
      // The `bf->replace` helper splices via index/substr (not `s///`)
      // so both the pattern and the replacement are literal — no Perl
      // regex metacharacters and no `$1` / `$&` interpolation in the
      // replacement, keeping it byte-equal with Go's `bf_replace`. The
      // regex-pattern form is refused upstream at the parser. See
      // #1448 Tier B.
      const recv = emit(object)
      const oldS = emit(args[0])
      const newS = emit(args[1])
      return `bf->replace(${recv}, ${oldS}, ${newS})`
    }
    case 'repeat': {
      // `.repeat(n)` — string repeated `n` times. The `bf->repeat`
      // helper wraps Perl's `x` operator with the same negative-count
      // → "" clamp and integer truncation Go's `bf_repeat` applies, so
      // the two adapters stay byte-equal. Full JS arity: the no-argument
      // form is `repeat(0)` → ""; a second+ argument is ignored.
      // See #1448 Tier B.
      const recv = emit(object)
      const count = args.length === 0 ? '0' : emit(args[0])
      return `bf->repeat(${recv}, ${count})`
    }
    case 'padStart':
    case 'padEnd': {
      // `.padStart(target, pad?)` / `.padEnd(target, pad?)`. The
      // `bf->pad_*` helpers default the pad to a single space when the
      // arg is omitted and measure length in characters, matching Go's
      // rune-based `bf_pad_*`. Full JS arity: the no-argument form is
      // `padStart(0)` → the receiver unchanged; a third+ argument is
      // ignored. See #1448 Tier B.
      const fn = method === 'padStart' ? 'pad_start' : 'pad_end'
      const recv = emit(object)
      if (args.length === 0) {
        return `bf->${fn}(${recv}, 0)`
      }
      const target = emit(args[0])
      if (args.length === 1) {
        return `bf->${fn}(${recv}, ${target})`
      }
      const pad = emit(args[1])
      return `bf->${fn}(${recv}, ${target}, ${pad})`
    }
    default: {
      // TS-level exhaustiveness guard. If this throws at runtime, the
      // IR was constructed against a newer `ArrayMethod` variant that
      // this adapter hasn't been updated for — loud failure is better
      // than emitting a silent empty string downstream.
      const _exhaustive: never = method
      throw new Error(
        `renderArrayMethod: unhandled ArrayMethod '${(_exhaustive as string)}'`,
      )
    }
  }
}

/**
 * Shared Mojo emit for `.sort(cmp)` / `.toSorted(cmp)` (#1448 Tier B).
 * Used by both the filter-context emitter and the top-level emitter,
 * plus the loop-hoist path in `renderLoop` — same emit shape across
 * all three so a regression in any one path surfaces consistently.
 *
 * The Perl helper accepts a hash-ref opts bag whose `keys` entry is
 * an ordered list of per-key hashes (room for a future `nulls` knob
 * without arity churn), and returns a fresh ARRAY ref so downstream
 * composition (`@{bf->sort(...)}` in `join(...)`, etc.) stays
 * straightforward.
 */
/**
 * Encode an `IRLoop.markerId` into a Perl-identifier-safe suffix
 * for the `bf_iter_…` hoist var. Collision-free for marker ids
 * that differ in any character — `-` and `_` map to distinct
 * encodings (`_x2d` vs `__`) so `l-0` and `l_0` stay distinct.
 *
 * Today the IR only emits `l<digits>` so the encoding is mostly
 * an identity, but pinning collision-freeness up front avoids a
 * silent variable-shadow bug if a future marker generator widens
 * the alphabet.
 */
function perlIdentifierFromMarkerId(markerId: string): string {
  return markerId.replace(/[^a-zA-Z0-9]/g, (ch) =>
    ch === '_' ? '__' : `_x${ch.charCodeAt(0).toString(16)}`
  )
}

function renderSortMethod(recv: string, c: SortComparator): string {
  // One hash per comparison key, in priority order, under `keys`. A
  // simple comparator yields a one-element list; a `||`-chained
  // multi-key comparator yields one per operand. `bf->sort` walks them
  // in order, falling through to the next on a tie.
  const keyHashes = c.keys.map((k) => {
    const keyEntry =
      k.key.kind === 'self'
        ? `key_kind => 'self'`
        : `key_kind => 'field', key => '${k.key.field}'`
    return `{ ${keyEntry}, compare_type => '${k.type}', direction => '${k.direction}' }`
  })
  return `bf->sort(${recv}, { keys => [${keyHashes.join(', ')}] })`
}

/**
 * Render a `.reduce(fn, init)` arithmetic fold (#1448 Tier C) as a
 * `bf->reduce(...)` call. The structured `ReduceOp` maps to the Perl
 * helper's options hash:
 *
 *   bf->reduce($recv, { op => '+', key_kind => 'field', key => 'duration',
 *                       type => 'numeric', init => 0 })
 *
 * A numeric init passes through as a bare Perl number (`0`, `-1`); a
 * string init (concat fold) is re-quoted from its literal contents.
 */
function renderReduceMethod(recv: string, op: ReduceOp, direction: 'left' | 'right'): string {
  const keyEntry =
    op.key.kind === 'self'
      ? `key_kind => 'self'`
      : `key_kind => 'field', key => '${op.key.field}'`
  // `op.init` is the decoded seed value. A numeric seed is already a
  // canonical decimal literal Perl reads directly; a concat seed is the
  // string contents, embedded in a single-quoted Perl literal. The `'`
  // escape is REQUIRED: a seed decoded from a double-quoted JS literal
  // (e.g. `"a'b"`) is escape-free yet contains an apostrophe. A literal
  // backslash can't occur (it would need a `\\` escape, which the parser
  // refuses), but escaping it too keeps this self-contained.
  const init =
    op.type === 'string'
      ? `'${op.init.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
      : op.init
  // `direction` is "left" (reduce) or "right" (reduceRight); the Perl
  // helper reverses the list for "right". Only observable for concat.
  return `bf->reduce(${recv}, { op => '${op.op}', ${keyEntry}, type => '${op.type}', init => ${init}, direction => '${direction}' })`
}

// `.flat(depth?)` → `bf->flat($recv, $depth)`. The `Infinity` form lowers
// to the `-1` sentinel (flatten fully); a finite depth flattens that many
// levels (`0` = shallow copy). See `sub flat` in BarefootJS.pm. (#1448)
function renderFlatMethod(recv: string, depth: FlatDepth): string {
  const d = depth === 'infinity' ? -1 : depth
  return `bf->flat(${recv}, ${d})`
}

// `.flatMap(i => i)` / `.flatMap(i => i.field)` → `bf->flat_map($recv,
// 'self'|'field', 'field')`, and the array-literal tuple form
// `i => [i.a, i.b]` → `bf->flat_map_tuple($recv, ['field','a'], ...)`
// (one arrayref per leaf). The field key is the raw JS prop name (Perl
// hashes are keyed by it), mirroring `bf->reduce`. See `sub flat_map` /
// `sub flat_map_tuple` in BarefootJS.pm.
function renderFlatMapMethod(recv: string, op: FlatMapOp): string {
  const proj = op.projection
  if (proj.kind === 'tuple') {
    const specs = proj.elements
      .map(l => (l.kind === 'self' ? `['self', '']` : `['field', '${l.field}']`))
      .join(', ')
    return `bf->flat_map_tuple(${recv}, ${specs})`
  }
  if (proj.kind === 'self') return `bf->flat_map(${recv}, 'self', '')`
  return `bf->flat_map(${recv}, 'field', '${proj.field}')`
}

/** True when `type` is the `string` primitive. */
function isStringTypeInfo(type: TypeInfo | undefined): boolean {
  return type?.kind === 'primitive' && type.primitive === 'string'
}

/** True when `initialValue` is a bare string-literal expression (`'x'` /
 *  `"x"`), used as a fallback for signals whose type wasn't inferred. */
function isBareStringLiteral(initialValue: string | undefined): boolean {
  if (!initialValue) return false
  const v = initialValue.trim()
  return (v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))
}

/**
 * Whether a comparison operand is string-typed, so JS `===`/`!==` against it
 * must lower to Perl `eq`/`ne` instead of numeric `==`/`!=` (#1672). Covers a
 * string literal, a string-signal getter call (`sel()`), and a string prop
 * access (`props.x`). `isStringName` reports whether a getter/prop name is
 * known-string. Loop-element fields (`t.id`) on untyped arrays have no known
 * type and stay undetected — a separate, narrower gap.
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
 * Lower `arr[index]` to a Perl deref. Perl distinguishes array
 * (`->[$i]`) from hash (`->{$k}`) access, which JS's single `[]` does
 * not — so we pick by the index expression's type: a string-typed key
 * derefs the hash, anything else (the common loop-index / arithmetic
 * case, e.g. `selected()[index]`) derefs the array. #1897.
 */
function emitIndexAccessPerl(
  object: ParsedExpr,
  index: ParsedExpr,
  emit: (e: ParsedExpr) => string,
  isStringName: (n: string) => boolean,
): string {
  const i = emit(index)
  return isStringTypedOperand(index, isStringName)
    ? `${emit(object)}->{${i}}`
    : `${emit(object)}->[${i}]`
}

/**
 * Lowering for the predicate body of a filter / every / some / find,
 * plus the same shape used by `renderBlockBodyCondition` for complex
 * block-body filters. Identifiers resolve against:
 *   - the predicate's loop param (`$param`),
 *   - `localVarMap` aliases declared inside the block body, then
 *   - a bare `$name` fallback for signals captured by the closure.
 *
 * Methods that have no filter-context meaning (template-literal,
 * arrow-fn, conditional, unsupported) fall back to the `'1'` literal
 * the original switch's `default` arm returned — those shapes never
 * arose inside the predicates the adapter actually accepts.
 */
class MojoFilterEmitter implements ParsedExprEmitter {
  constructor(
    private readonly param: string,
    private readonly localVarMap: Map<string, string>,
    // Reports whether a getter/prop name is string-typed, so `===`/`!==`
    // against it lowers to `eq`/`ne` (#1672). Defaults to "never" for callers
    // that don't thread it through.
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
    if (literalType === 'null') return 'undef'
    return String(value)
  }

  member(object: ParsedExpr, property: string, _computed: boolean, emit: (e: ParsedExpr) => string): string {
    // `.length` on a higher-order result (e.g.
    // `x.tags.filter(t => t.active).length > 0` inside the outer
    // filter predicate, #1443). The higher-order emit produces an
    // anonymous array ref `[grep ...]`; reading `->{length}` on that
    // is undef at runtime, which is why the pre-#1443 `containsHigherOrder`
    // gate refused this shape outright. Lowering `.length` to
    // `scalar(@{...})` makes the result a real Perl integer.
    if (property === 'length' && (object.kind === 'higher-order' || object.kind === 'array-literal')) {
      return `scalar(@{${emit(object)}})`
    }
    return `${emit(object)}->{${property}}`
  }

  indexAccess(object: ParsedExpr, index: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    return emitIndexAccessPerl(object, index, emit, this.isStringName)
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
      // Wrap binary/logical operands in parens to dodge Perl precedence surprises.
      const needsParens = argument.kind === 'binary' || argument.kind === 'logical'
      return needsParens ? `!(${arg})` : `!${arg}`
    }
    if (op === '-') return `-${arg}`
    return arg
  }

  binary(op: string, left: ParsedExpr, right: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    const l = emit(left)
    const r = emit(right)
    // String equality: `eq`/`ne` when EITHER operand is string-typed — a string
    // literal, a string signal getter, or a string prop. Numeric `==`/`!=`
    // would coerce both sides to 0 and match unrelated non-numeric strings (#1672).
    const isStr = (e: ParsedExpr) => isStringTypedOperand(e, this.isStringName)
    const stringCmp = isStr(left) || isStr(right)
    if ((op === '===' || op === '==') && stringCmp) {
      return `${l} eq ${r}`
    }
    if ((op === '!==' || op === '!=') && stringCmp) {
      return `${l} ne ${r}`
    }
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
    // The predicate body is also a filter context, but with this
    // higher-order's own `param` (potentially shadowing the outer one),
    // so we spin up a nested emitter with the inner param.
    const arrayExpr = emit(object)
    const predBody = emitParsedExpr(predicate, new MojoFilterEmitter(param, this.localVarMap, this.isStringName))
    const grepBody = predBody.replace(new RegExp(`\\$${param}\\b`, 'g'), '$_')
    if (method === 'filter') return `[grep { ${grepBody} } @{${arrayExpr}}]`
    if (method === 'every') return `!(grep { !(${grepBody}) } @{${arrayExpr}})`
    if (method === 'some') return `!!(grep { ${grepBody} } @{${arrayExpr}})`
    return arrayExpr
  }

  arrayLiteral(elements: ParsedExpr[], emit: (e: ParsedExpr) => string): string {
    // Perl array ref: `[$a, $b]`. Filter-context use is rare (the
    // outer emitter routes most array-literal arrivals via
    // MojoTopLevelEmitter), but #1443's chain
    // `[a, b].filter(Boolean).join(' ')` can land here when the
    // outer `.filter()` recurses into a nested filter whose own
    // source is an array literal.
    return `[${elements.map(emit).join(', ')}]`
  }

  arrayMethod(
    method: ArrayMethod,
    object: ParsedExpr,
    args: ParsedExpr[],
    emit: (e: ParsedExpr) => string,
  ): string {
    // Filter-context array methods are vanishingly rare — predicates
    // operate on scalars, not arrays. Defer to the top-level rendering
    // (`join(sep, @{...})`) for any case that does land here so the
    // emission stays consistent across contexts.
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

  objectLiteral(_properties: ObjectLiteralProperty[], _raw: string, _emit: (e: ParsedExpr) => string): string {
    // Filter-predicate context: an object literal is not a boolean leaf, so
    // emit the truthy sentinel exactly as `unsupported` does (byte-identical
    // with the pre-`object-literal` fallback; Roadmap A-1). Object *values*
    // are lowered to Perl hashrefs in the conditional/attr paths, not here.
    return '1'
  }
}

/**
 * Lowering for top-level expressions whose identifiers resolve against
 * the Mojo template's stash (signals, props, locals introduced by
 * `% my $x = ...;` lines). Differs from the filter emitter mainly in
 *   - `.length` → `scalar(@{...})` (filter contexts never see arrays
 *     in lvalue position),
 *   - `conditional` is supported (filter predicates can't return
 *     ternaries),
 *   - the `unsupported` fallback drops to the regex pipeline so legacy
 *     shapes the AST can't classify still emit something coherent.
 */
class MojoTopLevelEmitter implements ParsedExprEmitter {
  constructor(private readonly adapter: MojoAdapter) {}

  identifier(name: string): string {
    // `undefined` / `null` nested inside a larger expression tree
    // (#1897, pagination's `props.isActive ? 'page' : undefined`) — the
    // top-level short-circuits don't see them.
    if (name === 'undefined' || name === 'null') return 'undef'
    // Module pure-string const (e.g. `const baseClasses = '...'` used in a
    // className template literal): inline the literal value rather than emit
    // `$baseClasses` against a stash variable that is never bound.
    const inlined = this.adapter.resolveModuleStringConst(name)
    if (inlined !== null) return inlined
    // Same for a literal const of any scope (`const totalPages = 5`,
    // #1897 pagination's `Page {currentPage()} of {totalPages}`).
    const literalConst = this.adapter.resolveLiteralConst(name)
    if (literalConst !== null) return literalConst
    return `$${name}`
  }

  literal(value: string | number | boolean | null, literalType: LiteralType): string {
    if (literalType === 'string') return `'${value}'`
    if (literalType === 'boolean') return value ? '1' : '0'
    if (literalType === 'null') return 'undef'
    return String(value)
  }

  member(object: ParsedExpr, property: string, _computed: boolean, emit: (e: ParsedExpr) => string): string {
    // `props.x` flattens to the bare `$x` the Mojo SSR caller binds each
    // prop to (props arrive as individual `my $x = ...` vars, not a
    // `$props` hashref).
    if (object.kind === 'identifier' && object.name === 'props') {
      return `$${property}`
    }
    // Static property access on a module object-literal const
    // (`variantClasses.ghost`, #1897) resolves at compile time — the
    // generic hash lowering below would dereference a Perl var that
    // doesn't exist server-side.
    if (object.kind === 'identifier') {
      const staticValue = this.adapter.resolveStaticRecordLiteral(object.name, property)
      if (staticValue !== null) return staticValue
    }
    const obj = emit(object)
    if (property === 'length') return `scalar(@{${obj}})`
    return `${obj}->{${property}}`
  }

  indexAccess(object: ParsedExpr, index: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    return emitIndexAccessPerl(object, index, emit, n => this.adapter._isStringValueName(n))
  }

  call(callee: ParsedExpr, args: ParsedExpr[], emit: (e: ParsedExpr) => string): string {
    // Signal getter: count() → $count
    if (callee.kind === 'identifier' && args.length === 0) {
      return `$${callee.name}`
    }
    // Env-signal method call (#1922): `searchParams().get('sort')` is a real
    // method call on the per-request `$searchParams` reader object, not the
    // generic hash deref `member` would emit (`$searchParams->{get}`, which
    // drops the arg). Matches the local import binding (incl. an alias).
    if (this.adapter._searchParamsLocals.size > 0) {
      const sp = matchSearchParamsMethodCall(callee, args, this.adapter._searchParamsLocals)
      if (sp) {
        return `$searchParams->${sp.method}(${sp.args.map(emit).join(', ')})`
      }
    }
    // Identifier-path templatePrimitive (#1189): `JSON.stringify(x)` /
    // `Math.floor(x)` → `bf->json($x)` / `bf->floor($x)`. Args render
    // recursively through this same emitter so prop refs / signal calls
    // inside them get the standard transforms. Mirrors the Go adapter's
    // `call()` primitive dispatch. A wrong-arity call records BF101 and
    // returns the safe `''` placeholder (never silently emits a bad call).
    const path = identifierPath(callee)
    const spec = path ? MOJO_TEMPLATE_PRIMITIVES[path] : undefined
    if (path && spec) {
      if (args.length === spec.arity) {
        return spec.emit(args.map(emit))
      }
      this.adapter._recordExprBF101(
        `templatePrimitive '${path}' expects ${spec.arity} arg(s), got ${args.length}`,
        `Call '${path}' with exactly ${spec.arity} argument(s).`,
      )
      // Don't fall through to the generic `emit(callee)` below — for a
      // member callee (`JSON.stringify`) that emits an invalid Perl
      // hash-deref (`$JSON->{stringify}`). Return the same safe
      // empty-string placeholder the other BF101 paths use.
      return "''"
    }
    // Array methods (`.join` and any others added to ArrayMethod, #1443)
    // are lifted into the `array-method` IR kind at parse time, so they
    // never reach this dispatcher. Per-method detection here would mix
    // value-builtin lowering with signal-call lowering — keeping them
    // separated forces every adapter to declare the full array-method
    // surface in one place (the `arrayMethod` emitter below).
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
    // String equality: `eq`/`ne` when EITHER operand is string-typed — a string
    // literal (`role() === 'admin'`), a string signal getter (`sel()`), or a
    // string prop (`props.x`). Falling back to numeric `==`/`!=` would make
    // Perl coerce both sides to 0 and match unrelated non-numeric strings
    // (`"b" == "a"` → true), so all loop items render their true branch (#1672).
    const isStr = (e: ParsedExpr) => isStringTypedOperand(e, n => this.adapter._isStringValueName(n))
    const stringCmp = isStr(left) || isStr(right)
    if ((op === '===' || op === '==') && stringCmp) {
      return `${l} eq ${r}`
    }
    if ((op === '!==' || op === '!=') && stringCmp) {
      return `${l} ne ${r}`
    }
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
    const arrayExpr = emit(object)
    const predBody = this.adapter._renderPerlFilterExprPublic(predicate, param)
    const grepBody = predBody.replace(new RegExp(`\\$${param}\\b`, 'g'), '$_')
    if (method === 'filter') return `[grep { ${grepBody} } @{${arrayExpr}}]`
    if (method === 'every') return `!(grep { !(${grepBody}) } @{${arrayExpr}})`
    if (method === 'some') return `!!(grep { ${grepBody} } @{${arrayExpr}})`
    // `.find` / `.findIndex` / `.findLast` / `.findLastIndex` → the runtime
    // helpers (`bf->find` / `find_index` / `find_last` / `find_last_index`),
    // which call the predicate as a per-element coderef — same shape Xslate
    // emits via a Kolon lambda. The JS camelCase names map to the snake_case
    // helpers (like index_of / last_index_of).
    const findHelper: Record<string, string> = {
      find: 'find',
      findIndex: 'find_index',
      findLast: 'find_last',
      findLastIndex: 'find_last_index',
    }
    if (findHelper[method]) {
      return `bf->${findHelper[method]}(${arrayExpr}, sub { my $${param} = $_[0]; ${predBody} })`
    }
    return arrayExpr
  }

  arrayLiteral(elements: ParsedExpr[], emit: (e: ParsedExpr) => string): string {
    // Perl array ref. Identifiers inside elements resolve through the
    // top-level emitter so `[className, childClass]` becomes
    // `[$className, $childClass]` (the registry Slot's chain in
    // #1443). Empty `[]` stays as `[]` — a valid empty Perl array
    // ref that grep/join handle naturally.
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
    // `` `n=${count() + 1}` `` → Perl string concatenation
    // (`"n=" . ($count + 1)`), NOT double-quote interpolation. Perl only
    // interpolates simple `$var` reads inside `"..."`, so complex `${...}`
    // parts — arithmetic, helper calls (`bf->json(...)`), ternaries —
    // would render unevaluated if inlined into a quoted string.
    //   - Static chunks are emitted as quoted literals with the sigils
    //     that interpolate inside `"..."` (`$`/`@`) plus `"`/`\` escaped,
    //     so literal text survives verbatim.
    //   - Expression terms whose Perl precedence is below `.` (binary /
    //     logical / conditional) wrap in parens so they bind before the
    //     concatenation.
    const terms: string[] = []
    for (const part of parts) {
      if (part.type === 'string') {
        if (part.value !== '') {
          terms.push(`"${part.value.replace(/[\\"$@]/g, m => `\\${m}`)}"`)
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
    if (terms.length === 0) return '""'
    return terms.join(' . ')
  }

  arrowFn(_param: string, _body: ParsedExpr): string {
    // A bare arrow function never stands alone at a render position (it's
    // only meaningful as a higher-order predicate, handled above). Return
    // the safe Perl empty-string literal `''` — consistent with the BF101
    // / `unsupported` paths — so a stray emit can't produce a `<%= %>`
    // syntax error.
    return "''"
  }

  unsupported(_raw: string, _reason: string): string {
    // Unreachable in the parse-first flow: `convertExpressionToPerl`
    // gates on `isSupported` before dispatching, and `isSupported`
    // recurses, so a top-level supported expression never contains an
    // `unsupported` node. Return a safe Perl empty-string literal in
    // case a future caller renders a node tree directly.
    return "''"
  }

  objectLiteral(_properties: ObjectLiteralProperty[], _raw: string, _emit: (e: ParsedExpr) => string): string {
    // Mirror `unsupported`: a bare object literal reaching the dispatcher
    // lowers to the safe Perl empty-string literal, exactly as before the
    // `object-literal` kind existed (byte-identical; Roadmap A-1). Object
    // values that round-trip to a Perl hashref go through the dedicated
    // `objectLiteralToPerlHashref` lowering in the conditional/attr paths.
    return "''"
  }
}

export const mojoAdapter = new MojoAdapter()

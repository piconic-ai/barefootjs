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
  type ContextConsumer,
  collectModuleStringConsts,
  lookupStaticRecordLiteral,
  searchParamsLocalNames,
  prepareLoweringMatchers,
  queryHrefArgs,
  isValidHelperId,
  sortComparatorFromArrow,
  isLowerableLoopDestructure,
} from '@barefootjs/jsx'
import { isAriaBooleanAttr, isBooleanResultExpr } from './boolean-result.ts'
import type { ParsedExpr, LoweringMatcher } from '@barefootjs/jsx'
import { BF_SLOT, BF_COND, BF_REGION, escapeHtml } from '@barefootjs/shared'

import type { MojoRenderCtx } from './lib/types.ts'
import { MOJO_PRIMITIVE_EMIT_MAP } from './lib/constants.ts'
import { perlHashKey, perlIdentifierFromMarkerId } from './lib/perl-naming.ts'
import {
  resolveJsxChildrenProp,
  collectRootScopeNodes,
} from './lib/ir-scope.ts'
import { renderSortMethod, renderSortEval } from './expr/array-method.ts'
import { MojoFilterEmitter, MojoTopLevelEmitter } from './expr/emitters.ts'
import type { MojoEmitContext, MojoSpreadContext, MojoMemoContext } from './emit-context.ts'
import {
  hasClientInteractivity,
  collectImportedLoopChildComponentErrors,
} from './analysis/component-tree.ts'
import {
  conditionalSpreadToPerl,
  objectLiteralExprToPerlHashref,
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

export type { MojoAdapterOptions } from './lib/types.ts'
import type { MojoAdapterOptions } from './lib/types.ts'

/**
 * Build a Perl accessor expression for a `.map()` destructure binding's
 * structured `segments` path (#2087 Phase B), walking `field` (`->{key}`,
 * quoted with `perlHashKey`'s convention when `!isIdent`) / `index`
 * (`->[N]`) steps onto `base`. Never string-parses `LoopParamBinding.path` —
 * see the repo-wide rule against regex-parsing JS/TS-derived syntax.
 *
 * Used both for a fixed binding's FULL accessor (`base` = `$__bf_item`,
 * `segments` = the whole path) and a rest binding's PARENT-prefix accessor
 * (`segments` may be empty, at the loop root, in which case this returns
 * `base` unchanged) — see `LoopParamBinding.segments` jsdoc for which case
 * a binding is in.
 */
function perlSegmentAccessor(base: string, segments: readonly LoopBindingPathSegment[]): string {
  let expr = base
  for (const seg of segments) {
    expr +=
      seg.kind === 'field'
        ? `->{${seg.isIdent ? seg.key : perlHashKey(seg.key)}}`
        : `->[${seg.index}]`
  }
  return expr
}

/**
 * Quote a string as a Perl single-quoted literal (backslash first, then the
 * quote, so the escape doesn't double up). Unlike `perlHashKey` — which
 * intentionally leaves an identifier-safe name as a bareword for `->{key}` /
 * `key => val` hash-key position — a plain list element (`bf->omit($x, [id,
 * title])`) is NOT hash-key position: an unquoted bareword there is a sub
 * call under `use strict subs`, so every object-rest exclude key needs an
 * unconditional string literal.
 */
function perlStringLiteral(s: string): string {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
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
   * `IRLoop.depth` of the loop currently being rendered (save/restore
   * around `renderChildren(loop.children)`, mirroring `inLoop` above).
   * `renderAttributes` reads this to derive the `key` → `data-key`/
   * `data-key-N` suffix — the depth is IR-computed (jsx-to-ir.ts), not
   * re-derived here (#2168 nested-loop-outer-binding).
   */
  private currentLoopKeyDepth = 0
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
  private _searchParamsLocals: Set<string> = new Set()

  /**
   * Call-lowering matchers active for this component (#2057). Bound at
   * `generate()` entry via `prepareLoweringMatchers` and read by the top-level
   * emitter. Covers both userland plugins and the compiler's built-in plugins
   * (e.g. `queryHref` → `bf->query`, #2042) — one uniform path, no per-API branch.
   */
  private _loweringMatchers: LoweringMatcher[] = []
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
    // from the active provider value (or the `createContext` default) so the
    // body's `$x` resolves. The provider side pushes the value via
    // `emitProvider`; here the consumer reads it. (#1297)
    const ctxSeed = generateContextConsumerSeed(ir)

    // Prop/signal-derived memos that aren't statically evaluable (e.g.
    // `createMemo(() => props.value * 10)`) have a `null` SSR default, so
    // their `$x` would render empty. Compute them in-template from the
    // already-seeded prop/signal vars — mirroring Go's generated child
    // constructor that evaluates the memo from the passed prop. (#1297)
    const memoSeed = generateDerivedMemoSeed(this.memoCtx, ir)

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
  private resolveLiteralConst(name: string): string | null {
    if (this.loopBoundNames?.has?.(name)) return null
    const c = (this.localConstants ?? []).find(lc => lc.name === name)
    if (c?.value === undefined) return null
    const v = c.value.trim()
    if (/^-?\d+(\.\d+)?$/.test(v)) return v
    const strLit = /^'([^'\\]*)'$/.exec(v) ?? /^"([^"\\]*)"$/.exec(v)
    if (strLit) return `'${strLit[1].replace(/[\\']/g, m => `\\${m}`)}'`
    return null
  }

  private resolveStaticRecordLiteral(objectName: string, key: string): string | null {
    if (this.loopBoundNames?.has?.(objectName)) return null
    const hit = lookupStaticRecordLiteral(objectName, key, this.localConstants)
    if (!hit) return null
    return hit.kind === 'number'
      ? hit.text
      : `'${hit.text.replace(/[\\']/g, m => `\\${m}`)}'`
  }

  private resolveModuleStringConst(name: string): string | null {
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
    const hasInteractivity = hasClientInteractivity(ir)
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
    // IRText carries the entity-DECODED value (Phase 1 decodes JSX
    // character references); re-escape for direct HTML emission.
    return escapeHtml(node.value)
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
      return `<%== bf->comment("loop:${loop.markerId}") %><%== bf->comment("/loop:${loop.markerId}") %>`
    }

    // A `.map()` destructure loop param (`([k, v]) => ...` / `({ id, user: {
    // name } }) => ...` / `({ id, ...rest }) => ...`) lowers to a Perl `my`
    // local per binding, walking each binding's structured `segments` path
    // (#2087 Phase B) into a native `->{key}` / `->[N]` accessor off the
    // per-item var — so the body's `$id` / `$name` / `$rest->{flag}` /
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
        message: `Loop callback uses a destructure pattern (\`${loop.param}\`) that the Mojo adapter cannot lower — see the diagnostic detail for the specific shape.`,
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
    // the use site (`resolveLiteralConst`'s numeric/single-quoted-string fast
    // path, or a static-record-literal lookup), never binding one as a `my`
    // template local. Left unchecked, `% for my $_i (0..$#{$entries}) {`
    // over an undeclared `$entries` faults under `use strict` at request
    // time instead of failing loudly at build time. Pre-existing, general
    // limitation, orthogonal to #2087's destructure-binding work — newly
    // reachable in this adapter's test corpus only because the widened
    // destructure gate (#2087 Phase A/B) no longer refuses this fixture's
    // `([emoji, users]) => ...` param first.
    const arrayName = loop.array.trim()
    if (/^[A-Za-z_$][\w$]*$/.test(arrayName)) {
      const arrayConst = (this.localConstants ?? []).find(c => c.name === arrayName)
      if (arrayConst && !arrayConst.isModule && this.resolveLiteralConst(arrayName) === null) {
        this.errors.push({
          code: 'BF101',
          severity: 'error',
          message: `Loop array \`${arrayName}\` is a local computed value (\`${arrayConst.value}\`) that the Mojo adapter cannot bind as a template variable — only numeric/string-literal locals inline at their use site.`,
          loc: loop.loc ?? { file: this.componentName + '.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
          suggestion: {
            message:
              'Pre-compute the array server-side and pass it as a prop, or mark the loop position as @client-only so it runs in JS on the client.',
          },
        })
      }
    }

    const rawArray = this.convertExpressionToPerl(loop.array)
    // Apply sort if present (#1448 Tier B): wrap the loop array in the
    // shared sort helper. The same `renderSortEval` / `renderSortMethod`
    // pair feeds both this loop-chain hoist and the emitter's
    // `callbackMethod` sort arm, so a regression in either path surfaces
    // with the identical emit shape.
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
    const prevLoopKeyDepth = this.currentLoopKeyDepth
    this.currentLoopKeyDepth = loop.depth
    const renderedChildren = this.renderChildren(loop.children)
    this.currentLoopKeyDepth = prevLoopKeyDepth
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
      // Evaluator-first (#2018 P3): serialize the comparator + emit
      // `bf->sort_eval`; fall back to the structured `bf->sort` for a
      // comparator the evaluator can't model (e.g. `localeCompare`).
      //
      // The hoisted sort runs OUTSIDE this loop, so this loop's bound names
      // must not shadow the comparator's captured free vars while emitting the
      // env — otherwise a captured var that happens to share a loop-param name
      // is blocked from inlining its module const and renders as an undefined
      // `$name` (strict-mode fault, Copilot review #2035). Drop this loop's
      // bound names for the sort emit, then restore (a nested loop's outer
      // bindings, ref-counted, stay in effect).
      for (const n of loopBound) {
        const c = (this.loopBoundNames.get(n) ?? 1) - 1
        if (c <= 0) this.loopBoundNames.delete(n)
        else this.loopBoundNames.set(n, c)
      }
      const sortEmit = (e: ParsedExpr) => this.convertExpressionToPerl('', e)
      // `loop.sortComparator` is the generic `IRLoopSort` (#2018 P5): serialize
      // the arrow body for the evaluator (eval-first), recover the structured
      // comparator from the arrow for the `localeCompare` fallback.
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
        // comparator — record BF101 and fall through with the unsorted array
        // so the hoist line stays syntactically valid.
        this._recordExprBF101(
          `.sort(...) loop comparator is not lowerable to a template sort`,
          `Pre-sort the array in the route handler, or mark the loop @client-only.`,
        )
        sorted = rawArray
      }
      for (const n of loopBound) {
        this.loopBoundNames.set(n, (this.loopBoundNames.get(n) ?? 0) + 1)
      }
      lines.push(`% my $${sortedHoist} = ${sorted};`)
    }
    lines.push(`% for my ${indexVar} (0..$#{${array}}) {`)
    if (loop.iterationShape !== 'keys') {
      if (supportableDestructure) {
        // Per-item var + one `my` local per binding, walking each binding's
        // `segments` path (#2087 Phase B):
        //   - fixed (`b.rest` unset): the FULL accessor from `$__bf_item`.
        //   - array-rest: `bf->slice(parent, from, undef)` — the same
        //     runtime helper `.slice()` JS-method calls lower to (see
        //     `array-method.ts`), so the "no end → to length" arithmetic
        //     stays in one place.
        //   - object-rest: `bf->omit(parent, [...excluded keys...])` — a
        //     TRUE residual hashref (not the whole item aliased), so both
        //     `$rest->{flag}` (member-access use) and `bf->spread_attrs($rest)`
        //     (spread-onto-element use) see only the non-destructured keys.
        // `parent` is `$__bf_item` walked through the binding's PARENT-prefix
        // `segments` (empty at the loop root, per the `LoopParamBinding`
        // jsdoc) — NOT the same as a fixed binding's full-accessor segments.
        lines.push(`% my $__bf_item = ${array}->[${indexVar}];`)
        for (const b of loop.paramBindings ?? []) {
          const parent = perlSegmentAccessor('$__bf_item', b.segments ?? [])
          if (b.rest?.kind === 'object') {
            const exclude = b.rest.exclude.map(k => perlStringLiteral(k.key)).join(', ')
            lines.push(`% my $${b.name} = bf->omit(${parent}, [${exclude}]);`)
          } else if (b.rest?.kind === 'array') {
            lines.push(`% my $${b.name} = bf->slice(${parent}, ${b.rest.from}, undef);`)
          } else {
            lines.push(`% my $${b.name} = ${perlSegmentAccessor('$__bf_item', b.segments ?? [])};`)
          }
        }
      } else {
        lines.push(`% my $${param} = ${array}->[${indexVar}];`)
      }
    }

    // Handle filter().map() pattern by wrapping children in if-condition
    if (loop.filterPredicate) {
      let filterCond: string
      if (loop.filterPredicate.predicate) {
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
      // instead of refusing the bare object with BF101. (#1971 Perl) Read the
      // IR-carried structured `ParsedExpr` tree (#2018) instead of re-parsing
      // `value.expr` with `ts.createSourceFile`; the lowering returns null for
      // any non-object-literal shape, so the common non-object case falls
      // straight through to the bare-expression path below.
      if (value.parsed) {
        const hashref = objectLiteralExprToPerlHashref(this.spreadCtx, value.parsed)
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
    // Named JSX-valued props OTHER than the reserved `children`
    // (`header={<strong>Title</strong>}`, #2168 jsx-element-prop) get the
    // same `begin %>…<% end` capture as the reserved children slot below,
    // just keyed by the prop's own name. `render_child` (BarefootJS.pm)
    // materializes every prop value that's a CODE ref — not only
    // `children` — into the Mojo::ByteStream the capture block produces,
    // so the child's read of the slot back out (`<%= $header %>`) sees an
    // already-safe ByteStream and Mojo::Template's auto-escape passes it
    // through unescaped, the same way it already does for `children`.
    const namedSlotCaptures: string[] = []
    for (const p of comp.props) {
      // Skip callback props (onXxx) and `ref` — both are client-only for
      // SSR (Hono renders neither; the client JS wires them at hydration).
      if ((p.name.match(/^on[A-Z]/) || p.name === 'ref') && p.value.kind === 'expression') continue
      if (p.value.kind === 'jsx-children' && p.name !== 'children') {
        const prevInLoop = this.inLoop
        this.inLoop = false
        const slotBody = this.renderChildren(p.value.children)
        this.inLoop = prevInLoop
        const varName = `$bf_prop_${p.name}_${comp.slotId ?? 'c' + this.childrenCaptureCounter++}`
        namedSlotCaptures.push(`<% my ${varName} = begin %>${slotBody}<% end %>`)
        propParts.push(`${perlHashKey(p.name)} => ${varName}`)
        continue
      }
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
      return `${namedSlotCaptures.join('')}<% my ${varName} = begin %>${childrenBody}<% end %><%== bf->render_child('${tplName}'${propsStr}, children => ${varName}) %>`
    }
    return `${namedSlotCaptures.join('')}<%== bf->render_child('${tplName}'${propsStr}) %>`
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
    emitLiteral: (value, name) => `${name}="${escapeHtml(value.value)}"`,
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
      // Read the spread's IR-carried `ParsedExpr` tree (#2018) instead of
      // re-parsing `trimmed` with `ts.createSourceFile`.
      const ternaryHashref = conditionalSpreadToPerl(this.spreadCtx, value.parsed)
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
            // The local const's initializer text isn't carried as a structured
            // tree on the spread attr, so parse it once via the shared
            // `parseExpression` (the analyzer's own entry) — not
            // `ts.createSourceFile` — mirroring go-template's same local-const
            // resolution path.
            const resolved = conditionalSpreadToPerl(
              this.spreadCtx,
              parseExpression(initTrimmed),
            )
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
    // cleanly, and nested `filter` / `every` / `some` lower to real
    // inline `grep` forms. The shapes the emitter can only DEGRADE
    // (nested `find*`, sort / reduce / flatMap inside a predicate)
    // surface BF101 through the hook below instead of silently
    // rewriting the predicate (#2038). Wholesale refusal would block
    // the canonical case #1443 exists to enable, so the gate lives at
    // the exact degrade points inside `MojoFilterEmitter.callbackMethod`.
    return emitParsedExpr(
      expr,
      new MojoFilterEmitter(
        param,
        localVarMap,
        n => this._isStringValueName(n),
        (message, reason) => this._recordExprBF101(message, reason),
      ),
    )
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
   * Build the EmitContext seam the top-level `ParsedExpr` emitter depends on.
   * Built as a private object (the adapter does NOT `implements MojoEmitContext`)
   * so the wrapped bookkeeping — `_searchParamsLocals`, the const/record
   * resolvers, BF101 recording, the filter-predicate entry — stays private and
   * off the exported adapter's public type, matching the Go adapter's
   * `emitCtx` and the `spreadCtx` / `memoCtx` seams below.
   */
  private get emitCtx(): MojoEmitContext {
    return {
      _searchParamsLocals: this._searchParamsLocals,
      resolveModuleStringConst: (name) => this.resolveModuleStringConst(name),
      resolveLiteralConst: (name) => this.resolveLiteralConst(name),
      resolveStaticRecordLiteral: (o, k) => this.resolveStaticRecordLiteral(o, k),
      _isStringValueName: (name) => this._isStringValueName(name),
      _recordExprBF101: (message, reason) => this._recordExprBF101(message, reason),
      _renderPerlFilterExprPublic: (e, p) => this._renderPerlFilterExprPublic(e, p),
    }
  }

  /**
   * Build the narrow context the extracted spread lowering depends on. Passing
   * a purpose-built object (rather than `this`) keeps the adapter's bookkeeping
   * members private — they stay internal implementation detail, not part of the
   * exported class's public surface.
   */
  private get spreadCtx(): MojoSpreadContext {
    return {
      componentName: this.componentName,
      errors: this.errors,
      localConstants: this.localConstants,
      propsParams: this.propsParams,
      convertExpressionToPerl: (e, preParsed) => this.convertExpressionToPerl(e, preParsed),
    }
  }

  /** Build the narrow context the extracted memo seeding depends on. */
  private get memoCtx(): MojoMemoContext {
    return { convertExpressionToPerl: (e, preParsed) => this.convertExpressionToPerl(e, preParsed) }
  }

  private convertExpressionToPerl(expr: string, preParsed?: ParsedExpr): string {
    // Parse-first lowering — parity with the Go adapter's
    // `convertExpressionToGo`. Parse the JS expression once, gate it on
    // the shared `isSupported`, and render every supported shape through
    // the AST emitter (`renderParsedExprToPerl`). The parser's
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

    // Registered call lowerings (#2057) — including the built-in `queryHref`
    // plugin (#2042), which lowers `queryHref(base, { … })` to a neutral
    // `guard-list` on the `query` helper → `bf->query(base, <triples>)`.
    // Recognised before the support gate because the object-literal arg is
    // otherwise `unsupported` (BF101). The `bf->query` helper includes a pair iff
    // its guard is truthy AND its value is a non-empty string (the client's
    // `if (value)`): a plain `key: v` passes guard `1`, a conditional
    // `key: cond ? v : undefined` passes the lowered cond. Only the `query`
    // helper renders to `bf->query`; another guard-list helper must not be
    // silently mis-rendered as a query.
    if (parsed.kind === 'call') {
      for (const matcher of this._loweringMatchers) {
        const node = matcher(parsed.callee, parsed.args)
        if (node?.kind === 'guard-list' && node.helper === 'query') {
          const argsGo = queryHrefArgs(node, n => this.renderParsedExprToPerl(n))
          return `bf->query(${argsGo.join(', ')})`
        }
        // Generic `helper-call` (#2069) — the neutral vocabulary's escape
        // hatch for a userland `LoweringPlugin` that lowers to a single
        // runtime-helper invocation. `bf-><helper>(args…)` mirrors the
        // `query` helper's own naming convention exactly: the framework
        // renders the call, the plugin author registers `<helper>` as a
        // method on their own Mojolicious `bf` helper object — same
        // contract as `bf->query` itself, just not built in.
        if (node?.kind === 'helper-call' && isValidHelperId(node.helper)) {
          const argsX = node.args.map(a => this.renderParsedExprToPerl(a))
          return `bf->${node.helper}(${argsX.join(', ')})`
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
    return emitParsedExpr(expr, new MojoTopLevelEmitter(this.emitCtx))
  }

  /**
   * Hook for the ParsedExpr emitters to record a BF101 while walking
   * the AST — used for Mojo-specific gaps (`.find` / `.findIndex` have
   * no Embedded-Perl lowering) and templatePrimitive arity errors.
   */
  /** Whether `name` (a signal getter or prop) holds a string value, so an
   *  equality comparison against it should use Perl `eq`/`ne` (#1672). */
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
          ? `${reason}\n\nOptions:\n1. Use /* @client */ for client-side evaluation\n2. Pre-compute the value in Perl`
          : 'Options:\n1. Use /* @client */ for client-side evaluation\n2. Pre-compute the value in Perl',
      },
    })
  }

  /** Internal hook for higher-order: predicate body re-uses the filter emitter. */
  private _renderPerlFilterExprPublic(expr: ParsedExpr, param: string): string {
    return this.renderPerlFilterExpr(expr, param)
  }
}

export const mojoAdapter = new MojoAdapter()

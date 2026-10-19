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
  collectBooleanValueNames,
  BaseAdapter,
  type AdapterOutput,
  type AdapterGenerateOptions,
  type TemplateSections,
  type IRNodeEmitter,
  type EmitIRNode,
  type AttrValueEmitter,
  parseExpression,
  stringifyParsedExpr,
  parseStyleObjectEntries,
  isSupported,
  isSupportedValue,
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
  lookupLiteralConst,
  searchParamsLocalNames,
  prepareLoweringMatchers,
  isLowerableLoopDestructure,
  childTemplateName,
  isEmptyComponentProps,
  isBooleanTypedPropRef,
  planAttrExpression,
  planLoop,
  planSpreadAttr,
  planComponentProps,
  spellComponentProps,
  renameFreeIdentifiers,
  BindingScope,
  rootPropAliasNames,
  rootPropAliasesForLoop,
  rootPropReadName,
  buildImportAliasMap,
  collectNullableSignalGetters,
  attrValueMayBeNullish,
  collectNullishAttrContext,
  type NullishAttrContext,
  isAriaBooleanAttr,
  isBooleanResultExpr,
  hasClientInteractivity,
  collectImportedLoopChildComponentErrors,
  collectBooleanTypedProps,
  collectNullableOptionalProps,
  lowerCallbackMethod,
  emitCallbackEval,
  arithmeticOperandCoercion,
  renderElementShell,
  renderFragmentScope,
  renderDangerousInnerHtml,
  unsupportedAttrExpressionError,
  type ElementShellSpelling,
  computedConstContext,
  inlineComputedConstAttr,
  inlineComputedConsts,
  type ComputedConstContext,
} from '@barefootjs/jsx'
import type { ParsedExpr, LoweringMatcher } from '@barefootjs/jsx'
import {
  escapeLineStatementSigil,
  isBooleanResultParsed,
  isNumericArithmeticResult,
  isOpaqueLocalAccessorName,
  stringifyBooleanTernaryBranches,
} from '@barefootjs/jsx'
import { BF_SLOT, BF_COND, escapeHtml } from '@barefootjs/shared'

import type { MojoRenderCtx } from './lib/types.ts'
import { MOJO_PRIMITIVE_EMIT_MAP } from './lib/constants.ts'
import { perlHashKey, perlIdentifierFromMarkerId } from './lib/perl-naming.ts'
import { renderSortMethod, EVAL_SPELLING } from './expr/array-method.ts'
import { staticValueToPerl } from './lib/static-value.ts'
import { MojoFilterEmitter, MojoTopLevelEmitter, CALLBACK_LOWERING } from './expr/emitters.ts'
import type { MojoEmitContext, MojoSpreadContext, MojoMemoContext } from './emit-context.ts'
import {
  conditionalSpreadToPerl,
  objectLiteralExprToPerlHashref,
} from './spread/spread-codegen.ts'
import {
  generateContextConsumerSeed,
  generateDerivedMemoSeed,
} from './memo/seed.ts'
import { collectProviderDataNames, collectStringValueNames } from './props/prop-classes.ts'

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

/**
 * The `MojoAdapter` template adapter. Pass an instance as the `adapter` option of `@barefootjs/vite`.
 *
 * @since 0.1.0
 * @stability alpha
 */
export class MojoAdapter extends BaseAdapter implements IRNodeEmitter<MojoRenderCtx> {
  name = 'mojolicious'
  extension = '.html.ep'
  templatesPerComponent = true

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
  private options: Required<MojoAdapterOptions>
  private errors: CompilerError[] = []
  /**
   * SolidJS-style props identifier (`function(props: P)`) and the
   * analyzer-extracted prop names. Stashed at `generate()` entry so
   * the per-attribute `emitSpread` callback can build a propsObject
   * spread bag as an inline Perl hashref literal without re-walking
   * the IR (#1407 follow-up).
   */
  private propsObjectName: string | null = null
  /**
   * Name of the destructured `...rest` binding (`function X({ ...rest })`),
   * if any. A closed-type rest-expanded attribute's expression is
   * `${restPropsName}.${key}` (`expandSpreadAttribute`, #3057) — stripping
   * this prefix the same way `propsObjectName.` is stripped below lets the
   * nullable-optional-props guard recognise it as a bare optional
   * reference instead of falling through to unconditional emission.
   */
  private restPropsName: string | null = null
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
  private booleanValueNames: { names: Set<string>; props: Set<string> } = { names: new Set(), props: new Set() }
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
  /** The component's computed consts, inlined where a template reads them (#3494). */
  private computedConsts: ComputedConstContext | null = null
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
  /** Each prop's collision-free root alias (#3314), decided once per component. */
  private rootPropAliases: ReadonlyMap<string, string> = new Map()
  /**
   * The one canonical, position-accurate "names bound by an enclosing loop
   * callback" service (#2482 Stage 2) — replaces the ref-counted
   * `Map<string, number>` this adapter used to push/pop around
   * `renderLoop`'s body (the `my $<param>` / `my $<index>` bindings it
   * introduces). `resolveModuleStringConst` consults this so a loop
   * variable whose name happens to match a module string const is NOT
   * inlined as the const literal (mirrors the Go adapter's loop-param /
   * loop-var shadowing guards). (#1749 review) Threaded via
   * save/restore-by-reference around `renderChildren(loop.children)` in
   * `renderLoop` (immutable — no ref-count bookkeeping), mirroring the
   * Stage 1a/1b `ctx.scope` precedent in `jsx-to-ir.ts`. `IRLoop` already
   * structurally satisfies `LoopBindingSource`
   * (`param`/`index`/`paramBindings`/`preamble`), so `renderLoop` passes
   * the loop node straight to `enterLoopRow`.
   */
  private scope: BindingScope = BindingScope.EMPTY
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
  /** Getters of nullable signals (`collectNullableSignalGetters`, #3304). */
  private nullableSignalGetters: Set<string> = new Set()
  /** Signals and memos `attrValueMayBeNullish` reads (#3322). */
  private nullishAttrCtx: NullishAttrContext = { nullableSignals: new Set(), memos: new Map() }

  /**
   * Local alias -> declared/exported name for imported components (#2822,
   * the SSR-side counterpart of #2777's client-JS registry-key fix). A
   * child referenced under an import alias (`import { Foo as Bar }`,
   * `<Bar/>`) must build its cross-template call against the child's own
   * declared name (`Foo`, what `foo.tsx` registers its Mojo partial as) —
   * never the caller-local binding. Built once per compile from
   * `ir.metadata.imports` via the shared `buildImportAliasMap`
   * (`@barefootjs/jsx`) and read by `childTemplateName`.
   */
  private importAliases: Map<string, string> = new Map()

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
    this.restPropsName = ir.metadata.restPropsName ?? null
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
    this.nullableSignalGetters = collectNullableSignalGetters(ir)
    this.nullishAttrCtx = collectNullishAttrContext(ir)
    this.stringValueNames = collectStringValueNames(ir)
    this.booleanValueNames = collectBooleanValueNames(ir.metadata)
    this.moduleStringConsts = collectModuleStringConsts(ir.metadata.localConstants)
    this._searchParamsLocals = searchParamsLocalNames(ir.metadata)
    this._loweringMatchers = prepareLoweringMatchers(ir.metadata)
    this.computedConsts = computedConstContext(ir.metadata, name => this.scope.isBound(name))
    this.localConstants = ir.metadata.localConstants ?? []
    this.rootPropAliases = rootPropAliasNames(ir, this.propsParams.map(p => p.name))
    this.importAliases = buildImportAliasMap(ir.metadata.imports ?? [])
    this.scope = BindingScope.EMPTY
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
      this.errors.push(...collectImportedLoopChildComponentErrors(ir, this.componentName, 'Mojo'))
    }

    const templateBody = ir.root.type === 'if-statement'
      ? this.renderIfStatement(ir.root as IRIfStatement)
      : this.renderNode(ir.root)

    // Generate script registration
    const scriptReg = options?.skipScriptRegistration
      ? ''
      : this.generateScriptRegistrations(ir, options?.scriptBaseName, options?.scriptAssets, options?.preloadAssets)

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
   */  /**
   * Parse `cond ? value : undefined` (or `: null`), returning the
   * condition/consequent source spans, else `null`. Used for the
   * attribute-omission rule (#1897); mirrors the Xslate adapter.
   */  /**
   * Inline a const (any scope) whose initializer is a pure numeric or
   * quoted string literal (`const totalPages = 5`, #1897 pagination) —
   * function-scope consts never reach the per-render stash, so a bare
   * `$totalPages` faults under strict mode.
   *
   * The threaded scope's shadow guard also covers the #2221 hazard (a loop
   * callback's own param shadowing this outer const's name): `this.scope`
   * is position-accurate (#2482 Stage 2) — pushed/popped by reference as
   * `renderLoop` descends/ascends into each loop body — so it's already
   * scope-precise for this call site; no separate coarse whole-component
   * field is needed here.
   */
  private resolveLiteralConst(name: string): string | null {
    const lit = lookupLiteralConst(name, this.localConstants, n => this.scope.isBound(n))
    if (lit === null) return null
    if (lit.kind === 'number') return lit.text
    if (lit.kind === 'boolean') return lit.text === 'true' ? '1' : '0'
    if (lit.kind === 'null') return 'undef'
    return `'${lit.text.replace(/[\\']/g, m => `\\${m}`)}'`
  }

  private resolveStaticRecordLiteral(objectName: string, key: string): string | null {
    const hit = lookupStaticRecordLiteral(objectName, key, this.localConstants, name => this.scope.isBound(name))
    if (!hit) return null
    return hit.kind === 'number'
      ? hit.text
      : `'${hit.text.replace(/[\\']/g, m => `\\${m}`)}'`
  }

  private resolveModuleStringConst(name: string): string | null {
    // A loop body introduces `my $<param>` / `my $<index>` bindings that
    // shadow a module const of the same name — never inline inside one.
    if (this.scope.isBound(name)) return null
    const value = this.moduleStringConsts.get(name)
    if (value === undefined) return null
    return `'${value.replace(/[\\']/g, m => `\\${m}`)}'`
  }

  // ===========================================================================
  // Script Registration
  // ===========================================================================

  private generateScriptRegistrations(
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
      // is useless. `% ...;` is a no-output EP statement line, same as
      // `register_script` below — `register_preload`'s return value is
      // never printed.
      const lines = (preloadAssets ?? []).map((url) => `% bf->register_preload('${url}');`)
      lines.push(...scriptAssets.map((url) => `% bf->register_script('${url}');`))
      lines.push('')
      return lines.join('\n')
    }

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
    // character references); re-escape for direct HTML emission. A
    // line-leading `%` would be read as a line statement (#3311).
    return escapeLineStatementSigil(escapeHtml(node.value), '%', "<%= '%' %>")
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
    const rendered = this.renderComponent(node)
    // #3141: see `wrapComponentRootScopeComment`'s docstring.
    return node.needsScopeComment ? this.wrapComponentRootScopeComment(rendered) : rendered
  }

  emitFragment(node: IRFragment, _ctx: MojoRenderCtx, _emit: EmitIRNode<MojoRenderCtx>): string {
    return renderFragmentScope(node, children => this.renderChildren(children), rendered => this.wrapComponentRootScopeComment(rendered))
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
    return renderElementShell(element, this.elementShell)
  }

  /**
   * Route an `ssrPortalOwnerScope`-flagged element's ALREADY-RENDERED
   * markup (the `bf-po` attribute already stamped on its own tag) into
   * `bf->register_portal_element` instead of leaving it at its source
   * position (#3119).
   *
   * Reuses Mojo's own `begin %>…<% end` block-capture — the SAME mechanism
   * `renderComponent` already uses to forward JSX children (see this
   * file's "Content capture" notes near the children-capture call sites):
   * the element renders inline as normal Mojo (its own `<%= %>`/`<%== %>`
   * interpolations evaluate exactly as they would anywhere else), the
   * `begin`/`end` block captures the nested render into a CODE ref, and
   * calling that ref (`->()`) immediately materializes it to a
   * Mojo::ByteStream — mirrors `BarefootJS::Backend::Mojo#materialize`'s
   * own `ref($value) eq 'CODE' ? $value->() : $value` call. A separate
   * pure-statement `<% ... %>` tag (never `<%=`/`<%==`, so nothing prints
   * at the source position) hands that stream to the portal collector.
   */
  private wrapSsrPortalElement(rendered: string): string {
    const varName = `$bf_po_${this.childrenCaptureCounter++}`
    return `<% my ${varName} = begin %>${rendered}<% end %><% bf->register_portal_element(${varName}->()); %>`
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
        return `<%== bf->text_start("${expr.slotId}") %><%== bf->text_end %>`
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
      this.convertExpressionToPerl(expr.expr, expr.parsed),
    )

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

    // #3166: thread `cond.parsedCondition` through — a recognised
    // `<action>.isPending()` / `.error()` read has already been substituted
    // with its seed literal there; re-parsing `cond.condition` fresh here
    // would lose that and fall into the generic member-access lowering
    // (`$fetchPosts->{error}`, a hard "Global symbol requires explicit
    // package name" error under `use strict` — `$fetchPosts` is never
    // declared server-side).
    const condition = this.convertExpressionToPerl(cond.condition, cond.parsedCondition)
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

    // Each newline that ends a TEXT line before a `%` line statement is
    // escaped with a trailing backslash, which Mojo::Template drops together
    // with the newline. Unescaped, it rendered as whitespace between the
    // conditional and adjacent text (`x: off` for `x:{c ? 'on' : 'off'}`,
    // #3321). A `%` line consumes its own newline, so the newline after one
    // needs no escape.
    let result: string
    if (useCommentMarkers) {
      // Fragment branches: use comment markers
      const inner = whenFalse
        ? `\\\n% if (${condition}) {\n${whenTrue}\\\n% } else {\n${whenFalse}\\\n% }\n`
        : `\\\n% if (${condition}) {\n${whenTrue}\\\n% }\n`
      result = `<%== bf->comment("cond-start:${cond.slotId}") %>${inner}<%== bf->comment("cond-end:${cond.slotId}") %>`
    } else if (markedFalse) {
      result = `\\\n% if (${condition}) {\n${markedTrue}\\\n% } else {\n${markedFalse}\\\n% }\n`
    } else if (cond.slotId) {
      // Conditional with no else: wrap with comment markers for client hydration
      result = `<%== bf->comment("cond-start:${cond.slotId}") %>\\\n% if (${condition}) {\n${whenTrue}\\\n% }\n<%== bf->comment("cond-end:${cond.slotId}") %>`
    } else {
      result = `\\\n% if (${condition}) {\n${whenTrue}\\\n% }\n`
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
    const loopPlan = planLoop(loop, {
      scope: this.scope,
      localConstants: this.localConstants ?? [],
      resolveLiteralConst: (name) => this.resolveLiteralConst(name),
      callbackLowering: CALLBACK_LOWERING,
      spellStatic: staticValueToPerl,
    })
    const supportableDestructure = loopPlan.destructure === 'lowerable'
    if (loopPlan.destructure === 'unlowerable') {
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

    // A `.map()` loop whose array is a bare identifier bound to a local
    // const (module- or function-scope, #2946) with a non-statically-
    // evaluable initializer that reads props/signals/a function call (e.g.
    // `const entries = Object.entries(props.x ?? {}).filter(...)`) can't
    // render correctly. Locals get no per-render stash slot — this
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
    // #2208/#2946: a loop source that is a fully-static array literal —
    // either inline (`[{ label: 'Alpha' }, ...].map(...)`) or a bare
    // identifier bound to a local const (module- or function-scope) whose
    // initializer has no prop/signal/function-call dependency — inlines as
    // a native Perl arrayref/hashref literal below. A runtime-computed
    // local (#2069, e.g. `Object.entries(props.tags).filter(...)`) still
    // refuses below, whichever scope it's declared in. `isNameShadowed`
    // guards a DIFFERENT, enclosing loop's own callback param shadowing
    // this identifier (fable review) — reuses the same threaded,
    // position-accurate `this.scope` `resolveModuleStringConst` already
    // consults for this hazard class (#1749/#2482 Stage 2).
    const staticArray = loopPlan.staticSource

    const arrayConst = loopPlan.unresolvableConst
    if (arrayConst) {
      this.errors.push({
        code: 'BF101',
        severity: 'error',
        message: `Loop array \`${arrayConst.name}\` is a const (module- or function-scope) computed value (\`${arrayConst.value}\`) that the Mojo adapter cannot bind as a template variable — only numeric/string-literal locals inline at their use site.`,
        loc: loop.loc ?? { file: this.componentName + '.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
        suggestion: {
          message:
            'Pre-compute the array server-side and pass it as a prop, or mark the loop position as @client-only so it runs in JS on the client.',
          escape: [{ kind: 'prop-precompute' }, { kind: 'client-directive' }],
        },
      })
    }

    const rawArray = staticArray ?? this.convertExpressionToPerl(loop.array)
    // Apply sort if present (#1448 Tier B): wrap the loop array in the
    // shared sort helper. The same shared chain (`lowerCallbackMethod`) and
    // `renderSortMethod` feed both this loop-chain hoist and the emitter's
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
    // This loop's row scope. Guards module-const inlining for the whole
    // body (children + key + filter) so a same-named loop variable isn't
    // replaced by the const literal (#1749 review). `IRLoop` already
    // structurally satisfies `LoopBindingSource`
    // (`param`/`index`/`paramBindings`/`preamble`) — `enterLoopRow(loop)`
    // binds exactly what this renderLoop's header + preamble locals
    // introduce (#2482 Stage 2 — replaces the ref-counted `Map` this
    // adapter used to carry). Restored by reference (immutable — no
    // ref-count bookkeeping) at the matching pop below, once the WHOLE
    // body (including the filter predicate) has been rendered — except for
    // one temporary drop-to-outer window around the hoisted sort-comparator
    // emission below, since that runs OUTSIDE this loop.
    const preambleDecls = loop.preamble?.declarations ?? []
    const prevScope = this.scope
    this.scope = prevScope.enterLoopRow(loop)
    const renderedChildren = this.renderChildren(loop.children)
    // Props this row's bindings newly shadow, aliased in a block around the
    // loop so an explicit `props.X` inside still reads the root value
    // (#3314). The block keeps a sibling loop's alias from redeclaring it.
    const rootAliases = rootPropAliasesForLoop(prevScope, this.scope, this.rootPropAliases)

    // Whole-item conditional (#1665): prepend an always-present
    // `<!--bf-loop-i:KEY-->` anchor before each item's (possibly empty)
    // conditional content so the client's `mapArrayAnchored` can hydrate
    // every SSR-rendered item by its anchor. `bf->comment` prepends `bf-`,
    // so `"loop-i:" . KEY` yields `<!--bf-loop-i:KEY-->`.
    // `bf->escape_comment_key` (#2795 follow-up) both stringifies the key
    // (JS `String()` semantics, matching the other adapters) and neutralizes
    // `-` so it can't spell `-->` and close the comment early — see its doc
    // in `BarefootJS.pm`.
    const children =
      loop.bodyIsItemConditional && loop.key
        ? `<%== bf->comment("loop-i:" . bf->escape_comment_key(${this.convertExpressionToPerl(loop.key)})) %>\n${renderedChildren}`
        : renderedChildren

    // A name the filter predicate captures from an enclosing row that this
    // loop's own row binds again would read the row's item inside the loop;
    // keep the enclosing value under a loop-scoped alias (#3402).
    const captureAliases = loopPlan.captureAliases
    const captureRenames = new Map(captureAliases.map(({ name, alias }) => [name, alias]))
    const lines: string[] = []
    // Scoped per-call-site marker so sibling `.map()`s under the same parent
    // each get their own reconciliation range (#1087).
    lines.push(`<%== bf->comment("loop:${loop.markerId}") %>`)
    for (const { name, alias } of captureAliases) lines.push(`% my $${alias} = $${name};`)
    if (rootAliases.length > 0) {
      lines.push('% {')
      for (const { name, alias } of rootAliases) lines.push(`% my $${alias} = $${name};`)
    }
    if (sortedHoist && loop.sortComparator) {
      // Evaluator-first (#2018 P3): serialize the comparator + emit
      // `bf->sort_eval`; fall back to the structured `bf->sort` for a
      // comparator the evaluator can't model (e.g. `localeCompare`).
      //
      // The hoisted sort runs OUTSIDE this loop, so this loop's row scope
      // must not shadow the comparator's captured free vars while emitting the
      // env — otherwise a captured var that happens to share a loop-param name
      // is blocked from inlining its module const and renders as an undefined
      // `$name` (strict-mode fault, Copilot review #2035). Drop back to the
      // outer (pre-row) scope for the sort emit, then restore the row scope
      // below (a nested loop's own outer bindings stay in effect throughout,
      // since `prevScope` already carries them).
      this.scope = prevScope
      const sortEmit = (e: ParsedExpr) => this.convertExpressionToPerl('', e)
      // The shared chain (`@barefootjs/jsx`'s `adapters/callback-method.ts`),
      // the same as `.sort(cmp)` at an expression position: the evaluator,
      // then the structured `{keys: …}` descriptor. jsx-to-ir only lifts a
      // comparator the descriptor models, so the refusal arm is defensive; it
      // keeps the array unsorted so the template stays valid.
      const plan = loopPlan.sort!
      let sorted = rawArray
      if (plan.kind === 'eval') sorted = emitCallbackEval(plan, rawArray, sortEmit, EVAL_SPELLING)
      else if (plan.kind === 'structured-sort') sorted = renderSortMethod(rawArray, plan.comparator)
      else if (plan.kind === 'refuse') this._recordExprBF101(plan.message, plan.suggestion)
      this.scope = prevScope.enterLoopRow(loop)
      lines.push(`% my $${sortedHoist} = ${sorted};`)
    }
    if (loop.objectIteration) {
      // `objectIteration` (#2168 object-entries-map): a Perl hash has no
      // native insertion-order guarantee (unlike Ruby's `Hash`/Python's
      // `dict`) — this codebase's own runtime already works around this
      // elsewhere with `sort keys %$hash` (`BarefootJS.pm`'s
      // `spread_attrs`/`_style_to_css`), so this reuses that exact
      // convention for a deterministic, alphabetically-sorted iteration
      // (not JS insertion order — a documented known limitation for
      // out-of-alphabetical-order data, same as Go/Rust/Xslate).
      const keyVar = loop.objectIteration === 'values' ? '$__bf_k' : `$${loop.index ?? param}`
      lines.push(`% for my ${keyVar} (sort keys %{${array}}) {`)
      if (loop.objectIteration === 'entries' || loop.objectIteration === 'values') {
        lines.push(`% my $${param} = ${array}->{${keyVar}};`)
      }
    } else {
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
    }

    // Per-row preamble locals (#2447), in source order so a later
    // initializer sees an earlier local — same as the source block. Emitted
    // INSIDE the filter guard below, matching JS evaluation order: a
    // `.filter(p).map(cb)` chain never runs `cb`'s body for a filtered-out
    // item.
    const preambleLines = preambleDecls.map(
      d => `% my $${d.name} = ${this.convertExpressionToPerl(d.raw, d.valueParsed)};`,
    )

    // Handle filter().map() pattern by wrapping children in if-condition
    if (loop.filterPredicate) {
      let filterCond: string
      if (loop.filterPredicate.predicate) {
        // The aliases render and type like the enclosing names they keep (#3402).
        const scopeBeforeAliases = this.scope
        this.scope = this.scope.enterAliases(new Map(captureAliases.map(({ name, alias }) => [alias, name])))
        try {
          // The filter's param reads as the loop's row variable (`$t` →
          // `$todo`), decided by the binding rather than renamed in the text.
          filterCond = this.renderPerlFilterExpr(
            renameFreeIdentifiers(loop.filterPredicate.predicate, captureRenames),
            loop.filterPredicate.param,
            new Map(),
            `$${param}`,
          )
        } finally {
          this.scope = scopeBeforeAliases
        }
      } else {
        filterCond = '1'
      }
      lines.push(`% if (${filterCond}) {`)
      lines.push(...preambleLines)
      lines.push(children)
      lines.push(`% }`)
    } else {
      lines.push(...preambleLines)
      lines.push(children)
    }

    // Body fully rendered — restore the outer (pre-row) scope.
    this.scope = prevScope

    lines.push(`% }`)
    if (rootAliases.length > 0) lines.push('% }')
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
    // Each named JSX-valued prop (`header={<strong>Title</strong>}`, #2168)
    // and the forwarded children are captured with a `begin … end` block,
    // evaluated in the parent's template scope (signals, conditionals), and
    // passed by variable. A named slot's variable is counter-based: a prop
    // name can contain characters (`data-slot`) that are no valid Perl
    // variable name.
    const tplName = childTemplateName(comp.name, this.importAliases)
    const captures: string[] = []
    const capture = (children: IRNode[], name: () => string) => {
      const body = this.renderChildren(children)
      const varName = name()
      captures.push(`<% my ${varName} = begin %>${body}<% end %>`)
      return varName
    }
    const plan = planComponentProps(comp, { propsObjectName: this.propsObjectName, propsParams: this.propsParams })
    const segments = spellComponentProps(plan, {
      entry: (entry) => {
        switch (entry.kind) {
          case 'value':
            return emitAttrValue(entry.value, this.componentPropEmitter, entry.name)
          case 'named-slot':
            return `${perlHashKey(entry.name)} => ${capture(entry.children, () => `$bf_prop_${this.childrenCaptureCounter++}`)}`
          case 'props-param':
            return `${perlHashKey(entry.name)} => $${entry.name}`
          case 'slot-id':
            return `_bf_slot => '${entry.slotId}'`
          case 'children':
            return `children => ${capture(entry.children, () => `$bf_children_${comp.slotId ?? 'c' + this.childrenCaptureCounter++}`)}`
        }
      },
      // A `%{…}` hash dereference flattens a spread into the named-arg list (`emitSpread`).
      spread: (value) => emitAttrValue(value, this.componentPropEmitter, ''),
    })
    const parts = segments.flatMap((s) => (s.kind === 'entries' ? s.parts : s.expr ? [s.expr] : []))
    const propsStr = parts.length > 0 ? `, ${parts.join(', ')}` : ''
    return `${captures.join('')}<%== bf->render_child('${tplName}'${propsStr}) %>`
  }

  private childrenCaptureCounter = 0

  /** Uniquifies the `presenceOrUndefined` temp binding (`$bf_puN`) so two
   *  presence-folded attrs in one template don't collide. */
  private presenceVarCounter = 0
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

  /**
   * Wrap already-rendered output in the comment-based scope marker pair.
   * Shared by a `needsScopeComment` fragment root and a `needsScopeComment`
   * component root (#3141) — both are "this scope has no DOM element of its
   * own to carry bf-s/bf-p", so both lean on the same runtime helper pair.
   */
  private wrapComponentRootScopeComment(rendered: string): string {
    return `<%== bf->scope_comment %>${rendered}<%== bf->scope_comment_end %>`
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
    emitExpression: (source, name) => {
      // A computed const reads as its initializer (#3494).
      const value = inlineComputedConstAttr(source, this.computedConsts)
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
      const plan = planAttrExpression(value, name, {
        propsObjectName: this.propsObjectName,
        restPropsName: this.restPropsName,
        nullableOptionalProps: this.nullableOptionalProps,
        nullableSignalGetters: this.nullableSignalGetters,
        nullishAttrCtx: this.nullishAttrCtx,
        isLoopBound: (n) => this.scope.isBound(n),
        boolStr: (expr, attr) => isBooleanResultExpr(expr) || isAriaBooleanAttr(attr) || isBooleanTypedPropRef(expr, { propsObjectName: this.propsObjectName, booleanTypedProps: this.booleanTypedProps, isBound: (n) => this.scope.isBound(n) }),
      })
      const attr = (v: string, boolStr: boolean) =>
        boolStr ? `${name}="<%= bf->bool_str(${v}) %>"` : `${name}="<%= ${v} %>"`
      // Each kind is documented on `AttrExpressionPlan`.
      switch (plan.kind) {
        case 'omit-nullable': {
          // A bare read here, so it doubles as the guard test and the value.
          const v = this.convertExpressionToPerl(value.expr)
          return `<% if (defined ${v}) { %>${attr(v, plan.boolStr)}<% } %>`
        }
        case 'boolean-attr':
          return `<%= ${this.convertExpressionToPerl(value.expr, value.parsed)} ? '${name}' : '' %>`
        case 'presence': {
          const v = this.convertExpressionToPerl(value.expr)
          const tmp = `$bf_pu${this.presenceVarCounter++}`
          return `<% my ${tmp} = ${v}; if (${tmp}) { %>${attr(tmp, plan.boolStr)}<% } %>`
        }
        case 'undefined-alternate': {
          // A mixed boolean / string branch renders its boolean as JS does.
          const m = plan.ternary
          const cond = this.convertExpressionToPerl('', m.testParsed)
          const val = this.convertExpressionToPerl('', stringifyBooleanTernaryBranches(m.consequentParsed))
          const shown = isBooleanResultParsed(m.consequentParsed)
            ? `bf->bool_str(${val})`
            : this.jsNumberOutput(m.consequentParsed, val)
          return `<% if (${cond}) { %>${name}="<%= ${shown} %>"<% } %>`
        }
        case 'omit-nil':
        case 'plain': {
          // A ternary with a boolean and a string branch renders its boolean
          // as JS does, unless the whole value goes through `bool_str`.
          const valueParsed = value.parsed ?? parseExpression(value.expr.trim())
          const mixedParsed = valueParsed && !plan.boolStr ? stringifyBooleanTernaryBranches(valueParsed) : value.parsed
          const v = this.convertExpressionToPerl(value.expr, mixedParsed)
          if (plan.kind === 'plain') return plan.boolStr ? attr(v, true) : attr(this.jsNumberOutput(mixedParsed, v), false)
          const tmp = `$bf_pu${this.presenceVarCounter++}`
          return `<% my ${tmp} = ${v}; if (defined ${tmp}) { %>${attr(tmp, plan.boolStr)}<% } %>`
        }
      }
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
      const plan = planSpreadAttr(value, {
        propsObjectName: this.propsObjectName,
        propsParams: this.propsParams,
        localConstants: this.localConstants ?? [],
        isBound: (n) => this.scope.isBound(n),
      })
      // `{...props}`: props arrive as separate template vars, so enumerate them.
      if (plan.kind === 'props-object') {
        const entries = plan.params.map((p) => `${JSON.stringify(p)} => $${p}`)
        return `<%== bf->spread_attrs({${entries.join(', ')}}) %>`
      }
      // A conditional inline-object spread (`{...(cond ? {…} : {})}`) lowers to
      // a ternary of hashes; the falsy `{}` omits the key.
      for (const candidate of plan.candidates) {
        const lowered = conditionalSpreadToPerl(this.spreadCtx, candidate)
        if (lowered !== null) return `<%== bf->spread_attrs(${lowered}) %>`
      }
      return `<%== bf->spread_attrs(${this.convertExpressionToPerl(value.expr)}) %>`
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
        // Lower the `__html` expression and emit it through Mojo EP's raw sink
        // `<%== %>` (the unescaped sibling of the escaping `<%= %>`). The
        // runtime evaluates the expression, so no template-metachar guard
        // applies; the element already carries its hydration slot marker. #2319.
        `<%== ${this.convertExpressionToPerl(expr, parsed)} %>`,
      ),
    renderChildren: children => this.renderChildren(children),
    renderScopeMarker: instanceIdExpr => this.renderScopeMarker(instanceIdExpr),
    renderSlotMarker: slotId => this.renderSlotMarker(slotId),
    dataKeyRelay: `<%== bf->data_key_attr %>`,
    scopeIdValue: `<%= bf->scope_attr %>`,
    wrapSsrPortalElement: rendered => this.wrapSsrPortalElement(rendered),
  }

  /**
   * Lower a `style={{ … }}` object literal to a `bf->style_object(...)` call,
   * e.g. `{ backgroundColor: color }` → `<%== bf->style_object('background-color',
   * $color) %>`. `style_object` is the single oracle-matching sanitizer
   * (ported from Hono's `hasUnsafeStyleValue`, shared with the Xslate
   * adapter via `BarefootJS.pm`): it drops any key:value pair whose value
   * could break out of a CSS declaration and HTML-escapes the rest, so the
   * call uses `<%== %>` (raw) rather than `<%= %>` to avoid double-encoding
   * the already-safe result (#2261). Returns null when the shape is
   * unsupported or any value can't be lowered (caller then falls through to
   * the BF101 refusal). (#1322)
   */
  private tryLowerStyleObject(expr: string): string | null {
    const entries = parseStyleObjectEntries(expr)
    if (!entries) return null
    for (const e of entries) {
      if (e.kind === 'expr' && !isSupported(parseExpression(e.expr)).supported) return null
    }
    const args = entries.flatMap(e => [
      `'${e.cssKey.replace(/[\\']/g, m => `\\${m}`)}'`,
      e.kind === 'literal' ? `'${e.value.replace(/[\\']/g, m => `\\${m}`)}'` : this.convertExpressionToPerl(e.expr),
    ])
    return `<%== bf->style_object(${args.join(', ')}) %>`
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
    paramVar = `$${param}`,
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
        (n, property) => this._isStringValueName(n, property),
        (message, reason) => this._recordExprBF101(message, reason),
        new Map(),
        paramVar,
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
    const error = unsupportedAttrExpressionError(expr, attrName, this._loweringMatchers, this.componentName, 'Mojo', 'Embedded Perl')
    if (error) this.errors.push(error)
    return error !== null
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
      _propsObjectName: this.propsObjectName,
      _isGlobalName: (name: string) => this.computedConsts?.isGlobal(name) ?? false,
      _loweringMatchers: this._loweringMatchers,
      resolveModuleStringConst: (name) => this.resolveModuleStringConst(name),
      resolveLiteralConst: (name) => this.resolveLiteralConst(name),
      rootPropReadName: (name) => rootPropReadName(name, this.scope, this.rootPropAliases),
      resolveStaticRecordLiteral: (o, k) => this.resolveStaticRecordLiteral(o, k),
      _isStringValueName: (name, property) => this._isStringValueName(name, property),
      _isBooleanValueName: (name, property) => property ? this.booleanValueNames.props.has(name) : !this.scope.isBound(name) && this.booleanValueNames.names.has(name),
      _arithmeticCoercion: (op, operand, other) => arithmeticOperandCoercion(op, operand, other, this.nullishAttrCtx, n => this.scope.isBound(n)),
      _isOpaqueLocalAccessorCall: (name) => isOpaqueLocalAccessorName(name, this.localConstants),
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
    return { convertExpressionToPerl: (e, preParsed, pos) => this.convertExpressionToPerl(e, preParsed, pos) }
  }

  private convertExpressionToPerl(expr: string, preParsed?: ParsedExpr, pos: 'rendered' | 'value' = 'rendered'): string {
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
    parsed = inlineComputedConsts(parsed, this.computedConsts)

    // `pos` distinguishes a derived-seed RHS (an assignment, checked via
    // `isSupportedValue`) from every other, genuinely rendered call site —
    // the rendered gate would otherwise re-refuse a tree the seed plan
    // already classified `derived` at value position (#2696 review).
    // Registered call lowerings (#2057) — including the built-in `queryHref`
    // plugin — are consulted by this gate no matter where the call sits in
    // the tree (`MojoTopLevelEmitter`'s `lowering` seam does the actual
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
  /**
   * Print an arithmetic result with JS `Number::toString` (`bf->string`)
   * rather than Perl's `%.15g`, which pads a small exponent
   * (`1.23456789e-06`) and drops digits past 15 (#3380).
   */
  private jsNumberOutput(parsed: ParsedExpr | null | undefined, perl: string): string {
    return isNumericArithmeticResult(parsed, (n, c) => this._isStringValueName(n, c)) ? `bf->string(${perl})` : perl
  }

  /** Whether `name` (a signal getter or prop) holds a string value, so an
   *  equality comparison against it should use Perl `eq`/`ne` (#1672). */
  private _isStringValueName(name: string, componentProperty = false): boolean {
    return this.scope.isStringValueName(name, n => this.stringValueNames.has(n), componentProperty)
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

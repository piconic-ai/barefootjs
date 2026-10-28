/** BarefootJS adapter: BarefootJS IR → Go `html/template` files. */

import ts from 'typescript'

import type {
  ComponentIR,
  MemoInfo,
  IRNode,
  IRElement,
  IRText,
  IRExpression,
  IRConditional,
  IRLoop,
  IRLoopChildComponent,
  IRComponent,
  IRFragment,
  IRSlot,
  TypeInfo,
  TypeDefinition,
  PropertyInfo,
  CompilerError,
  SourceLocation,
  ParsedExpr,
  ObjectLiteralProperty,
  SortComparator,
  FlatDepth,
  TemplatePart,
  IRIfStatement,
  IRProvider,
  IRAsync,
  IRMetadata,
  TemplatePrimitiveRegistry,
  LoopBindingPathSegment,
  ConstantInfo,
  JsSourceText,
} from '@barefootjs/jsx'
import {
  collectAbsentPropSeedReads, isElidedFactoryGetter } from '@barefootjs/jsx'
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
  type SupportResult,
  collectNullableSignalGetters,
  arithmeticOperandCoercion,
  collectNullishAttrContext,
  parseExpression,
  stringifyParsedExpr,
  isSupported,
  exprToString,
  identifierPath,
  asCallbackMethodCall,
  emitParsedExpr,
  groupObjectLiteralSegments,
  emitIRNode,
  emitAttrValue,
  augmentInheritedPropAccesses,
  collectContextConsumers,
  type ContextConsumer,
  collectModuleStringConsts as collectModuleStringConstsShared,
  lookupLiteralConst,
  prepareLoweringMatchers,
  envSignalReaderFor,
  computeSsrSeedPlan,
  isStringConcatBinary,
  dangerousInnerHtmlDiagnostic,
  resolveStaticLoopSource,
  collectLoopBoundNames,
  evaluateStaticLiteral,
  BindingScope,
  type ScopeFrame,
  buildImportAliasMap,
  resolveGetterAliases,
  collectAliasableGetterNames,
  resolveBodyDestructuredPropAliases,
  isChildrenPropParam,
  isOpaqueLocalAccessorName,
  renderElementAttributes,
  renderFragmentScope,
  renderDangerousInnerHtml,
  matchSearchParamsMethodCall,
  isUnloweredCall,
  unloweredCallRefusal,
  computedConstContext,
  inlineComputedConstAttr,
  inlineComputedConsts,
} from '@barefootjs/jsx'
import { BF_REGION, BF_PORTAL_OWNER, escapeHtml, resolveJsxChildrenProp } from '@barefootjs/shared'

import {
  capitalize,
  capitalizeFieldName,
  goFieldNameForKey,
  slotIdToFieldSuffix,
  structFieldNamePairs,
} from "./lib/go-naming.ts"
import { isFieldlessRowType, loopKeyToGoRowExpr, rowItemPath, type LoopRowBinding, type LoopRowShape, type LoweredLoopKey } from './lib/loop-row-path.ts'
import { allocateRowsFields, loopDrivingProp, nestedRowsFieldName, rowsFieldSiteKey, type RowsFieldSite } from './lib/nested-rows-field.ts'

import {
  escapeGoString,
  wrapIfMultiToken,
  lowerJsNot,
  lowerJsTruthyTest,
  isBareValueRead,
  wrapGoArg,
  emitPredicateEval,
  goBinaryHelperCall,
  buildUnsupportedSuggestion,
  GO_REMEDIATION_OPTIONS,
  goPropDefault,
  applyGoFallback,
} from "./lib/go-emit.ts"
import type {
  GoRenderCtx,
  HigherOrderShape,
  NestedComponentInfo,
  StaticChildInstance,
  ChildComponentShape,
  SpreadSlotInfo,
  PropFallbackVar,
  CtorLowerEnv,
  GoTemplateAdapterOptions,
} from "./lib/types.ts"
import { routesToRestBag, restBagOverrideFields, isCertainlyDataType } from "./lib/types.ts"
import { GO_TEMPLATE_PRIMITIVES, SCALAR_ROW_GO_TYPES, SCALAR_ROW_ITEM_FIELD } from "./lib/constants.ts"
import { CompileState, findModuleScopeConst, findValuedLocalConst, resolveSignalParsedThroughSeedPlan } from "./lib/compile-state.ts"
import { hasClientInteractivity, findNestedComponents } from "./analysis/component-tree.ts"
import { analyzeBakeableStaticChildLoop, scalarToGoLiteral, type BakedStaticChildLoop } from "./analysis/static-child-loop-bake.ts"
import { analyzeBakeableStaticElementLoop, classifyBakedCondition } from "./analysis/static-element-loop-bake.ts"
import type { GoEmitContext } from "./emit-context.ts"
import { inlineLocalHelperCall } from "./expr/helper-inline.ts"
import { freeTemplateVars } from "./lib/template-scope.ts"
import { lowerRegisteredCall, lowerRegisteredCallNode, lowerTemplateLiteralValue, lowerTernary, lowerValueOperand } from "./expr/url-builder.ts"
import {
  convertInitialValue,
  jsLiteralToGo,
  objectLiteralToGoMap,
} from "./value/value-lowering.ts"
import { parsedLiteralToGo } from "./value/parsed-literal-to-go.ts"
import { propertyInfoToGo, typeInfoToGo } from "./type/type-codegen.ts"
import { isKnownArray, isKnownNonNumber } from "./type/number-read.ts"
import { planSynthPropStructs } from "./type/synth-prop-structs.ts"
import { collectPropFallbackVars, inferMemoType, isNillableSeedSignal, signalFieldGoType } from "./type/state-fields.ts"
import { propsFieldName, propsFieldNames } from './lib/props-field-names.ts'
import { propMemberSeedGoType } from "./value/prop-member-seed.ts"
import { lowerCtorExpr } from "./memo/ctor-lowering.ts"
import { computeMemoInitialValue, collectPropsReadByCtorInit, isBoxedNumericMemoBody, evaluatedAsGoType, computedPropSeedGo } from "./memo/memo-compute.ts"
import { collectNullableSeedStructFields } from "./value/prop-member-seed.ts"
import { collectSpreadSlots, buildSpreadInitializer, collectRestBagSpreadFields } from "./spread/spread-codegen.ts"
import { collectPropsSpreadForwardedParams } from "./props/props-spread.ts"
import { buildPropTypeOverrides, dependentDefaultNormalization, resolvePropGoType, collectNillablePropNames, collectNullishConsumedPropNames, collectOmittableAttrConsumedPropNames, collectTextConsumedPropNames, collectPresenceCheckedPropNames, collectNullableSignalSeedPropNames, collectOptionalChainReceiverPropNames, collectArithmeticAbsentPropNames, seedPassthroughPropName } from "./props/prop-types.ts"
import { collectStringValueNames } from "./props/prop-classes.ts"
import { emitMemoFieldInits, emitPropFallbackLocals, emitPropFieldInits, emitSignalFieldInits, hoistSiblingMemoLocals } from "./props/ctor-field-inits.ts"
import { lowerChildInputFields, lowerLoopRowChildInputFields, lowerStaticChildDataKey, sourceRowChildInputFields, type ChildInputHost } from "./props/child-input-fields.ts"
import { resolveLocalGetterAsGo } from "./value/child-prop-value.ts"
import { emitParsedExpressionAttr, emitSpreadAttr, emitStyleOrPresenceAttr, emitTemplateAttr, type ElementAttrHost } from "./attr/element-attrs.ts"
import { renderConditionExpr, renderFilterExpr, type ConditionExprHost } from "./expr/condition-expr.ts"
import { PREDICATE_METHODS, renderArrayMethod, renderCallbackMethod, renderMember, type MemberAndMethodsHost } from "./expr/member-and-methods.ts"
import { loopRowChildPropOverrides, renderLoop as renderLoopWithHost, type LoopRenderHost } from "./loop/render-loop.ts"
import { collectBodyChildInstances, collectStaticChildInstances, type StaticChildrenHost } from "./children/static-children.ts"
import { buildLocalTypeTables, resolveNestedLoopItemTypes, synthesizeStructsFromElements, synthSliceTypeInfo, type TypeSynthesisHost } from "./type/type-synthesis.ts"

export type { GoTemplateAdapterOptions } from "./lib/types.ts"

/**
 * Placeholder `SourceLocation` for a `TypeDefinition` `emitSynthPropStructs`
 * (#2674) pushes onto `ctx.state.currentTypeDefinitions` for a synthesized
 * anonymous-object struct. Never rendered or used for diagnostics — the
 * synthesized entry exists only so `parsed-literal-to-go.ts`'s
 * `structPropertyType` can look its properties up BY NAME the same way it
 * looks up a real user type.
 */
const SYNTH_TYPE_LOC: SourceLocation = {
  file: '<synthesized>',
  start: { line: 0, column: 0 },
  end: { line: 0, column: 0 },
}

/**
 * Everything needed to emit a component's #2448 props rebuilder, captured when
 * its own types are generated so a PARENT can emit the registration into its
 * own type block (`emitOwnedReprops`). `propsField` (LOCAL) and `inputField`
 * (caller-facing) diverge only for an aliased destructured prop — one name is
 * not enough (see `emitRepropsRegistration`).
 */
type RepropsSpec = {
  params: { propsField: string; inputField: string }[]
  usesSearchParams: boolean
}

/**
 * String-returning array/string methods. `.get(...)` stays a generic `call`;
 * the rest fold into `array-method`. Module-level so `isStringExpr` (which
 * recurses over expression trees) reuses one set instead of allocating per call.
 */
const STRING_METHODS: ReadonlySet<string> = new Set([
  'replace', 'trim', 'trimStart', 'trimEnd', 'toLowerCase', 'toUpperCase',
  'slice', 'substring', 'substr', 'padStart', 'padEnd', 'concat', 'repeat', 'get',
])

/** Binary operators whose Go lowering yields a boxed number (`+` may also be
 * a string concat, which `bf_string` passes through unchanged). */
const ARITHMETIC_OPS = new Set(['+', '-', '*', '/', '%', '**'])

/** A lowered value that is a Go constant (an inlined const, a string
 * literal): it prints as written, so the text sink needs no `bf_text`. */
function isGoConstant(goExpr: string): boolean {
  if (goExpr === 'true' || goExpr === 'false' || /^-?\d+$/.test(goExpr)) return true
  if (!goExpr.startsWith('"') || !goExpr.endsWith('"')) return false
  try {
    return typeof JSON.parse(goExpr) === 'string'
  } catch {
    return false
  }
}

/**
 * Local names whose template reads resolve to another field than their own
 * (`rootFieldRef`): a bare-props-form body destructure's renamed prop
 * (`const { children: kids } = props`, #2788, resolved to the prop key),
 * and a param destructure binding whose Props field is not named after its
 * local (`propsFieldNames`: `{ children: kids }` → `Children`,
 * `{ label: children }` → `Label`, #3572), resolved to that field.
 */
function propFieldAliases(ir: ComponentIR): Map<string, string> {
  const aliases = resolveBodyDestructuredPropAliases(ir.metadata.localConstants ?? [], ir.metadata.propsObjectName)
  for (const [local, field] of propsFieldNames(ir.metadata)) {
    if (field !== capitalizeFieldName(local)) aliases.set(local, field)
  }
  return aliases
}

/** Caller-facing prop key → its Props field (`CompileState.propKeyFields`). */
function propKeyFields(ir: ComponentIR): Map<string, string> {
  const fields = new Map<string, string>()
  const byLocal = propsFieldNames(ir.metadata)
  for (const p of ir.metadata.propsParams ?? []) {
    if (p.isRest) continue
    const key = p.sourceName ?? p.name
    const field = byLocal.get(p.name)
    if (field && !fields.has(key)) fields.set(key, field)
  }
  return fields
}

/** Go field names a derived-const field must not take: props, signals and memos already own them. */
function derivedConstTakenFieldNames(ir: ComponentIR): Set<string> {
  return new Set<string>([
    ...ir.metadata.propsParams.map(p => propsFieldName(p, ir.metadata)),
    ...ir.metadata.signals.map(s => capitalizeFieldName(s.getter)),
    ...ir.metadata.memos.map(m => capitalizeFieldName(m.name)),
  ])
}

/**
 * `ir` with each memo body's computed-const reads replaced by their
 * initializers (#3494). Applied once, with every other compile state primed,
 * so the memo field's type, its boxed-arithmetic classification and its
 * constructor value all read the same body. A memo body is component scope:
 * no loop binding shadows a const there. A module-scope const stays a name:
 * the constructor lowering already resolves one (`checkbox`'s
 * `stateClasses = [...].join(' ')` inside a template-literal memo). `ir`
 * itself is returned when no memo body reads one.
 */
function withInlinedMemoBodies(ir: ComponentIR, isAdapterBound: (name: string) => boolean): ComponentIR {
  const moduleConsts = new Set((ir.metadata.localConstants ?? []).filter(c => c.isModule).map(c => c.name))
  const memoConsts = computedConstContext(ir.metadata, () => false, name => moduleConsts.has(name) || isAdapterBound(name))
  const memos = (ir.metadata.memos ?? []).map(m =>
    m.parsed ? { ...m, parsed: inlineComputedConsts(m.parsed, memoConsts) } : m,
  )
  if (!memos.some((m, i) => m.parsed !== ir.metadata.memos[i].parsed)) return ir
  return { ...ir, metadata: { ...ir.metadata, memos } }
}

/**
 * The `GoTemplateAdapter` template adapter. Pass an instance as the `adapter` option of `@barefootjs/vite`.
 *
 * @since 0.1.0
 * @stability alpha
 */
export class GoTemplateAdapter extends BaseAdapter implements ParsedExprEmitter, IRNodeEmitter<GoRenderCtx> {
  name = 'go-template'
  extension = '.tmpl'

  // Sentinel marking a parent-scope `bf-s` slot inside a hoisted-JSX children
  // bake (see `extractScopedHtmlChildren`). Can't appear in real HTML text.
  private static readonly SCOPE_SENTINEL = '__BF_SCOPE_SENTINEL__'

  /** Captured enclosing names a filtered loop's own `{{range}}` redeclares,
   * mapped to the Go variable that holds the enclosing value (#3396). */
  private filterCaptureAliases: Map<string, string> = new Map()

  /**
   * Identifier-path callees the Go runtime can render in template scope, keyed
   * by the textual callee path as written in JSX. Each value emits the
   * substituted Go body from already-Go-rendered args, WITHOUT the `{{ }}`
   * delimiters so callers compose it (`{{if eq (bf_json .X) "..."}}`).
   *
   * Identifier-path callees only; method calls on values (`(arr).join(",")`)
   * need an analyzer-resolved receiver type and are out of scope. Public
   * because the relocate pass reads it for boolean acceptance.
   */
  templatePrimitives: TemplatePrimitiveRegistry =
    Object.fromEntries(
      Object.entries(GO_TEMPLATE_PRIMITIVES).map(([k, v]) => [k, v.emit])
    )

  /**
   * Expected arg count per primitive, so a wrong-arity call (`JSON.stringify()`,
   * `JSON.stringify(x, replacer)`) falls back to BF101 instead of emitting
   * invalid Go from the emit fn's blind `args[0]` read. Derived from
   * `GO_TEMPLATE_PRIMITIVES` so it can't drift from `templatePrimitives`.
   */
  private readonly templatePrimitiveArities: Record<string, number> =
    Object.fromEntries(
      Object.entries(GO_TEMPLATE_PRIMITIVES).map(([k, v]) => [k, v.arity])
    )

  private options: Required<GoTemplateAdapterOptions>

  /** Per-compile mutable state, reset at `generate()` / `generateTypes()` entry. See `CompileState` for the field-by-field docs. */
  private readonly state = new CompileState()

  /**
   * The `GoEmitContext` handed to extracted emit modules — the seam that keeps
   * `state` / `convert*` off the public adapter type. `state` is captured by
   * reference (reset in place, never reassigned), so this single `emitCtx` stays
   * valid across `generate()` calls.
   */
  private readonly emitCtx: GoEmitContext = {
    state: this.state,
    convertExpressionToGo: (jsExpr, out, preParsed) =>
      this.convertExpressionToGo(jsExpr, out, preParsed),
    convertConditionToGo: (jsCondition, preParsed) =>
      this.convertConditionToGo(jsCondition, preParsed),
    computedSignalSeed: (signal, propsParams, propFallbackVars, concreteDest) =>
      this.computedSignalSeed(signal, propsParams, propFallbackVars, concreteDest),
    extractPropFallbackFromParsed: (parsed) => this.extractPropFallbackFromParsed(parsed),
    extractCollisionDerivation: (parsed) => this.extractCollisionDerivation(parsed),
    resolveModuleStringConst: (name) => this.resolveModuleStringConst(name),
    resolveModuleConstAsGo: (name, target) => this.resolveModuleConstAsGo(name, target),
  }

  /** The adapter-owned lookups and renders the child-Input lowering (`props/child-input-fields.ts`) reads. */
  private readonly childInputHost: ChildInputHost = {
    ctx: this.emitCtx,
    childShape: (childName) => this.childComponentShapes.get(this.resolveChildName(childName)),
    resolveDynamicPropValue: (expr, signals, memos, propsParams, propFallbackVars, nillableDest) =>
      this.resolveDynamicPropValue(expr, signals, memos, propsParams, propFallbackVars, nillableDest),
    extractTextChildren: (children) => this.extractTextChildren(children),
    extractHtmlChildren: (children) => this.extractHtmlChildren(children),
    extractScopedHtmlChildren: (children) => this.extractScopedHtmlChildren(children),
  }

  /** Diagnostics from the current compile (backed by `CompileState`); `generate()` also merges these into `ir.errors`. */
  get errors(): CompilerError[] {
    return this.state.errors
  }

  private inLoop: boolean = false
  /**
   * Memoized `analyzeBakeableStaticChildLoop` result per loop marker id
   * (#2208). Consulted from three sites that all need the SAME verdict for
   * the SAME loop — the `renderLoop` gate, the Input struct's field list,
   * and the constructor's per-item construction. `renderLoop`'s gate runs
   * during `generate()`'s render pass; the other two run during
   * `generateTypes()`'s constructor-generation pass, which `generate()`
   * also invokes internally partway through — so this cache is reset (in
   * `primeCompileState`, not here) between those two passes too. Agreement
   * across all three sites is therefore guaranteed by `analyzeBakeable-
   * StaticChildLoop` being a deterministic pure function of the (re-primed)
   * per-compile state, not by one shared memo spanning every read; the
   * cache's value is avoiding redundant recomputation WITHIN the pass that
   * populated it, not correctness across passes.
   */
  private bakedStaticChildLoopCache = new Map<string, BakedStaticChildLoop | null>()
  /**
   * The one threaded, immutable scope of "names bound by an enclosing loop
   * callback" (#2482 Stage 3 — replaces this adapter's own order-sensitive
   * loop-param stack). Entered via `enterLoopRow(loop)` in `renderLoop` /
   * `renderUnrolledStaticElementLoop`, bracketing preamble conversion,
   * children rendering, AND the key-anchor (`loopItemMarker`) conversion —
   * mirrors the Stage 1a/1b `ctx.scope` precedent in `jsx-to-ir.ts` and the
   * Stage 2 template-string-adapter migration. `IRLoop` already structurally
   * satisfies `LoopBindingSource` (`param`/`index`/`paramBindings`/
   * `preamble`), so most call sites pass the loop node straight through.
   *
   * ONE Go-specific wrinkle `BindingScope`'s generic 'item' semantics don't
   * know about: a `.keys()`-shape loop's callback param is the RANGE INDEX,
   * not the range value — Go's `{{range}}` dot context there is the
   * (discarded) value, not the key, so the key must never win the
   * depth-0-item "resolves to `.`" fast path `isCurrentLoopItem` grants a
   * plain `.map()` param. `renderLoop` enters such a loop's scope with an
   * overridden EMPTY `param`, mirroring the historical empty-string push
   * onto the old stack for the same shape — the key name stays
   * resolvable only through `loopVarRefCount`'s existing `$name` machinery,
   * unchanged by this migration.
   *
   * Destructured-binding ACCESSOR TEXT (`id` → `$__bf_item0.Id`) is Go-
   * specific rendering payload `ScopeBinding` has no field for (by design —
   * `BindingScope` only carries EXISTENCE/kind, not per-adapter accessor
   * strings), so `loopBindingStack` stays as the accessor source of truth,
   * pushed/popped in lockstep with `scope` at the same points. `scope`
   * subsumes its EXISTENCE role (shadow-guard / dot-vs-`$name` decisions)
   * everywhere except the accessor lookup itself.
   */
  private scope: BindingScope = BindingScope.EMPTY
  /**
   * Per-loop: true when the body renders the bare range value (scalar-item
   * inline-literal loop), so the `bf_tmpl` companion is fed `.BfLoopItem` (the
   * wrapper's synthetic scalar field) instead of `.`. Innermost last.
   */
  private loopScalarItemStack: boolean[] = []
  /**
   * True while a scalar wrapper row's call site renders
   * (`scalarWrapperRowLoops`): `.` there is the row wrapper, so the row value
   * itself reads as `.BfLoopItem` (`currentLoopItemRef`) — a prop of the row
   * component (`tone={g}`) included. Off inside the row's forwarded-children
   * define, whose `.` is the bare value (`queueLoopBodyChildrenDefine`).
   */
  private scalarWrapperRowCallSite = false
  /**
   * While a scalar wrapper row's forwarded-children define renders: its
   * calling loop's index or callback locals it reads come from the wrapper's
   * `BfRowVars`, so the define gets the wrapper as its data and ranges once
   * over its `BfLoopItem` (`renderWrapperRowDefine`).
   */
  private wrapperRowScalar = false
  /**
   * Per-loop: true when the loop body IS a single component
   * (`loop.childComponent`), i.e. the range iterates the `.{Name}s` wrapper
   * slice and `.` inside the body is a wrapper struct that embeds the child's
   * Props. False for a component merely nested inside an element item
   * (`<li><Badge/></li>`, #2130), where `.` is the raw datum and the child's
   * props live on the PARENT's once-per-slot instance (`$.{Name}SlotN`).
   * Innermost last.
   */
  private loopWrapperStack: boolean[] = []
  private loopVarRefCount: Map<string, number> = new Map()
  /** Stack of destructure-param binding maps (binding name → Go accessor on the
   *  range var, e.g. `id` → `$__bf_item0.Id`, `rest` → `$__bf_item0`, an
   *  array-rest → `(bf_slice $__bf_item0 1)`, a nested/index path →
   *  `(index $__bf_item0.Cells 0)`). Innermost last. Lets `.map(({ id, ...rest
   *  })` / `.map(([k, v]) =>` / nested-path destructure resolve instead of
   *  BF104 (#2087 Phase B — see `buildDestructureBindingMap`). */
  private loopBindingStack: Array<Map<string, string>> = []
  /**
   * Go accessor text for each destructured row's bindings, keyed by the row's
   * `BindingScope` frame. `scope` decides which row binds a name; this table
   * only carries the Go-specific accessor for a `destructure` binding (#3392).
   */
  private destructureAccessors = new WeakMap<ScopeFrame, Map<string, string>>()
  /**
   * Stack of object-rest exclude-key maps, parallel to `loopBindingStack`
   * (same push/pop points, innermost last). Only object-rest bindings appear
   * here — keyed by binding name, each entry carries the PARENT accessor
   * (same value as `loopBindingStack`'s entry for that name) plus the sibling
   * keys the destructure pattern already pulled out. `emitSpread` consults
   * this for a `{...rest}` spread onto an intrinsic element, so the residual
   * omits exactly the keys the pattern destructured — member reads
   * (`rest.flag`) don't need it and keep resolving through `loopBindingStack`
   * alone (#2087 Phase B).
   */
  private loopRestExcludeStack: Array<Map<string, { parent: string; excludeKeys: string[] }>> = []
  /**
   * Active per-item static bindings for a #2224 unrolled plain-element loop
   * (`renderUnrolledStaticElementLoop`) — innermost last, so a nested static
   * unroll inside another one resolves against its own item, not an outer
   * one's. When non-empty, `convertExpressionToGo`'s top-of-function check
   * resolves EVERY expression against the innermost entry's item via
   * `evaluateStaticLiteral` and returns a literal Go value instead of
   * descending into the normal `.Field`-style dot-context lowering — there
   * is no real `{{range}}` establishing that context during an unroll, so
   * `identifier()`'s `currentLoopParam → '.'` branch would otherwise resolve
   * against the WRONG (enclosing) dot context. `analyzeBakeableStaticElementLoop`
   * has already verified every expression in the body resolves this way for
   * every item, so the fallback failure branch below is a defensive
   * invariant check, not a real code path.
   */
  private staticLoopItemStack: Array<{ param: string; item: unknown }> = []
  /**
   * Set by the `convertExpressionToGo` override above when a
   * `staticLoopItemStack` entry is active but the current expression fails
   * to resolve against it — should never happen (see that check's comment),
   * but `renderUnrolledStaticElementLoop` asserts this stays `false` after
   * every item render rather than silently shipping a `""` sentinel.
   */
  private staticLoopBakeFailed = false

  /**
   * Fold `staticLoopItemStack` (outer→inner) into one bindings map — an
   * inner row (#2893) needs to resolve BOTH its own item param AND any
   * outer loop's, not just the innermost entry (`item.id` read from inside
   * a nested `item.children.map(child => ...)` row). Later entries win on a
   * name collision, matching normal JS shadowing (`items.map(item =>
   * item.children.map(item => ...))`, however unlikely). The SAME map shape
   * `analyzeBakeableStaticElementLoop`'s per-item fold check builds, so the
   * two can never disagree about what a name resolves to.
   */
  private staticLoopBindings(): ReadonlyMap<string, unknown> {
    const bindings = new Map<string, unknown>()
    for (const entry of this.staticLoopItemStack) bindings.set(entry.param, entry.item)
    return bindings
  }

  /**
   * Cross-component child shapes, keyed by child component name. Populated via
   * `registerChildComponentShape` before the parent's `generateTypes`, so the
   * static-child-init codegen can route an attribute that is NOT a declared
   * child param (`<CheckIcon data-slot=.../>`) into the child's rest bag instead
   * of an invalid hyphenated field (`Data-slot:`). An unknown attr on a child
   * with no rest bag is left as-is (existing field path / Go error surfaces).
   */
  private childComponentShapes: Map<string, ChildComponentShape> = new Map()

  /** Child component name → the contexts it consumes (cross-component, for provider wiring). */
  private childContextConsumers: Map<string, ContextConsumer[]> = new Map()

  /**
   * Type name (as its DEFINING file wrote it) → its Go-backed shape,
   * accumulated across every component `buildLocalTypeTables` has already
   * processed in this build (#2984), including a definer `ensureCrossFileTypes`
   * (#2992) scanned on demand ahead of its own real compile. A consumer's
   * own `ir.metadata.
   * typeDefinitions` never includes a type it only IMPORTS — most often a
   * child component's own prop-shape type, imported alongside the component
   * itself (`import { Child, type Dashboard } from './Child'`) — so without
   * this, `typeInfoToGo`'s `'interface'` case treats `Dashboard` as an
   * unbacked external reference the moment a PARENT names it as a generic
   * type argument (`createSignal<Dashboard>`), falling back to
   * `interface{}` and silently losing the field's Go type (and seeding
   * `nil`, since `convertInitialValue` follows the same fallback).
   *
   * Snapshots the field map the DEFINING component already computed, rather
   * than re-deriving one from the borrowed `TypeDefinition` in the
   * consumer's own emit context: a nested anonymous property type
   * (`Dashboard.items: { id, label }[]`) only resolves through
   * `state.synthObjectStructNames`, which is reset per component —
   * recomputing `structFieldsFor` for `Dashboard` while compiling the
   * PARENT would consult the parent's own (unrelated, and at this point not
   * yet populated) synthesis map and silently widen that nested field to
   * `map[string]interface{}` instead of reusing what the child already
   * worked out for itself.
   *
   * Keyed by the type's name in its OWN defining file, not any importer's
   * local alias — `buildLocalTypeTables` looks entries up by the imported
   * specifier's ORIGINAL name (`ImportSpecifier.name`), then registers the
   * result under the consumer's local binding.
   */
  private crossFileTypeAliases: Map<string, string> = new Map()

  /** See `crossFileTypeAliases`. Object/interface counterpart (tsName → Go field name). */
  private crossFileStructFields: Map<string, Map<string, string>> = new Map()
  /**
   * `Struct.field` keys flipped to `interface{}` for a nullable signal seed
   * (#3323), unioned over every component this adapter has seen — both
   * its own `primeCompileState` and `registerChildComponentShape`'s
   * pre-pass — so a named type shared within a file is emitted once, the
   * same way, by each component.
   */
  private fileNullableSeedStructFields: Set<string> = new Set()

  /**
   * The constructor locals holding the caller's own value of each prop whose
   * dependent destructure default was applied to `in`, by Input field (#3531).
   * Set by `emitDependentDefaults` for the constructor being generated.
   */
  private dependentDefaultRawLocals: Map<string, string> = new Map()

  /**
   * See `crossFileTypeAliases`. The DEFINING component's own `TypeDefinition`
   * (carrying `properties`, so each field's declared `TypeInfo` — not just
   * its Go name — survives), for a consumer that bakes an object-LITERAL
   * initial value against a borrowed type (`createSignal<Dashboard>({...})`)
   * rather than merely declaring a field of that type. `structPropertyType`
   * (`parsed-literal-to-go.ts`) resolves a struct literal's per-property
   * type by struct name against `state.currentTypeDefinitions` — a plain
   * name lookup, agnostic to which file registered the entry — so splicing
   * this into the consumer's own list (`buildLocalTypeTables`) is enough;
   * no second lookup path to keep in sync with the same-file case.
   */
  private crossFileTypeDefinitions: Map<string, TypeDefinition> = new Map()

  /** Absolute paths already scanned by `ensureCrossFileTypes` (#2992) — caps re-parsing a definer to once per build. */
  private scannedCrossFileSources: Set<string> = new Set()

  /**
   * Local alias -> declared/exported name for imported components (#2822,
   * the SSR-side counterpart of #2777's client-JS registry-key fix). A
   * child referenced under an import alias (`import { Foo as Bar }`,
   * `<Bar/>`) has an `IRComponent.name` of `Bar` (the caller-local JSX tag
   * name), but every cross-file lookup this adapter does against the
   * child's OWN registered identity — `childComponentShapes` /
   * `childContextConsumers` / `childDerivedFieldDeps` / `childPropFieldNames`
   * / `childRepropsReady` (all populated from the CHILD's own
   * `ir.metadata.componentName` via `registerChildComponentShape` or the
   * child's own `generate()`/`generateTypes()` pass), the `New<Name>Props`
   * constructor + `<Name>Input`/`<Name>Props` TYPE names, and the
   * `{{template "<Name>" ...}}` cross-template call — must resolve through
   * to `Foo`, the declared name, or they silently miss (a Go compile error
   * for the constructor/type case, a `no such template` render error for
   * the `{{template}}` case). Built once per compile from
   * `ir.metadata.imports` via the shared `buildImportAliasMap`
   * (`@barefootjs/jsx`) and read through `resolveChildName`.
   *
   * Deliberately NOT applied to a component's own PARENT-PRIVATE struct
   * field name (`${comp.name}${suffix}`, `.${comp.name}` field access) —
   * that field is declared and read using the SAME `comp.name` expression
   * within this one parent's own generated code, so it stays internally
   * consistent under the caller-local alias with no cross-file identity to
   * match.
   */
  private importAliases: Map<string, string> = new Map()

  /**
   * Resolve a component reference's `IRComponent.name` (the caller-local
   * JSX tag / import alias) to the name the referenced child's OWN module
   * registers its Go template/type/constructor under. Identity for an
   * un-aliased reference. See `importAliases`.
   */
  private resolveChildName(name: string): string {
    return this.importAliases.get(name) ?? name
  }


  constructor(options: GoTemplateAdapterOptions = {}) {
    super()
    this.options = {
      packageName: options.packageName ?? 'components',
      clientJsBasePath: options.clientJsBasePath ?? '/static/client/',
      barefootJsPath: options.barefootJsPath ?? '/static/client/barefoot.js',
    }
  }

  /**
   * Prime the per-compile state both `generate()` and `generateTypes()` derive
   * from the IR. Both must prime identically or the emitted Input/Props structs
   * drift (`generateTypes` runs on a separately round-tripped IR).
   * `propsObjectName` is set first because the inherited-attr scan keys off it.
   */
  private primeCompileState(ir: ComponentIR): ComponentIR {
    this.state.propsObjectName = ir.metadata.propsObjectName
    this.state.restPropsName = ir.metadata.restPropsName ?? null
    // #2822: this component's OWN import-alias map (local alias -> declared
    // name), read by `resolveChildName` at every cross-file lookup/codegen
    // site below. Re-primed on every `generate()`/`generateTypes()` call —
    // harmless per this method's own docstring, since what matters is that
    // the LAST prime before a given `ir`'s template body actually renders is
    // that same `ir`'s own imports (true here: `generate(ir)` primes then
    // renders `ir`'s body synchronously before any other IR is primed).
    this.importAliases = buildImportAliasMap(ir.metadata.imports ?? [])
    // Inline-object-typed props (`cfg: { id: number }`) bake as
    // `map[string]interface{}`; `member()` routes a nested access on them
    // through `bf_get` rather than an exact-case dot path (#2299).
    this.state.objectTypedPropNames = new Set(
      (ir.metadata.propsParams ?? [])
        .filter(p => p.type.kind === 'object')
        .map(p => p.name),
    )
    // Object-literal signal seeds in an `interface{}` / map field bake as a
    // source-keyed map (#3353); `member()` reads them through `bf_get`.
    this.state.mapSeededSignalGetters = new Set(
      (ir.metadata.signals ?? [])
        .filter(s => {
          if (s.parsed?.kind !== 'object-literal') return false
          const goType = typeInfoToGo(this.emitCtx, s.type)
          return goType === 'interface{}' || goType === 'map[string]interface{}'
        })
        .map(s => s.getter),
    )
    this.state.moduleStringConsts = this.collectModuleStringConsts(ir.metadata.localConstants)
    this.state.localConstants = ir.metadata.localConstants ?? []
    const bakesField = this.derivedConstFieldBaker(ir)
    this.state.computedConsts = computedConstContext(ir.metadata, name => this.scope.isBound(name), bakesField)
    // #2813: precompute which local consts are bare alias-hop chains onto a
    // signal/memo getter, so `rootFieldRef` can route a call through the
    // getter's OWN field instead of registering a separate, never-seeded
    // field under the alias's name. Env-signal getters are excluded — they
    // resolve through `searchParamsFieldRef`, not a seeded root field.
    {
      const getterNames = collectAliasableGetterNames(ir.metadata.signals ?? [], ir.metadata.memos ?? [])
      this.state.getterAliases = resolveGetterAliases(ir.metadata.localConstants ?? [], (n) => getterNames.has(n))
    }
    // #2788: bare-props-form body destructure aliases (`const { children:
    // kids } = props`) — same alias-resolution need as `getterAliases`
    // above, different terminal set (a prop key here, a signal/memo
    // getter there).
    this.state.propDestructureAliases = propFieldAliases(ir)
    this.state.propKeyFields = propKeyFields(ir)
    // #2208 fable review: every name a `.map()`/`.filter()` loop callback
    // binds as its item/index parameter anywhere in the component. Static
    // loop-source resolution (`getBakedStaticChildLoop` /
    // `analyzeBakeableStaticChildLoop`) must never resolve a const whose
    // name a DIFFERENT, enclosing loop's own callback param shadows.
    // Computed here (not from live render-time stack state) because this
    // must agree across THREE call sites, two of which (`generateTypes`'s
    // Input-struct + constructor generation) run OUTSIDE the live
    // `renderLoop` tree-walk that would otherwise track shadowing via
    // stack push/pop — same coarse-but-safe mitigation as #2212.
    this.state.staticLoopSourceBoundNames = collectLoopBoundNames(ir)
    // #2208 fable re-review: the adapter instance is a reused singleton —
    // `generate()` calls this once per component, but `generateTypes()` is
    // ALSO a standalone public entry point (the Go conformance harness in
    // `test-render.ts` calls it directly on an already-`generate()`d
    // adapter for a sibling/child IR). Resetting the bake cache HERE, not
    // just in `generate()`, closes that door too: a stale entry keyed by a
    // marker id that collides with a PREVIOUS component (marker ids
    // restart at `l0` per component) would otherwise either silently
    // suppress this fix or leak that other component's baked data into
    // this one's constructor. `generate()` itself calls `generateTypes()`
    // partway through — re-priming (and so re-clearing the cache) there is
    // harmless: `analyzeBakeableStaticChildLoop` is deterministic over
    // identically-primed state, so a cache miss on the second pass just
    // recomputes the same answer.
    this.bakedStaticChildLoopCache = new Map()
    this.state.localHelperNames = new Set(
      this.state.localConstants.filter(c => !c.isModule && c.containsArrow).map(c => c.name),
    )
    this.state.currentMemos = ir.metadata.memos ?? []
    this.state.currentSignals = ir.metadata.signals ?? []
    this.state.currentTypeDefinitions = ir.metadata.typeDefinitions ?? []
    this.state.currentPropsParams = ir.metadata.propsParams ?? []
    this.state.rowsFields = allocateRowsFields(
      findNestedComponents(ir.root),
      this.state.currentPropsParams,
      [...(ir.metadata.signals ?? []).map(s => s.getter), ...(ir.metadata.memos ?? []).map(m => m.name)],
    )
    this.state.contextConsumers = collectContextConsumers(ir.metadata)
    // Single authority (Package G): the plan already decided which signals are
    // per-request env readers, in declaration order. `ir.metadata.ssrSeedPlan`
    // may be absent for hand-built metadata (tests), hence the fallback to the
    // same shared computation rather than a second, divergent derivation.
    this.state.ssrSeedPlan = ir.metadata.ssrSeedPlan ?? computeSsrSeedPlan(ir.metadata)
    this.state.envSignalReadersByLocal = new Map()
    this.state.searchParamsLocals = new Set()
    for (const step of this.state.ssrSeedPlan.steps) {
      if (step.kind !== 'env-reader') continue
      // `reader.methods` is a ReadonlySet — JSON round-tripping (adapter
      // conformance harness) serializes it to `{}`, so re-resolve a live
      // reader from the registry by key instead of trusting `step.reader`.
      const reader = envSignalReaderFor(step.reader.key)
      if (reader) this.state.envSignalReadersByLocal.set(step.name, reader)
      if (step.reader.key === 'search') this.state.searchParamsLocals.add(step.name)
    }
    this.state.loweringMatchers = prepareLoweringMatchers(ir.metadata)
    augmentInheritedPropAccesses(ir)
    // The consumed-prop sets feed `resolvePropGoType`'s interface{} flips
    // (#2248/#2259) and `collectNillablePropNames` is derived from
    // `resolvePropGoType`, which also consults the local type tables — so
    // build the tables first and populate all three HERE, where both entry
    // points share them. Computing them only in `generate()` left the
    // standalone `generateTypes()` entry (sibling IRs in the conformance
    // harness) resolving structs against another component's sets, and
    // `generate()` itself computing nillability against the PREVIOUS
    // compile's type tables.
    buildLocalTypeTables(this.typeSynthesisHost, ir, ir.metadata.componentName)
    // Template-time readers (`nillablePropNameOf`, `resolvePropMemberSeed`
    // via memo/getter lowering) run before `generateTypes`, so they need
    // the overrides now — computed against the same freshly built tables
    // `collectNillablePropNames` reads below. `generateTypes` recomputes it
    // once this compile's anonymous-object structs are synthesized.
    this.state.propTypeOverrides = buildPropTypeOverrides(this.emitCtx, ir)
    this.state.nullishConsumedPropNames = collectNullishConsumedPropNames(this.emitCtx, ir)
    this.state.omittableAttrConsumedPropNames = collectOmittableAttrConsumedPropNames(this.emitCtx, ir)
    this.state.textConsumedPropNames = collectTextConsumedPropNames(this.emitCtx, ir)
    this.state.presenceCheckedPropNames = collectPresenceCheckedPropNames(this.emitCtx, ir)
    this.state.nullableSignalSeedPropNames = collectNullableSignalSeedPropNames(this.emitCtx, ir)
    this.state.absentPropSeedSignals = new Set(
      [...collectAbsentPropSeedReads(ir)]
        .filter(([, reads]) => [...reads].every(name => this.state.nullableSignalSeedPropNames.has(name)))
        .map(([getter]) => getter),
    )
    this.state.optionalChainReceiverPropNames = collectOptionalChainReceiverPropNames(this.emitCtx, ir)
    this.state.arithmeticAbsentPropNames = collectArithmeticAbsentPropNames(this.emitCtx, ir)
    this.state.propsSpreadForwardedPropNames = collectPropsSpreadForwardedParams(this.emitCtx, ir)
    for (const key of collectNullableSeedStructFields(ir.metadata, ir.root)) this.fileNullableSeedStructFields.add(key)
    this.state.nullableSeedStructFields = this.fileNullableSeedStructFields
    this.state.nillablePropNames = collectNillablePropNames(this.emitCtx, ir, this.state.propTypeOverrides)
    this.state.nillableSignalGetters = this.collectNillableSignalGetters(ir)
    ir = withInlinedMemoBodies(ir, bakesField)
    this.state.currentMemos = ir.metadata.memos
    this.state.nullishAttrCtx = collectNullishAttrContext(ir)
    return ir
  }

  /**
   * Nullable signals (`collectNullableSignalGetters`, #3304) whose Props
   * field is `interface{}` and so can actually hold `nil`. A signal seeded
   * from a prop or a prop member takes that field's Go type instead
   * (`generateTypes`), which a `ne … nil` guard can't compare against —
   * those stay unguarded, except a seed prop already flipped to
   * `interface{}` for it (`collectNullableSignalSeedPropNames`, #3323).
   */
  private collectNillableSignalGetters(ir: ComponentIR): Set<string> {
    const nullable = collectNullableSignalGetters(ir)
    const propNames = new Set(ir.metadata.propsParams.map(p => p.name))
    return new Set(
      ir.metadata.signals
        .filter(signal => nullable.has(signal.getter))
        .filter(signal => isNillableSeedSignal(this.emitCtx, signal) || propMemberSeedGoType(this.emitCtx, signal) === 'interface{}' || (
          !propNames.has(signal.initialValue) &&
          !seedPassthroughPropName(this.emitCtx, signal.parsed) &&
          !propMemberSeedGoType(this.emitCtx, signal) &&
          typeInfoToGo(this.emitCtx, signal.type, signal.initialValue, signal.parsed) === 'interface{}'))
        .map(signal => signal.getter),
    )
  }

  /** A nullable signal seeded whole from a prop flipped to `interface{}` for it (#3323). */
  /** Generate template output for a component. */
  generate(ir: ComponentIR, options?: AdapterGenerateOptions): AdapterOutput {
    this.state.componentName = ir.metadata.componentName
    this.state.errors = []
    this.state.referencedDerivedConsts = new Set()
    this.state.templateReadRootFields = new Set()
    this.state.templateVarCounter = 0
    this.state.pendingChildrenDefines = []
    this.state.refusedLoopArrayConsts = new Set()
    this.scope = BindingScope.EMPTY
    ir = this.primeCompileState(ir)
    this.state.stringValueNames = collectStringValueNames(ir)
    // A SAME-FILE child's shape (`childComponentShapes`, which `routesToRestBag`
    // reads to pick `bf_with_props` vs `bf_with_bag` delivery, and
    // `childDerivedFieldDeps` for `loopRowChildPropOverrides`) is registered
    // by `compileMultipleComponents`' pre-pass through the
    // `registerChildComponentShape` hook — for EVERY component of the file
    // before any of them generates, so it holds whatever the declaration
    // order (`composite-row-child-rest-bag-prop-hoisted`). Cross-file
    // children reach the same hook from the CLI / compat / test-render
    // pre-passes. Self-registering here instead (#2448, #3062) only covered
    // a child generated before its parent.

    // Surface loop-body usages of sibling-imported components (see
    // `checkImportedLoopChildComponents`). The barefoot CLI compiles a
    // source dir together onto one `*template.Template`, so it sets
    // `siblingTemplatesRegistered` and the check would be noise; stand-alone
    // `compileJSX` callers leave it unset and get the loud build-time error.
    if (!options?.siblingTemplatesRegistered) {
      this.checkImportedLoopChildComponents(ir)
    }
    this.checkPropFieldNameCollisions(ir)

    const hasInteractivity = hasClientInteractivity(ir)
    const isRootComponent = ir.root.type === 'component'
    const isIfStatement = ir.root.type === 'if-statement'

    // Map each array memo backing a loop (`<memo>().map(...)`) to that loop's
    // handler-filled slice field, so `<memo>().length` lowers to the slice's
    // length. Built before rendering — `.length` can precede the loop in source.
    this.state.memoBackedLoopSlice = new Map()
    this.state.scalarWrapperRowLoops = new Set()
    for (const nested of findNestedComponents(ir.root)) {
      const memoName = this.extractMemoNameFromLoopArray(nested.loopArray)
      if (memoName) this.state.memoBackedLoopSlice.set(memoName, this.nestedRowsField(nested))
      if (nested.loopMarkerId && this.wrapperRowScalarItemGoType(ir, nested)) {
        this.state.scalarWrapperRowLoops.add(nested.loopMarkerId)
      }
    }
    const templateBody = isIfStatement
      ? this.renderIfStatement(ir.root as IRIfStatement, { isRootOfClientComponent: hasInteractivity })
      : this.renderNode(ir.root, { isRootOfClientComponent: hasInteractivity && isRootComponent })

    const scriptRegistrations = options?.skipScriptRegistration
      ? ''
      : this.generateScriptRegistrations(ir, options?.scriptBaseName, options?.scriptAssets, options?.preloadAssets)

    // Trim markers (`-}}` / `{{-`) strip the template-SOURCE formatting
    // newlines that surround the define body -- unlike Jinja's
    // `trim_blocks`/`lstrip_blocks`, Go's `text/template` has no
    // environment-level auto-trim option, so these newlines are literal
    // output text by default. That is invisible when this component is
    // rendered as the page root or sits between two tags (ordinary
    // whitespace collapse, including this repo's `normalizeHTML`, erases
    // it there) but becomes a real, byte-visible leading/trailing space
    // the moment `{{template "${this.state.componentName}" ...}}` is
    // spliced immediately next to TEXT rather than a tag -- e.g. an
    // `AccordionTrigger`'s `{props.children}` label immediately followed
    // by its `<ChevronDownIcon/>`, whose OWN `{{define "ChevronDownIcon"}}`
    // used to leak a `\n` in front of its `<svg`. See the analogous
    // `trim_blocks`/`lstrip_blocks` fix in the Jinja adapter's
    // `backend_jinja.py`.
    let template = `{{define "${this.state.componentName}" -}}\n${scriptRegistrations}${templateBody}\n{{- end}}\n`
    // Companion children defines execute with the parent's data via `bf_tmpl`.
    for (const d of this.state.pendingChildrenDefines) {
      template += `{{define "${d.name}"}}${d.content}{{end}}\n`
    }
    const types = this.generateTypes(ir, true)

    if (this.state.errors.length > 0) {
      ir.errors.push(...this.state.errors)
    }

    // Go templates have no JS-style import/type/default-export sections; the
    // whole `{{define}}…{{end}}` block is the body, and the compiler assembles
    // multi-component files by concatenating the `component` parts.
    const sections: TemplateSections = {
      imports: '',
      types: '',
      component: template,
      defaultExport: '',
    }

    return {
      template,
      sections,
      types: types || undefined,
      extension: this.extension,
    }
  }

  /**
   * Refuse two props whose names lower to the same exported Go field
   * (`x_a` and `_a` both → `X_a`, #3336). Checked in both namespaces: the
   * template-facing Props struct is keyed by the local binding name, and the
   * caller-facing Input struct by the caller's key (`sourceName`), so
   * `{ _a: first, x_a: second }` has distinct Props fields but would merge
   * both caller keys into one Input field. Repeated entries for the same
   * name are not a collision.
   */
  private checkPropFieldNameCollisions(ir: ComponentIR): void {
    const params = ir.metadata.propsParams ?? []
    const reported = new Set<string>()
    const check = (names: string[], structName: string): void => {
      const owners = new Map<string, string>()
      for (const name of names) {
        const field = capitalizeFieldName(name)
        const other = owners.get(field)
        if (other === undefined) {
          owners.set(field, name)
          continue
        }
        if (other === name) continue
        const pair = [other, name].sort().join('\u0000')
        if (reported.has(pair)) continue
        reported.add(pair)
        this.state.errors.push({
          code: 'BF101',
          severity: 'error',
          message: `Props '${other}' and '${name}' of <${ir.metadata.componentName}> both map to the Go struct field '${field}' of the ${structName} type on the Go template adapter, so their values cannot be told apart.`,
          loc: this.makeLoc(),
          suggestion: { message: `Rename one of the props so their exported Go field names differ.` },
        })
      }
    }
    check(params.map(p => p.sourceName ?? p.name), 'Input')
    check(params.map(p => p.name), 'Props')
  }

  /**
   * Push BF103 for every loop-body component reference whose name is imported
   * from a relative-path (sibling) module. The Go adapter renders these as
   * `{{template "X" .}}`, which resolves only against templates registered on
   * the same `*template.Template` — otherwise a clean build fails at request
   * time with `template: "X" is undefined`. Static (non-loop) usage is left
   * alone so existing layouts keep working.
   */
  private checkImportedLoopChildComponents(ir: ComponentIR): void {
    // No case filter: `IRComponent` nodes exist only for PascalCase usages, so
    // a lowercase utility import can't match and the structural IR check below
    // beats any name heuristic.
    const relativeImports = new Set<string>()
    for (const imp of ir.metadata.templateImports ?? ir.metadata.imports ?? []) {
      if (!imp.source.startsWith('./') && !imp.source.startsWith('../')) continue
      if (imp.isTypeOnly) continue
      for (const spec of imp.specifiers) {
        relativeImports.add(spec.alias ?? spec.name)
      }
    }
    if (relativeImports.size === 0) return

    const visit = (node: IRNode, inLoop: boolean): void => {
      switch (node.type) {
        case 'component': {
          const comp = node as IRComponent
          if (inLoop && relativeImports.has(comp.name)) {
            this.state.errors.push({
              code: 'BF103',
              severity: 'error',
              message: `Component <${comp.name}> is imported from a sibling module and used inside a loop. The Go template adapter emits a cross-template call ({{template "${comp.name}" .}}); the child template must be registered on the same *template.Template instance at render time.`,
              loc: comp.loc ?? this.makeLoc(),
              suggestion: {
                message:
                  `Options:\n` +
                  `  1. Compile '${comp.name}' (its source file) with the same adapter and register the resulting {{define "${comp.name}"}} on the same *template.Template instance at render time.\n` +
                  `  2. Inline <${comp.name}> directly inside the loop body so no cross-file template lookup is needed.\n` +
                  `  3. Mark the loop position as @client-only so the template is materialised on the client instead of at SSR time.`,
              },
            })
          }
          for (const child of comp.children) visit(child, inLoop)
          break
        }
        case 'element': {
          const el = node as IRElement
          for (const child of el.children) visit(child, inLoop)
          break
        }
        case 'fragment': {
          const frag = node as IRFragment
          for (const child of frag.children) visit(child, inLoop)
          break
        }
        case 'conditional': {
          const cond = node as IRConditional
          visit(cond.whenTrue, inLoop)
          if (cond.whenFalse) visit(cond.whenFalse, inLoop)
          break
        }
        case 'loop': {
          const loop = node as IRLoop
          for (const child of loop.children) visit(child, true)
          break
        }
        case 'if-statement': {
          const stmt = node as IRIfStatement
          visit(stmt.consequent, inLoop)
          if (stmt.alternate) visit(stmt.alternate, inLoop)
          break
        }
        case 'provider': {
          const p = node as IRProvider
          for (const child of p.children) visit(child, inLoop)
          break
        }
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

  /**
   * Script (and modulepreload) registration code for the template start.
   * Reads `.Scripts` (on every Props struct) and guards the registrations
   * with `{{if .Scripts}}` for a nil collector.
   */
  private generateScriptRegistrations(
    ir: ComponentIR,
    scriptBaseName?: string,
    scriptAssets?: string[],
    preloadAssets?: string[],
  ): string {
    // `scriptAssets`, when present (including `[]`), fully supersedes the
    // adapter-computed `barefootJsPath` / `clientJsBasePath` fallback pair
    // below — see `AdapterGenerateOptions.scriptAssets`. The caller (e.g.
    // the Vite plugin) has already decided the exact ordered URL list,
    // including whether any script is needed at all.
    if (scriptAssets) {
      if (scriptAssets.length === 0) return ''
      // `preloadAssets` is only meaningful alongside a non-empty
      // `scriptAssets` (see `AdapterGenerateOptions.preloadAssets`), and
      // every preload registration is emitted BEFORE every script
      // registration — a hint that arrives after the script it describes
      // is useless. `RegisterPreload`, like `Register`, is a no-output
      // statement: the `<link rel="modulepreload">` tag itself is only
      // ever rendered by `BfScripts` (runtime/bf.go), never here.
      const preloadRegistrations = (preloadAssets ?? []).map(
        (url) => `{{.Scripts.RegisterPreload "${url}"}}`,
      )
      const registrations = scriptAssets.map((url) => `{{.Scripts.Register "${url}"}}`)
      // `{{end -}}` trims the trailing `\n` below so it never becomes a
      // literal newline ahead of `templateBody` in the caller -- see the
      // trim-marker note on `generate()`'s `{{define}}` above.
      return `{{if .Scripts}}${preloadRegistrations.join('')}${registrations.join('')}{{end -}}\n`
    }

    const hasInteractivity = hasClientInteractivity(ir)

    if (!hasInteractivity) {
      return ''
    }

    const registrations: string[] = []

    // Runtime first, then this component's script. `scriptBaseName` is set for
    // non-default exports that share the parent's `.client.js`.
    registrations.push(`{{.Scripts.Register "${this.options.barefootJsPath}"}}`)
    const scriptName = scriptBaseName || ir.metadata.componentName
    registrations.push(`{{.Scripts.Register "${this.options.clientJsBasePath}${scriptName}.client.js"}}`)

    // `{{end -}}` trims the trailing `\n` (see the sibling branch above).
    return `{{if .Scripts}}${registrations.join('')}{{end -}}\n`
  }

  /**
   * Register a child component's shape (see `childComponentShapes`). Call once
   * per known child IR before the parent's `generateTypes`. Idempotent. Takes
   * only the IR's `metadata` so orchestrators that never build the full IR
   * (the CLI's cross-file shape pre-pass, #2131) can register from a bare
   * analyzer pass — a full `ComponentIR` still satisfies it structurally.
   */
  /**
   * #2448: component name -> (memo field -> the INPUT prop Go field names its
   * initializer reads). Deliberately SEPARATE from `childComponentShapes`,
   * which only the CLI's cross-file pre-pass
   * (`registerChildComponentShape`) populates — `compileJSX` never calls that
   * hook, so a SAME-FILE child (the only kind a loop row may contain: a
   * sibling-module child is BF103-refused there) would never have an entry
   * and the #2448 refusal would never fire. That is exactly how the first cut
   * of this fix shipped a conformance pin for a diagnostic that was never
   * emitted.
   *
   * Populated from BOTH doors: `registerChildComponentShape` for the
   * cross-file pre-pass, and `generate()` for every component compiled in
   * this run — a same-file child is generated before its parent, so its entry
   * is present by the time `loopRowChildPropOverrides` looks. Kept out of
   * `ChildComponentShape` on purpose: that struct's presence/absence already
   * drives rest-bag routing and map-typed-param baking, and widening WHEN it
   * exists would change emission for every same-file child in the corpus.
   * This map has exactly one reader.
   */
  private childDerivedFieldDeps: Map<string, Map<string, ReadonlySet<string>>> = new Map()

  /**
   * component name -> (JSX-attribute name -> that component's own Props
   * field, LOCAL binding). `bf.WithProps` treats an unknown field as a
   * silent passthrough, so `bf_with_props`/`bf_reprops` call sites cannot
   * just capitalize the JSX attribute: for `{ n: count }` that names a
   * field (`N`) the Props struct doesn't have, dropping the override with
   * no diagnostic. Input composite literals need no such lookup — Input
   * fields are caller-facing, so `capitalizeFieldName(jsxName)` already
   * names them (see `emitChildField`).
   *
   * Populated inside `recordDerivedFieldDeps` BEFORE its `deps.size > 0`
   * gate: an aliased child with no derived field at all is exactly the
   * #2457 shape, so this map must not inherit `recordRepropsSpec`'s gates.
   */
  private childPropFieldNames: Map<string, Map<string, string>> = new Map()

  /**
   * Components a `bf.RegisterReprops` rebuilder CAN be emitted for
   * (`recordRepropsSpec`, #2448), with everything needed to emit it. A parent
   * overriding a prop that feeds one of the child's derived fields emits
   * `bf_reprops` when the child is in here, and falls back to the BF101
   * refusal when it is not — the rebuilder is declined for shapes whose Input
   * can't be reconstructed from Props, and emitting the call anyway would fail
   * at template execute time with "no props rebuilder registered".
   *
   * Populated from `generateTypes`, so a same-file child (the only kind a loop
   * row may contain) is recorded before its parent renders.
   */
  private childRepropsReady: Map<string, RepropsSpec> = new Map()

  /**
   * child component name -> the component whose type block carries its
   * rebuilder registration. First parent to need the child wins, so two
   * parents overriding the same child don't both emit an `init()` for it.
   *
   * An assignment, not a queue: `generateTypes` is called more than once for
   * the same component (the conformance harness re-generates the entry's types
   * after `compileJSX` already did), and a queue drained by the first call
   * would leave the second call's output — the one that actually gets used —
   * missing the registration.
   */
  private repropsOwner: Map<string, string> = new Map()

  /**
   * Record which of `ir`'s constructor-computed fields derive from one of its
   * own input props (#2448). See `childDerivedFieldDeps`.
   *
   * BOTH constructor-evaluated declaration forms count, because
   * `generateNewPropsFunction` bakes both into the struct once:
   * a `createMemo` BODY (`createMemo(() => props.n * 2)` → `Dbl: in.N * 2`)
   * and a `createSignal` INITIAL VALUE (`createSignal(props.n)` → `Dbl: in.N`).
   * `bf_with_props` re-runs neither, so a per-row override of `n` leaves
   * either one holding the shared instance's one-shot value.
   *
   * A declaration whose Go field name collides with a prop's own field name is
   * a same-named "shadow" (`size = createMemo(() => props.size ?? 'icon')`) —
   * `generateNewPropsFunction` folds it into the PROP's passthrough field
   * rather than emitting a separate derived one, so a per-row override of
   * that prop lands on the same field and nothing goes stale. A declaration
   * with no structurally-resolvable `parsed` initializer is skipped too: this
   * map is best-effort, and its absence costs a missed refusal (today's
   * behaviour), never a wrong one.
   *
   * Dependencies are keyed by the prop's CANONICAL source name
   * (`ParamInfo.sourceName ?? name`), not the child's local binding. An
   * ALIASED destructure (`function Badge({ n: count }: { n: number })`) reads
   * `count` in the memo body, but the only name the parent knows is the JSX
   * attribute `n` — `loopRowChildPropOverrides` looks THAT up in
   * `childPropFieldNames` before checking this map. Keying on the local name
   * would file the dependency under `Count`, the lookup would miss, and the
   * refusal would silently not fire on exactly the shape it exists for.
   *
   * This canonicalization used to cover the DERIVED case only — an aliased
   * prop with no derived field still had the parent emitting `"N" .N`
   * against a child whose field is `Count`, silently passed over by
   * `bf.WithProps` (#2457). `childPropFieldNames`, populated a few lines
   * below in this same method, closes that residual gap by resolving every
   * prop's field name at the parent's emission site, not just the ones a
   * derived field depends on.
   */
  private recordDerivedFieldDeps(
    ir: Pick<ComponentIR, 'metadata'>,
    paramNames: ReadonlySet<string>,
  ): void {
    const name = ir.metadata.componentName
    if (!name) return
    // Local binding → the prop name the PARENT writes at the call site.
    // Identity for every un-aliased param (`sourceName` is set only on a
    // renaming destructure).
    const sourceOf = new Map(
      (ir.metadata.propsParams ?? []).map(p => [p.name, p.sourceName ?? p.name]),
    )
    const canonical = (local: string): string => capitalizeFieldName(sourceOf.get(local) ?? local)
    const propFieldNames = new Set([...paramNames].map(canonical))
    // Recorded for EVERY component — this must not share `recordRepropsSpec`'s
    // gates (see `childPropFieldNames`).
    const fieldNames = new Map<string, string>()
    for (const p of ir.metadata.propsParams ?? []) {
      fieldNames.set(p.sourceName ?? p.name, propsFieldName(p, ir.metadata))
    }
    this.childPropFieldNames.set(name, fieldNames)
    const deps = new Map<string, ReadonlySet<string>>()
    const ctorInits: { field: string; init: ParsedExpr | undefined }[] = [
      ...(ir.metadata.memos ?? []).map(m => ({ field: m.name, init: m.parsed })),
      ...(ir.metadata.signals ?? []).map(s => ({ field: s.getter, init: s.parsed })),
    ]
    for (const { field, init } of ctorInits) {
      if (propFieldNames.has(capitalizeFieldName(field))) continue
      if (!init) continue
      const read = collectPropsReadByCtorInit(
        init,
        ir.metadata.propsObjectName ?? null,
        paramNames,
      )
      if (read.size === 0) continue
      deps.set(field, new Set([...read].map(canonical)))
    }
    if (deps.size > 0) this.childDerivedFieldDeps.set(name, deps)
  }

  registerChildComponentShape(ir: Pick<ComponentIR, 'metadata' | 'root'>): void {
    const name = ir.metadata.componentName
    if (!name) return
    for (const key of collectNullableSeedStructFields(ir.metadata, ir.root)) this.fileNullableSeedStructFields.add(key)
    // Both sets on `ChildComponentShape` are looked up by a PARENT against the
    // name it wrote at the JSX call site, so they are keyed by
    // `sourceName ?? name` — identity for an un-aliased param, the original
    // property name for an aliased destructure (`{ n: count }` → `n`). Keying
    // them by the local binding meant an aliased prop looked undeclared to
    // `emitChildField` (misrouted into the rest bag) and to
    // `loopRowChildPropOverrides` (skipped as rest-bag-only) — the same
    // wrong-name-at-a-parent-side-lookup bug as #2457, one function over.
    const paramNames = new Set((ir.metadata.propsParams ?? []).map(p => p.sourceName ?? p.name))
    const restPropsName = ir.metadata.restPropsName ?? null
    const restBagField = restPropsName ? capitalizeFieldName(restPropsName) : null
    // #3062: which `Spread_N` field(s), if any, an element spread of THIS
    // rest binding (`{...rest}` somewhere in the child's own tree) renders
    // from — computed structurally off `ir.root` since no `GoEmitContext`
    // for this child exists yet at registration time (see
    // `collectRestBagSpreadFields`'s docstring). Empty for the #2805 shape
    // (`rest.header`, a member read with no element spread at all).
    const restBagSpreadFields = restPropsName ? collectRestBagSpreadFields(ir.root, restPropsName) : []
    // Optional object/named-interface params lower to `map[string]interface{}`
    // (see `resolvePropGoType`); track them so a parent baking an inline object
    // literal targets a Go map literal.
    const mapTypedParamNames = new Set(
      (ir.metadata.propsParams ?? [])
        .filter(
          p =>
            p.optional &&
            (p.type.kind === 'object' ||
              (p.type.kind === 'interface' && !!p.type.raw)),
        )
        .map(p => p.sourceName ?? p.name),
    )
    // A REQUIRED anonymous-object param (`value: { v: () => number }`) is NOT
    // in the `optional` set above — `resolvePropGoType` only flips an
    // OPTIONAL object-typed param to a map, so a required one lowers through
    // `typeInfoToGo`'s `'object'` case to whatever `emitSynthPropStructs`
    // (run at THIS child's own `generateTypes` time — after shape
    // registration, per this file's docstring above) synthesizes for it: a
    // named struct, or the `map[string]interface{}` fallback on a name
    // collision. `planSynthPropStructs` is the SAME naming decision
    // `emitSynthPropStructs` makes, run here so a parent registering this
    // child's shape (before either side has compiled) can bake an inline
    // object literal against the right Go shape instead of silently
    // omitting the field (#2925).
    const synthPlan = planSynthPropStructs(
      { typeDefinitions: ir.metadata.typeDefinitions ?? [], propsParams: ir.metadata.propsParams ?? [] },
      name,
    )
    const synthByType = new Map(synthPlan.map(e => [e.typeInfo, e]))
    const structTypedObjectParams = new Map<string, { goType: string; fields: ReadonlyMap<string, string> }>()
    for (const p of ir.metadata.propsParams ?? []) {
      if (p.optional || p.type.kind !== 'object') continue
      const key = p.sourceName ?? p.name
      const entry = synthByType.get(p.type)
      if (entry) {
        const fields = new Map(structFieldNamePairs(entry.properties).map(f => [f.tsName, f.goName]))
        structTypedObjectParams.set(key, { goType: entry.name, fields })
      } else {
        // Synthesis declined this exact type (name collision) — `typeInfoToGo`
        // falls back to the map convention, so the child's field IS a map.
        mapTypedParamNames.add(key)
      }
    }
    // Params whose declared type can't hold a function — what lets the
    // loop-row refusal tell an imported binding passed to it is data
    // (`isUndeliveredSsrData`).
    const dataTypedParamNames = new Set(
      (ir.metadata.propsParams ?? [])
        .filter(p => !p.isRest && isCertainlyDataType(p.type))
        .map(p => p.sourceName ?? p.name),
    )
    const propTypeOverrides = buildPropTypeOverrides(this.emitCtx, ir as ComponentIR)
    const paramGoTypes = new Map(
      (ir.metadata.propsParams ?? [])
        .filter(p => !p.isRest)
        .map(p => [
          p.sourceName ?? p.name,
          propTypeOverrides.get(p.name) ?? typeInfoToGo(this.emitCtx, p.type, p.defaultValue, p.parsed),
        ]),
    )
    // The child's own nillable decision, primed on a separate instance so
    // this compile's state is untouched (#3323).
    const probe = new GoTemplateAdapter(this.options)
    probe.primeCompileState(ir as ComponentIR)
    const nillableParamNames = new Set(
      (ir.metadata.propsParams ?? [])
        .filter(p => probe.state.nillablePropNames.has(p.name))
        .map(p => p.sourceName ?? p.name),
    )
    this.childComponentShapes.set(name, {
      paramNames,
      restBagField,
      restBagSpreadFields,
      mapTypedParamNames,
      structTypedObjectParams,
      dataTypedParamNames,
      paramGoTypes,
      nillableParamNames,
    })
    // NOT `paramNames`: `recordDerivedFieldDeps` forwards this set to
    // `collectPropsReadByCtorInit`, which in destructured mode matches BARE
    // IDENTIFIERS in the memo/signal body — those are the LOCAL bindings
    // (`count`), not the call-site names. Handing it the canonical set would
    // make an aliased child's derived field look dependency-free and silently
    // un-refuse / un-rebuild it.
    this.recordDerivedFieldDeps(ir, new Set((ir.metadata.propsParams ?? []).map(p => p.name)))
    // Contexts this child consumes, so a parent `<Ctx.Provider value>` wrapping
    // it can set the matching field on the child's slot input.
    this.childContextConsumers.set(name, collectContextConsumers(ir.metadata))
  }

  /** Go field name for a `useContext` consumer (the capitalized local binding). */
  private contextFieldName(c: ContextConsumer): string {
    return capitalizeFieldName(c.localName)
  }

  /**
   * True when `node` is (or is a member access rooted in) a `useContext`
   * local with an object-shaped `createContext` default — see `member()`'s
   * `bf_get` branch. Recurses through non-computed member chains: once a
   * chain is rooted in a map, every further `.property` down the chain reads
   * off an `interface{}` value with no static struct to fall back to, so it
   * stays map-rooted for `bf_get` too.
   */
  private isMapRootedContextChain(node: ParsedExpr): boolean {
    if (node.kind === 'identifier') {
      return this.state.contextConsumers.some(
        c => c.localName === node.name && c.defaultKind === 'object',
      )
    }
    if (node.kind === 'member' && !node.computed) {
      return this.isMapRootedContextChain(node.object)
    }
    return false
  }

  /**
   * True when `node` is a non-computed member chain rooted in an
   * inline-object-typed prop (`props.cfg` where `cfg: { id: number }`, an
   * `objectTypedPropNames` entry — #2299). Such a prop is a
   * `map[string]interface{}` Input field, so a nested `.id` must go through
   * the case-tolerant `bf_get` (like `isMapRootedContextChain`), not an
   * exact-case dot path that would `MapIndex("ID")` a JS-cased-`"id"` map and
   * render empty. Recurses: once map-rooted, every further hop reads off an
   * `interface{}` value with no static struct, so it stays map-rooted.
   */
  /**
   * True when `node` is a non-computed member chain rooted in a call of a
   * `mapSeededSignalGetters` getter (`data().meta`, #3353). The getter's
   * field holds a map keyed by the source property names, so each hop reads
   * through `bf_get` like `isMapRootedPropChain`. A bracket hop
   * (`data()['meta']`, `data()[k]`) also reads through `bf_get` and yields a
   * value of the same map, so the chain continues through it.
   */
  private isMapSeededSignalChain(node: ParsedExpr): boolean {
    if (node.kind === 'call') {
      return node.callee.kind === 'identifier' && node.args.length === 0 &&
        this.state.mapSeededSignalGetters.has(node.callee.name)
    }
    if (node.kind === 'member' || node.kind === 'index-access') return this.isMapSeededSignalChain(node.object)
    return false
  }

  private isMapRootedPropChain(node: ParsedExpr): boolean {
    if (node.kind !== 'member' || node.computed) return false
    const obj = node.object
    if (obj.kind === 'identifier' && obj.name === this.state.propsObjectName) {
      return this.state.objectTypedPropNames.has(node.property)
    }
    return this.isMapRootedPropChain(obj)
  }

  /** Go type for a context-consumer field, from its `createContext` default's type. */
  private contextConsumerGoType(c: ContextConsumer): string {
    if (typeof c.defaultValue === 'number') return 'float64'
    if (typeof c.defaultValue === 'boolean') return 'bool'
    // An OBJECT-shaped default (`createContext<{ config: X }>({ config: {} })`,
    // #2087) needs a real map type, not the scalar `string` fallback below: a
    // descendant's `ctx.config.label` read lowers through `bf_get` (see
    // `member()`), which needs an actual `map[string]interface{}` receiver to
    // walk — a `string` field crashes real `go run` execution with `can't
    // evaluate field Config in type string`.
    if (c.defaultKind === 'object') return 'map[string]interface{}'
    return 'string'
  }

  /** Go literal for a context-consumer's default value (the `createContext` arg). */
  private contextConsumerGoDefault(c: ContextConsumer): string {
    if (typeof c.defaultValue === 'number') return String(c.defaultValue)
    if (typeof c.defaultValue === 'boolean') return String(c.defaultValue)
    if (typeof c.defaultValue === 'string') return `"${escapeGoString(c.defaultValue)}"`
    // Object-shaped default: a real (nil-safe) empty map — see
    // `contextConsumerGoType`. The `createContext` argument's actual nested
    // shape (`{ config: {} }`) is never baked key-for-key here: a consumer
    // only ever reads this DEFAULT when no enclosing Provider ran, and
    // `bf_get` (getFieldValue) already returns nil safely for any missing/
    // absent key off an empty map, so `ctx.config.label ?? 'none'` resolves
    // to `'none'` regardless of how deep the default's own nesting goes.
    if (c.defaultKind === 'object') return 'map[string]interface{}{}'
    return '""'
  }

  /** Context-consumer fields not colliding with an already-emitted prop/signal/memo field (the struct must carry them; template reads `{{.Field}}`). */
  private nonCollidingContextConsumers(taken: ReadonlySet<string>): ContextConsumer[] {
    return this.state.contextConsumers.filter(c => !taken.has(this.contextFieldName(c)))
  }

  /**
   * True when `nested` is a `/* @client *\/` child-component loop (#2627)
   * whose array is neither a real signal/memo (`isDynamic`) nor a direct
   * prop reference (`isPropDerived`) — e.g. `Object.entries(props.tags)
   * .filter(...)` feeding a `<Tag>` loop. `renderLoop`'s clientOnly branch
   * (its very first check) renders such a loop as bare start/end comment
   * markers on every backend — the SSR template NEVER references this
   * nested component's Go field — and for a non-clientOnly loop with this
   * same array shape, `renderLoop`'s own later BF101 gate (`arrayName` /
   * `isBound` check) refuses to bind a function-scope computed local as a
   * template variable at all. So there is no Go value anywhere to seed an
   * Input field from or range over in `NewXxxProps` — treating `nested` as
   * a normal static/prop-derived child loop emits a field/range/wrapper var
   * for data nothing ever populates.
   *
   * `nested.isDynamic` is excluded from this check on purpose: a genuinely
   * signal-backed clientOnly loop keeps its existing (tested, harmless)
   * `json:"-"` Props field — only the "looks static but is actually an
   * unbindable local" shape needs full exclusion.
   */
  private isOrphanedClientOnlyNested(nested: NestedComponentInfo): boolean {
    return !!nested.clientOnly && !nested.isDynamic && !nested.isPropDerived
  }

  /** The Input/Props field holding a child-component loop site's rows (`allocateRowsFields`). */
  private nestedRowsField(site: RowsFieldSite): string {
    return (
      this.state.rowsFields.get(rowsFieldSiteKey(site))?.field ??
      nestedRowsFieldName(site.name, this.state.currentPropsParams)
    )
  }

  /** The constructor local that builds a loop site's rows (`allocateRowsFields`). */
  private nestedRowsVar(site: RowsFieldSite): string {
    return this.state.rowsFields.get(rowsFieldSiteKey(site))?.varName ?? `${site.name.charAt(0).toLowerCase()}${site.name.slice(1)}s`
  }

  /**
   * Every Go field name these props params could claim — LOCAL and
   * caller-facing. A context-consumer field must exist in ALL of
   * Input/Props/NewProps or none, and the three key prop fields under
   * different namings, so their shared collision gate cannot check just one
   * (`{ n: searchParams }` collides in Props but not Input).
   */
  private propParamFieldNamesUnion(params: ReadonlyArray<{ name: string; sourceName?: string }>): string[] {
    return params.flatMap(p => [capitalizeFieldName(p.name), capitalizeFieldName(p.sourceName ?? p.name)])
  }

  /**
   * Claim `desired` in the struct-wide set of emitted json tags, or fall
   * back to `json:"-"` on collision. The identifier de-dup sets cannot cover
   * this: an aliased prop's tag is caller-facing while other fields' tags
   * stay local, so two DIFFERENT Go identifiers can want the same tag — and
   * `encoding/json` silently drops every field sharing an ambiguous tag,
   * losing the key from the bf-p payload entirely. Callers thread one set
   * through the field-emitting loops in declaration order, so props win;
   * that matches hono, whose hydration blob is built only from props params
   * (a signal seeds by reading the prop's key, never a key of its own, so
   * the dropped tag was never a client read path).
   */
  private claimJsonTag(desired: string, taken: Set<string>): string {
    if (taken.has(desired)) return '-'
    taken.add(desired)
    return desired
  }

  /**
   * `preserveTemplateReadRootFields` is set ONLY by `generate()`'s own
   * internal call below — `templateReadRootFields` is an observation log
   * `renderNode` populated moments ago while rendering THIS SAME
   * component's template body, and this call needs to read that log back,
   * not a freshly emptied one. Every other caller (the standalone public
   * entry point `test-render.ts` calls directly on an already-`generate()`d
   * adapter for a sibling/child IR, and this file's own unit tests) omits
   * it and gets the set reset fresh — otherwise a stale log left over from
   * whichever OTHER component `generate()` rendered last would silently
   * narrow #2700's BF101 refusal to a false negative (pullfrog review, PR
   * #2818).
   */
  generateTypes(ir: ComponentIR, preserveTemplateReadRootFields = false): string | null {
    this.state.usesHtmlTemplate = false
    this.state.usesFmt = false
    if (!preserveTemplateReadRootFields) {
      this.state.templateReadRootFields = new Set()
      this.state.refusedLoopArrayConsts = new Set()
    }
    // Prime identically to `generate()` so the standalone `generateTypes` entry
    // can't drift the structs (e.g. a `{...props}` bag field in one entry only).
    ir = this.primeCompileState(ir)
    const lines: string[] = []

    const componentName = ir.metadata.componentName

    buildLocalTypeTables(this.typeSynthesisHost, ir, componentName)

    // #2674 Plan A: synthesize named structs for anonymous object types
    // BEFORE emitting named-type structs — a nested anonymous property
    // inside a named type (`Row.user`) needs its synthesized name registered
    // before `emitLocalTypeStructs` computes `Row`'s own struct fields.
    this.emitSynthPropStructs(lines, ir, componentName)

    this.emitLocalTypeStructs(lines, ir, componentName)

    this.emitSynthStructs(lines, ir, componentName)

    const nestedComponents = findNestedComponents(ir.root)

    resolveNestedLoopItemTypes(this.typeSynthesisHost, lines, ir, componentName, nestedComponents)

    for (const nested of nestedComponents) {
      if (!nested.bodyChildren || nested.bodyChildren.length === 0) continue
      this.generateLoopBodyWrapperStruct(lines, ir, componentName, nested)
    }

    const propTypeOverrides = buildPropTypeOverrides(this.emitCtx, ir)
    this.state.propTypeOverrides = propTypeOverrides

    // Computed once (the walk is shared by all three generators).
    const spreadSlots = collectSpreadSlots(this.emitCtx, ir.root)

    this.generateInputStruct(lines, ir, componentName, nestedComponents, propTypeOverrides)

    this.state.needsStringsImport = false
    this.generatePropsStruct(lines, ir, componentName, nestedComponents, propTypeOverrides, spreadSlots)

    this.generateNewPropsFunction(lines, ir, componentName, nestedComponents, spreadSlots, propTypeOverrides)

    this.recordRepropsSpec(ir, componentName, nestedComponents, spreadSlots)
    this.emitOwnedReprops(lines, componentName)

    return this.composeFileHeader(lines)
  }

  /**
   * #2448: emit a props REBUILDER for a component whose constructor derives a
   * field from one of its own input props, and register it from `init()`.
   *
   * `bf_with_props` patches fields on the child's already-constructed shared
   * instance; it cannot re-run `New<Child>Props`, where a `createMemo` body and
   * a `createSignal` initial value are both baked. This closure reconstructs
   * the Input from the base Props, folds the row's overrides in, and re-runs
   * the real constructor — so every derived field recomputes per row. The
   * parent's call site then emits `bf_reprops` instead of `bf_with_props`
   * (`loopRowChildPropOverrides`).
   *
   * Two invariants the emitted code depends on:
   *
   * - **Input is recoverable from Props.** `emitPropsDataFields` and
   *   `generateInputStruct` emit each props param with the SAME
   *   `resolvePropGoType`, and the same field name EXCEPT for an aliased
   *   destructured prop, where Props keeps the LOCAL field and Input keys by
   *   the CALLER-facing name (a caller-side `BadgeInput{N: 5}` literal must
   *   type-check). `in.<inputField> = b.<propsField>` bridges the pair
   *   (identity when un-aliased). A prop read
   *   only by a memo still gets its passthrough field, so nothing is lost.
   *   Shapes that add Input fields with no Props counterpart (a rest bag, a
   *   spread slot, context consumers, nested child Inputs) are declined —
   *   `eligible` below — and the parent falls back to today's BF101.
   * - **Identity is carried, never re-derived.** `New<Child>Props` mints a
   *   random ScopeID when handed an empty one, so re-running it naively would
   *   give every row its own scope and break hydration. ScopeID/BfParent/
   *   BfMount come from the base, and the Props-only fields (Scripts,
   *   BfIsRoot/BfIsChild/BfDataKey) are reapplied after the constructor.
   *
   * The override switch built from `params` is emitted by
   * `emitRepropsRegistration`.
   */
  private recordRepropsSpec(
    ir: ComponentIR,
    componentName: string,
    nestedComponents: NestedComponentInfo[],
    spreadSlots: SpreadSlotInfo[],
  ): void {
    if (!this.childDerivedFieldDeps.has(componentName)) return

    const params = ir.metadata.propsParams ?? []
    const takenInput = new Set(this.propParamFieldNamesUnion(ir.metadata.propsParams ?? []))
    const eligible =
      nestedComponents.every(n => n.isDynamic && !n.isPropDerived) &&
      spreadSlots.length === 0 &&
      !ir.metadata.restPropsName &&
      this.nonCollidingContextConsumers(takenInput).length === 0
    if (!eligible) return

    this.childRepropsReady.set(componentName, {
      params: params.map(p => ({
        propsField: propsFieldName(p, ir.metadata),
        inputField: capitalizeFieldName(p.sourceName ?? p.name),
      })),
      usesSearchParams: this.usesSearchParams(ir),
    })
  }

  /**
   * Emit the rebuilders assigned to `owner` — the children its own render
   * asked for (`loopRowChildPropOverrides` → `repropsOwner`).
   *
   * Emitted from the PARENT rather than the child on purpose. The prop-seeded
   * signal (`createSignal(props.initial)`) is one of the most common shapes in
   * the corpus, so emitting a rebuilder for every component that merely HAS a
   * derived field added ~250 lines of never-called Go to each integration's
   * generated file. Only a parent knows whether a child is actually overridden
   * per row inside a composite loop row, and it knows before its own type block
   * is built — `generate()` renders the template first. Every component's type
   * block lands in the same package (`combineGoTypes`, `build.ts`), so the
   * child's Input/Props types are in scope from here.
   *
   * Idempotent: driven by the recorded assignment, so re-generating the same
   * component's types produces the same block.
   */
  private emitOwnedReprops(lines: string[], owner: string): void {
    for (const [childName, ownerName] of this.repropsOwner) {
      if (ownerName !== owner) continue
      const spec = this.childRepropsReady.get(childName)
      if (!spec) continue
      this.emitRepropsRegistration(lines, childName, spec)
    }
  }

  private emitRepropsRegistration(
    lines: string[],
    componentName: string,
    spec: RepropsSpec,
  ): void {
    const { params, usesSearchParams } = spec
    const inputTypeName = `${componentName}Input`
    const q = JSON.stringify(componentName)

    lines.push(`// ${componentName} computes at least one field from an input prop when its`)
    lines.push('// props are constructed, so a per-row override inside a composite loop row')
    lines.push('// cannot be applied by patching fields — the derived field would keep the')
    lines.push('// shared instance\'s one-shot value on every row (#2448). This rebuilder')
    lines.push(`// re-runs New${componentName}Props with the row's overrides folded into the`)
    lines.push('// Input; the parent calls it through bf_reprops.')
    lines.push('func init() {')
    lines.push(`\tbf.RegisterReprops(${q}, func(base interface{}, kv ...interface{}) (interface{}, error) {`)
    lines.push(`\t\tb, ok := base.(${componentName}Props)`)
    lines.push('\t\tif !ok {')
    lines.push(`\t\t\treturn nil, bf.RepropsTypeError(${q}, base)`)
    lines.push('\t\t}')
    lines.push(`\t\tin := ${inputTypeName}{`)
    // Identity comes from the base instance — re-deriving it would re-mint the
    // ScopeID and break hydration.
    lines.push('\t\t\tScopeID: b.ScopeID,')
    lines.push('\t\t\tBfParent: b.BfParent,')
    lines.push('\t\t\tBfMount: b.BfMount,')
    if (usesSearchParams) lines.push('\t\t\tSearchParams: b.SearchParams,')
    for (const { propsField, inputField } of params) {
      lines.push(`\t\t\t${inputField}: b.${propsField},`)
    }
    lines.push('\t\t}')
    lines.push('\t\tfor i := 0; i < len(kv); i += 2 {')
    lines.push('\t\t\tname, _ := kv[i].(string)')
    lines.push('\t\t\tvar err error')
    lines.push('\t\t\tswitch name {')
    for (const { propsField, inputField } of params) {
      // Case label = the child's own PROPS field (what the parent's
      // `bf_with_props`/`bf_reprops` call is keyed by); target = the Input
      // field. One name is not enough: an aliased destructure gives
      // `{ n: count }` → Props `Count`, Input `N` (437f822 had unified the
      // pair while the two could never diverge).
      lines.push(`\t\t\tcase ${JSON.stringify(propsField)}:`)
      lines.push(`\t\t\t\terr = bf.RepropsAssign(${q}, ${JSON.stringify(propsField)}, &in.${inputField}, kv[i+1])`)
    }
    // No silent drop. `bf_with_props` passes an unknown field through because
    // a rest-bag prop legitimately has no named field — but a rebuilder is
    // only emitted for components with no rest bag, and there is a case for
    // every prop the parent can override, so an unknown name here means the
    // override would go unapplied.
    lines.push('\t\t\tdefault:')
    lines.push(`\t\t\t\terr = bf.RepropsUnknownFieldError(${q}, name)`)
    lines.push('\t\t\t}')
    lines.push('\t\t\tif err != nil {')
    lines.push('\t\t\t\treturn nil, err')
    lines.push('\t\t\t}')
    lines.push('\t\t}')
    lines.push(`\t\tp := New${componentName}Props(in)`)
    lines.push('\t\t// Props-only state, absent from Input and therefore not rebuilt.')
    lines.push('\t\tp.Scripts = b.Scripts')
    lines.push('\t\tp.BfIsRoot = b.BfIsRoot')
    lines.push('\t\tp.BfIsChild = b.BfIsChild')
    lines.push('\t\tp.BfDataKey = b.BfDataKey')
    lines.push('\t\treturn p, nil')
    lines.push('\t})')
    lines.push('}')
    lines.push('')
  }

  /** Convert a TS type definition to Go: object types → structs, string-literal unions → a `string` alias. */
  private typeDefinitionToGo(td: TypeDefinition): string | null {
    // A string-literal union (`type Filter = 'all' | 'active'`) carries no
    // `properties`; Phase 1 records its members instead.
    if (td.stringLiteralUnion) {
      return `// ${td.name} is a string type.\ntype ${td.name} = string`
    }

    const fields = this.structFieldsFor(td.name, td)
    if (fields.length === 0) return null

    const goFields = fields.map(f => this.structFieldDeclaration(f))
    return `// ${td.name} represents a ${td.name.toLowerCase()}.\ntype ${td.name} struct {\n${goFields.join('\n')}\n}`
  }

  /**
   * Single source of truth for a generated struct's Go fields, derived from the
   * analyzer's structured properties (no definition-string parsing). Both the
   * struct emitter and the object-literal baker consume it, so a baked literal
   * can't name a field the struct lacks. A non-Go-identifier source key
   * (`"data-priority"`, a numeric key) still gets a field via
   * `goFieldNameForKey`'s segment-splitting PascalCase (#2087 Phase B —
   * `rest-destructure-object-spread-in-map`'s `'data-priority'` residual key
   * needs a real field to bake into, or the whole literal defers to nil); a
   * dedup guard drops a later key that sanitizes to a Go name already taken
   * (rare, but two fields can't share one Go identifier).
   *
   * Accepts anything carrying a `PropertyInfo[]` — a `TypeDefinition` (a
   * user-named type) OR a bare `TypeInfo` of `kind: 'object'` (an anonymous
   * type `emitSynthPropStructs` is synthesizing a struct for, #2674) — so
   * both the named-type struct emitter and the anonymous-type synthesis
   * pre-pass share one field-derivation path.
   */
  private structFieldsFor(owner: string, td: { properties?: PropertyInfo[] }): Array<{ tsName: string; goName: string; goType: string; nullableSeed: boolean }> {
    const propertyByName = new Map((td.properties ?? []).map(p => [p.name, p]))
    return structFieldNamePairs(td.properties ?? []).map(({ tsName, goName }) => ({
      tsName,
      goName,
      goType: propertyInfoToGo(this.emitCtx, propertyByName.get(tsName)!, owner),
      nullableSeed: this.state.nullableSeedStructFields.has(`${owner}.${tsName}`),
    }))
  }

  private structFieldDeclaration(field: { tsName: string; goName: string; goType: string; nullableSeed?: boolean }): string {
    // Pointer fields represent optional nested objects. Keep a nil field
    // absent from the hydration payload rather than serializing it as null.
    // A field flipped to `interface{}` for a nullable signal seed (#3323)
    // likewise leaves a missing member out of the payload, as JS does.
    const omit = field.goType.startsWith('*') || field.nullableSeed ? ',omitempty' : ''
    return `\t${field.goName} ${field.goType} \`json:"${this.toJsonTag(field.tsName)}${omit}"\``
  }

  /**
   * Synthesise a Go struct (plus, per #2800, one nested struct for each
   * array-of-objects field, recursively) from an untyped object-array
   * signal's inline initial value, or `null` (caller keeps
   * `[]interface{}`/`nil`). Requires: untyped array type; a non-empty array
   * literal of object literals; every element sharing the same
   * Go-identifier key set; every value EITHER a scalar literal with a
   * per-key-consistent Go type (mixed int/float64 widens to float64) OR an
   * array of object literals (recursed the same way). Any deviation, or a
   * name collision with an existing type, returns `null` for the WHOLE
   * signal — `parsedLiteralToGo` (`value-lowering.ts`) already defers the
   * whole array the moment one element fails to bake, so a partial struct
   * (e.g. only the scalar fields) would synthesize a type nothing could
   * ever fully populate; not worth a second, more permissive code path.
   *
   * Returns the synthesized structs in DEPENDENCY ORDER — nested structs
   * before the struct(s) that reference them by name — so a caller
   * registering them in list order never references an undeclared Go type.
   * The signal's own top-level struct is always the LAST entry.
   */
  private synthesizeStructFromSignal(
    signal: { getter: string; type: TypeInfo; initialValue: JsSourceText; parsed?: ParsedExpr },
    componentName: string,
  ): Array<{ name: string; fields: Array<{ tsName: string; goName: string; goType: string }>; properties: PropertyInfo[] }> | null {
    // Only untyped arrays: typed (`Item[]`) / scalar (`string[]`) elements bake
    // through the normal path.
    if (signal.type.kind !== 'array') return null
    const elem = signal.type.elementType
    if (elem && elem.kind !== 'unknown') return null

    const node = signal.parsed
    if (!node || node.kind !== 'array-literal' || node.elements.length === 0) return null

    const name = `${componentName}${capitalizeFieldName(signal.getter)}Item`
    return synthesizeStructsFromElements(this.emitCtx, node.elements, name)
  }

  /**
   * Register a synthesized struct (fields as Go source lines, `properties`
   * for `structPropertyType`'s nested-type lookups) and emit its
   * declaration — the one register+emit sequence shared by
   * `emitSynthPropStructs.visitObject` (anonymous TS object types, #2674)
   * and `emitSynthStructs` (untyped object-array signals, #2800), so
   * localTypeNames/localStructFields/currentTypeDefinitions registration
   * can't drift between the two synthesis call sites.
   */
  private registerSynthStruct(
    lines: string[],
    name: string,
    fields: Array<{ tsName: string; goName: string; goType: string }>,
    properties: PropertyInfo[],
    comment: string,
  ): void {
    this.state.localTypeNames.add(name)
    this.state.localStructFields.set(name, new Map(fields.map(f => [f.tsName, f.goName])))
    this.state.currentTypeDefinitions.push({
      kind: 'type',
      name,
      definition: '',
      properties,
      loc: SYNTH_TYPE_LOC,
    })
    const goFields = fields.map(f => this.structFieldDeclaration(f))
    lines.push(comment)
    lines.push(`type ${name} struct {\n${goFields.join('\n')}\n}`)
    lines.push('')
  }

  /**
   * Whether the component reads the request-scoped `searchParams()` env signal
   * (from `searchParamsLocals`, covering any local incl. aliased imports). When
   * true the structs carry a `SearchParams bf.SearchParams` binding the handler
   * fills per request, read as `.SearchParams.Get "key"`. Returns false when a
   * user prop/signal/memo named `searchParams` already owns the field (the
   * binding would resolve to their value).
   */
  private usesSearchParams(ir: ComponentIR): boolean {
    if (this.state.searchParamsLocals.size === 0) return false
    // A `SearchParams` collision would redeclare the field and break the Go
    // compile. This ONE boolean gates the field in Input (caller-facing
    // names), Props (LOCAL names) and NewProps at once, so a prop cannot be
    // checked under just one naming: `{ x: searchParams }` collides only in
    // Props, `{ searchParams: x }` only in Input.
    const taken = new Set<string>([
      ...ir.metadata.propsParams.map(p => capitalizeFieldName(p.name)),
      ...ir.metadata.propsParams.map(p => capitalizeFieldName(p.sourceName ?? p.name)),
      // Env signals (`createSearchParams()`) don't produce a normal value field —
      // they ARE the `SearchParams` binding — so they must not poison this
      // collision set (a getter named `searchParams` would otherwise capitalise
      // to `SearchParams` and suppress the real reader field).
      ...ir.metadata.signals.filter(s => !s.envReader).map(s => capitalizeFieldName(s.getter)),
      ...ir.metadata.memos.map(m => capitalizeFieldName(m.name)),
      ...this.state.contextConsumers.map(c => this.contextFieldName(c)),
    ])
    if (ir.metadata.restPropsName) {
      taken.add(capitalizeFieldName(ir.metadata.restPropsName))
    }
    return !taken.has('SearchParams')
  }

  /** Generate the Input struct for a component. */
  private generateInputStruct(
    lines: string[],
    ir: ComponentIR,
    componentName: string,
    nestedComponents: NestedComponentInfo[],
    propTypeOverrides: Map<string, string>,
  ): void {
    const inputTypeName = `${componentName}Input`
    lines.push(`// ${inputTypeName} is the user-facing input type.`)
    lines.push(`type ${inputTypeName} struct {`)
    lines.push('\tScopeID string // Optional: if empty, random ID is generated')
    // Slot identity for child scopes mounted as a slot of an outer component.
    // Forwarded to Props's BfParent / BfMount.
    lines.push('\tBfParent string // Optional: parent scope id')
    lines.push('\tBfMount string // Optional: slot id in parent')

    // Request-scoped `searchParams()` binding. Zero value is an empty query, so
    // an omitted field resolves every `.Get` to "" and the author's `?? default`
    // renders.
    if (this.usesSearchParams(ir)) {
      lines.push('\tSearchParams bf.SearchParams // Optional: request query for searchParams()')
    }

    // Static + prop-derived nested components are in Input; signal-backed
    // dynamic ones are template-only. An orphaned clientOnly nested loop
    // (#2627 — see `isOrphanedClientOnlyNested`) has no Go value to seed an
    // Input field from at all, so it's excluded from both buckets.
    const inputNested = nestedComponents.filter(
      n => (!n.isDynamic || n.isPropDerived) && !this.isOrphanedClientOnlyNested(n),
    )

    // #2943: a body-destructure-with-default rename (`const { label: text =
    // 'none' } = props`) adds a SECOND `propsParams` entry (`text`,
    // `sourceName: 'label'`) alongside the original `label` entry — both
    // share ONE caller-facing field name here (`Label`), so the naive
    // per-entry loop below would emit it twice, a Go compile error
    // (`Label redeclared`). Track emitted field names and keep only the
    // first entry for a given name.
    const emittedInputFields = new Set<string>()
    for (const param of ir.metadata.propsParams) {
      // #2525: caller-facing name, not the local destructure binding — a
      // caller-side composite `BadgeInput{N: 5}` literal is written against
      // the name the callee's `{ n: count }` destructure was GIVEN, not the
      // name it renamed to internally. `generatePropsStruct`'s field (what
      // `{{.X}}` executes against) stays keyed by the local binding — see
      // `emitPropsDataFields`.
      const fieldName = capitalizeFieldName(param.sourceName ?? param.name)
      if (emittedInputFields.has(fieldName)) continue
      emittedInputFields.add(fieldName)
      const goType = resolvePropGoType(this.emitCtx, param, propTypeOverrides)
      lines.push(`\t${fieldName} ${goType}`)
    }

    for (const nested of inputNested) {
      // #2208: a static loop whose array source is itself fully-static
      // (baked directly in the constructor — see `generateNewPropsFunction`)
      // has no caller-supplied data to accept; the Input struct carries no
      // field for it at all (there was never a working `in.<Name>s` path
      // for this shape before this fix — it refused with BF101).
      if (nested.loopMarkerId && this.getBakedStaticChildLoop(
        nested.loopMarkerId,
        nested,
        nested.loopArrayParsed,
        nested.loopParam,
        nested.loopKey,
      )) continue
      // Rows built from the array prop itself (`propArrayLoopRowSource`):
      // nothing for the caller to supply here either.
      if (this.propArrayLoopRowSource(ir, nested)) continue
      // #2822 follow-up: field NAME stays alias-keyed (parent-private, this
      // Input struct's own field — `nestedRowsField`, read as `in.<field>`
      // throughout this file), but the element TYPE is the child's own cross-file
      // `<Name>Input` struct — see `importAliases`.
      lines.push(`\t${this.nestedRowsField(nested)} []${this.resolveChildName(nested.name)}Input`)
    }

    // `useContext` consumer fields — settable by an enclosing provider; default
    // applied in NewXxxProps. `taken` must union the local and caller-facing
    // prop names (`propParamFieldNamesUnion`) or Input disagrees with
    // Props/NewProps on whether the consumer field exists.
    const takenInput = new Set(this.propParamFieldNamesUnion(ir.metadata.propsParams))
    for (const c of this.nonCollidingContextConsumers(takenInput)) {
      lines.push(`\t${this.contextFieldName(c)} ${this.contextConsumerGoType(c)}`)
    }

    // Input-side bag for a destructured rest binding (`function({a, ...rest}:
    // P) { ... }`) — Go can't enumerate the open-ended key set, so the caller
    // passes a `map[string]any`. Field + JSON tag use the rest binding name
    // (`rest` → `Rest`) so call sites and JSON round-trips line up. Emitted
    // whenever the component destructures a rest binding at all (#2805) —
    // NOT only when it's also spread onto an element (`bagSource:
    // 'input-bag'`): a component that only READS `rest.header` needs the
    // same field to land a value in, even though it never spreads the bag.
    const restPropsName = ir.metadata.restPropsName
    if (restPropsName) {
      const fieldName = capitalizeFieldName(restPropsName)
      const jsonTag = this.toJsonTag(restPropsName)
      lines.push(`\t${fieldName} map[string]any \`json:"${jsonTag}"\``)
    }

    lines.push('}')
    lines.push('')
  }

  private generatePropsStruct(
    lines: string[],
    ir: ComponentIR,
    componentName: string,
    nestedComponents: NestedComponentInfo[],
    propTypeOverrides: Map<string, string>,
    spreadSlots: SpreadSlotInfo[]
  ): void {
    const propsTypeName = `${componentName}Props`
    this.emitPropsStructHeader(lines, ir, propsTypeName, componentName)

    // ONE taken-tags set spans every field-emitting loop below — per-loop
    // sets would let two loops emit the same tag, and `encoding/json` drops
    // both such fields silently (see `claimJsonTag`).
    const takenJsonTags = new Set<string>()

    this.emitPropsDataFields(lines, ir, propTypeOverrides, takenJsonTags)

    this.emitPropsAuxFields(lines, ir, componentName, nestedComponents, spreadSlots, takenJsonTags)

    lines.push('}')
    lines.push('')
  }

  /**
   * Wrapper struct for a loop-body component with JSX children: embeds the
   * child's Props, datum fields from the loop's item type, and slot fields for
   * sub-components in the body (`TableCell` inside `<TableRow>…</TableRow>`).
   */
  private generateLoopBodyWrapperStruct(
    lines: string[],
    ir: ComponentIR,
    parentComponentName: string,
    nested: NestedComponentInfo,
  ): void {
    const wrapperName = this.loopBodyWrapperName(parentComponentName, nested)
    const datumFields = this.resolveLoopDatumFields(nested.loopItemType)
    const bodyChildInstances = collectBodyChildInstances(this.staticChildrenHost, nested.bodyChildren!)
    // #2822 follow-up: this is a Go EMBEDDED (anonymous) field — its field
    // name IS its type name, so unlike `child.fieldName` the alias-keyed
    // field name can't be kept separate from the type here. The whole
    // token must be the child's own cross-file DECLARED name everywhere
    // this embedded field is declared or literal-initialized (below, and
    // every `${declaredName}Props: New${declaredName}Props(...)` composite
    // literal site) — see `importAliases`.
    const declaredName = this.resolveChildName(nested.name)

    lines.push(`// ${wrapperName} wraps ${declaredName}Props with per-row loop datum`)
    lines.push(`// fields and child component slots for the loop body children. (#1897)`)
    lines.push(`type ${wrapperName} struct {`)
    lines.push(`\t${declaredName}Props`)
    for (const f of datumFields) {
      lines.push(`\t${f.goName} ${f.goType} \`json:"-"\``)
    }
    // Scalar-item row (`[1,2,3,4,5].map(n => …{n}…)`, `props.tags.map(t => …)`)
    // — no datum fields, so carry the whole range value; the body define is
    // fed `.BfLoopItem`.
    const scalarLoopType = this.wrapperRowScalarItemGoType(ir, nested)
    if (scalarLoopType && datumFields.length === 0) {
      lines.push(`\tBfLoopItem ${scalarLoopType} \`json:"-"\``)
    }
    // The row's index and callback locals, set per row at the template call
    // site for a forwarded-children define that reads them (`wrapperRowVars`).
    lines.push(`\tBfRowVars map[string]interface{} \`json:"-"\``)
    for (const child of bodyChildInstances) {
      // #2822: field NAME stays alias-keyed (parent-private); the TYPE must
      // name the child's own declared Go type — see `importAliases`.
      lines.push(`\t${child.fieldName} ${this.resolveChildName(child.name)}Props \`json:"-"\``)
    }
    lines.push('}')
    lines.push('')
  }

  /** Extract a memo name from a loop array expression like `sortedData()` → `sortedData`. */
  private extractMemoNameFromLoopArray(loopArray: string | undefined): string | null {
    if (!loopArray) return null
    const match = loopArray.match(/^(\w+)\(\)$/)
    return match ? match[1] : null
  }

  /** Stable name for the wrapper struct: `<Parent><Child>L<Marker>Ctx` */
  private loopBodyWrapperName(parentName: string, nested: NestedComponentInfo): string {
    return `${parentName}${nested.name}L${nested.loopMarkerId ?? '0'}Ctx`
  }

  /** Resolve a loop item's TypeInfo to Go struct fields for the wrapper. */
  private resolveLoopDatumFields(
    itemType: TypeInfo | null | undefined,
  ): Array<{ tsName: string; goName: string; goType: string }> {
    if (!itemType) return []
    // `itemType` is documented as the loop ITEM's type, but historically
    // could arrive already ARRAY-shaped (`Todo[]`) from a caller that hadn't
    // unwrapped it — `typeNodeToTypeInfo` normalises every array spelling to
    // `kind: 'array'` + `elementType`, so read the element structurally
    // (#2484) instead of regexing a trailing `[]` off `raw`.
    const typeName = itemType.kind === 'array' ? (itemType.elementType?.raw ?? itemType.raw) : itemType.raw
    if (!typeName) return []
    for (const td of this.state.currentTypeDefinitions) {
      if (td.name === typeName) {
        // Every field the datum struct has, quoted source keys included
        // (`'data-priority'` → `DataPriority`): the wrapper copies each one
        // by the same `structFieldNamePairs` name, and a destructured row
        // binding (#3313) may read any of them.
        const fields = this.structFieldsFor(td.name, td)
        if (fields.length > 0) return fields
        break
      }
    }
    const structFields = this.state.localStructFields.get(typeName)
    if (structFields) {
      return Array.from(structFields, ([tsName, goName]) => ({ tsName, goName, goType: 'interface{}' }))
    }
    return []
  }

  /**
   * Resolve a loop's array-source NAME to the local const it references —
   * module-scope or function-scope alike (#2946/#3164). The one shared
   * lookup every loop-array-baking call site uses (constructor-time value
   * baking in `emitStaticBodyWrappers`, element-shape detection in
   * `resolveLoopArraySourceParsed`) so they can't drift on what counts as a
   * safely-bakeable const: never a name an enclosing loop's own callback
   * param shadows (the same coarse whole-component shadow-name set
   * `getBakedStaticChildLoop` already consults, for the same reason — this
   * runs both inside and outside the live tree walk), never a binding
   * mutated after its declaration (#2910 — its initializer is a stale
   * snapshot).
   */
  private resolveLoopArraySourceConst(name: string | undefined): ConstantInfo | null {
    if (!name || this.state.staticLoopSourceBoundNames.has(name)) return null
    return (
      this.state.localConstants.find(
        c =>
          c.name === name &&
          (c.origin?.scope === 'module' || c.origin?.scope === 'init') &&
          !c.mutatedAfterDeclaration,
      ) ?? null
    )
  }

  /**
   * A loop-array-source `ParsedExpr` is either an inline array-literal
   * (`[1,2,3].map(...)`) or a bare identifier naming a local const whose
   * initializer IS an array-literal. Resolves the latter to the former
   * (via `resolveLoopArraySourceConst`) so every caller that needs to
   * inspect the array's element shape (`scalarLiteralLoopGoType`) sees
   * through the named reference the same way constructor-time baking does,
   * instead of only working for an inline literal with no name.
   */
  private resolveLoopArraySourceParsed(arrayParsed: ParsedExpr | undefined): ParsedExpr | undefined {
    if (!arrayParsed || arrayParsed.kind !== 'identifier') return arrayParsed
    const local = this.resolveLoopArraySourceConst(arrayParsed.name)
    return local?.parsed ?? arrayParsed
  }

  /**
   * `'interface{}'` for a loop over a primitive-literal array — inline
   * (`[1,2,3,4,5].map(n => …{n}…)`) or a named local const resolved through
   * `resolveLoopArraySourceParsed` (module- or function-scope, #3164) —
   * whose body renders the bare item, else null. Such scalar-item loops have
   * no datum fields, so the value is carried on the wrapper's synthetic
   * `BfLoopItem`; object/field loops and non-literal sources keep the
   * datum-field path.
   */
  private scalarLiteralLoopGoType(
    arrayParsed: ParsedExpr | undefined,
    itemType: TypeInfo | null | undefined,
  ): string | null {
    if (this.resolveLoopDatumFields(itemType).length > 0) return null
    const resolved = this.resolveLoopArraySourceParsed(arrayParsed)
    if (!resolved) return null
    if (resolved.kind !== 'array-literal' || resolved.elements.length === 0) {
      return null
    }
    for (const el of resolved.elements) {
      const isStr = el.kind === 'literal' && el.literalType === 'string'
      // A numeric literal, or a unary-minus wrapping one (`-1`).
      const isNum =
        (el.kind === 'literal' && el.literalType === 'number') ||
        (el.kind === 'unary' &&
          el.op === '-' &&
          el.argument.kind === 'literal' &&
          el.argument.literalType === 'number')
      if (!isStr && !isNum) return null
    }
    return 'interface{}'
  }

  /**
   * The Go type of a forwarded-children wrapper row's `BfLoopItem`, or null
   * when the row carries datum fields instead. A scalar row has no fields to
   * copy, so the wrapper carries the whole range value and the row's
   * forwarded-children define is fed `.BfLoopItem`: an inline or named
   * primitive-literal array (`scalarLiteralLoopGoType`), or an array prop of
   * strings/numbers/booleans whose rows the constructor builds from the prop
   * itself (`propArrayLoopRowSource`). The struct field, the constructor's
   * rows and the template (`scalarWrapperRowLoops`) all read this one
   * answer.
   */
  private wrapperRowScalarItemGoType(ir: ComponentIR, nested: NestedComponentInfo): string | null {
    if (!nested.bodyChildren?.length) return null
    const literal = this.scalarLiteralLoopGoType(nested.loopArrayParsed, nested.loopItemType)
    if (literal) return literal
    const source = this.propArrayLoopRowSource(ir, nested)
    return source?.shape.scalar ? 'interface{}' : null
  }

  /** Generate the NewXxxProps function. */
  private generateNewPropsFunction(
    lines: string[],
    ir: ComponentIR,
    componentName: string,
    nestedComponents: NestedComponentInfo[],
    spreadSlots: SpreadSlotInfo[],
    propTypeOverrides: Map<string, string>,
  ): void {
    const inputTypeName = `${componentName}Input`
    const propsTypeName = `${componentName}Props`

    // Dynamic nested split: components with body children auto-populate from
    // baked memo data; those without stay handler-populated. The "dynamic loop
    // slices stay empty until the handler fills them" rule is documented per
    // child via `emitNewPropsDocComment`.
    const dynamicWithBody = nestedComponents.filter(
      n => n.isDynamic && !n.isPropDerived && n.bodyChildren && n.bodyChildren.length > 0,
    )
    const signalDynamicNested = nestedComponents.filter(
      n => n.isDynamic && !n.isPropDerived && !(n.bodyChildren && n.bodyChildren.length > 0),
    )
    this.emitNewPropsDocComment(lines, componentName, inputTypeName, propsTypeName, signalDynamicNested)
    lines.push(`func New${componentName}Props(in ${inputTypeName}) ${propsTypeName} {`)
    lines.push('\tscopeID := in.ScopeID')
    lines.push('\tif scopeID == "" {')
    lines.push(`\t\tscopeID = "${componentName}_" + randomID(6)`)
    lines.push('\t}')
    lines.push('')
    this.emitDependentDefaults(lines, ir, propTypeOverrides)

    // Static + prop-derived nested components auto-populate from input. An
    // orphaned clientOnly nested loop (#2627 — see `isOrphanedClientOnlyNested`)
    // has no Input field to range over (excluded above in `generateInputStruct`),
    // so it's excluded here too.
    const staticNested = nestedComponents.filter(
      n => (!n.isDynamic || n.isPropDerived) && !this.isOrphanedClientOnlyNested(n),
    )

    // Wrapper vars emitted (by either the static-with-body or dynamic-with-body
    // path), so the return struct only includes the ones that were built.
    const emittedWrapperVars = new Set<string>()

    // Static loops WITH body children bake the data directly (like the
    // dynamic-with-body path): Input items don't carry the wrapper's datum
    // fields.
    const staticWithBody = staticNested.filter(
      n => n.bodyChildren && n.bodyChildren.length > 0,
    )
    const staticWithoutBody = staticNested.filter(
      n => !n.bodyChildren || n.bodyChildren.length === 0,
    )

    // Static nested WITHOUT body children.
    for (const nested of staticWithoutBody) {
      const varName = this.nestedRowsVar(nested)
      // #2822 follow-up: the constructor/type names below are cross-file
      // (the child's own `New<Name>Props`/`<Name>Props`/`<Name>Input`) and
      // must resolve to the child's declared name; `varName` (this local)
      // and `in.<nestedRowsField>` (this parent's own Input field, read
      // below) stay alias-keyed — see `importAliases`.
      const declaredName = this.resolveChildName(nested.name)
      // #2208: a static loop whose ARRAY SOURCE is itself fully-static
      // (`const items = [{ label: 'Alpha' }, ...]`) has no caller input to
      // wait for — every item's props/data-key are already known at
      // compile time. Bake them directly instead of ranging over
      // `in.<Name>s` (which stays empty forever for this shape, since the
      // loop-source gate above only lets this fixture through BECAUSE it's
      // baked here).
      const baked = nested.loopMarkerId
        ? this.getBakedStaticChildLoop(
            nested.loopMarkerId,
            nested,
            nested.loopArrayParsed,
            nested.loopParam,
            nested.loopKey,
          )
        : null
      if (baked) {
        lines.push(`\t${varName} := make([]${declaredName}Props, ${baked.items.length})`)
        baked.items.forEach((item, i) => {
          const fields = item.inputFields.map(f => `${f.goField}: ${f.goValue}`).join(', ')
          lines.push(`\t${varName}[${i}] = New${declaredName}Props(${declaredName}Input{${fields}})`)
          lines.push(`\t${varName}[${i}].BfParent = scopeID`)
          lines.push(`\t${varName}[${i}].BfMount = "${nested.slotId}"`)
          if (item.dataKey !== null) {
            lines.push(`\t${varName}[${i}].BfDataKey = ${JSON.stringify(item.dataKey)}`)
          }
        })
        lines.push('')
        continue
      }
      // Rows built from the array prop itself (`propArrayLoopRowSource`),
      // emitted below once the prop-fallback locals their props may read
      // are declared (`emitPropArrayChildRows`).
      if (this.propArrayLoopRowSource(ir, nested)) continue
      const rowsField = this.nestedRowsField(nested)
      lines.push(`\t${varName} := make([]${declaredName}Props, len(in.${rowsField}))`)
      lines.push(`\tfor i, item := range in.${rowsField} {`)
      lines.push(`\t\t${varName}[i] = New${declaredName}Props(item)`)
      lines.push(`\t\t${varName}[i].BfParent = scopeID`)
      lines.push(`\t\t${varName}[i].BfMount = "${nested.slotId}"`)
      this.emitCallerRowDataKey(lines, nested, varName)
      lines.push('\t}')
      lines.push('')
    }

    const propFallbackVars = collectPropFallbackVars(this.emitCtx, ir)
    emitPropFallbackLocals(lines, propFallbackVars)

    // After the prop-fallback locals: a loop-row child's prop can resolve to a
    // signal seeded from one of them (`signalSeedGo`). Before this
    // component's own sibling-memo hoisting below, so drop the previous
    // component's hoisted locals here — a memo read by the wrappers must
    // never resolve to a local this function doesn't declare.
    this.state.hoistedMemoLocals = new Map()
    for (const nested of staticWithoutBody) {
      const source = this.propArrayLoopRowSource(ir, nested)
      if (source) this.emitPropArrayChildRows(lines, ir, nested, source, propFallbackVars)
    }
    this.emitStaticBodyWrappers(lines, ir, componentName, staticWithBody, propFallbackVars, emittedWrapperVars)
    this.emitDynamicBodyWrappers(lines, ir, componentName, dynamicWithBody, propFallbackVars, emittedWrapperVars)

    hoistSiblingMemoLocals(this.emitCtx, lines, ir, propFallbackVars)

    this.emitCallerPropsInit(lines, ir, propTypeOverrides)

    lines.push(`\treturn ${propsTypeName}{`)
    lines.push('\t\tScopeID: scopeID,')
    // Host context, for when *this* component is itself a slot-attached child.
    lines.push('\t\tBfParent: in.BfParent,')
    lines.push('\t\tBfMount: in.BfMount,')
    if (this.usesSearchParams(ir)) {
      lines.push('\t\tSearchParams: in.SearchParams,')
    }
    lines.push('\t\tBfCallerProps: bfCallerProps,')

    const propFieldNames = emitPropFieldInits(this.emitCtx, lines, ir, propFallbackVars, propTypeOverrides)
    emitSignalFieldInits(this.emitCtx, lines, ir, propFallbackVars, propFieldNames)

    // Nested component arrays. Static-without-body always emitted; the
    // with-body paths only when their wrapper var was built.
    for (const nested of staticWithoutBody) {
      const varName = this.nestedRowsVar(nested)
      lines.push(`\t\t${this.nestedRowsField(nested)}: ${varName},`)
    }
    for (const nested of [...staticWithBody, ...dynamicWithBody]) {
      const varName = this.nestedRowsVar(nested)
      if (!emittedWrapperVars.has(varName)) continue
      lines.push(`\t\t${this.nestedRowsField(nested)}: ${varName},`)
    }

    emitMemoFieldInits(this.emitCtx, lines, ir, propFallbackVars, propFieldNames)

    // Computed derived-const fields (`Root: func() string { … }()`), matching
    // `generatePropsStruct`.
    const takenDerivedInit = derivedConstTakenFieldNames(ir)
    for (const f of this.computeDerivedConstFields(takenDerivedInit)) {
      lines.push(`\t\t${f.name}: ${f.init},`)
    }

    // `useContext` consumer fields default to the `createContext` default when
    // the provider didn't set them. Props params must contribute BOTH namings
    // (`propParamFieldNamesUnion`) or this disagrees with Input/Props on
    // whether the consumer field exists.
    const takenInit = new Set<string>([
      ...this.propParamFieldNamesUnion(ir.metadata.propsParams),
      ...ir.metadata.signals.map(s => capitalizeFieldName(s.getter)),
      ...ir.metadata.memos.map(m => capitalizeFieldName(m.name)),
    ])
    for (const c of this.nonCollidingContextConsumers(takenInit)) {
      const field = this.contextFieldName(c)
      const def = this.contextConsumerGoDefault(c)
      // A `map[string]interface{}` field's Go zero value (nil) is already a
      // safely-readable "no value" (`bf_get` / `getFieldValue` treats a nil
      // map exactly like an empty one, per `reflect.Value.MapIndex`'s
      // documented nil-map behavior) — no `applyGoFallback` wrapper needed,
      // same as the other zero-value sentinels below.
      const defaulted =
        c.defaultValue === null ||
        def === '""' ||
        def === '0' ||
        def === 'false' ||
        def === 'map[string]interface{}{}'
          ? `in.${field}`
          : applyGoFallback(`in.${field}`, def)
      lines.push(`\t\t${field}: ${defaulted},`)
    }

    this.emitStaticChildInstances(lines, ir, propFallbackVars)

    this.emitSpreadBagInits(lines, ir, spreadSlots)

    // Pass the rest-bag map straight through from Input to Props (#2805) —
    // same field on both structs (`generateInputStruct` / `emitPropsAuxFields`),
    // no reshaping needed since it's already `map[string]any` on both sides.
    if (ir.metadata.restPropsName) {
      const field = capitalizeFieldName(ir.metadata.restPropsName)
      lines.push(`\t\t${field}: in.${field},`)
    }

    lines.push('\t}')
    lines.push('}')
  }

  /**
   * Build the `bfCallerProps` local (assigned to `BfCallerProps` in the
   * returned struct) — the hydration-only, caller-supplied-keys-only view
   * of this component's props (#2684). See the field's doc comment
   * (`emitPropsStructHeader`) for the two-consumers rationale.
   *
   * Three classes, mirroring the issue's taxonomy — gated on `param.optional`
   * (NOT on the resolved Go type's nillability alone, even though that reads
   * as the more "obvious" test): a REQUIRED prop must stay unconditional
   * even when its resolved type happens to be nillable (`ctx: unknown`, the
   * `array-flatmap-thisarg` fixture passes `ctx: null` explicitly) — Go's
   * `interface{}` cannot tell "explicit null" from "omitted" once
   * unmarshaled (both are the nil zero value), so nil-checking a required
   * field would silently turn an intentional `null` into a dropped key.
   *   1. Required prop → always included, raw `in.<InputField>` (never the
   *      defaulted Props-field value — a caller who passes the same value
   *      as the author's default is indistinguishable from one who didn't,
   *      but that's inherent to a required prop having no "omitted" state).
   *   2. Optional prop whose resolved Go type is nillable (`interface{}`,
   *      `map[string]interface{}`, or any slice `[]T`) → included only
   *      when `in.<InputField> != nil`, i.e. only when the caller actually
   *      passed something.
   *   3. Optional prop that nonetheless resolved to a CONCRETE type (a
   *      string-union alias like `placement?: 'top' | 'bottom'`, a bare
   *      scalar never consumed nullish/attr/text/presence-wise, OR a type
   *      that resolves to `interface{}` some OTHER way — e.g. an inherited
   *      `extends` clause the analyzer can't fully resolve — while
   *      `param.optional` itself is, possibly inaccurately, `false`) —
   *      presence is unknowable from Input alone, so it's included
   *      unconditionally, same as class 1. A documented residual, not
   *      silently dropped; see the PR that introduced this method for named
   *      instances found in the corpus (e.g. `textarea`'s `rows`, inherited
   *      through `TextareaHTMLAttributes`). Do NOT widen these props' types
   *      to "fix" this — that's `resolvePropGoType`'s call, not this
   *      method's, and doing so would risk the same `ctx`-style regression.
   *
   * `children` is excluded outright (#1952 — a separately-declared
   * position, not relitigated here). Rest-props bags are never added to
   * the Props struct's JSON at all (checked: no field exists for them
   * outside Input), so nothing to exclude here either — already at parity
   * with the reference, which never serializes rest keys.
   *
   * Every prop has its own Input field here: a loop's rows never take over
   * a prop's field (`nestedRowsFieldName`, #3603/#3616).
   */
  /**
   * Apply each computed destructure default (one reading an earlier prop,
   * #3531, or any other non-literal one, `hasComputedDefault`) to the Input
   * before anything reads it (`dependentDefaultNormalization`), and refuse
   * one reading an earlier prop that this adapter can't apply instead of
   * rendering the prop without its default.
   */
  private emitDependentDefaults(
    lines: string[],
    ir: ComponentIR,
    propTypeOverrides: Map<string, string>,
  ): void {
    // `bfCallerProps` reads the caller's value of every prop but these
    // (`emitCallerPropsInit`), so only the others keep a local for it.
    const { lines: normalization, rawLocals, unsupported } = dependentDefaultNormalization(
      this.emitCtx, ir.metadata.propsParams, propTypeOverrides,
      param => !isChildrenPropParam(param),
    )
    lines.push(...normalization)
    this.dependentDefaultRawLocals = rawLocals
    for (const name of unsupported) {
      this.state.errors.push({
        code: 'BF101',
        severity: 'error',
        message: `The default of prop '${name}' reads an earlier prop in a shape the Go template adapter can't apply in the props constructor`,
        loc: this.makeLoc(),
        suggestion: {
          message: `Destructure '${name}' without a default and compute its value from the earlier prop in the component body instead.`,
        },
      })
    }
  }

  /**
   * The caller's own value of `param` in the props constructor: its Input
   * field, or for a prop whose dependent default was applied to `in`, the
   * local holding what the caller passed (#3531), so hydration carries that.
   */
  private callerPropValueGo(param: { name: string; sourceName?: string }): string {
    const field = capitalizeFieldName(param.sourceName ?? param.name)
    return this.dependentDefaultRawLocals.get(field) ?? `in.${field}`
  }

  private emitCallerPropsInit(
    lines: string[],
    ir: ComponentIR,
    propTypeOverrides: Map<string, string>,
  ): void {
    lines.push('\tbfCallerProps := map[string]interface{}{}')
    const bfCallerPropsTakenTags = new Set<string>()

    for (const param of ir.metadata.propsParams) {
      // Children are DOM content, not hydration data (#1952) — excluded the
      // same way `emitPropsDataFields` excludes them from the Props struct.
      if (isChildrenPropParam(param)) continue
      // Same tag algorithm `emitPropsDataFields` uses for the Props field's
      // own `json:"…"` tag, re-derived against a FRESH set: props are always
      // processed first, in the same order, over an empty set in BOTH
      // places, so the two computations can't disagree.
      const callerKey = this.claimJsonTag(this.toJsonTag(param.sourceName ?? param.name), bfCallerPropsTakenTags)
      if (callerKey === '-') continue // tag collision — dropped from the wire, same as the Props field itself would be
      const inputField = this.callerPropValueGo(param)
      const goType = resolvePropGoType(this.emitCtx, param, propTypeOverrides)
      const isNillable = goType === 'interface{}' || goType === 'map[string]interface{}' || goType.startsWith('[]')
      // `param.optional` gates the branch (not "isNillable alone") because a
      // REQUIRED prop must stay unconditional even when its resolved type
      // happens to be nillable (`ctx: unknown`, #2094's array-flatmap-thisarg
      // fixture passes `ctx: null` explicitly) — Go's `interface{}` cannot
      // tell "explicit null" from "omitted" once unmarshaled (both are the
      // nil zero value), so a nil-check here would silently turn an
      // intentional `null` into a dropped key, regressing a fixture that
      // matched the reference before this method existed. `resolvePropGoType`
      // never applies its nillable flip to a required prop, so this ONLY
      // affects the rare case where a type resolves to `interface{}` some
      // OTHER way (e.g. `unknown`, or a type inherited through an
      // unresolved external `extends` clause) while `param.optional` is
      // (accurately or not) false — see the method docstring's residual list.
      if (param.optional && isNillable) {
        lines.push(`\tif ${inputField} != nil {`)
        lines.push(`\t\tbfCallerProps["${callerKey}"] = ${inputField}`)
        lines.push(`\t}`)
      } else {
        // Required (class 1), or optional-but-concrete residual (class 3),
        // or optional-but-misresolved-required residual — see docstring.
        lines.push(`\tbfCallerProps["${callerKey}"] = ${inputField}`)
      }
    }

    lines.push('')
  }

  private emitStaticChildInstances(
    lines: string[],
    ir: ComponentIR,
    propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
  ): void {
    const staticChildren = collectStaticChildInstances(this.staticChildrenHost, ir.root, ir.metadata.propsParams)
    for (const child of staticChildren) {
      // #2822: the constructor/type names and every cross-file shape lookup
      // below must resolve to the child's own DECLARED name — `New<Name>Props`
      // / `<Name>Input` are types/functions the child's OWN generated Go file
      // defines under that name, not the caller-local alias. `child.fieldName`
      // (this PARENT's own struct field) stays keyed by the alias — declared
      // and read consistently within this one parent's generated code.
      const declaredName = this.resolveChildName(child.name)
      // A `key` is the child root's `data-key`, not an Input field: build the
      // child, stamp `BfDataKey`, and hand the stamped value to the field.
      const dataKey = lowerStaticChildDataKey(this.childInputHost, child, ir, propFallbackVars)
      lines.push(dataKey === null
        ? `\t\t${child.fieldName}: New${declaredName}Props(${declaredName}Input{`
        : `\t\t${child.fieldName}: func() ${declaredName}Props { p := New${declaredName}Props(${declaredName}Input{`)
      lines.push(`\t\t\tScopeID: scopeID + "_${child.slotId}",`)
      lines.push(`\t\t\tBfParent: scopeID,`)
      lines.push(`\t\t\tBfMount: "${child.slotId}",`)
      // SSR context propagation: a child wrapped in a `<Ctx.Provider value>` it
      // consumes gets the provider value set on its consumer field (else its own
      // NewProps applies the `createContext` default).
      if (child.contextBindings) {
        for (const consumer of this.childContextConsumers.get(declaredName) ?? []) {
          const goVal = child.contextBindings.get(consumer.contextName)
          if (goVal !== undefined) {
            lines.push(`\t\t\t${this.contextFieldName(consumer)}: ${goVal},`)
          }
        }
      }
      const inputProps = { name: child.name, props: child.props.filter(p => p.name !== 'key') }
      for (const { goField, goValue } of lowerChildInputFields(this.childInputHost, inputProps, ir, propFallbackVars).fields) {
        lines.push(`\t\t\t${goField}: ${goValue},`)
      }
      // JSX children → the child slot's `Children` input. Plain text uses
      // JSON.stringify (dodges `goLiteral`'s number branch, which would emit
      // `<Button>-1</Button>` as an int); mixed/HTML wraps in `template.HTML(...)`
      // so html/template skips re-escaping the already-rendered markup.
      if (child.childrenText !== null) {
        lines.push(`\t\t\tChildren: ${JSON.stringify(child.childrenText)},`)
      } else if (child.childrenHtml !== null) {
        this.state.usesHtmlTemplate = true
        lines.push(`\t\t\tChildren: template.HTML(${JSON.stringify(child.childrenHtml)}),`)
      } else if (child.childrenScopedHtmlExpr !== null) {
        // Hoisted-JSX children with a needsScope root: the root `bf-s` is the
        // runtime parent scopeID spliced into the bake.
        this.state.usesHtmlTemplate = true
        lines.push(`\t\t\tChildren: template.HTML(${child.childrenScopedHtmlExpr}),`)
      }
      lines.push(dataKey === null ? `\t\t}),` : `\t\t}); p.BfDataKey = ${dataKey}; return p }(),`)
    }
  }

  /**
   * The `child_<Field> := New<Child>Props(...)` constructions for the
   * components nested in a loop-body component's forwarded children, built
   * once and shared by every row (identical scope IDs per row). Shared by the
   * static and memo-baked wrapper paths.
   */
  private emitLoopRowBodyChildInstances(
    lines: string[],
    ir: ComponentIR,
    bodyChildInstances: readonly StaticChildInstance[],
    propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
  ): void {
    for (const child of bodyChildInstances) {
      const childDeclaredName = this.resolveChildName(child.name)
      lines.push(`\tchild_${child.fieldName} := New${childDeclaredName}Props(${childDeclaredName}Input{`)
      lines.push(`\t\tScopeID: scopeID + "_${child.slotId}",`)
      lines.push(`\t\tBfParent: scopeID,`)
      lines.push(`\t\tBfMount: "${child.slotId}",`)
      for (const f of lowerLoopRowChildInputFields(this.childInputHost, child, ir, propFallbackVars, child.rowScope)) {
        lines.push(`\t\t${f.goField}: ${f.goValue},`)
      }
      lines.push(`\t})`)
    }
    if (bodyChildInstances.length > 0) lines.push('')
  }

  /**
   * The wrapper row's embedded `<Name>Props: New<Name>Props(...)` for the
   * loop-body component itself, with its own row-independent props (`key` →
   * `BfDataKey`, forwarded children → `bf_with_children`, both applied by the
   * caller). Shared by the static and memo-baked wrapper paths.
   */
  private emitLoopBodyComponentProps(
    lines: string[],
    ir: ComponentIR,
    nested: NestedComponentInfo,
    propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
  ): void {
    // #2822 follow-up: the SAME declared name `generateLoopBodyWrapperStruct`
    // declared the wrapper struct's embedded field under.
    const declaredName = this.resolveChildName(nested.name)
    lines.push(`\t\t\t${declaredName}Props: New${declaredName}Props(${declaredName}Input{`)
    lines.push(`\t\t\t\tBfParent: scopeID,`)
    lines.push(`\t\t\t\tBfMount: "${nested.slotId}",`)
    const own = { name: nested.name, props: nested.rowProps }
    for (const f of lowerLoopRowChildInputFields(this.childInputHost, own, ir, propFallbackVars, nested.rowScope)) {
      lines.push(`\t\t\t\t${f.goField}: ${f.goValue},`)
    }
    lines.push(`\t\t\t}),`)
  }

  private emitNewPropsDocComment(
    lines: string[],
    componentName: string,
    inputTypeName: string,
    propsTypeName: string,
    signalDynamicNested: NestedComponentInfo[],
  ): void {
    lines.push(`// New${componentName}Props creates ${propsTypeName} from ${inputTypeName}.`)
    for (const nested of signalDynamicNested) {
      const arrayField = this.nestedRowsField(nested)
      // #2822 follow-up: `arrayField` names THIS parent's own field
      // (alias-keyed, stays as-is); the constructor/type names in the
      // example below are the child's own cross-file symbols — resolve
      // for doc accuracy (cosmetic; not compiled) — see `importAliases`.
      const declaredName = this.resolveChildName(nested.name)
      lines.push(`//`)
      lines.push(`// NOTE: \`${arrayField}\` is populated by the route handler, not by`)
      lines.push(`// New${componentName}Props — the SSR template iterates over it`)
      lines.push(`// dynamically (\`.${arrayField}\`). Build the slice from your source data and`)
      lines.push(`// assign it before passing the props to your renderer. Example:`)
      lines.push(`//`)
      lines.push(`//   props := New${componentName}Props(${inputTypeName}{ /* ... */ })`)
      lines.push(`//   props.${arrayField} = make([]${declaredName}Props, len(items))`)
      lines.push(`//   for i, item := range items {`)
      lines.push(`//     props.${arrayField}[i] = New${declaredName}Props(${declaredName}Input{ /* fields */ })`)
      lines.push(`//     props.${arrayField}[i].BfParent = props.ScopeID`)
      lines.push(`//     props.${arrayField}[i].BfMount = "${nested.slotId}"`)
      lines.push(`//   }`)
    }
  }

  private emitSpreadBagInits(lines: string[], ir: ComponentIR, spreadSlots: SpreadSlotInfo[]): void {
    // Spread bag field inits. Unsupported shapes fall through to BF101; the
    // field stays declared on the struct so the template still compiles.
    for (const slot of spreadSlots) {
      const goExpr = buildSpreadInitializer(this.emitCtx, slot.expr, ir, slot.parsed)
      if (goExpr) {
        lines.push(`\t\t${slot.slotId}: ${goExpr},`)
      } else {
        this.state.errors.push({
          code: 'BF101',
          severity: 'error',
          message: `JSX spread '{...${slot.expr}}' on an intrinsic element has no Go template lowering. Supported shapes: signal-getter calls (attrs()), destructured-prop identifiers ({ extras }: P with {...extras}), SolidJS-style props identifier ((props: P) with {...props}), rest-prop identifiers ({...rest}: P with {...rest})`,
          loc: this.makeLoc(),
          suggestion: {
            message: 'Pre-compute the spread bag as a discrete prop, or expand the spread into per-attribute props at the call site.',
          },
        })
      }
    }
  }

  /**
   * Does anything inside a static loop's forwarded body-children tree call
   * a signal getter or memo (`callsReactiveGetters`, computed by the
   * analyzer — #940/#942)?
   * Such a reference has no live binding once `emitStaticBodyWrappers` bakes
   * this static array's rows ahead of time: the row's forwarded children
   * render through a SEPARATE `bf_tmpl`-executed companion define
   * (`queueLoopBodyChildrenDefine`) whose data is the row's own item, with
   * no path back to the parent's signal fields (Go's `$` resets on every
   * `ExecuteTemplate` call — `runtime/bf.go`'s `TemplateFuncMap`). Baking
   * the array anyway would let `go run` crash at template-EXECUTE time
   * (`can't evaluate field ... in type ...`), so `emitStaticBodyWrappers`
   * refuses the loop with BF101 instead (`loop-row-child-children-attrs-frozen`).
   * The walk descends through every node shape that already bakes and
   * renders correctly here (a nested component's children, a
   * conditional and both branches, a nested loop, a fragment) and flags
   * only an actual reactive read on the way — flagging those shapes
   * wholesale would silently empty loops that render fine on `main`
   * (e.g. `<Chip><Badge>{o.label}</Badge></Chip>`). Only shapes it can't
   * see into (a slot, a provider, an async boundary, an if-statement) are
   * treated as unsafe. Reaching outer reactive state from a loop-forwarded
   * child on Go is a separate, unsolved capability gap (#3164 fixes the
   * array-source scope only), not something this check attempts to
   * resolve.
   */
  private bodyChildrenReferenceOuterReactiveState(nodes: readonly IRNode[], scalarRow = false): boolean {
    for (const node of nodes) {
      switch (node.type) {
        case 'text':
          continue
        case 'expression':
          if (node.callsReactiveGetters) return true
          continue
        case 'element':
          if (node.attrs.some(a => a.callsReactiveGetters)) return true
          if (this.bodyChildrenReferenceOuterReactiveState(node.children, scalarRow)) return true
          continue
        case 'component':
          // A scalar-item row's companion define runs with the bare item as
          // its data (`bf_tmpl … .BfLoopItem`), so a nested component's
          // slot field on the row wrapper is out of reach there. Its props
          // are not checked: the row's child construction below
          // (`collectBodyChildInstances`) happens in the parent's constructor,
          // never inside the companion define, so an outer read cannot crash
          // it: a row-independent reactive prop is lowered to its initial
          // value there (`lowerLoopRowChildInputFields`), or refused loudly.
          if (scalarRow) return true
          if (this.bodyChildrenReferenceOuterReactiveState(node.children, scalarRow)) return true
          continue
        case 'conditional':
          if (node.callsReactiveGetters) return true
          if (this.bodyChildrenReferenceOuterReactiveState([node.whenTrue, node.whenFalse], scalarRow)) return true
          continue
        case 'loop':
          if (node.callsReactiveGetters) return true
          if (this.bodyChildrenReferenceOuterReactiveState(node.children, scalarRow)) return true
          continue
        case 'fragment':
          if (this.bodyChildrenReferenceOuterReactiveState(node.children, scalarRow)) return true
          continue
        default:
          return true
      }
    }
    return false
  }

  private emitStaticBodyWrappers(
    lines: string[],
    ir: ComponentIR,
    componentName: string,
    staticWithBody: NestedComponentInfo[],
    propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
    emittedWrapperVars: Set<string>,
  ): void {
    // Bake the array-source const into the constructor so wrappers get their
    // datum fields from the data (Input items carry only child-component params).
    // The const can live at module scope OR be local to the component
    // function body (#2946/#3164, `resolveLoopArraySourceConst`) — Go's
    // `convertInitialValue` only needs the initializer's text/type, not
    // where it's declared. This path used to accept module scope only, so
    // a function-body-local array (`const opts = [...]` inside the
    // component) baked nothing and the whole loop silently dropped from
    // SSR (#3164).
    for (const nested of staticWithBody) {
      // A forwarded child element reading an outer signal/memo (or, on a
      // scalar-item row, a nested component) has no path back to it from
      // the row's own companion define. Baking the rows would crash at
      // `go run` time and skipping them would silently drop the loop from
      // SSR, so refuse loudly instead (see the doc comment above).
      const scalarLoopType = this.wrapperRowScalarItemGoType(ir, nested)
      if (nested.bodyChildren && this.bodyChildrenReferenceOuterReactiveState(nested.bodyChildren, !!scalarLoopType)) {
        this.state.errors.push({
          code: 'BF101',
          severity: 'error',
          message: `Loop-row child component '${nested.name}' forwards JSX children that read an outer signal/memo (or, on a scalar-item row, nest a component). A static loop's forwarded children render through a per-row companion template that can't reach the parent component's own state on the Go template adapter.`,
          loc: this.makeLoc(),
          suggestion: {
            message: 'Mark the loop /* @client */ so it renders in the browser, or pass the outer value into the loop-body component as its own prop.',
          },
        })
        continue
      }
      const found = this.resolveLoopArraySourceConst(nested.loopArray)
      const localConst = found?.value && found.type ? found : null
      let bakedValue = localConst?.type
        ? convertInitialValue(this.emitCtx, localConst.value!, localConst.type, ir.metadata.propsParams, localConst.parsed)
        : null
      // Inline primitive-literal array (`[1,2,3,4,5].map(...)`): no named const,
      // so bake the literal slice directly (else SSR renders an empty loop).
      if (!bakedValue && this.scalarLiteralLoopGoType(nested.loopArrayParsed, nested.loopItemType)) {
        bakedValue = jsLiteralToGo(
          this.emitCtx,
          { kind: 'unknown', raw: 'unknown' },
          nested.loopArrayParsed,
        )
      }
      // An array prop: range over its own (caller-supplied) Input field.
      if (!bakedValue) bakedValue = this.propArrayLoopRowSource(ir, nested)?.goExpr ?? null
      if (!bakedValue || bakedValue === 'nil' || bakedValue === '0') continue

      const varName = this.nestedRowsVar(nested)
      const wrapperType = this.loopBodyWrapperName(componentName, nested)
      const datumFields = this.resolveLoopDatumFields(nested.loopItemType)
      const bodyChildInstances = collectBodyChildInstances(this.staticChildrenHost, nested.bodyChildren!, ir.metadata.propsParams, nested.rowScope)
      this.emitLoopRowBodyChildInstances(lines, ir, bodyChildInstances, propFallbackVars)

      const dataVar = `${varName}Data`
      lines.push(`\t${dataVar} := ${bakedValue}`)
      lines.push(`\t${varName} := make([]${wrapperType}, len(${dataVar}))`)
      lines.push(`\tfor i, item := range ${dataVar} {`)
      lines.push(`\t\t${varName}[i] = ${wrapperType}{`)
      this.emitLoopBodyComponentProps(lines, ir, nested, propFallbackVars)
      for (const f of datumFields) {
        lines.push(`\t\t\t${f.goName}: item.${f.goName},`)
      }
      // Scalar-item loop: carry the range value on `BfLoopItem` so the body
      // renders the bare param. Also consumes `item`, otherwise an unused range
      // var (Go compile error) in a datum-less loop.
      if (scalarLoopType && datumFields.length === 0) {
        lines.push(`\t\t\tBfLoopItem: item,`)
      }
      for (const child of bodyChildInstances) {
        lines.push(`\t\t\t${child.fieldName}: child_${child.fieldName},`)
      }
      lines.push(`\t\t}`)
      lines.push(`\t\t${varName}[i].BfParent = scopeID`)
      lines.push(`\t\t${varName}[i].BfMount = "${nested.slotId}"`)
      // The rows are the source data itself, so the key reads the row
      // (`key={n}` on a scalar row is the range value).
      this.emitRowDataKey(lines, nested, varName, this.staticWrapperRowShape(ir, nested, scalarLoopType, datumFields.length))
      lines.push('\t}')
      lines.push('')
      emittedWrapperVars.add(varName)
    }
  }

  private emitDynamicBodyWrappers(
    lines: string[],
    ir: ComponentIR,
    componentName: string,
    dynamicWithBody: NestedComponentInfo[],
    propFallbackVars: Map<string, PropFallbackVar>,
    emittedWrapperVars: Set<string>,
  ): void {
    // Wrapper items for dynamic loop-body components whose array bakes to a
    // module-const via a memo (embedded child Props + datum + sub-instances).
    const propsParamMap = new Map(ir.metadata.propsParams.map(p => [p.name, p]))
    for (const nested of dynamicWithBody) {
      const memoName = this.extractMemoNameFromLoopArray(nested.loopArray)
      if (!memoName) continue
      const memo = ir.metadata.memos.find(m => m.name === memoName)
      if (!memo) continue

      const goType = inferMemoType(this.emitCtx, memo, ir.metadata.signals, propsParamMap)
      const bakedValue = computeMemoInitialValue(this.emitCtx, 
        memo, ir.metadata.signals, ir.metadata.propsParams, propFallbackVars, goType,
      )
      if (bakedValue === 'nil' || bakedValue === '0') continue

      const wrapperType = this.loopBodyWrapperName(componentName, nested)
      const varName = this.nestedRowsVar(nested)
      const datumFields = this.resolveLoopDatumFields(nested.loopItemType)
      const bodyChildInstances = collectBodyChildInstances(this.staticChildrenHost, nested.bodyChildren!, ir.metadata.propsParams, nested.rowScope)
      // Child sub-component instances created once (identical scope IDs per row).
      this.emitLoopRowBodyChildInstances(lines, ir, bodyChildInstances, propFallbackVars)

      lines.push(`\tbakedData := ${bakedValue}`)
      lines.push(`\t${varName} := make([]${wrapperType}, len(bakedData))`)
      lines.push(`\tfor i, item := range bakedData {`)
      lines.push(`\t\t${varName}[i] = ${wrapperType}{`)
      this.emitLoopBodyComponentProps(lines, ir, nested, propFallbackVars)
      for (const f of datumFields) {
        lines.push(`\t\t\t${f.goName}: item.${f.goName},`)
      }
      for (const child of bodyChildInstances) {
        lines.push(`\t\t\t${child.fieldName}: child_${child.fieldName},`)
      }
      lines.push(`\t\t}`)
      this.emitRowDataKey(lines, nested, varName, this.wrapperRowShape(nested, null))
      lines.push(`\t}`)
      lines.push('')
      emittedWrapperVars.add(varName)
    }
  }

  /**
   * #2674 Plan A: synthesize a deterministically-named, json-tagged struct
   * for every ANONYMOUS (`kind: 'object'`) type reachable from the
   * component's type surface, so `typeInfoToGo`'s `'object'` case (consulted
   * by `emitLocalTypeStructs`/`generateInputStruct` right after this runs)
   * resolves a real struct instead of falling to `map[string]interface{}` —
   * the map `bakeInlineObjectAsGoMap` (`parsed-literal-to-go.ts`) bakes with
   * DELIBERATELY PascalCased keys for `html/template`'s exact-case
   * `MapIndex` (#2087/#1487), which `BfPropsAttr`'s `json.Marshal` then
   * ships verbatim — the source of the hydration-payload Go-casing leak
   * this pass closes.
   *
   * Two independent walk roots, because a NAMED type reference
   * (`{kind:'interface', raw:'Row'}`) carries no inline `properties` — only
   * `ir.metadata.typeDefinitions` has `Row`'s own property list:
   *
   *   1. Every user `TypeDefinition`'s properties (closes a nested anonymous
   *      property inside a named type — `type Row = { id: string; user: {
   *      name: string } }` → `Row.user`). MUST run before
   *      `emitLocalTypeStructs`: `Row`'s own struct-field computation
   *      (`typeDefinitionToGo` → `structFieldsFor` → `typeInfoToGo`) needs
   *      the synthesized name for its `user` field already registered.
   *   2. Every props param's own `TypeInfo` tree (closes an inline
   *      array-element type with no backing `TypeDefinition` at all —
   *      `items: { id: number; tags: string[] }[]`).
   *
   * Naming is deterministic on STRUCTURAL POSITION (matching
   * `synthesizeStructFromSignal`'s `<component><Getter>Item` convention, not
   * shape/content — two anonymous types shaped identically at different
   * positions get different names, and the same position always yields the
   * same name run-to-run): an array-element object gets
   * `<parent><Prop>Item`; a direct nested object property gets
   * `<parent><Prop>`. `<parent>` is the enclosing struct's OWN Go name for a
   * walk-root-1 type (or the newly-synthesized name of an enclosing
   * anonymous type, for a doubly-nested object — `RowUserAddress`), or
   * `componentName` for a walk-root-2 (top-level props) type — threaded
   * through the recursion so nesting chains correctly regardless of which
   * root reached it.
   *
   * A synthesized name colliding with an EXISTING local type (rare: two
   * structurally-unrelated anonymous types resolving to the same
   * deterministic name) skips synthesis for that ONE type — and its own
   * subtree, since there is no struct to attach nested field names to —
   * gracefully, not as a regression: `typeInfoToGo` keeps returning the
   * pre-#2674 map fallback for exactly that type, so the corpus never
   * breaks, it just doesn't graduate for that one shape (see the
   * `synthObjectStructNames` docstring on `CompileState`).
   *
   * A synthesized struct is ALSO pushed onto `ctx.state.currentTypeDefinitions`
   * as a `TypeDefinition` (empty `definition`, a dummy `loc` — never
   * rendered or used for diagnostics, only looked up by name) so
   * `parsed-literal-to-go.ts`'s `structPropertyType` — which resolves a
   * struct literal's nested-property TYPE by struct name against that same
   * list — finds a synthesized parent's properties exactly like it finds a
   * real named type's, with no separate lookup path to keep in sync.
   */
  private emitSynthPropStructs(lines: string[], ir: ComponentIR, componentName: string): void {
    this.state.synthObjectStructNames = new Map<TypeInfo, string>()
    // `primeCompileState` assigns `currentTypeDefinitions` the SAME array
    // reference as `ir.metadata.typeDefinitions` (no clone) — copy before
    // pushing synthesized entries onto it below, so this per-compile
    // scratch state never mutates the IR's own metadata (which could be
    // compiled again, or read by another consumer sharing the same IR).
    this.state.currentTypeDefinitions = [...this.state.currentTypeDefinitions]

    // Naming/collision decision lives in `planSynthPropStructs` (#2925) —
    // shared with `registerChildComponentShape`'s cross-component-shape
    // registry, which needs the SAME decision before this component has
    // even compiled once (see that function's own #2925 comment).
    // `this.state.localTypeNames` at this point already holds exactly
    // `planSynthPropStructs`'s own collision seed (`localTypeDefinitionNames`,
    // populated by `buildLocalTypeTables` just before this method runs and
    // untouched since) — entries below never collide against it or each
    // other, so registering them is unconditional.
    for (const entry of planSynthPropStructs(ir.metadata, componentName)) {
      this.state.localTypeNames.add(entry.name)
      this.state.synthObjectStructNames.set(entry.typeInfo, entry.name)
      const fields = this.structFieldsFor(entry.name, entry.typeInfo)
      this.registerSynthStruct(
        lines,
        entry.name,
        fields,
        entry.properties,
        `// ${entry.name} is a synthesised type for an anonymous object type (#2674).`,
      )
    }
  }

  private emitLocalTypeStructs(lines: string[], ir: ComponentIR, componentName: string): void {
    for (const td of ir.metadata.typeDefinitions) {
      if (td.name === 'Props' || td.name === `${componentName}Props`) continue
      if (td.name.endsWith('Props')) continue
      const goStruct = this.typeDefinitionToGo(td)
      if (goStruct) {
        lines.push(goStruct)
        lines.push('')
      }
    }
  }

  private emitSynthStructs(lines: string[], ir: ComponentIR, componentName: string): void {
    // Synthesise a struct for each untyped object-array signal (plus, per
    // #2800, one nested struct per array-of-objects field, recursively) and
    // emit them, so the signal field can be typed `[]Synth` and its inline
    // items baked (the loop body reaches each item via struct field
    // access). Registered via `registerSynthStruct` so the baker resolves
    // every level's element type the same way it resolves a #2674
    // anonymous-type struct.
    this.state.synthStructTypes = new Map<string, TypeInfo>()
    for (const signal of ir.metadata.signals) {
      if (signal.envReader) continue // env signal has no bakeable initial shape (#2057)
      // The struct field/ctor-init that would reference this synthesized
      // struct are already skipped (#3245) — see `isElidedFactoryGetter`'s
      // docstring for the full rationale — so emitting the struct itself is
      // dead output that still leaks the internal `__bfGet_<action>` name.
      if (isElidedFactoryGetter(signal)) continue
      const synth = this.synthesizeStructFromSignal(signal, componentName)
      if (!synth) continue
      // Nested-first order (`synthesizeStructFromSignal`'s contract): a
      // struct referencing an earlier entry by name is always registered
      // after it, so no declaration ever forward-references an
      // undeclared Go type.
      for (const s of synth) {
        this.registerSynthStruct(
          lines,
          s.name,
          s.fields,
          s.properties,
          `// ${s.name} is a synthesised element type for the ${signal.getter} signal.`,
        )
      }
      const top = synth[synth.length - 1]
      this.state.synthStructTypes.set(signal.getter, synthSliceTypeInfo(top.name))
    }
  }

  /**
   * The constructor-side row source of a loop over an array PROP whose row
   * is a child component (`props.items.map(item => <Badge key={item.id}
   * label={item.label} />)`, with or without forwarded JSX children), or
   * null when this loop isn't one.
   *
   * The array prop IS the row data, and already reaches the constructor
   * typed as its own Go slice (`in.Items []…ItemsItem`, or `[]string` for a
   * scalar row), so the constructor ranges over that field directly — the
   * same field the Props struct and `bf-p` carry, so SSR rows and the
   * client's own `mapArray` read one source. Every per-row read — the
   * child's props AND its `key` — is then evaluated against the source row
   * (`loopKeyToGoRowExpr` / `rowReadGoAccessor`), never against a child
   * `Input` built from it: the key is not one of the child's props, and a
   * same-named prop may carry a different value.
   *
   * - A row WITH forwarded children renders through a wrapper struct
   *   (`generateLoopBodyWrapperStruct`) whose forwarded-children define
   *   reads the row's datum fields (a struct row), or the bare row value
   *   on the wrapper's `BfLoopItem` (a scalar row,
   *   `wrapperRowScalarItemGoType`).
   * - A bodyless row builds each child's `<Child>Input` from the row
   *   (`sourceRowChildInputFields`); a struct or scalar row, as long as
   *   every SSR prop of the child lowers against the row. Otherwise the loop
   *   stays on the caller-supplied `in.<Child>s` rows.
   *
   * The one decision every site consults — the row's element type for the
   * wrapper's datum fields (`resolveNestedLoopItemTypes`), the Input struct
   * (no `<Child>s` field: rows come from the prop, `generateInputStruct`),
   * and the constructor's rows (`emitStaticBodyWrappers`,
   * `emitPropArrayChildRows`).
   *
   * Recognized: the prop itself (`props.items`, or a destructured `items` /
   * `{ items: rows }`) whose declared type is an array of objects that
   * resolves to a generated Go struct, or of strings/numbers/booleans. A
   * deeper path (`props.data.items`) or a local alias of the prop stay on
   * the existing paths. The rows never share the prop's field: a prop named
   * like the row's plural keeps it, and the rows field is renamed
   * (`nestedRowsFieldName`, #3603/#3616).
   */
  private propArrayLoopRowSource(
    ir: ComponentIR,
    nested: NestedComponentInfo,
  ): { goExpr: string; itemType: TypeInfo; shape: LoopRowShape } | null {
    if (!nested.isPropDerived) return null
    const withBody = !!nested.bodyChildren?.length
    const arr = nested.loopArrayParsed
    if (!arr) return null
    const param = loopDrivingProp(arr, ir.metadata.propsParams, ir.metadata.propsObjectName)
    if (!param) return null
    const arrayType = param.type
    if (arrayType?.kind !== 'array' || !arrayType.elementType) return null
    const elementGoType = typeInfoToGo(this.emitCtx, arrayType.elementType)
    const goExpr = `in.${capitalizeFieldName(param.sourceName ?? param.name)}`
    let source: { goExpr: string; itemType: TypeInfo; shape: LoopRowShape }
    if (this.state.localStructFields.has(elementGoType)) {
      const itemType: TypeInfo = { kind: 'interface', raw: elementGoType }
      if (this.resolveLoopDatumFields(itemType).length === 0) return null
      source = {
        goExpr,
        itemType,
        shape: {
          hasFieldPath: segments => this.rowFieldPathGoType(itemType, segments) !== null,
          readGoType: segments => (segments.length === 0 ? elementGoType : this.rowFieldPathGoType(itemType, segments)),
        },
      }
    } else if (SCALAR_ROW_GO_TYPES.has(elementGoType)) {
      // The prop's own slice type decides what `item` holds: a `number[]`
      // is `[]interface{}` (#3310), so its float64 row arrives boxed.
      const boxedNumber = elementGoType === 'float64' && typeInfoToGo(this.emitCtx, arrayType) !== '[]float64'
      source = {
        goExpr,
        itemType: arrayType.elementType,
        shape: { scalar: true, boxedNumber, readGoType: segments => (segments.length === 0 ? elementGoType : null) },
      }
    } else {
      return null
    }
    if (!withBody && sourceRowChildInputFields(this.childInputHost, ir, nested, source.shape, collectPropFallbackVars(this.emitCtx, ir), false) === null) {
      return null
    }
    return source
  }

  /**
   * The Go type of the field path `segments` on the struct row type
   * `itemType` (`meta.id` on `{ id; meta: { id } }` → `string`), or null
   * when it isn't one: each segment must name a field of the struct reached
   * so far, so a read the Go type can't spell (`label.length`) is declined
   * rather than emitted.
   */
  private rowFieldPathGoType(itemType: TypeInfo, segments: readonly LoopBindingPathSegment[]): string | null {
    let current: TypeInfo = itemType
    let goType: string | null = null
    for (const segment of segments) {
      if (segment.kind !== 'field' || !segment.isIdent) return null
      const field = this.resolveLoopDatumFields(current).find(f => f.tsName === segment.key)
      if (!field) return null
      goType = field.goType
      current = { kind: 'interface', raw: field.goType }
    }
    return goType
  }

  /**
   * The `data-key` of a row on the caller-supplied `in.<Child>s` path,
   * whose `item` is the child's own `<Child>Input` rather than the source
   * row. The key is an expression of the source row, so the Input can only
   * answer it through a prop the child received with that very value
   * (`key={item.id} id={item.id}` → `item.ID`). A key read through no such
   * prop (`key={item.id} label={item.label}`), or through a same-named prop
   * holding a different value (`key={item.id} id={item.slug}`), has nothing
   * on the Input to read, so it is null.
   */
  private childInputRowKeyField(nested: NestedComponentInfo): string | null {
    if (!nested.loopKey) return null
    const row: LoopRowBinding = { param: nested.loopParam, paramBindings: nested.loopParamBindings }
    const keyPath = rowItemPath(parseExpression(nested.loopKey), row)
    if (!keyPath) return null
    const same = (a: readonly LoopBindingPathSegment[], b: readonly LoopBindingPathSegment[]): boolean =>
      a.length === b.length && a.every((seg, i) => JSON.stringify(seg) === JSON.stringify(b[i]))
    // Only a prop landing on its own declared Input field can carry the key:
    // a rest-bag attribute (`token={item.id}` on a `...rest` child) or an
    // undeclared one has no `item.Token` to read.
    const childShape = this.childComponentShapes.get(this.resolveChildName(nested.name))
    const carrier = nested.rowProps.find(prop => {
      if (prop.name === 'key' || prop.name.includes('-') || prop.value.kind !== 'expression' || !prop.value.parsed) return false
      if (childShape && !childShape.paramNames.has(prop.name)) return false
      const path = rowItemPath(prop.value.parsed, row)
      return path !== null && same(path, keyPath)
    })
    return carrier ? `item.${capitalizeFieldName(carrier.name)}` : null
  }

  /**
   * Stamp `BfDataKey` on one row of the caller-supplied `in.<Child>s` path,
   * whose `item` is the child's own `<Child>Input`: the key read through a
   * prop carrying it (`childInputRowKeyField`), or a key that reads no row
   * at all (`key={i}`, the index). A key read off the source row with no
   * carrier is refused with BF101, unless the loop is `/* @client *\/`:
   * rendering the rows without their `data-key` would silently diverge.
   */
  private emitCallerRowDataKey(lines: string[], nested: NestedComponentInfo, varName: string): void {
    if (!nested.loopKey) return
    const keyField = this.childInputRowKeyField(nested) ?? loopKeyToGoRowExpr(nested.loopKey, { index: nested.loopIndex })?.go
    if (keyField) {
      lines.push(`\t\t${varName}[i].BfDataKey = bf.String(${keyField})`)
      return
    }
    // A `/* @client */` loop renders no rows at SSR, so its key is never read.
    if (nested.clientOnly) return
    const declaredName = this.resolveChildName(nested.name)
    this.state.errors.push({
      code: 'BF101',
      severity: 'error',
      message: `Loop key '${nested.loopKey}' on <${nested.name}> rows can't be read on the Go template adapter: the rows are built from caller-supplied '${declaredName}Input' values (a child prop can't be read off the source row), and no prop of <${nested.name}> carries the key's value.`,
      loc: this.makeLoc(),
      suggestion: {
        message: 'Pass each child prop as a plain read of the row (`label={item.label}`), so the rows are built from the array prop itself, or mark the loop /* @client */.',
        escape: [{ kind: 'client-directive' }],
      },
    })
  }

  /** The row scope a constructor-built row's key is lowered in (`loopKeyToGoRowExpr`). */
  private nestedRowBinding(nested: NestedComponentInfo): LoopRowBinding {
    return {
      param: nested.loopParam,
      paramBindings: nested.loopParamBindings,
      index: nested.loopIndex,
    }
  }

  /**
   * What a wrapper row's `item` holds when it isn't an array prop's own
   * row: the bare value of a scalar row (`scalarGoType`), else a struct row
   * whose field types come from the loop's item type, so a key's `+` knows
   * when it concatenates.
   */
  private wrapperRowShape(nested: NestedComponentInfo, scalarGoType: string | null): LoopRowShape {
    if (scalarGoType) return { scalar: true, readGoType: segments => (segments.length === 0 ? scalarGoType : null) }
    const itemType = nested.loopItemType
    return { readGoType: segments => (itemType && segments.length > 0 ? this.rowFieldPathGoType(itemType, segments) : null) }
  }

  /**
   * The `item` of a static wrapper row (`emitStaticBodyWrappers`): an array
   * prop's own row, else a baked scalar row carried bare (no datum fields),
   * else a struct row.
   */
  private staticWrapperRowShape(
    ir: ComponentIR,
    nested: NestedComponentInfo,
    scalarLoopType: string | null,
    datumFieldCount: number,
  ): LoopRowShape {
    const propRows = this.propArrayLoopRowSource(ir, nested)
    if (propRows) return propRows.shape
    return this.wrapperRowShape(nested, datumFieldCount === 0 ? scalarLoopType : null)
  }

  /**
   * Stamp `BfDataKey` on one constructor-built row (`for i, item := range …`),
   * the key lowered in the row's scope (`loopKeyToGoRowExpr`: the row and the
   * index). An unkeyed loop stamps nothing. A key the row loop can't lower
   * is refused with BF101, unless the loop is `/* @client *\/`: rendering
   * the rows without their `data-key` would silently diverge from the
   * reference.
   */
  private emitRowDataKey(
    lines: string[],
    nested: NestedComponentInfo,
    varName: string,
    shape: LoopRowShape,
    lowered: LoweredLoopKey | null = loopKeyToGoRowExpr(nested.loopKey, this.nestedRowBinding(nested), shape),
  ): void {
    if (!nested.loopKey) return
    if (lowered) {
      lines.push(`\t\t${varName}[i].BfDataKey = bf.String(${lowered.go})`)
      return
    }
    // A `/* @client */` loop renders no rows at SSR, so its key is never read.
    if (nested.clientOnly) return
    this.state.errors.push({
      code: 'BF101',
      severity: 'error',
      message: `Loop key '${nested.loopKey}' on <${nested.name}> rows has no Go lowering in the constructor that builds the rows: the Go template adapter lowers a row key built from the row and the index with String(), a template literal or '+' (with operands of known type), and nothing else.`,
      loc: this.makeLoc(),
      suggestion: {
        message: 'Key the rows by a row field or the index (or a string built from them), or mark the loop /* @client */.',
        escape: [{ kind: 'client-directive' }],
      },
    })
  }

  /**
   * A bodyless child-component loop over an array prop
   * (`propArrayLoopRowSource`): one `New<Child>Props` per source row, its
   * Input fields and its `data-key` both read off that row.
   */
  private emitPropArrayChildRows(
    lines: string[],
    ir: ComponentIR,
    nested: NestedComponentInfo,
    source: { goExpr: string; shape: LoopRowShape },
    propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
  ): void {
    const varName = this.nestedRowsVar(nested)
    const declaredName = this.resolveChildName(nested.name)
    const fields = sourceRowChildInputFields(this.childInputHost, ir, nested, source.shape, propFallbackVars, true) ?? []
    const keyExpr = loopKeyToGoRowExpr(nested.loopKey, this.nestedRowBinding(nested), source.shape)
    // Bind `item` only when the key or a field reads the row: an unused
    // range variable doesn't compile.
    const usesItem = !!keyExpr?.readsRow || fields.some(f => f.readsRow)
    lines.push(`\t${varName} := make([]${declaredName}Props, len(${source.goExpr}))`)
    lines.push(`\tfor i, ${usesItem ? 'item' : '_'} := range ${source.goExpr} {`)
    lines.push(`\t\t${varName}[i] = New${declaredName}Props(${declaredName}Input{`)
    lines.push(`\t\t\tBfParent: scopeID,`)
    lines.push(`\t\t\tBfMount: "${nested.slotId}",`)
    for (const f of fields) lines.push(`\t\t\t${f.goField}: ${f.goValue},`)
    lines.push(`\t\t})`)
    this.emitRowDataKey(lines, nested, varName, source.shape, keyExpr)
    lines.push('\t}')
    lines.push('')
  }

  /**
   * A module-scope const by name, read through `this.state.localConstants`
   * so a type `resolveNestedLoopItemTypes` already folded onto an untyped
   * const (#3178) is seen by a later loop over the same const, which then
   * doesn't synthesize (and declare) its Go struct a second time. One
   * shared lookup keeps this file's linear-scan count in
   * `binding-scope-ratchet.test.ts`'s shrink-only ledger from growing.
   */
  private findModuleScopeConst(name: string): ConstantInfo | undefined {
    return findModuleScopeConst(this.state, name)
  }

  /** A non-module local const that has an initializer, by name (`findValuedLocalConst`). */
  private findValuedLocalConst(name: string): ConstantInfo | undefined {
    return findValuedLocalConst(this.state, name)
  }

  private composeFileHeader(lines: string[]): string {
    // Imports come at the top, but `usesHtmlTemplate` is only known after the
    // body is generated; compose package + imports + body once everything has
    // been collected.
    const header: string[] = []
    header.push(`package ${this.options.packageName}`)
    header.push('')
    header.push('import (')
    // Go's import block is conventionally sorted; emit in lexical order
    // (`fmt` < `html/template` < `math/rand`).
    if (this.state.usesFmt) header.push('\t"fmt"')
    if (this.state.usesHtmlTemplate) header.push('\t"html/template"')
    header.push('\t"math/rand"')
    if (this.state.needsStringsImport) header.push('\t"strings"')
    header.push('')
    header.push('\tbf "github.com/barefootjs/runtime/bf"')
    header.push(')')
    header.push('')

    return [...header, ...lines].join('\n')
  }

  private emitPropsStructHeader(lines: string[], ir: ComponentIR, propsTypeName: string, componentName: string): void {
    lines.push(`// ${propsTypeName} is the props type for the ${componentName} component.`)
    lines.push(`type ${propsTypeName} struct {`)
    // Internal scope id: used by the Go template (`{{.ScopeID}}`) to render bf-s
    // markers, but no client runtime consumer ever reads it back out of the
    // hydration bf-p JSON (audited: the only bf-p parser is
    // packages/client/src/runtime/hydrate.ts's parseProps/runInit, and nothing
    // downstream of it reads scopeID). Excluded from Marshal via `json:"-"` — Go's
    // json tag only affects (un)marshalling, not template field access, so
    // `{{.ScopeID}}` keeps working unchanged.
    lines.push('\tScopeID string `json:"-"`')
    lines.push('\tBfIsRoot bool `json:"-"`')
    lines.push('\tBfIsChild bool `json:"-"`')
    // Slot identity for child scopes: host scope id + slot id. Emitted as bf-h /
    // bf-m HTML attributes by `bfHydrationAttrs`.
    lines.push('\tBfParent string `json:"-"`')
    lines.push('\tBfMount string `json:"-"`')
    // Keyed-loop reconciliation key, stamped per item by the parent's loop init
    // and emitted as `data-key` on this component's scope root.
    lines.push('\tBfDataKey string `json:"-"`')

    lines.push('\tScripts *bf.ScriptCollector `json:"-"`')
    // #3119: was never emitted on ANY generated Props struct, even though
    // `renderComponentInto` (runtime/bf.go) already calls
    // `setPortalsField`/`setPortalsOnSlice`/`setPortalsOnSingle` — those
    // reflection-based injectors silently no-op when the target field
    // doesn't exist, so `.Portals.Add`/`.Portals.AddElement` in a rendered
    // template (the explicit `<Portal>` component, and now the
    // `ref`-callback SSR-portal pattern below) referenced a nil field on
    // every component, a latent break in the (until now dormant) explicit
    // `<Portal>` mechanism independent of this fix. Unconditional, like
    // `Scripts`, for the same reason: a nested child's OWN template may
    // use either mechanism even when this component's own template does
    // not.
    lines.push('\tPortals *bf.PortalCollector `json:"-"`')

    // Request-scoped `searchParams()` SSR value. Read by the template as
    // `.SearchParams.Get "key"`. Not serialised for hydration (`json:"-"`) — the
    // client re-reads `window.location.search` itself.
    if (this.usesSearchParams(ir)) {
      lines.push('\tSearchParams bf.SearchParams `json:"-"`')
    }

    // #2684: the raw, CALLER-SUPPLIED view of this component's props —
    // populated by `NewXxxProps` with exactly the keys the caller passed
    // (required props always; optional ones only when not nil), holding
    // the UNDEFAULTED value. This exists because every prop field above
    // (e.g. `X`) serves TWO different consumers that want two different
    // values: the Go TEMPLATE wants the DEFAULTED value so `{{.X}}` renders
    // the author's fallback, while the HYDRATION PAYLOAD wants to know only
    // what the caller actually supplied — baking the author's default into
    // it makes an omitted prop indistinguishable from one explicitly passed
    // with that value, and a Go zero value indistinguishable from an
    // explicit zero/empty/false (the reference, Hono, only ever serializes
    // caller-passed keys). One field can't answer both questions at once,
    // so this sidecar gives the hydration payload its own carrier;
    // `BfPropsAttr` (runtime/bf.go) marshals THIS map instead of the whole
    // struct when it's present. `json:"-"` — never marshaled as an ordinary
    // struct field; `BfPropsAttr` reads it directly by name via reflection.
    lines.push('\tBfCallerProps map[string]interface{} `json:"-"`')
  }

  private emitPropsDataFields(
    lines: string[],
    ir: ComponentIR,
    propTypeOverrides: Map<string, string>,
    takenJsonTags: Set<string>,
  ): void {
    const propFieldNames = new Set<string>()

    for (const param of ir.metadata.propsParams) {
      const fieldName = propsFieldName(param, ir.metadata)
      const goType = resolvePropGoType(this.emitCtx, param, propTypeOverrides)
      // Children are already rendered in the DOM; serialising them into bf-p
      // leaks nested scope ids and bloats the attribute. Exclude from JSON so
      // BfPropsAttr never marshals them.
      //
      // The tag is CALLER-facing even though `fieldName` stays LOCAL: the
      // tag is the hydration wire format and the client JS reads
      // `_p.<callerKey>` (#2524) — a local tag would make hydration read the
      // wrong key. Props are emitted FIRST into `takenJsonTags`, so a prop
      // always wins a tag collision against a later signal/memo/etc field.
      const jsonTag =
        isChildrenPropParam(param)
          ? '-'
          : this.claimJsonTag(this.toJsonTag(param.sourceName ?? param.name), takenJsonTags)
      lines.push(`\t${fieldName} ${goType} \`json:"${jsonTag}"\``)
      propFieldNames.add(fieldName)
    }

    const propsParamMap = new Map(ir.metadata.propsParams.map(p => [p.name, p]))

    for (const signal of ir.metadata.signals) {
      // Env signals are bound as the `SearchParams bf.SearchParams` reader field
      // (see generateInputStruct), not as a generic value field (#2057).
      if (signal.envReader) continue
      // An elided async-factory value (#3245): `signal.getter` is a
      // synthesized internal name nothing in the source ever references. A
      // backend author reading the generated Go props should see only the
      // component's own props and state, not this compiler-internal name.
      // See `isElidedFactoryGetter`'s docstring for the full rationale.
      if (isElidedFactoryGetter(signal)) continue
      const fieldName = capitalizeFieldName(signal.getter)
      if (propFieldNames.has(fieldName)) continue
      // Signal fields are component-internal state, not caller input (#2672):
      // the client never reads `_p.<signalGetter>` — it re-derives the value
      // from `createSignal(...)`'s own initial expression (which itself reads
      // whatever PROP field seeded it, already emitted above with a real tag
      // by the propsParams loop). Excluding the signal field from JSON stops
      // it from co-boarding into `bf-p` while leaving `{{.Field}}` SSR access
      // untouched — Go template field access doesn't consult json tags.
      const jsonTag = '-'
      // The field type decision lives with the seed decision in
      // `type/state-fields.ts`, so the two can never disagree (#3425).
      const goType = signalFieldGoType(this.emitCtx, signal, propsParamMap)
      lines.push(`\t${fieldName} ${goType} \`json:"${jsonTag}"\``)
    }

    // Memos for SSR. A memo whose name collides with an emitted prop field
    // (`const className = createMemo(() => props.className ?? '')`) is skipped:
    // both readers lower to the same `.Field`, and the memo's `?? fallback` folds
    // into the prop initializer in `generateNewPropsFunction`.
    for (const memo of ir.metadata.memos) {
      const fieldName = capitalizeFieldName(memo.name)
      if (propFieldNames.has(fieldName)) continue
      // Memo fields are derived, re-computed client-side from the same prop
      // reads the memo body itself performs — never read as `_p.<memoName>`
      // (#2672). Same rationale as the signal fields above.
      const jsonTag = '-'
      const goType = inferMemoType(this.emitCtx, memo, ir.metadata.signals, propsParamMap)
      lines.push(`\t${fieldName} ${goType} \`json:"${jsonTag}"\``)
    }
  }

  private emitPropsAuxFields(
    lines: string[],
    ir: ComponentIR,
    componentName: string,
    nestedComponents: NestedComponentInfo[],
    spreadSlots: SpreadSlotInfo[],
    takenJsonTags: Set<string>,
  ): void {
    // Computed fields for component-scope derived string consts the template
    // references (e.g. `root = base || '/'`). Not serialised — the route handler
    // doesn't supply them; `NewXxxProps` computes them.
    const takenForDerivedConsts = derivedConstTakenFieldNames(ir)
    for (const f of this.computeDerivedConstFields(takenForDerivedConsts)) {
      lines.push(`\t${f.name} string \`json:"-"\``)
    }

    // `useContext` consumer fields (skip names already taken by a prop /
    // signal / memo field). Props params must contribute BOTH namings
    // (`propParamFieldNamesUnion`) or this disagrees with Input on whether
    // the consumer field exists.
    const takenProps = new Set<string>([
      ...this.propParamFieldNamesUnion(ir.metadata.propsParams),
      ...ir.metadata.signals.map(s => capitalizeFieldName(s.getter)),
      ...ir.metadata.memos.map(m => capitalizeFieldName(m.name)),
    ])
    for (const c of this.nonCollidingContextConsumers(takenProps)) {
      // Context-consumer fields are resolved server-side from the enclosing
      // `Provider` and read via `{{.Field}}` in SSR only — the client's own
      // `useContext` re-reads the DOM-scoped provider value at hydration
      // time, never `_p.<contextField>` (#2672).
      const jsonTag = '-'
      lines.push(`\t${this.contextFieldName(c)} ${this.contextConsumerGoType(c)} \`json:"${jsonTag}"\``)
    }

    for (const nested of nestedComponents) {
      // An orphaned clientOnly nested loop (#2627 — see
      // `isOrphanedClientOnlyNested`) gets NO Props field at all, not even
      // the dead `json:"-"` one the signal-backed dynamic branch below gets:
      // nothing ever populates it.
      if (this.isOrphanedClientOnlyNested(nested)) continue
      // Loop body with JSX children → use the wrapper struct type (a
      // parent-private name — the child's own Props type only appears
      // INSIDE it as the embedded field, already resolved in
      // `generateLoopBodyWrapperStruct`). Loop body IS just the bare child
      // component → this element type IS the child's own cross-file Props
      // type directly — #2822 follow-up: resolve to the declared name.
      const elemType = nested.bodyChildren?.length
        ? this.loopBodyWrapperName(componentName, nested)
        : `${this.resolveChildName(nested.name)}Props`
      const rowsField = this.nestedRowsField(nested)
      if (nested.isDynamic && !nested.isPropDerived) {
        // Dynamic signal-array loops are template-only.
        lines.push(`\t${rowsField} []${elemType} \`json:"-"\``)
      } else if (nested.isDynamic && nested.isPropDerived) {
        // Prop-derived dynamic loops (`props.items.map(item => <Child/>)`,
        // #2672): this field is USUALLY a RE-SHAPED COPY of the driving prop,
        // built for SSR's `{{range}}` — not the prop itself. The client's own
        // `mapArray` re-derives every row straight from the real prop field
        // (`_p.items`, emitted with a real tag by the propsParams loop
        // above), never from `_p.<Name>s`, so co-boarding this copy into
        // `bf-p` is redundant component-internal derivation, same as a memo.
        // The rows field never takes over the prop's own field
        // (`nestedRowsFieldName`, #3603/#3616), so the prop is always there.
        lines.push(`\t${rowsField} []${elemType} \`json:"-"\``)
      } else {
        // Static arrays go in JSON so the client can hydrate (that data can
        // be non-literal, request-time Input the caller supplies with no
        // prop-field twin to fall back on).
        const jsonTag = this.claimJsonTag(
          this.toJsonTag(`${rowsField.charAt(0).toLowerCase()}${rowsField.slice(1)}`),
          takenJsonTags,
        )
        lines.push(`\t${rowsField} []${elemType} \`json:"${jsonTag}"\``)
      }
    }

    const staticChildren = collectStaticChildInstances(this.staticChildrenHost, ir.root, ir.metadata.propsParams)
    for (const child of staticChildren) {
      // #2822: the field's NAME stays keyed by the caller-local alias
      // (`child.fieldName`, declared and read consistently within this
      // parent's own generated code — see `importAliases`'s docstring), but
      // its TYPE is a real Go type only the child's own file defines, under
      // the child's DECLARED name.
      lines.push(`\t${child.fieldName} ${this.resolveChildName(child.name)}Props \`json:"-"\``)
    }

    // Top-level intrinsic-element spreads: each gets a `Spread_<slotId>
    // map[string]any` field the template reads via `{{bf_spread_attrs}}`.
    // Loop-internal spreads emit inline and don't appear here. SSR-only —
    // the resolved attrs are already baked into the rendered HTML, and no
    // client runtime reads `_p.Spread_<slotId>` back out of `bf-p` (#2672).
    for (const slot of spreadSlots) {
      const jsonTag = '-'
      lines.push(`\t${slot.slotId} map[string]any \`json:"${jsonTag}"\``)
    }

    // Rest-bag field mirroring the Input-side one `generateInputStruct` emits
    // (#2805) — a value routed into it (a jsx-children prop the child only
    // reads via its rest binding, e.g. `rest.header`) needs somewhere to
    // land on the struct the template actually executes against. Never
    // serialised: rest-bag values reach the client through `BfCallerProps`
    // the same way reserved `children` does, not through `bf-p` JSON.
    if (ir.metadata.restPropsName) {
      const fieldName = capitalizeFieldName(ir.metadata.restPropsName)
      lines.push(`\t${fieldName} map[string]any \`json:"-"\``)
    }
  }

  /** Convert a field name to its JSON tag (camelCase). */
  private toJsonTag(name: string): string {
    return name.charAt(0).toLowerCase() + name.slice(1)
  }

  /**
   * Return the concatenated text content of a list of IR nodes when
   * every node is plain text; otherwise null.
   */
  private extractTextChildren(children: IRNode[]): string | null {
    if (children.length === 0) return null
    let out = ''
    for (const child of children) {
      if (child.type !== 'text') return null
      out += (child as { value: string }).value
    }
    return out
  }

  private extractHtmlChildren(children: IRNode[]): string | null {
    if (children.length === 0) return null
    if (children.every(c => c.type === 'text')) return null
    // Speculative: the result is used only when it carries no action, so no
    // row variable read here ever reaches a define (`wrapperRowReads`).
    const html = this.withoutWrapperRowReads(() => this.renderChildren(children))
    if (html.includes('{{')) return null
    return html
  }

  /**
   * Build a Go string-concat expression for hoisted-JSX children whose root
   * carries `needsScope` (`children={<span/>}`). Such roots render in the
   * PARENT's scope, so their `bf-s` is the runtime parent `scopeID`, not a
   * bake-time constant. Render the fragment, swap the parent-scope hydration
   * marker for a sentinel, and splice `scopeID` back in. Returns null when the
   * plain static `childrenHtml` path already applies, or when any other template
   * action survives (genuinely dynamic — those stay on the drop path).
   */
  /**
   * Set only while baking a hoisted children value into a static Go string.
   * `data-key` is a KEYED-LOOP-ROW contract, and a value baked into a
   * caller's props at compile time is by construction not a loop row — so
   * emitting `{{if .BfDataKey}}` there is dead weight. It is also actively
   * harmful: `extractScopedHtmlChildren` rejects any surviving `{{` action
   * as "genuinely dynamic" and returns null, and its caller drops the field
   * without a word, so the baked children silently vanish.
   *
   * `ctx.isRoot` leaks into a JSX-valued prop's subtree, so such a fragment
   * is already tagged `needsScopeComment` as if it were a component root —
   * which is why a relay `element.keyAttr` (#2753; `carriesDataKey` before
   * it) reaches this path at all.
   */
  private bakingStaticChildren = false

  /**
   * Set only while rendering a wrapper-slice loop body component's forwarded
   * children into their companion define (`queueLoopBodyChildrenDefine` with
   * `wrapperRow`). A component nested there renders through the static
   * `.NameSlotN` call-site branch of `renderComponent`, but that field is the
   * single instance the constructor built for every row, so the branch must
   * also re-apply the props that read the row (`loopRowChildPropOverrides`).
   * A render-position flag like `inLoop`, not a record of bound names — which
   * names read the row is still `this.scope`'s answer.
   *
   * Saved and restored around that one define (`queueLoopBodyChildrenDefine`)
   * and deliberately NOT cleared by the companion defines queued while it is
   * set (`queueDynamicChildrenDefine`, `queueDynamicPropDefine`, a Portal's
   * `bfPortalHTML`): each is executed with the calling define's own `.` — the
   * same row wrapper — so a component nested one level further down
   * (`<Mark><Icon tone={o.tone} /></Mark>`) is still the constructor's single
   * shared instance and still needs its row props re-applied
   * (`loop-row-child-children-nested-deep-row-prop`). A define that runs with
   * a different data context resets it itself: an inner loop's row renders
   * under `inLoop` and never reaches the static call-site branch.
   */
  private renderingWrapperRowChildren = false
  /**
   * The innermost enclosing loop's synthetic range variable (`__bf_item0`)
   * when that loop's param is a supported destructure, else null. A
   * wrapper-row forwarded-children define reads destructured names through
   * it (`$__bf_item0.Tone`), but runs as its own template with the row as
   * its data, so it rebinds the variable to `.` (#3313).
   */
  private innermostDestructureRangeVar: string | null = null
  /**
   * While a wrapper-row forwarded-children define renders: the calling
   * loop's index and callback-local variables (`innermostRowVarNames`), which
   * that separate template can't see as `$i`/`$t`. The call site hands them
   * over in the row wrapper's `BfRowVars` map, and every define executed
   * with that wrapper as its data rebinds the ones it reads
   * (`renderWrapperRowDefine`), so a nested prop or text reading them lowers
   * exactly as it does in the calling template. A scalar row's define that
   * reads them gets the wrapper too instead of the bare value
   * (`wrapperRowScalar`). Null otherwise.
   */
  private wrapperRowVars: { names: ReadonlySet<string>; used: Set<string> } | null = null
  /**
   * While a wrapper-row forwarded-children define renders: the calling
   * loop's synthetic destructure range variable (`__bf_item0`), which every
   * define executed with the row wrapper as its data rebinds to `.`
   * (`renderWrapperRowDefine`). Null when the row isn't destructured.
   */
  private wrapperRowDestructureVar: string | null = null
  /**
   * While a wrapper-row forwarded-children define renders: the calling
   * loop's row frame in `scope` — the frame whose bindings (index, callback
   * locals, destructured names) the define has to rebind when it reads them.
   * Null otherwise.
   */
  private wrapperRowFrame: ScopeFrame | null = null
  /**
   * The names of `wrapperRowFrame`'s bindings the define currently being
   * rendered (`renderWrapperRowDefine`) lowered to a `{{range}}`/preamble
   * variable — recorded by `noteWrapperRowRead` at the point the lowering
   * resolves the identifier, so which variables to rebind is read off the
   * scope resolution, never off the rendered text. Null outside such a
   * define, and while rendering output that is discarded or lands outside
   * it (`extractHtmlChildren`'s speculative render).
   */
  private wrapperRowReads: Set<string> | null = null
  /** Per wrapper-row forwarded-children define: the row variables it (or a define it calls) reads. */
  private wrapperRowVarsByDefine = new Map<string, readonly string[]>()

  private extractScopedHtmlChildren(children: IRNode[]): string | null {
    if (children.length === 0) return null
    if (children.every(c => c.type === 'text')) return null
    const prevBaking = this.bakingStaticChildren
    this.bakingStaticChildren = true
    let html: string
    try {
      // Speculative, like `extractHtmlChildren`'s render.
      html = this.withoutWrapperRowReads(() => this.renderChildren(children))
    } finally {
      this.bakingStaticChildren = prevBaking
    }
    // The needsScope marker renders parent-scope hydration attrs; in a
    // hoisted fragment every needsScope root resolves to the parent scopeID,
    // so collapse the whole marker to a bare `bf-s` sentinel (the empty
    // bf-h / bf-m attrs are dropped — same shape the client emits).
    const marker = this.renderScopeMarker('.ScopeID')
    const withSentinel = html
      .split(marker)
      .join(`bf-s="${GoTemplateAdapter.SCOPE_SENTINEL}"`)
    // No sentinel → no needsScope root → the static childrenHtml path covers it.
    if (!withSentinel.includes(GoTemplateAdapter.SCOPE_SENTINEL)) return null
    // Any surviving action means the fragment is genuinely dynamic.
    if (withSentinel.includes('{{')) return null
    return withSentinel
      .split(GoTemplateAdapter.SCOPE_SENTINEL)
      .map(seg => JSON.stringify(seg))
      .join(' + scopeID + ')
  }

  /**
   * Extend the active provider-context map with one `<Ctx.Provider value>`. A
   * string/number/boolean literal value is lowered to a Go literal. An
   * OBJECT-LITERAL value (#2087's chart shape — `value={{ config: props.config
   * ?? {} }}`) lowers to a `map[string]interface{}` Go expression via
   * `providerObjectValueToGoMap` when every member is a supported shape; any
   * other shape (including a partially-supported object literal) is skipped —
   * the descendant consumer keeps its `createContext` default, unchanged from
   * before this method understood objects at all.
   */
  private extendProviderContext(
    current: ReadonlyMap<string, string>,
    p: IRProvider,
    propsParams: ReadonlyArray<{ name: string }>,
  ): ReadonlyMap<string, string> {
    const v = p.valueProp?.value as
      | { kind?: string; value?: unknown; parsed?: ParsedExpr }
      | undefined
    if (!v) return current
    if (v.kind === 'literal') {
      let goLit: string | null = null
      if (typeof v.value === 'string') goLit = `"${escapeGoString(v.value)}"`
      else if (typeof v.value === 'number' || typeof v.value === 'boolean') goLit = String(v.value)
      if (goLit === null) return current
      const next = new Map(current)
      next.set(p.contextName, goLit)
      return next
    }
    if (v.kind === 'expression' && v.parsed) {
      const goMap = this.providerObjectValueToGoMap(v.parsed, propsParams)
      if (goMap !== null) {
        const next = new Map(current)
        next.set(p.contextName, goMap)
        return next
      }
    }
    return current
  }

  /**
   * Lower a `<Ctx.Provider value={{ … }}>` object literal to a Go
   * `map[string]interface{}{…}` expression, for binding into a static child's
   * context-consumer field (`emitStaticChildInstances`). Keys keep their
   * SOURCE (JS-cased) names — the consumer reads them back via `bf_get`
   * (`member()`), which is case-tolerant (`getFieldValue`, bf.go), so casing
   * doesn't have to match a capitalized Go field.
   *
   * Every member must lower through `lowerProviderMapMemberValue` for the
   * WHOLE object to lower — a single unsupported member (a getter, a
   * function, an expression outside the narrow surface below) fails the
   * whole value and returns `null`, exactly like the pre-#2087 refusal (the
   * consumer then keeps its `createContext` default).
   */
  private providerObjectValueToGoMap(
    parsed: ParsedExpr,
    propsParams: ReadonlyArray<{ name: string }>,
  ): string | null {
    if (parsed.kind !== 'object-literal') return null
    const entries: string[] = []
    for (const prop of parsed.properties) {
      // A spread (`{ ...t }`, #2696 Step 2) isn't a per-key member this Go
      // struct-literal lowering can express — fail the whole value, same as
      // any other unsupported member (the consumer keeps its default).
      if (prop.kind === 'spread') return null
      if (prop.shorthand) return null
      const goVal = this.lowerProviderMapMemberValue(prop.value, propsParams)
      if (goVal === null) return null
      entries.push(`${JSON.stringify(prop.key)}: ${goVal}`)
    }
    if (entries.length === 0) return null
    return `map[string]interface{}{${entries.join(', ')}}`
  }

  /**
   * Lower one member VALUE of a provider object literal to a Go expression.
   * Supports:
   *   - a pure literal / nested literal array-or-object (same machinery
   *     `objectLiteralToGoMap` uses for an inline object passed to a child's
   *     optional object prop);
   *   - `props.<X> ?? {}` (#2087's exact chart shape) — an optional prop with
   *     an empty-object fallback. The referenced prop's OWN Go field is
   *     `interface{}` (a `Record<string, X>` type-alias prop never becomes a
   *     named Go struct — see `typeInfoToGo`'s `interface` case — so it can't
   *     be typed `map[string]interface{}` without risking an unrelated
   *     `ui/compat.lock.json` diff across every other `interface{}`-typed
   *     prop). Recovering the caller-supplied map goes through the runtime's
   *     `bf.AsMap` normalizer rather than a bare
   *     `.(map[string]interface{})` type assertion: an `interface{}` field
   *     can legally hold ANY string-keyed map kind — a Go handler modelling
   *     `Record<string, string>` naturally passes `map[string]string` — and
   *     the single-type assertion would silently drop those values (#2111
   *     review). `bf.AsMap` returns nil for nil / typed-nil / non-map
   *     values, so the emitted fallback still lands on a real, empty map,
   *     matching JS `??`'s "assign the real value when present, else `{}`"
   *     semantics.
   * Anything else (a getter/callback member, an unresolvable expression)
   * returns `null`, failing the WHOLE containing object (see
   * `providerObjectValueToGoMap`).
   */
  private lowerProviderMapMemberValue(
    node: ParsedExpr,
    propsParams: ReadonlyArray<{ name: string; sourceName?: string }>,
  ): string | null {
    if (node.kind === 'object-literal') return objectLiteralToGoMap(this.emitCtx, node)
    const literal = parsedLiteralToGo(this.emitCtx, node)
    if (literal !== null) return literal
    if (
      node.kind === 'logical' &&
      node.op === '??' &&
      node.right.kind === 'object-literal' &&
      node.right.properties.length === 0 &&
      node.left.kind === 'member' &&
      !node.left.computed &&
      node.left.object.kind === 'identifier' &&
      node.left.object.name === this.state.propsObjectName
    ) {
      // Bound to a local so the narrowed `member` shape survives into the
      // closure below — TS drops property-path narrowing (`node.left.kind
      // === 'member'`) across a nested arrow function boundary.
      const propName = node.left.property
      const matchedParam = propsParams.find(param => param.name === propName)
      if (matchedParam) {
        // `sourceName ?? name`: the Input struct's field is caller-facing
        // (#2525). A `props.<key>` member read (this function's shape) has
        // no destructure aliasing to begin with — `key` IS the caller-facing
        // name — but resolving through the matched param keeps this in step
        // with every other `in.<field>` read in the file rather than
        // re-deriving the assumption locally.
        const fieldRef = `in.${capitalizeFieldName(matchedParam.sourceName ?? matchedParam.name)}`
        return (
          `func() map[string]interface{} { ` +
          `if m := bf.AsMap(${fieldRef}); m != nil { return m }; ` +
          `return map[string]interface{}{} }()`
        )
      }
    }
    return null
  }

  private resolveDynamicPropValue(
    expr: string,
    signals: { getter: string; setter: string | null; initialValue: JsSourceText; type: TypeInfo; parsed?: ParsedExpr }[],
    memos: { name: string; computation: JsSourceText; deps: string[] }[],
    propsParams: { name: string; sourceName?: string }[],
    propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
    /** The destination child Input field is nillable `interface{}` (#3323). */
    nillableDest = false,
  ): string | null {
    // A unary-not wrapping any shape this function otherwise resolves
    // (`!value()`, `!open()`, `!props.v`, `!label` — #3174) — recurse on the
    // negated operand and wrap the result in `bf.Truthy`, which is what the
    // ternary-test lowering above already uses for the identical "coerce a
    // constructor-time value to bool" question. A bare Go `!` only compiles
    // for an already-bool operand, so it silently fails to build (or was
    // simply never reached) for `!value()` over a STRING-typed signal field
    // — `bf.Truthy` mirrors the runtime's own JS-truthiness coercion instead
    // (empty string / zero / false / nil → falsy, same as JS). A literal
    // `true`/`false` result is inverted directly rather than wrapped, so the
    // emitted Go stays a plain boolean literal instead of an unnecessary
    // `bf.Truthy(true)` call.
    if (expr.startsWith('!')) {
      const negatedGo = this.resolveDynamicPropValue(
        expr.slice(1).trim(),
        signals,
        memos,
        propsParams,
        propFallbackVars,
      )
      if (negatedGo === null) return null
      if (negatedGo === 'true') return 'false'
      if (negatedGo === 'false') return 'true'
      return `!bf.Truthy(${negatedGo})`
    }

    // `getter() === 'lit'` / `!==` as a child-instance prop value
    // (`open={openItem() === 'item-1'}`): resolves to a Go bool when the
    // signal's initial value is a string literal.
    const cmpMatch = expr.match(
      /^(\w+)\(\)\s*([!=]==?)\s*(?:'([^']*)'|(-?\d+(?:\.\d+)?))\s*$/,
    )
    if (cmpMatch) {
      const [, depName, op, strLit, numLit] = cmpMatch
      const signal = signals.find(sg => sg.getter === depName)
      const init = signal?.initialValue.trim()
      const initMatch = init !== undefined
        ? /^(?:'([^'\\]*)'|(-?\d+(?:\.\d+)?))$/.exec(init)
        : null
      if (initMatch) {
        const initVal = initMatch[1] ?? initMatch[2]
        const litVal = strLit ?? numLit
        // Same-kind comparison only (string vs string, number vs number).
        const sameKind = (initMatch[1] !== undefined) === (strLit !== undefined)
        if (sameKind) {
          const equal = initVal === litVal
          return String(op.startsWith('!') ? !equal : equal)
        }
      }
    }

    // Signal/memo getter calls (`count()`, `doubled()`).
    const getterMatch = expr.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\(\)$/)
    if (getterMatch) {
      const resolved = resolveLocalGetterAsGo(this.emitCtx, getterMatch[1], signals, memos, propsParams, propFallbackVars, nillableDest)
      if (resolved !== null) return resolved
      // Neither a signal nor a memo (some other zero-arg call) — fall
      // through to the passthrough checks below, same as before.
    }

    // A bare passthrough of the CALLER's own prop — `text={props.label}`
    // forwarding into a nested child-component invocation (or the
    // destructured form, `text={label}`) — #2168 grandchild-composition: a
    // prop re-forwarded through a second component layer matched neither
    // pattern above (not a getter call, not a literal — that's `case
    // 'literal'` above this function entirely) and fell through to `null`,
    // silently OMITTING the field so Go's zero value applied instead of the
    // threaded value. Only an EXACT `props.<name>` / bare `<name>` — no `??`
    // /`||` suffix — qualifies; a fallback-bearing expression isn't a pure
    // passthrough and must keep falling through to `null` rather than
    // silently dropping the fallback.
    //
    // Guarded against a LOCAL const/helper shadowing a propsParam's name
    // (`const label = compute(); ... text={label}` inside a component whose
    // OWN prop is also called `label`) — that bare `label` means the local,
    // not the prop, and must keep falling through to `null` rather than
    // being misresolved to `in.Label`.
    const propsObjectName = this.state.propsObjectName
    // `$` is a valid JS/TS identifier character (Copilot review, #2198) —
    // without it, a passthrough like `text={$label}` or `text={props.$label}`
    // never matches either shape below and silently falls through to `null`.
    const identifierPattern = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/
    const bareIdentifier = identifierPattern.test(expr) ? expr : null
    // #2925: a BARE (uncalled) local getter handed to a child prop
    // (`value={count}`) — the child calls it at its OWN render time, which at
    // SSR IS the constructor-time seed: the same value the CALLED form
    // (`count()`, handled above) already bakes. Checked before the
    // passthrough section below: a signal/memo getter name can never
    // coincide with a propsParam name in valid source (both are bindings in
    // the same scope), so ordering between the two is unobservable — this
    // just mirrors the called form's getter-before-passthrough order. A bare
    // SETTER (`update={setCount}`) matches neither a signal getter nor a memo
    // name, falls through unresolved, and stays omitted exactly as before
    // this fix.
    if (bareIdentifier !== null) {
      const resolved = resolveLocalGetterAsGo(this.emitCtx, bareIdentifier, signals, memos, propsParams, propFallbackVars, nillableDest)
      if (resolved !== null) return resolved
    }
    // Plain prefix/suffix check rather than an `expr`-interpolated `RegExp`:
    // `propsObjectName` is an arbitrary identifier and could itself contain
    // regex metacharacters (e.g. `$props`), which would silently build a
    // malformed pattern instead of erroring.
    const barePropAccess =
      propsObjectName &&
      expr.startsWith(`${propsObjectName}.`) &&
      identifierPattern.test(expr.slice(propsObjectName.length + 1))
        ? expr.slice(propsObjectName.length + 1)
        : null
    const passthroughName = bareIdentifier ?? barePropAccess
    // A `localConstants` entry sharing this name is a genuine SHADOW only
    // when it's an independent local — NOT when it's the analyzer's own
    // body-level destructure alias (`const { label } = props`, expanded to
    // a `localConstants` entry named `label` valued exactly `props.label`,
    // #1138/analyzer.ts `collectConstant`). That alias IS the same prop
    // value, so a bare `label` reference is still a pure passthrough
    // (Copilot review, #2198 — the earlier blanket "any `localConstants`
    // match blocks it" check wrongly reintroduced the omitted-field bug for
    // exactly this common destructured-body pattern). A `?? default`-bearing
    // alias value does NOT match the exact-string check below, so it's
    // correctly still treated as a shadow (a fallback-bearing local isn't a
    // pure passthrough either — same reasoning as the outer `??`/`||` guard
    // above).
    const localConst = this.state.localConstants.find(c => c.name === passthroughName)
    const isPropsDestructureAlias =
      localConst !== undefined &&
      propsObjectName !== null &&
      localConst.value === `${propsObjectName}.${passthroughName}`
    const shadowedByLocal =
      passthroughName !== null &&
      ((localConst !== undefined && !isPropsDestructureAlias) ||
        this.state.localHelperNames.has(passthroughName))
    const passthroughParam =
      passthroughName && !shadowedByLocal
        ? propsParams.find(p => p.name === passthroughName)
        : undefined
    if (passthroughParam) {
      // Input field is caller-facing (#2525); `passthroughName` is the LOCAL
      // binding (`bareIdentifier`) or the `props.<key>` source key
      // (`barePropAccess`, never aliased) — resolve through the matched
      // param rather than assuming the two coincide.
      return `in.${capitalizeFieldName(passthroughParam.sourceName ?? passthroughParam.name)}`
    }

    return null
  }

  /**
   * Match a signal's or memo's parsed value of the form `props.X ?? <literal>`
   * — or, for destructured components, `x ?? <literal>` — into the source
   * prop name and the Go-formatted fallback. Returns null when there is no
   * tree, the tree isn't that shape, or the fallback isn't a literal
   * `goPropDefault` can translate. A bare identifier can shadow a same-named
   * prop (loop/callback params — the `collectNullishConsumedPropNames`
   * limitation class), so every caller validates the returned name against
   * `ir.metadata.propsParams`.
   *
   * Keeps the original prop reference (not just the resolved value) so
   * caller-supplied non-zero inputs are honoured.
   */
  private extractPropFallbackFromParsed(
    preParsed: ParsedExpr | undefined,
  ): { propName: string; goFallback: string } | null {
    if (!preParsed || preParsed.kind !== 'logical' || preParsed.op !== '??') return null
    const left = preParsed.left
    const propName =
      left.kind === 'identifier' && !this.state.propsObjectName
        ? left.name
        : left.kind === 'member' &&
            !left.computed &&
            left.object.kind === 'identifier' &&
            left.object.name === this.state.propsObjectName
          ? left.property
          : null
    if (!propName) return null
    // A negative fallback (`?? -1`) parses as unary minus around a number
    // literal, not a literal.
    let right = preParsed.right
    let negate = ''
    if (right.kind === 'unary' && right.op === '-') {
      negate = '-'
      right = right.argument
    }
    if (right.kind !== 'literal') return null
    if (negate && right.literalType !== 'number') return null
    // A string fallback is already the decoded value — quote it directly;
    // routing it through `goPropDefault` would strip JSON.stringify's outer
    // quotes and escape the body a second time (`"` → `\\\"`).
    if (right.literalType === 'string') {
      return { propName, goFallback: JSON.stringify(right.value) }
    }
    // Numbers keep their source spelling when available (`raw` is only
    // populated for numbers); booleans/null stringify losslessly.
    const goFallback = goPropDefault(negate + (right.raw ?? String(right.value)))
    if (goFallback === null) return null
    return { propName, goFallback }
  }

  /**
   * #2683: match a signal's collision-derivation shape — `(props.X ?? <lit>)
   * <op> <int>` — the ONE non-idempotent shape this adapter faithfully lowers
   * when a signal's Go field name collides with its own prop's field (see the
   * collision-override loop in `collectPropFallbackVars` / the props-field
   * loop in `generateNewPropsFunction`). Composes two ALREADY-EXISTING
   * lowerings instead of adding a third: `extractPropFallbackFromParsed`
   * recognizes the embedded `props.X ?? <lit>` presence check exactly as it
   * does for the idempotent fold, and the wrap mirrors the SAME `<ref> <op>
   * <int>` arithmetic shape `memoInitialFromParsedBody`'s multiply-family
   * branch already supports for a bare `props.X <op> N` (non-negative
   * integer operand only, matching that branch's own restriction).
   *
   * Returns null for any other shape — the caller then keeps today's
   * raw-passthrough behavior (sound-or-loud; the remaining #2683 pin, if
   * any, covers whatever this doesn't reach).
   */
  private extractCollisionDerivation(
    parsed: ParsedExpr | undefined,
  ): { propName: string; goFallback: string; operator: string; operand: string } | null {
    if (!parsed || parsed.kind !== 'binary') return null
    if (!['*', '+', '-', '/'].includes(parsed.op)) return null
    const { right } = parsed
    if (
      right.kind !== 'literal' ||
      right.literalType !== 'number' ||
      typeof right.value !== 'number' ||
      !Number.isInteger(right.value) ||
      right.value < 0
    ) {
      return null
    }
    // Constant division by zero is a Go COMPILE error (`invalid operation:
    // division by zero`), unlike JS's Infinity — declining keeps that shape
    // on the raw-passthrough path instead of breaking the build.
    if (parsed.op === '/' && right.value === 0) return null
    // The `??` fallback itself must be a NUMERIC literal before delegating
    // to the fold: `extractPropFallbackFromParsed` happily matches a string
    // fallback (`(props.label ?? 'x') + 2`), which would hoist
    // `var label string = "x"` and emit `Label: label + 2,` — invalid Go
    // (string + int), a compile break where the pre-existing behavior at
    // least built (Copilot review on #2694). JS's `'x' + 2` is string
    // concatenation besides, so a numeric compose could never be faithful
    // for it — the shape belongs on the raw-passthrough path until someone
    // lowers it through ConcatStr deliberately. Gating on `??` (not `||`)
    // also keeps JS nullish semantics exact for numeric props, where a
    // caller's explicit `0` must NOT trigger the fallback.
    const coalesce = parsed.left
    if (
      coalesce.kind !== 'logical' ||
      coalesce.op !== '??' ||
      coalesce.right.kind !== 'literal' ||
      coalesce.right.literalType !== 'number'
    ) {
      return null
    }
    const inner = this.extractPropFallbackFromParsed(parsed.left)
    if (!inner) return null
    return { ...inner, operator: parsed.op, operand: String(right.value) }
  }

  /** {@link GoEmitContext.computedSignalSeed}. */
  private computedSignalSeed(
    signal: { getter: string; type: TypeInfo; initialValue: JsSourceText; parsed?: ParsedExpr },
    propsParams: readonly { name: string; sourceName?: string; type?: TypeInfo; defaultValue?: string }[],
    propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
    concreteDest = false,
  ): string | null {
    // The seed plan's form, which reads through local consts and helper calls (#3562).
    const parsed = resolveSignalParsedThroughSeedPlan(this.state, signal)
    const computed = computedPropSeedGo(this.emitCtx, parsed, [...propsParams], propFallbackVars)
    if (computed === null) return null
    const propsParamMap = new Map(this.state.currentPropsParams.map(p => [p.name, p]))
    return evaluatedAsGoType(computed, signalFieldGoType(this.emitCtx, signal, propsParamMap, concreteDest))
  }

  /**
   * Public entry point for node rendering. Delegates to the shared
   * `IRNodeEmitter` dispatcher; per-kind logic lives in the `IRNodeEmitter`
   * methods below.
   */
  renderNode(node: IRNode, ctx?: GoRenderCtx): string {
    return emitIRNode<GoRenderCtx>(node, this, ctx ?? {})
  }

  // ===========================================================================
  // IRNodeEmitter implementation (Go templates)
  // ===========================================================================

  emitElement(node: IRElement, _ctx: GoRenderCtx, _emit: EmitIRNode<GoRenderCtx>): string {
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

  emitConditional(node: IRConditional, _ctx: GoRenderCtx, _emit: EmitIRNode<GoRenderCtx>): string {
    return this.renderConditional(node)
  }

  emitLoop(node: IRLoop, _ctx: GoRenderCtx, _emit: EmitIRNode<GoRenderCtx>): string {
    return this.renderLoop(node)
  }

  emitComponent(node: IRComponent, ctx: GoRenderCtx, _emit: EmitIRNode<GoRenderCtx>): string {
    return this.renderComponent(node, ctx)
  }

  emitFragment(node: IRFragment, _ctx: GoRenderCtx, _emit: EmitIRNode<GoRenderCtx>): string {
    return renderFragmentScope(node, children => this.renderChildren(children), rendered => this.wrapComponentRootScopeComment(rendered))
  }

  emitSlot(node: IRSlot): string {
    return this.renderSlot(node)
  }

  emitIfStatement(node: IRIfStatement, ctx: GoRenderCtx, _emit: EmitIRNode<GoRenderCtx>): string {
    return this.renderIfStatement(node, ctx)
  }

  emitProvider(node: IRProvider, _ctx: GoRenderCtx, _emit: EmitIRNode<GoRenderCtx>): string {
    return this.renderChildren(node.children)
  }

  emitAsync(node: IRAsync, _ctx: GoRenderCtx, _emit: EmitIRNode<GoRenderCtx>): string {
    return this.renderAsync(node)
  }

  renderElement(element: IRElement): string {
    const tag = element.tag
    const attrs = renderElementAttributes(element, this.elementAttrEmitter)
    const dangerousHtml = this.renderDangerousInnerHtml(element)
    const children = dangerousHtml !== null ? dangerousHtml : this.renderChildren(element.children)

    let hydrationAttrs = ''
    if (element.needsScope) {
      hydrationAttrs += ` ${this.renderScopeMarker('.ScopeID')}`
    }
    // #2753: `element.keyAttr` is the ONE IR-resolved decision for this
    // element's row-key attribute — replacing both the `carriesDataKey`
    // boolean and this adapter's own `rootScopeNodes`/`needsScope` check
    // (mechanism 2: a render-root relay, including the #2732 fragment-root
    // case) and the separate `loopKeyDepthStack`-driven rewrite of a literal
    // `key` attribute this adapter used to do in `renderAttributes`
    // (mechanism 1: a `.map()` row root compiled inline here).
    if (element.keyAttr) {
      if (element.keyAttr.value !== undefined) {
        const lowered = emitAttrValue(
          { kind: 'expression', expr: element.keyAttr.value },
          this.elementAttrEmitter,
          element.keyAttr.name,
        )
        if (lowered) hydrationAttrs += ` ${lowered}`
      } else if (!this.bakingStaticChildren) {
        // Relay: this element is one of THIS component's own render roots,
        // carrying whatever key its OWN caller supplies at runtime (the
        // parent's loop init stamped `.BfDataKey`), when this component is
        // itself invoked as a caller's keyed loop row. Applies to
        // early-return (if-statement) roots too, where every branch's top
        // element qualifies, and to #2732's fragment-root case.
        // `bakingStaticChildren` (see its docstring) excludes a hoisted
        // children value baked into a static Go string at compile time —
        // by construction not a loop row, and a surviving `{{if}}` action
        // there gets silently dropped by the caller rather than rendered.
        hydrationAttrs += `{{if .BfDataKey}} data-key="{{.BfDataKey}}"{{end}}`
      }
    }
    if (element.slotId) {
      hydrationAttrs += ` ${this.renderSlotMarker(element.slotId)}`
    }
    // Page-lifecycle boundary lowered from `<Region>` (spec/router.md). The id
    // is a deterministic static string (`<file scope>:<index>`), so it emits as
    // a plain literal attribute — no Go-template interpolation.
    if (element.regionId) {
      hydrationAttrs += ` ${BF_REGION}="${element.regionId}"`
    }
    // #3119: the `ref`-callback SSR-portal pattern (`ssrPortalOwnerScope`,
    // `isSsrPortalRefCallback` in `@barefootjs/jsx`) — the overlay/content
    // pattern the dialog-style primitives use. Stamp `bf-po` directly on
    // this element's own tag, matching exactly what the client
    // `createPortal(el, document.body, { ownerScope })` stamps onto the
    // SAME element at hydrate time (`packages/client/src/runtime/
    // portal.ts`), mirroring the Hono reference adapter
    // (`hono-adapter.ts`'s identical `BF_PORTAL_OWNER` stamp). The element
    // itself is then routed through `.Portals.AddElement` below instead of
    // returned for inline placement, so it renders at the collector's
    // `{{.Portals.Render}}` outlet the app's own layout places near
    // `</body>` — see `wrapSsrPortalElement`'s docstring for why this
    // needs its own runtime path distinct from the explicit `<Portal>`
    // component's `.Portals.Add`.
    //
    // Inside a `{{range}}` (a loop row, #3318), `.` is the row item, so the
    // owner scope is read off the root (`$`) and the element is collected
    // with its row scope (`wrapSsrPortalElement`, #3420).
    const portalOut = element.ssrPortalOwnerScope
    if (portalOut) {
      hydrationAttrs += ` ${BF_PORTAL_OWNER}="{{bfScopeAttr ${this.inLoop ? '$' : '.'}}}"`
    }

    const voidElements = [
      'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
      'link', 'meta', 'param', 'source', 'track', 'wbr',
    ]

    const rendered = voidElements.includes(tag.toLowerCase())
      ? `<${tag}${attrs}${hydrationAttrs}>`
      : `<${tag}${attrs}${hydrationAttrs}>${children}</${tag}>`

    if (portalOut) {
      return this.wrapSsrPortalElement(rendered)
    }
    return rendered
  }

  /**
   * Route an `ssrPortalOwnerScope`-flagged element's ALREADY-RENDERED
   * markup (the `bf-po` attribute already stamped on its own tag) through
   * `.Portals.AddElement` instead of returning it for inline placement
   * (#3119).
   *
   * Mirrors `renderPortalComponent`'s dynamic/static split — `.Add`'s own
   * comment on `PortalCollector` (`runtime/bf.go`) explains why this
   * two-step (collect a STRING, re-execute it as a template at the
   * outlet via `bfPortalHTML`) is the only way to get a value out of
   * `html/template`'s otherwise write-only `{{template}}` action — but
   * calls `.Portals.AddElement`, a SEPARATE accumulator from `.Add`'s
   * `portals`: `.Add` wraps arbitrary `<Portal>` children in its own
   * `bf-pi`/`bf-po` container div (needed because `children` may not be a
   * single element); THIS content is the ONE element the compiler already
   * rendered with `bf-po` on its own tag, matching exactly what the
   * client `createPortal` stamps onto the SAME element at hydrate time —
   * wrapping it in another div would diverge from that. Mirrors Hono's
   * `collectSsrPortalElement` / `BfPortals`'s `elements` array
   * (`packages/adapter-hono/src/portals.tsx`) keeping the same two-list
   * split for the same reason.
   */
  private wrapSsrPortalElement(rendered: string): string {
    if (this.inLoop && rendered.includes('{{')) return this.wrapLoopRowSsrPortalElement(rendered)
    const escaped = escapeGoTemplateString(rendered)
    if (rendered.includes('{{')) {
      return `{{.Portals.AddElement (bfPortalHTML . "${escaped}")}}`
    }
    // Inside a `{{range}}`, `.` is the row; the collector lives on the root.
    return `{{${this.inLoop ? '$' : ''}.Portals.AddElement "${escaped}"}}`
  }

  /**
   * `wrapSsrPortalElement` for an element inside a `{{range}}` (#3420). The
   * element renders at the outlet, away from its row, so it moves into a
   * companion define executed through `bf_tmpl` — which keeps the
   * component template set in reach for nested `{{template}}` calls — with
   * `bf_portal_scope` handing over what the row could see: the define's
   * root (every bare `$` in the element's actions is renamed to
   * `$__bfRoot`), each loop variable the element reads without declaring
   * it (`freeTemplateVars`), and the row as `.` through a one-element
   * `range`, which rebinds `.` even when the row is falsy.
   */
  private wrapLoopRowSsrPortalElement(rendered: string): string {
    const { free, body } = freeTemplateVars(rendered, '__bfRoot')
    const prelude = ['{{$__bfRoot := index . "root"}}', ...free.map(name => `{{$${name} := index . "${name}"}}`)].join('')
    const name = `${this.state.componentName}__portal_${this.state.pendingChildrenDefines.length}`
    this.state.pendingChildrenDefines.push({ name, content: `${prelude}{{range index . "dot"}}${body}{{end}}` })
    const vars = free.map(v => ` "${v}" $${v}`).join('')
    return `{{$.Portals.AddElement (bf_tmpl "${name}" (bf_portal_scope $ .${vars}))}}`
  }


  /**
   * `dangerouslySetInnerHTML={{ __html: '...' }}` (#2207). `null` means the
   * attribute is absent (caller falls through to normal `renderChildren`);
   * a non-`null` string (possibly `''`) replaces the children outright.
   */
  private renderDangerousInnerHtml(element: IRElement): string | null {
    return renderDangerousInnerHtml(element, this.errors, this.name, (valueExpr, valueParsed, loc) => {
      // Lower the `__html` expression and emit it through the `bf_raw_html`
      // runtime helper, which returns a `template.HTML` value so
      // html/template's contextual escaper emits it verbatim (the one raw
      // sink Go lacks as bare syntax).
      const classify: { parsed?: ParsedExpr } = {}
      const goExpr = this.convertExpressionToGo(valueExpr, classify, valueParsed)
      // A `{{…}}`-leading fragment or a template literal (a nested ternary
      // lowered to `{{with}}`, or `` `<b>${x}</b>` `` lowered to mixed
      // literal+action text) can't be passed as a single argument to
      // `bf_raw_html`. Those raw-HTML shapes are out of scope on Go alone —
      // refuse loudly rather than emit broken template source. The
      // conformance fixture (a plain prop) takes the common path below.
      if (this.isTemplateFragment(goExpr, classify.parsed?.kind)) {
        // The `{ __html: … }` shape is fine here — echo the whole object
        // literal (not just the inner value) so the message reads
        // consistently with the other refusal paths, whose `reason` carries
        // the actual cause.
        this.errors.push(
          dangerousInnerHtmlDiagnostic(
            `{ __html: ${valueExpr} }`,
            loc,
            'a template-literal or conditional __html value has no single-argument raw form on the Go adapter',
          ),
        )
        return ''
      }
      return `{{bf_raw_html ${wrapIfMultiToken(goExpr)}}}`
    })
  }

  renderExpression(expr: IRExpression): string {
    // @client: an ordinary claimed 'text' slot pair (slot unification A3,
    // spec/slot-unification.md §5-A3), empty at SSR since the expression
    // can't be evaluated server-side — the client's claim creates the
    // missing Text node on first write (A2's create-if-absent semantics).
    // Replaces the old unpaired `client:sN` comment, which nothing adopted.
    if (expr.clientOnly) {
      // Slot unification Step B: the compiler already proved (once, before
      // this adapter ran — `client-only-elision.ts`) that the claim plan
      // can find/create this slot's Text node from `elidedPath` alone, with
      // no marker to anchor against. SSR always renders empty here either
      // way, so eliding the marker changes nothing but the marker bytes.
      if (expr.markerless) return ''
      if (expr.slotId) {
        return `{{bfTextStart "${expr.slotId}"}}{{bfTextEnd}}`
      }
      return ''
    }

    // Let `convertExpressionToGo` report the `ParsedExpr` it already builds (if
    // it gets that far) so the wrap decision below reuses that single parse —
    // no extra `ts.createSourceFile`, and no parse at all for expressions it
    // resolves via early returns (`null`/`undefined`, inlined consts) on the
    // `bf build` hot path.
    const classify: { parsed?: ParsedExpr } = {}
    const goExpr = this.convertExpressionToGo(expr.expr, classify, expr.parsed)

    // If the lowered expression is already template text, don't wrap it again
    // in {{...}} (double-wrapping). Two distinct shapes reach here:
    //   - whole-expression blocks that START with `{{` (a `{{with ...}}` /
    //     `{{if ...}}` chain from a nested ternary), and
    //   - template literals, which lower via `templateLiteral()` to a MIX of
    //     literal text and actions (` · #${tag}` → ` · #{{.Tag}}`). Those don't
    //     start with `{{`, so a plain `startsWith` test would let them fall
    //     through to the wrap below and produce `{{ · #{{.Tag}}}}` — invalid
    //     `html/template` syntax that panics at parse time.
    //
    // `isTemplateFragment` makes this decision structurally (a `{{`-leading
    // action block or a template-literal kind), not by substring-matching `{{`:
    // a bare string literal that merely CONTAINS `{{` (JSX `{"{{"}` → Go expr
    // `"{{"`) is neither — it must still be wrapped so html/template evaluates
    // and escapes the string instead of emitting the raw quotes.
    // Use comment markers instead of <span> to avoid changing DOM structure.
    if (this.isTemplateFragment(goExpr, classify.parsed?.kind)) {
      if (expr.slotId) {
        return `{{bfTextStart "${expr.slotId}"}}${goExpr}{{bfTextEnd}}`
      }
      return goExpr
    }

    // A bare TEXT-position reference to an optional no-default scalar prop
    // that `resolvePropGoType` flipped to nillable `interface{}` (#2267,
    // `collectTextConsumedPropNames`) needs a nil-safe stringify: plain
    // `{{.X}}` prints a nil `interface{}` as the literal `<no value>`, not
    // "" — `bf_string` (the runtime's nil-safe `String()`) prints "" for
    // nil and uses JS-compatible notation for a present float; other
    // present values retain the existing default printing behavior.
    // A bare `nil` (a `const x = null` read as text) is not a valid action on
    // its own (`nil is not a command`); JS renders a null child as nothing.
    const finalExpr =
      goExpr === 'nil'
        ? '""'
        : this.textNillablePropNameOf(classify.parsed) !== null
          ? `bf_string ${wrapIfMultiToken(goExpr)}`
          : this.numericTextExpression(goExpr, classify.parsed)

    // Mark expressions with slotId using comment nodes for client JS to find.
    // This includes reactive expressions AND loop-param-dependent expressions.
    if (expr.slotId) {
      return `{{bfTextStart "${expr.slotId}"}}{{${finalExpr}}}{{bfTextEnd}}`
    }

    return `{{${finalExpr}}}`
  }

  /**
   * The nillable-prop name a bare TEXT-position expression refers to, or
   * null. Mirrors `nillablePropNameOf` (the `??`-lowering gate) but keys on
   * `textConsumedPropNames` instead of `nullishConsumedPropNames` — a
   * text-only optional scalar prop (`{size}`, never consumed by `??` or a
   * bare omittable attribute) is in neither of those other two sets.
   */
  private textNillablePropNameOf(expr: ParsedExpr | undefined): string | null {
    if (!expr) return null
    let name: string | null = null
    if (expr.kind === 'identifier') {
      name = expr.name
    } else if (
      expr.kind === 'member' &&
      !expr.computed &&
      expr.object.kind === 'identifier' &&
      expr.object.name === this.state.propsObjectName
    ) {
      name = expr.property
    }
    return name !== null &&
      this.state.textConsumedPropNames.has(name) &&
      this.state.nillablePropNames.has(name)
      ? name
      : null
  }

  /**
   * Whether a lowered Go string already carries its own `{{...}}` actions and so
   * must NOT be re-wrapped (`{{ {{...}} }}` is a parse error). Single source of
   * the wrap-or-not decision across the expression / template-literal / attr
   * paths.
   *
   * Structural, deliberately NOT a `{{` substring scan (a Go string literal may
   * contain `{{`). Exactly two shapes are fragments: an action block, which the
   * emitter never prefixes with literal text so it always starts with `{{`; and
   * a template literal, the only form interleaving author text with actions,
   * keyed by its parsed `kind`. The "no non-template-literal fragment starts
   * with literal text" invariant is enforced by the template-fragment tests.
   */
  private isTemplateFragment(go: string, kind?: ParsedExpr['kind']): boolean {
    return go.startsWith('{{') || kind === 'template-literal'
  }

  /**
   * Render a client-only conditional as comment markers (used when @client is
   * applied to an unsupported conditional). The client evaluates the condition
   * via insert().
   */
  private renderClientOnlyConditional(cond: IRConditional): string {
    if (cond.slotId) {
      // Empty markers initially; the client populates them.
      return `{{bfComment "cond-start:${cond.slotId}"}}{{bfComment "cond-end:${cond.slotId}"}}`
    }
    return ''
  }

  /**
   * Render a ParsedExpr to Go template syntax via the shared dispatcher. The
   * per-kind logic lives in the `ParsedExprEmitter` methods below; this is a
   * thin wrapper so existing call sites keep working.
   */
  private renderParsedExpr(expr: ParsedExpr): string {
    return emitParsedExpr(expr, this)
  }

  // ===========================================================================
  // ParsedExprEmitter implementation (Go template syntax)
  // ===========================================================================

  identifier(name: string): string {
    // `undefined` / `null` inside a larger expression tree (a ternary branch
    // like `props.isActive ? 'page' : undefined`) renders as the empty string —
    // the top-level `convertExpressionToGo` short-circuit doesn't see nested
    // ones.
    if (name === 'undefined' || name === 'null') return '""'
    // Module pure-string const (e.g. `const baseClasses = '...'` in a className
    // template literal): inline the literal value rather than emit
    // `{{.BaseClasses}}` against a Props field that never exists.
    // Destructure-param bindings (`.map(({ id, ...rest }) => …)`): resolve the
    // binding name to its accessor on the range var. Innermost loop wins, and
    // this runs *before* module-const inlining so a binding whose name collides
    // with a module string const still resolves to the loop item.
    const acc = this.lookupDestructureBinding(name)
    if (acc !== undefined) return this.noteWrapperRowRead(name, acc)
    const inlined = this.resolveModuleStringConst(name)
    if (inlined !== null) return inlined
    // Literal-initialized const, module or function scope (`const TRACK = 8`,
    // `const OPEN = true`, `const mode = 'on'`): inline the literal rather than
    // emit `{{.TRACK}}` against a Props field that never exists (#3312). Any
    // other module literal the structural resolver bakes (`const val = null`
    // → `nil`) still resolves through it.
    const inlinedScalar =
      this.resolveLiteralConstAsGo(name) ?? this.resolveModuleConstAsGo(name, { kind: 'template-action' })
    if (inlinedScalar !== null) return inlinedScalar
    if (this.isCurrentLoopItem(name)) return this.currentLoopItemRef()
    // An *outer* loop's value variable (we're in a nested loop) is in scope as
    // the Go range variable `$name` declared by that loop's `{{range … := …}}`;
    // the inner dot no longer refers to it, and it's not a root field.
    if (this.isOuterLoopParam(name) || this.loopVarRefCount.has(name)) return this.rowVarRef(name)
    // A bare reference to a component-scope derived const (e.g. `root`) lowers to
    // `.Root`; note it so `generateTypes` emits a computed field.
    if (this.state.localConstants.some(c => c.name === name && !c.isModule && !c.containsArrow)) {
      this.state.referencedDerivedConsts.add(name)
    }
    // Env-signal binding (incl. an alias) → canonical `.SearchParams`.
    return this.searchParamsFieldRef(name) ?? this.rootFieldRef(name)
  }

  /** {@link bakesDerivedConstField} for `ir`, memoized per const name. */
  private derivedConstFieldBaker(ir: ComponentIR): (name: string) => boolean {
    const baked = new Map<string, boolean>()
    return name => {
      if (!baked.has(name)) baked.set(name, this.bakesDerivedConstField(name, ir))
      return baked.get(name) === true
    }
  }

  /**
   * Whether `NewXxxProps` computes the derived string const `name` into its
   * own field (`computeDerivedConstFields`), so the template reads `.Root`
   * instead of the const's initializer (#1945, #3494). A const whose field
   * name a prop, signal or memo field already takes is inlined instead.
   */
  private bakesDerivedConstField(name: string, ir: ComponentIR): boolean {
    if (derivedConstTakenFieldNames(ir).has(capitalizeFieldName(name))) return false
    const c = this.findValuedLocalConst(name)
    if (!c?.value || !c.parsed || c.isModule || c.containsArrow) return false
    if (!this.isStringExpr(c.parsed, new Set())) return false
    const init = lowerCtorExpr(this.emitCtx, c.parsed, { searchParamsVars: new Set(), params: new Map(), consts: new Set([name]) })
    return init !== null
  }

  /**
   * Compute the Go struct fields for component-scope derived string consts
   * referenced by the template (e.g. `root = base || '/'`). Each is lowered to a
   * constructor-context Go expression via `lowerCtorExpr`, with its dependency
   * consts inlined. Skips names that collide with an existing field
   * (`takenFieldNames`) or that the lowerer can't represent.
   */
  private computeDerivedConstFields(
    takenFieldNames: ReadonlySet<string>,
  ): { name: string; init: string }[] {
    const fields: { name: string; init: string }[] = []
    for (const name of this.state.referencedDerivedConsts) {
      const fieldName = capitalizeFieldName(name)
      if (takenFieldNames.has(fieldName)) continue
      const c = this.findValuedLocalConst(name)
      if (!c?.value) continue
      const expr = c.parsed
      if (!expr) continue
      // The field is typed `string`; only emit when the value is provably a Go
      // string, so a numeric/other const referenced in the template can't be
      // assigned into a string field.
      if (!this.isStringExpr(expr, new Set())) continue
      const init = lowerCtorExpr(this.emitCtx, expr, {
        searchParamsVars: new Set(),
        params: new Map(),
        consts: new Set([name]),
      })
      if (init === null) continue
      fields.push({ name: fieldName, init })
    }
    return fields
  }

  /**
   * Conservative check that a JS expression is *definitely* string-valued —
   * used to gate derived-const field emission (the field is typed `string`).
   * Recognizes string/template literals, string-returning methods (`.replace`,
   * `.trim`, … and `searchParams().get`), `+` / `||` / `??` where a branch is
   * string-valued, and a component-const reference to such a value. Anything
   * unproven (numbers, `props.X`, calls it doesn't know) returns false.
   */
  private isStringExpr(node: ParsedExpr, seen: Set<string>): boolean {
    // `+` and `||` / `??` are carried as `binary` / `logical`; the parser
    // resolves template literals with substitutions to `unsupported` (so
    // `parsed` is undefined upstream), and a substitution-free template to a
    // string `literal`.
    if (node.kind === 'literal' && node.literalType === 'string') {
      return true
    }
    if (node.kind === 'binary' && node.op === '+') {
      // `+`: a string on *either* side forces string concatenation.
      return this.isStringExpr(node.left, seen) || this.isStringExpr(node.right, seen)
    }
    if (node.kind === 'logical' && (node.op === '||' || node.op === '??')) {
      // `||` / `??` evaluate to *one* operand, so the result is only provably a
      // string when *both* sides are (`props.count ?? ''` is not — it can be the
      // number).
      return this.isStringExpr(node.left, seen) && this.isStringExpr(node.right, seen)
    }
    // `.get(...)` stays a generic `call`; the string-returning array/string
    // methods (`.replace`, `.trim`, …) fold into `array-method`.
    if (node.kind === 'call' && node.callee.kind === 'member') {
      return STRING_METHODS.has(node.callee.property)
    }
    if (node.kind === 'array-method') {
      // `.replace` (including the structurally-carried regex trailing-slash form,
      // #2039) is in STRING_METHODS, so it's covered here — no special case.
      return STRING_METHODS.has(node.method)
    }
    if (node.kind === 'conditional') {
      return (
        this.isStringExpr(node.consequent, seen) && this.isStringExpr(node.alternate, seen)
      )
    }
    if (node.kind === 'identifier') {
      if (seen.has(node.name)) return false
      const c = this.findValuedLocalConst(node.name)
      if (c?.value) {
        const inner = c.parsed
        if (inner) return this.isStringExpr(inner, new Set([...seen, node.name]))
      }
    }
    return false
  }

  /**
   * True when `name` is bound as the CURRENT (innermost) loop row's own
   * plain `.map()` item param — i.e. it resolves to Go template's dot
   * context (`.`), not a `$name` range variable or a root field. `depth 0`
   * is `scope`'s innermost frame; `source === 'item'` excludes a
   * destructured binding (source `'destructure'`, resolved through
   * `loopBindingStack` instead — see `scope`'s field docstring) and a
   * `.keys()`-shape loop's key param (never bound as `'item'` at all —
   * `renderLoop` enters that shape's scope with an overridden empty param).
   */
  private isCurrentLoopItem(name: string): boolean {
    const hit = this.scope.lookup(name)
    return hit !== null && hit.depth === 0 && hit.binding.source === 'item'
  }

  /** The current row value (`isCurrentLoopItem`): `.`, or `.BfLoopItem` on a scalar wrapper row's call site. */
  private currentLoopItemRef(): string {
    return this.scalarWrapperRowCallSite ? `.${SCALAR_ROW_ITEM_FIELD}` : '.'
  }

  /**
   * `name` is the current row (`isCurrentLoopItem`) and its fields are fields
   * of `.` (`row.label` → `.Label`). Not on a scalar wrapper row's call site:
   * `.` is the wrapper and the row is a bare value on `.BfLoopItem`, so a
   * member read (`g.length`) goes through the generic path over
   * `currentLoopItemRef` (`bf_length .BfLoopItem`). Nor on a plain row whose
   * value is a scalar (`isFieldlessRowType` of the row's type): `.` is the
   * value itself, so `g.length` reads `bf_length .`.
   */
  private isCurrentLoopRecord(name: string): boolean {
    return this.isCurrentLoopItem(name) && !this.scalarWrapperRowCallSite && !this.isScalarRowItem(name)
  }

  /** `name` is a loop row's own item (any depth) whose value is a scalar (`isFieldlessRowType`). */
  private isScalarRowItem(name: string): boolean {
    const hit = this.scope.lookup(name)
    return hit?.binding.source === 'item' && isFieldlessRowType(hit.binding.row?.itemType)
  }

  /**
   * The function a condition's `.length` read lowers to. `len` counts a
   * string's bytes; `bf_length` counts its UTF-16 code units as JS does and
   * reads nil as 0. Only a receiver whose declared type is an array
   * (`isKnownArray`) keeps `len`, whose element count is the same answer.
   * A string (a prop, a signal, a memo, a local, a scalar row), a receiver
   * of unknown type and a `?.length` receiver, which can be nil, take
   * `bf_length` (#3609).
   */
  private conditionLengthFn(expr: Extract<ParsedExpr, { kind: 'member' }>): 'len' | 'bf_length' {
    if (expr.optional) return 'bf_length'
    return isKnownArray(this.emitCtx, expr.object, this.scope) ? 'len' : 'bf_length'
  }

  /**
   * True when `name` is a loop value variable from an enclosing (not the
   * current) loop — i.e. it's bound in `scope` as an OUTER frame's own
   * plain item param (`depth > 0`, source `'item'`). Such a reference
   * resolves to the Go range variable `$name`, not the inner dot or the
   * root data.
   */
  /** True when `name` is bound in `scope` as any enclosing row's plain item
   * param, which renders as its `$name` range variable inside a nested
   * `{{range}}` such as a filtered loop's predicate (#3396). */
  private isOuterRowItem(name: string): boolean {
    return this.scope.lookup(name)?.binding.source === 'item'
  }

  private isOuterLoopParam(name: string): boolean {
    const hit = this.scope.lookup(name)
    return hit !== null && hit.depth > 0 && hit.binding.source === 'item'
  }

  /**
   * The root field of the nillable prop `propName` names, for the
   * `{{if ne .X nil}}` attribute-omission guard, or null when it is not a
   * nillable prop. It is the same field the attribute's value reads: a bare
   * local through `rootFieldRef`'s alias resolution (`{ label: children }`
   * reads `Label`, not the children payload's `Children`), a props-object
   * key (`viaPropsObject`) through `propKeyFieldRef`. A bare name a loop row
   * binds (`rows.map(children => <li key={children}>)`) is the row value,
   * not the prop (#3572).
   */
  private nillablePropFieldRef(propName: string, viaPropsObject: boolean): string | null {
    if (!this.state.nillablePropNames.has(propName)) return null
    if (viaPropsObject) {
      // A loop row or callback binding of the props object's name shadows
      // it (#3693): `props.<key>` reads that binding's member.
      if (this.state.propsObjectName !== null && this.scope.isBound(this.state.propsObjectName)) return null
      return this.propKeyFieldRef(propName)
    }
    if (this.scope.lookup(propName) !== null) return null
    return this.rootFieldRef(propName)
  }

  /**
   * Root field reference for a read of the props object's own key
   * (`props.<key>`): the field the prop with that caller-facing key is held
   * in (`CompileState.propKeyFields`), not a local alias of the same name.
   */
  private propKeyFieldRef(key: string): string {
    this.state.templateReadRootFields.add(key)
    const prefix = this.inLoop ? '$.' : '.'
    return `${prefix}${this.state.propKeyFields.get(key) ?? capitalizeFieldName(key)}`
  }

  /**
   * A reference to a root-scope field — a signal, a prop, or a derived value
   * that lives on the component's top-level data struct. Inside a `{{range}}`
   * the dot is rebound to the iteration element, so root data must be reached
   * through Go template's `$` (the top-level argument to Execute), which never
   * rebinds. Outside any loop the root *is* the dot, so we emit `.Field`.
   */
  private rootFieldRef(name: string): string {
    const resolved = this.resolveRootFieldAlias(name)
    this.state.templateReadRootFields.add(resolved)
    const prefix = this.inLoop ? '$.' : '.'
    return `${prefix}${capitalizeFieldName(resolved)}`
  }

  /**
   * #2813 / #2788: `name` may be a bare local-const alias of a signal/memo
   * getter (`const items__alias = items`) or a bare-props-form body
   * destructure's renamed prop (`const { children: kids } = props`) —
   * resolve it to the ALIASED entity's own name, so a caller that needs to
   * build its own prefixed field reference (e.g. `renderFilterExprNode`,
   * which must hardcode `$.` regardless of `rootFieldRef`'s
   * `this.inLoop`-conditional prefix — #2857) still lands on the field that
   * entity itself seeds (`.Items`, `.Children`) instead of a never-populated
   * field under the local alias (`.Items__alias`, `.Kids`). `rootFieldRef`
   * itself is built on top of this so there is exactly one resolution.
   */
  private resolveRootFieldAlias(name: string): string {
    return this.state.getterAliases.get(name) ?? this.state.propDestructureAliases.get(name) ?? name
  }

  /**
   * Root-scope field reference from INSIDE a `.filter()`/`.find()` predicate
   * (#2857, #2879). Same registration + alias resolution as `rootFieldRef`,
   * but the `$.` prefix is unconditional: a filter predicate's `{{if}}`
   * always sits inside its loop's own `{{range}}` (`renderLoop` restores
   * `this.inLoop` before rendering it), so a bare `.Field` would resolve
   * against the current row's type instead of root.
   */
  private filterRootFieldRef(name: string): string {
    this.rootFieldRef(name)
    return `$.${capitalizeFieldName(this.resolveRootFieldAlias(name))}`
  }

  /**
   * When `name` is a local binding of the `searchParams()` env signal, resolve
   * it to the canonical `.SearchParams` field — not `.<Capitalized name>` — so
   * an aliased `import { searchParams as sp }` (`sp()`) reaches the same struct
   * field the generator emits. Returns null for any other name so callers fall
   * back to their normal field-ref lowering.
   */
  private searchParamsFieldRef(name: string): string | null {
    return this.state.searchParamsLocals.has(name) ? this.rootFieldRef('searchParams') : null
  }

  /**
   * Build the module pure-string-const map from the IR's localConstants.
   * A const qualifies only when it is module-scope (`isModule`) and its
   * initializer parses to a single string literal (`ts.StringLiteral` or
   * `ts.NoSubstitutionTemplateLiteral` — a backtick string with no `${}`).
   * Template literals *with* interpolations, numeric/object initializers,
   * `Record<T,string>` maps, memos, and signals are all excluded: only a
   * pure compile-time string can be safely inlined byte-for-byte.
   */
  private collectModuleStringConsts(constants: IRMetadata['localConstants']): Map<string, string> {
    // Single source of truth shared with the Mojo / Xslate adapters (fixed-point
    // resolution incl. composed template-literal consts and `[...].join(sep)`).
    return collectModuleStringConstsShared(constants)
  }



  /**
   * Resolve an identifier to its inlined Go string literal when it names a
   * module pure-string const. Returns the Go template literal form
   * (`"<escaped>"`) so callers can drop it straight into a `{{...}}` action, or
   * `null` when the name is not such a const (the caller then falls back to its
   * normal field-ref lowering). The value is escaped for a Go double-quoted
   * string literal; `html/template` then applies its usual contextual
   * auto-escaping.
   */
  private resolveModuleStringConst(name: string): string | null {
    if (this.isCurrentLoopItem(name)) return null
    if (this.loopVarRefCount.has(name)) return null
    if (this.isOuterLoopParam(name)) return null
    const value = this.state.moduleStringConsts.get(name)
    if (value === undefined) return null
    return `"${escapeGoString(value)}"`
  }

  /**
   * A bare identifier bound to a literal-initialized const — module or
   * component-function scope — as a Go template literal (`true`, `8`,
   * `"on"`), or null. The decision is the shared `lookupLiteralConst` every
   * template-string adapter uses (#3312); a name a loop binds at this point
   * resolves to the row instead.
   */
  private resolveLiteralConstAsGo(name: string): string | null {
    const lit = lookupLiteralConst(
      name,
      this.state.localConstants,
      n => this.isCurrentLoopItem(n) || this.loopVarRefCount.has(n) || this.isOuterLoopParam(n),
    )
    if (lit === null) return null
    // A decoded string value can hold a newline or other control character,
    // which a Go template string literal must carry escaped; JSON's escapes
    // are a subset of Go's interpreted-string escapes.
    if (lit.kind === 'null') return 'nil'
    return lit.kind === 'string' ? JSON.stringify(lit.text) : lit.text
  }

  /**
   * The single module-const lookup shared by `resolveModuleConstAsGo` —
   * kept as its own method (rather than inlined) so a second `.find(` isn't
   * added elsewhere, growing `binding-scope-ratchet.test.ts`'s shrink-only
   * floor for this file (already at 5).
   */
  private findModuleConst(name: string): ConstantInfo | undefined {
    return this.state.localConstants.find(
      (k) => k.name === name && k.isModule && !k.containsArrow,
    )
  }

  /**
   * Resolve a bare identifier naming a plain module-level const (`const
   * TRACK = 8`, `const OPEN = true`, `const INITIAL: Row[] = [...]`, #2794 /
   * #2815 / #2862) to its value's Go literal — dispatched STRUCTURALLY off
   * `ConstantInfo.parsed`, through the same `parsedLiteralToGo` door an
   * inline `createSignal([...])`/`createSignal({...})` seed already takes,
   * rather than a separate per-type text-matching resolver for each literal
   * shape (the numeric/boolean resolvers this replaces, and the array/
   * object-literal gap #2862 tracked, were exactly that repeated pattern).
   * `resolveModuleStringConst` stays separate: its fixed-point text
   * resolution also covers a COMPOSED template-literal const (`` `${A}-${B}`
   * ``) that has no single structural literal to bake.
   *
   * `target` names the emission position, which constrains what can resolve
   * there:
   *   - `go-source` (the `New<Component>Props` constructor) may bake a
   *     composite (array/object) literal against `bakeType` — falling back
   *     to the const's OWN declared type when the consumer's type is
   *     `unknown` (the analyzer's inference is text-shaped and never chases
   *     a bare `createSignal(INITIAL)` seed to its declaration).
   *   - `template-action` (a bare `{{...}}` splice, e.g. a className
   *     expression) has no valid Go template spelling for a composite
   *     literal, so only a scalar (or unary-minus number) resolves there —
   *     the same restriction the numeric/boolean resolvers already had.
   *
   * Scoped to module consts and guarded against loop vars so a range
   * variable that shadows a const name still wins (same guards the
   * resolvers this replaces already had).
   */
  private resolveModuleConstAsGo(
    name: string,
    target: { kind: 'template-action' } | { kind: 'go-source'; bakeType: TypeInfo },
  ): string | null {
    if (this.isCurrentLoopItem(name)) return null
    if (this.loopVarRefCount.has(name)) return null
    if (this.isOuterLoopParam(name)) return null
    const c = this.findModuleConst(name)
    if (!c?.parsed) return null
    if (target.kind === 'template-action') {
      return c.parsed.kind === 'literal' || c.parsed.kind === 'unary'
        ? parsedLiteralToGo(this.emitCtx, c.parsed)
        : null
    }
    const bakeType = target.bakeType.kind !== 'unknown' ? target.bakeType : (c.type ?? undefined)
    return parsedLiteralToGo(this.emitCtx, c.parsed, bakeType)
  }

  literal(value: string | number | boolean | null, literalType: LiteralType): string {
    // A decoded string value: JSON escaping is a subset of Go's interpreted-
    // string escapes, so a quote or newline stays inside the literal.
    if (literalType === 'string') return JSON.stringify(String(value))
    if (literalType === 'null') return 'nil'
    return String(value)
  }

  call(callee: ParsedExpr, args: ParsedExpr[], emit: (e: ParsedExpr) => string): string {
    // #2842: a registered lowering (the built-in `queryHref`, or any userland
    // plugin) must win in EVERY position this shared dispatcher reaches — a
    // ternary branch, a template-literal interpolation, a binary operand —
    // not only when the call is the whole expression (`convertExpressionToGo`'s
    // own early return). Same precedence as that top-level path, where the
    // registry is consulted before signal-read resolution and template
    // primitives.
    const lowered = lowerRegisteredCallNode(this.emitCtx, callee, args)
    if (lowered !== null) return lowered
    // #3144: a zero-arg call to a component-body local bound to an opaque
    // call (`const label = makeLabel(); {label()}`) is NOT a signal getter
    // — checked before the signal-getter branch below, which would
    // otherwise treat it as one and emit a struct field reference with no
    // corresponding field.
    if (
      callee.kind === 'identifier' &&
      args.length === 0 &&
      isOpaqueLocalAccessorName(callee.name, this.state.localConstants)
    ) {
      this.state.errors.push({
        code: 'BF101',
        severity: 'error',
        message: `Call to '${callee.name}(...)' has no Go template lowering — '${callee.name}' is a local bound to an opaque call (not a signal/memo getter), so there is no struct field for its result in template scope.`,
        loc: this.makeLoc(),
        suggestion: {
          message: `The reference adapter runs '${callee.name}()' at render time. Add /* @client */ to defer this read to the client, or pre-compute the value in the backend.`,
        },
      })
      return ''
    }
    // Signal call: count() -> .Count (or $.Count inside a loop). An env-signal
    // binding (`searchParams()`, or an aliased `sp()`) resolves to the canonical
    // `.SearchParams` field regardless of the JS name.
    if (callee.kind === 'identifier' && args.length === 0) {
      return this.searchParamsFieldRef(callee.name) ?? this.rootFieldRef(callee.name)
    }
    // Array methods (`.join` etc.) are lifted into the `array-method` IR kind at
    // parse time, so they never reach this dispatcher (see `arrayMethod()`).
    //
    // Identifier-path primitive callee: if the JS call resolves to a path
    // registered on `templatePrimitives` (e.g. `JSON.stringify`, `Math.floor`),
    // substitute the Go template form. The emit fn receives args already
    // rendered to Go template syntax. Wrap in parens to preserve operator
    // precedence (e.g. `bf_floor x` composed inside `gt (bf_floor x) 3`).
    //
    // Arity is checked against `templatePrimitiveArities` so a wrong-arity call
    // (`JSON.stringify()`, `JSON.stringify(x, replacer)`) falls through to the
    // standard BF101 path instead of emitting invalid Go template syntax via
    // `args[0]` on a missing or extra argument.
    const path = identifierPath(callee)
    if (path && this.templatePrimitives[path]) {
      const expected = this.templatePrimitiveArities[path]
      if (expected === undefined || args.length === expected) {
        const renderedArgs = args.map(emit)
        return `(${this.templatePrimitives[path](renderedArgs)})`
      }
      this.state.errors.push({
        code: 'BF101',
        severity: 'error',
        message: `templatePrimitive '${path}' expects ${expected} arg(s), got ${args.length}`,
        loc: this.makeLoc(),
        suggestion: {
          message: `Call '${path}' with exactly ${expected} argument(s), or wrap the JSX expression in /* @client */ to defer evaluation.`,
        },
      })
    }
    // #2994: any other identifier callee reaching here is a call to an
    // arbitrary JS function by bare name — a module-scope `function`/arrow
    // `const` helper being the repro shape. Zero-arg calls already
    // returned above as signal reads, so this is always a call WITH args.
    // Falling through to the generic render below used to emit the bare
    // name as a Go template field/func reference (`.Fmt .Label`), which
    // `html/template` then fails to evaluate at RENDER time (`can't
    // evaluate field Fmt in type ...`) — a crash, not a silent empty
    // render, but still no compile-time diagnostic. Refuse loudly here
    // instead.
    if (callee.kind === 'identifier') {
      this.state.errors.push({
        code: 'BF101',
        severity: 'error',
        message: `Call to '${callee.name}(...)' has no Go template lowering — '${callee.name}' is not a signal read, a registered template primitive, or a recognised lowering call, so there is no Go binding for it in template scope.`,
        loc: this.makeLoc(),
        suggestion: {
          message: `A bare-name call to a module-scope helper (or any other JS-only function reference) only exists in the real JS runtime (Hono SSR / CSR) — html/template has no way to invoke it. Pre-compute the value server-side and pass it as a prop, or wrap the position in /* @client */ so it runs in JS on the client.`,
        },
      })
      return ''
    }
    // A method outside the catalogue has no lowering: as a method call on a
    // plain data field it fails the render (#3493). A method on the request's
    // `searchParams()` reader is a real Go method (`.SearchParams.Get "key"`),
    // and a getter or function-valued prop keeps the callee read.
    if (isUnloweredCall(callee, args, this.state.propsObjectName, name => this.state.computedConsts?.isGlobal(name) ?? false) && !matchSearchParamsMethodCall(callee, args, this.state.searchParamsLocals)) {
      const refusal = unloweredCallRefusal(callee, args, 'Go')
      this.state.errors.push({
        code: 'BF101',
        severity: 'error',
        message: refusal.message,
        loc: this.makeLoc(),
        suggestion: { message: refusal.suggestion },
      })
      return ''
    }
    // Generic call: render callee and args.
    const calleeStr = emit(callee)
    if (args.length === 0) return calleeStr
    const argsStr = args.map(emit).join(' ')
    return `${calleeStr} ${argsStr}`
  }

  /** Lower a member access (`expr/member-and-methods.ts`). */
  member(
    object: ParsedExpr,
    property: string,
    computed: boolean,
    optional: boolean,
    emit: (e: ParsedExpr) => string,
  ): string {
    return renderMember(this.memberAndMethodsHost, object, property, computed, optional, emit)
  }

  /** Shared by value and condition emitters: optional hops need nil-safe,
   * case-tolerant lookup for both generated structs and JSON-decoded maps. */
  private renderOptionalMember(object: string, property: string): string {
    return `bf_get ${wrapIfMultiToken(object)} ${JSON.stringify(property)}`
  }

  indexAccess(object: ParsedExpr, index: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    // Go's builtin `index` is exact-case only, and the shared analyzer
    // types a dynamic index (e.g. a destructured .map() param used as a
    // key, `tone[k]`) as `{kind:'unknown'}` — there is no compile-time
    // witness available to guess whether the runtime value will be a
    // string key or a numeric index (#2491). Route through the runtime's
    // case-tolerant, kind-polymorphic `bf_get` (`getFieldValue`, bf.go)
    // instead of guessing: it dispatches on the receiver's REFLECTED
    // kind (map/struct vs slice/array/string) and accepts either a
    // string or numeric `field` argument, so it's a strict superset of
    // `index` — genuine numeric-index uses (`selected()[i]`) keep
    // working, and string-keyed row lookups now resolve too. Both
    // operands render through the same emitter so a loop-variable /
    // arithmetic index lowers correctly. A multi-token operand
    // (`bf_add $i 1`) must be parenthesised or Go parses it as extra
    // `bf_get` arguments.
    return `bf_get ${wrapIfMultiToken(this.emitOperand(object, emit))} ${wrapIfMultiToken(this.emitOperand(index, emit))}`
  }

  /**
   * A `binary`/`logical`/`unary` operand that feeds a prefix-call Go form
   * (`bf_mul a b`, `and a b`, `not a`, …), which cannot host a raw `{{…}}`
   * action the way the generic `emit` dispatcher's `templateLiteral()` would
   * produce for a template-literal operand (#2863). ONLY a template literal
   * is special-cased here, folded through `bf_concat_str` (the same door
   * `lowerValueOperand` uses for a ternary branch / helper-call arg /
   * query-guard value); every other kind still goes through the caller's own
   * `emit` closure unchanged. This matters: routing every operand through
   * `lowerValueOperand`'s `convertExpressionToGo` fallback (rather than only
   * the one broken kind) would ALSO pick up `convertExpressionToGo`'s own
   * string-keyed fast paths — e.g. inlining a bare identifier bound to a
   * local literal const — which `emit`'s AST-walk `identifier()` dispatch
   * does not do, a real behavioral divergence for that shape (caught by the
   * #2236 loop-param-shadowing regression pins).
   */
  private emitOperand(n: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    if (n.kind === 'template-literal') {
      return wrapIfMultiToken(lowerTemplateLiteralValue(this.emitCtx, n.parts))
    }
    return emit(n)
  }

  binary(op: string, left: ParsedExpr, right: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    const l = this.emitOperand(left, emit)
    const r = this.emitOperand(right, emit)
    // Every Go form below is a prefix function call (`bf_mul a b`, `gt a b`,
    // `eq a b`), so a COMPOUND operand must be parenthesised or the template
    // parser folds its tokens into the call's argument list — e.g.
    // `(elapsed / TRACK) * 100` would emit `bf_mul bf_div .Elapsed .TRACK 100`,
    // handing `bf_mul` four args. `wrapIfMultiToken` is a no-op for single tokens
    // and quoted literals.
    // Spell `arithmeticOperandCoercion` (#3474): an operand whose nil reads
    // as `undefined` at SSR (#3390, an omitted optional number prop #3533)
    // goes through `bf_number`, which maps nil to `NaN` as JS
    // `ToNumber(undefined)` does. The arithmetic helpers already read a
    // `null` operand as `0`, so that coercion needs no spelling.
    const undefinedOperand = (e: ParsedExpr, other: ParsedExpr, w: string): string =>
      arithmeticOperandCoercion(op, e, other, this.state.nullishAttrCtx, n => this.scope.isBound(n)) === 'undefined'
        ? `(bf_number ${w})`
        : w
    const wl = undefinedOperand(left, right, wrapIfMultiToken(l))
    const wr = undefinedOperand(right, left, wrapIfMultiToken(r))
    const call = goBinaryHelperCall(op, wl, wr, [left, right])
    if (call !== null) return call
    switch (op) {
      case '+':
        return this._emitPlus(left, right, wl, wr)
      case '-':
        return `bf_sub ${wl} ${wr}`
      case '*':
        return `bf_mul ${wl} ${wr}`
      default:
        return `${l} ${op} ${r}`
    }
  }

  /**
   * JS `+` with a string-typed operand is CONCATENATION, not addition — Go's
   * `bf_add` coerces both sides through `toFloat64` (#2168
   * string-concat-plus: `'Hello, ' + name` rendered "0", since a string
   * operand's `toFloat64` is 0). `html/template` has no infix `+` at all, so
   * both directions are a runtime call; route through `bf_concat_str` when
   * either operand is string-typed.
   *
   * Shared by all THREE `case '+':` sites in this file (`binary()` here, the
   * filter-predicate emitter's own `binary` case, and the condition-
   * expression emitter's own `binary` case) — each recurses over its own
   * `ParsedExpr` tree with its own rendered-operand strings, but the
   * string-vs-numeric decision itself must stay identical everywhere so the
   * three never drift out of sync (a Copilot review comment on #2197 flagged
   * exactly this risk when they were three independent inline checks).
   * Callers pass their own `leftExpr`/`rightExpr` (the raw `ParsedExpr` nodes
   * `isStringConcatBinary` inspects) and `leftRendered`/`rightRendered` (the
   * already-emitted, already-wrapped/parenthesised operand text for THIS
   * call site's Go form).
   */
  private _emitPlus(
    leftExpr: ParsedExpr,
    rightExpr: ParsedExpr,
    leftRendered: string,
    rightRendered: string,
  ): string {
    if (isStringConcatBinary('+', leftExpr, rightExpr, (n, property) => this._isStringValueName(n, property))) {
      return `bf_concat_str ${leftRendered} ${rightRendered}`
    }
    return `bf_add ${leftRendered} ${rightRendered}`
  }

  /** Whether `name` (a signal getter or prop) holds a string value — drives
   *  `isStringConcatBinary`'s string-vs-numeric `+` decision (#2168
   *  string-concat-plus). */
  private _isStringValueName(name: string, componentProperty = false): boolean {
    return this.scope.isStringValueName(name, n => this.state.stringValueNames.has(n), componentProperty)
  }

  unary(op: string, argument: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    const arg = this.emitOperand(argument, emit)
    // `lowerJsNot` parenthesises a multi-token argument (#2758: `not or a b`
    // parses as `not` applied to 3 args, not 1) and routes a non-bool operand
    // through `bf_truthy`, since Go's `not` reads an empty slice as false.
    if (op === '!') return lowerJsNot(argument, arg)
    // Unary minus applies JS `ToNumber` like binary `-` (#3533): an operand
    // whose nil reads as `undefined` goes through `bf_number`.
    if (op === '-') {
      return arithmeticOperandCoercion(op, argument, undefined, this.state.nullishAttrCtx, n => this.scope.isBound(n)) === 'undefined'
        ? `bf_neg (bf_number ${wrapIfMultiToken(arg)})`
        : `bf_neg ${wrapIfMultiToken(arg)}`
    }
    return arg
  }

  logical(
    op: '&&' | '||' | '??',
    left: ParsedExpr,
    right: ParsedExpr,
    emit: (e: ParsedExpr) => string,
  ): string {
    // Go's `and`/`or` are prefix builtins, so every operand that renders to more
    // than one token (a call like `.SearchParams.Get "sort"`, an arithmetic
    // `bf_add a b`, a comparison `eq a b`, a nested `not …` / `or …`) must be
    // parenthesised or it degrades into extra sibling args of the enclosing
    // `and`/`or`. This makes `searchParams().get(k) ?? d` lower to
    // `or (.SearchParams.Get "sort") "none"` instead of the broken
    // `or .SearchParams.Get "sort" "none"`.
    const wrapLeft = wrapIfMultiToken(this.emitOperand(left, emit))
    const wrapRight = wrapIfMultiToken(this.emitOperand(right, emit))
    if (op === '&&') return `and ${wrapLeft} ${wrapRight}`
    // `??` on a nillable prop needs true JS nullish semantics (#2248): Go's
    // `or` is truthiness-based, so `{{or .Label "Default"}}` falls back on a
    // present-but-empty `""` — JS `??` keeps it. `bf_nullish` tests nil-ness
    // only. Non-nillable operands keep `or`: their concrete Go type can't
    // represent "absent" at all, so `or` and `??` are indistinguishable there.
    if (op === '??' && this.isNillableNullishLeft(left)) {
      return `bf_nullish ${wrapLeft} ${wrapRight}`
    }
    // `(c ? undefined : x) ?? d` — the guard an optional-chained call
    // `props.s?.trim() ?? d` lowers to (#3435). Its `undefined` branch is
    // nil (`lowerTernary`), so `bf_nullish` falls back only for it, keeping
    // a present `''` / `0` result that `or` would replace.
    if (op === '??' && left.kind === 'conditional' && left.consequent.kind === 'identifier' && left.consequent.name === 'undefined') {
      return `bf_nullish ${wrapLeft} ${wrapRight}`
    }
    return `or ${wrapLeft} ${wrapRight}`
  }

  /**
   * The nillable-prop name a `??` left operand refers to, or null. Matches
   * the two prop-reference shapes (`label` destructured, `props.label`
   * object-style) against `nullishConsumedPropNames ∩ nillablePropNames`.
   *
   * The intersection matters: `nillablePropNames` alone OVERAPPROXIMATES —
   * it is collected before local type aliases are registered, so an
   * alias-typed prop (`placement?: TooltipPlacement`) can sit in the set
   * while its emitted struct field is the concrete alias type. On such a
   * concrete field "absent" is invisible (the zero value), so the
   * truthiness-based `or` is the correct approximation and `bf_nullish`
   * would wrongly KEEP the zero value (e.g. Tooltip's
   * `placementClasses[props.placement ?? 'top']` would resolve to no
   * class for an omitted placement). Requiring `nullishConsumedPropNames`
   * membership pins the
   * gate to props the `??` analysis actually saw — the same set that drives
   * the `interface{}` flip in `resolvePropGoType`.
   */
  private isNillableNullishLeft(expr: ParsedExpr): boolean {
    return this.nillablePropNameOf(expr) !== null || this.isNillableSignalField(expr)
  }

  /**
   * `user().name` / `user()?.name` where `user` is a signal of a named
   * object type whose `name` field is `interface{}`
   * (`nullableSeedStructFields`, #3421): a missing field is nil there, so
   * `??` can test nil-ness like it does for a nillable prop.
   */
  private isNillableSignalField(expr: ParsedExpr): boolean {
    if (expr.kind !== 'member' || expr.computed) return false
    const call = expr.object
    if (call.kind !== 'call' || call.args.length !== 0 || call.callee.kind !== 'identifier') return false
    const getter = call.callee.name
    const signal = this.state.currentSignals.find(sig => sig.getter === getter)
    return !!signal && this.state.nullableSeedStructFields.has(`${signal.type.raw}.${expr.property}`)
  }

  private nillablePropNameOf(expr: ParsedExpr): string | null {
    let name: string | null = null
    let memberOfRoot = false
    if (expr.kind === 'identifier') {
      name = expr.name
    } else if (expr.kind === 'member' && !expr.computed && expr.object.kind === 'identifier') {
      if (expr.object.name === this.state.propsObjectName) {
        name = expr.property
      } else {
        // Single-hop member access rooted at a bare destructured optional
        // OBJECT prop (`user?.name ?? '…'`, #2256) — the ROOT prop is what
        // needs to be in the nillable/nullish-consumed sets, not the
        // accessed field; `member()`'s own `bf_get` lowering for the `?.`
        // hop already returns Go `nil` on a nil/missing root, so gating on
        // the root here is sufficient. Mirrors
        // `collectNullishConsumedPropNames`'s `propNameOfLeft`.
        name = expr.object.name
        memberOfRoot = true
      }
    }
    if (name === null || !this.state.nullishConsumedPropNames.has(name)) return null
    if (this.state.nillablePropNames.has(name)) return name
    // A slice-typed prop is nil when absent and an empty non-nil slice when
    // present as `[]`, so `bf_nullish` keeps a present `[]` where the
    // truthiness-based `or` would fall back (#3362).
    if (!memberOfRoot) {
      const param = this.state.currentPropsParams.find(p => p.name === name)
      if (param && resolvePropGoType(this.emitCtx, param, this.state.propTypeOverrides).startsWith('[]')) {
        return name
      }
    }
    // The root of a `user?.name` hop is also nillable when it lowers to the
    // optional-object `map[string]interface{}` field (`resolvePropGoType`'s
    // struct-map branch — an optional prop typed by a same-file object
    // type): a nil map, like a missing key, makes that `bf_get` return nil.
    if (memberOfRoot) {
      const param = this.state.currentPropsParams.find(p => p.name === name)
      if (param && resolvePropGoType(this.emitCtx, param, this.state.propTypeOverrides).startsWith('map[')) {
        return name
      }
    }
    return null
  }

  // JSX-level ternaries (`{expr ? a : b}`) in TEXT position are handled at the
  // IR level as IRConditional (via convertConditionToGo → renderConditionExpr →
  // renderConditional). This method is only reached for ternaries nested inside
  // other ParsedExpr trees in VALUE position (e.g. template-literal
  // interpolation, an attribute value), where both branches are values.
  //
  // #2335: emit the pipeline-position `(bf_ternary …)` form — the same lowering
  // helper-call args (`lowerArg`) and boolean sub-conditions
  // (`renderConditionExpr`) now share — instead of a text-position
  // `{{if}}…{{end}}` action fragment. Callers wrap the returned pipeline in
  // `{{…}}` via the normal expression path (it no longer `{{`-leads, so
  // `isTemplateFragment` correctly declines it). `emit` is unused: the shared
  // lowering re-derives each child's Go form (branches as quoted values, the
  // test coerced to a real bool) rather than the generic emit.
  conditional(
    test: ParsedExpr,
    consequent: ParsedExpr,
    alternate: ParsedExpr,
    _emit: (e: ParsedExpr) => string,
  ): string {
    return lowerTernary(this.emitCtx, test, consequent, alternate)
  }

  /** One text-sink decision for direct expressions, template interpolations
   * and attribute values (#3359). Numeric values remain boxed everywhere
   * outside these string sinks. A value that can be a `float64` here — a
   * numeric memo read, a ternary with such a branch, or an arithmetic
   * expression (`props.value + 0.5`, #3320) whose `bf_add`/`bf_div`/… result
   * is boxed `any` — prints through `bf_string`, whose `numberString` spells
   * it as JS does (`1234567890.5`); html/template's own `fmt.Sprint` would
   * print `1.2345678905e+09`. `bf_string` leaves an int or a string (a
   * string-concat `+`) unchanged. Any other value read prints through
   * `bf_text` unless it provably holds no number (`isKnownNonNumber`): a TS
   * `number` is a Go `float64` wherever it lives (a prop, a signal, a
   * synthesized row struct, a `.map()` preamble local, a context value), and
   * `bf_text` spells a float64 as JS does while passing every other value
   * through unchanged. */
  private numericTextExpression(goExpr: string, expr: ParsedExpr | undefined): string {
    if (this.isNumericTextValue(expr)) return `bf_string ${wrapIfMultiToken(goExpr)}`
    if (!expr || isGoConstant(goExpr) || isKnownNonNumber(this.emitCtx, expr, this.scope)) return goExpr
    return `bf_text ${wrapIfMultiToken(goExpr)}`
  }

  private isNumericTextValue(expr: ParsedExpr | undefined): boolean {
    if (!expr) return false
    if (expr.kind === 'binary') return ARITHMETIC_OPS.has(expr.op)
    if (expr.kind === 'unary') return expr.op === '-' || expr.op === '+'
    // A ternary whose taken branch can be a boxed number (`c ? n + 0.5 : 'x'`).
    if (expr.kind === 'conditional') {
      return this.isNumericTextValue(expr.consequent) || this.isNumericTextValue(expr.alternate)
    }
    if (expr.kind !== 'call' || expr.callee.kind !== 'identifier' || expr.args.length !== 0) return false
    const name = this.state.getterAliases.get(expr.callee.name) ?? expr.callee.name
    const memo = this.state.currentMemos.find(m => m.name === name)
    return !!memo && isBoxedNumericMemoBody(this.emitCtx, memo.parsed, this.state.currentSignals, this.state.currentPropsParams)
  }

  templateLiteral(parts: TemplatePart[], emit: (e: ParsedExpr) => string): string {
    let result = ''
    for (const part of parts) {
      if (part.type === 'string') {
        // The literal text lands in markup OUTSIDE any `{{…}}` action, so
        // html/template never escapes it. Escape it here, or a `"` in a
        // nested literal segment (`content-["x"]`) closes the surrounding
        // `class="…"` and a `<` opens a tag in text position (#3706).
        result += escapeHtml(part.value)
      } else {
        // A nested ternary emits a complete `{{if …}}…{{end}}` action chain (see
        // `conditional` above) — wrapping it again produces `{{{{if …}}` and a
        // template parse error. Same `isTemplateFragment` guard as
        // `renderExpression`.
        const e = emit(part.expr)
        result += this.isTemplateFragment(e, part.expr.kind) ? e : `{{${this.numericTextExpression(e, part.expr)}}}`
      }
    }
    return result
  }

  arrow(params: string[], _body: ParsedExpr, _emit: (e: ParsedExpr) => string): string {
    // A standalone arrow has no Go template form — it only ever reaches an
    // adapter as a callback argument (handled by `callbackMethod`). Route to the
    // `unsupported` path so it surfaces instead of leaking placeholder markup.
    return this.unsupported(`(${params.join(', ')}) => ...`, 'standalone arrow')
  }

  regex(raw: string): string {
    // A regex literal has no Go template form (the one trailing-slash-strip
    // pattern is recognised only in the ctor lowering, not template scope).
    return this.unsupported(raw, 'regex literal')
  }

  arrayLiteral(elements: ParsedExpr[], emit: (e: ParsedExpr) => string): string {
    // `[a, b]` lowers to `bf_arr a b` — a variadic runtime helper returning
    // `[]any`. The Go template `slice` builtin can't carry JS-style
    // heterogeneous element types (string, signal call, prop reference) without
    // coercion. Elements get parens so a nested call doesn't run together with
    // its arguments (`bf_arr .A (bf_filter ...) .B`). Empty `[]` is `bf_arr` with
    // no args.
    if (elements.length === 0) return 'bf_arr'
    const parts = elements.map(el => {
      const rendered = emit(el)
      // Wrap multi-token results (calls, dotted paths with args) in parens;
      // simple identifiers / literals stay bare.
      return rendered.includes(' ') ? `(${rendered})` : rendered
    })
    return `bf_arr ${parts.join(' ')}`
  }

  objectLiteral(properties: ObjectLiteralProperty[], raw: string, emit: (e: ParsedExpr) => string): string {
    // A POPULATED literal is reachable here only in VALUE position (a
    // `.map()` receiver/callback body, an array-literal element, …) —
    // `isSupportedValue` admits it when every property value is itself
    // supported (expression-parser.ts, `checkSupport`'s `pos` parameter).
    // `text/template` has no map-literal syntax, so lower through the
    // variadic `bf_map` runtime helper (the object counterpart of
    // `arrayLiteral`'s `bf_arr`) instead of trying to spell a literal.
    if (properties.length > 0) {
      const wrap = (rendered: string) => (rendered.includes(' ') ? `(${rendered})` : rendered)
      const literalOf = (run: readonly Extract<ObjectLiteralProperty, { kind: 'prop' }>[]) =>
        `bf_map ${run.map(p => `"${escapeGoString(p.key)}" ${wrap(emit(p.value))}`).join(' ')}`
      if (!properties.some(p => p.kind === 'spread')) {
        return literalOf(properties as Extract<ObjectLiteralProperty, { kind: 'prop' }>[])
      }
      // Spread (`{ ...t, editing: false }`, #2696 Step 2): `bf_merge`
      // (runtime/eval.go, a `bf_map` sibling) is a variadic, null-safe map
      // merge — a non-map argument (nil included) is skipped rather than
      // panicking, matching JS's null/undefined-spread no-op — folding
      // every segment (a `bf_map` run, or a spread's own emitted value) in
      // ONE call, later segments winning, exactly JS spread's semantics.
      const segments = groupObjectLiteralSegments(properties, literalOf, e => wrap(emit(e)))
      return `bf_merge ${segments.join(' ')}`
    }
    // The EMPTY object literal (`?? {}`) reaches here as `??`'s right
    // operand (expression-parser.ts, `logical` case) — a RENDERED-position
    // admission, not a value-position one. The shared gate no longer
    // reports BF101 for this shape itself (it now considers `x ?? {}`
    // supported), so a silent sentinel would render as an empty value with
    // no diagnostic. So self-report BF101 here — mirroring
    // the other self-contained refusals in this file (`pushCallbackBF101`,
    // `refuseFilterExprNode`) — and return the safe `""` string sentinel,
    // which is always a valid Go template value in every position `??`'s
    // result can land in. Object values that DO reach a Go map today
    // (signal/const inits, spread bags) go through the dedicated
    // `objectLiteralToGoMap` lowering, not here.
    // `raw` is the whole top-level expression's source text (threaded
    // unchanged through `convertNode`, same convention every `unsupported`
    // node relies on for its diagnostic) — e.g. `props.config ?? {}`, not
    // just the `{}` sub-node — so it reads naturally in the message below.
    this.state.errors.push({
      code: 'BF101',
      severity: 'error',
      message: `Expression not supported: ${raw}`,
      loc: this.makeLoc(),
      suggestion: {
        message: `Go templates have no object/map literal syntax, so the \`?? {}\` fallback can't render server-side. ${GO_REMEDIATION_OPTIONS}`,
      },
    })
    return `""`
  }

  /**
   * Recover the (removed) `higher-order` destructured shape from a generic
   * `call` that is a recognised callback method whose method is a *predicate*
   * one. Returns null for sort/reduce/flatMap or any non-callback call. Used by
   * the `member`-arm short-circuits (`obj.filter(...).length`,
   * `obj.find(...).prop`) that need the structured fallbacks.
   */
  private higherOrderShapeOf(node: ParsedExpr): HigherOrderShape | null {
    const cb = asCallbackMethodCall(node)
    if (!cb) return null
    if (!PREDICATE_METHODS.has(cb.method)) return null
    return {
      method: cb.method as HigherOrderMethod,
      object: cb.object,
      param: cb.arrow.params[0] ?? '_',
      predicate: cb.arrow.body,
    }
  }

  /** Lower a higher-order callback method (`expr/member-and-methods.ts`). */
  callbackMethod(
    method: string,
    object: ParsedExpr,
    arrow: Extract<ParsedExpr, { kind: 'arrow' }>,
    restArgs: ParsedExpr[],
    emit: (e: ParsedExpr) => string,
  ): string {
    return renderCallbackMethod(this.memberAndMethodsHost, method, object, arrow, restArgs, emit)
  }

  /** Lower a non-callback array / string method (`expr/member-and-methods.ts`). */
  arrayMethod(
    method: ArrayMethod,
    object: ParsedExpr,
    args: ParsedExpr[],
    rawEmit: (e: ParsedExpr) => string,
  ): string {
    return renderArrayMethod(this.memberAndMethodsHost, method, object, args, rawEmit)
  }

  flatMethod(
    object: ParsedExpr,
    depth: FlatDepth | { expr: ParsedExpr },
    emit: (e: ParsedExpr) => string,
  ): string {
    if (typeof depth === 'object') {
      // Dynamic depth (#2094) → `bf_flat_dynamic <recv> <renderedDepthExpr>`,
      // a SEPARATE runtime helper from `bf_flat` below. `bf_flat`'s `-1`
      // argument is a compile-time SENTINEL meaning "flatten fully"
      // (`Infinity` normalised at parse time); a genuinely dynamic render-time
      // value of `-1` means the JS-correct OPPOSITE (no flatten — negative
      // depth never recurses). Reusing `bf_flat` for both would silently
      // invert that case, so the dynamic form routes through `FlatDynamicDepth`
      // (`bf.go`), which performs full `ToIntegerOrInfinity` coercion from
      // scratch on whatever value the rendered expression evaluates to.
      return `bf_flat_dynamic ${wrapIfMultiToken(emit(object))} ${wrapIfMultiToken(emit(depth.expr))}`
    }
    // `.flat(depth?)` → `bf_flat <recv> <depth>`. `Infinity` lowers to the `-1`
    // sentinel (flatten fully); a finite depth flattens that many levels
    // (`0` = shallow copy).
    const d = depth === 'infinity' ? -1 : depth
    return `bf_flat ${wrapIfMultiToken(emit(object))} ${d}`
  }

  unsupported(raw: string, reason: string): string {
    // Callers check `isSupported` first, so this is a backstop: a refusal
    // carried as BF101, never as marker text spliced into a template action
    // (#3542). `""` is a valid Go template value in every position.
    this.state.errors.push({
      code: 'BF101',
      severity: 'error',
      message: `Expression '${raw}' has no Go template lowering: ${reason}`,
      loc: this.makeLoc(),
      suggestion: { message: 'Use /* @client */ for client-side evaluation, or rewrite the expression in the supported subset.' },
    })
    return '""'
  }

  /**
   * Extract field name and negation from a simple predicate.
   *   `t => t.done`  → { field: "Done", negated: false }
   *   `t => !t.done` → { field: "Done", negated: true }
   */
  private extractFieldPredicate(pred: ParsedExpr, param: string): { field: string | null; negated: boolean } {
    // t.done
    if (pred.kind === 'member' && pred.object.kind === 'identifier' && pred.object.name === param) {
      return { field: capitalizeFieldName(pred.property), negated: false }
    }
    // !t.done
    if (pred.kind === 'unary' && pred.op === '!' && pred.argument.kind === 'member') {
      const mem = pred.argument
      if (mem.object.kind === 'identifier' && mem.object.name === param) {
        return { field: capitalizeFieldName(mem.property), negated: true }
      }
    }
    return { field: null, negated: false }
  }

  /**
   * Extract field name and value from an equality predicate (extends
   * extractFieldPredicate to also handle equality comparisons).
   *   `t.done`                → { field: "Done", value: "true" }
   *   `!t.done`               → { field: "Done", value: "false" }
   *   `u.id === selectedId()` → { field: "Id", value: <rendered expr> }
   *   `selectedId() === u.id` → same (both operand orders supported)
   */
  private extractEqualityPredicate(
    pred: ParsedExpr,
    param: string,
    renderValue: (e: ParsedExpr) => string
  ): { field: string; value: string } | null {
    // Boolean field: t.done → { field: "Done", value: "true" }
    if (pred.kind === 'member' && pred.object.kind === 'identifier' && pred.object.name === param) {
      return { field: capitalizeFieldName(pred.property), value: 'true' }
    }
    // Negated boolean: !t.done → { field: "Done", value: "false" }
    if (pred.kind === 'unary' && pred.op === '!' && pred.argument.kind === 'member') {
      const mem = pred.argument
      if (mem.object.kind === 'identifier' && mem.object.name === param) {
        return { field: capitalizeFieldName(mem.property), value: 'false' }
      }
    }
    // Equality: u.id === expr or expr === u.id
    if (pred.kind === 'binary' && (pred.op === '===' || pred.op === '==')) {
      // Left is param.field
      if (pred.left.kind === 'member' && pred.left.object.kind === 'identifier' && pred.left.object.name === param) {
        return { field: capitalizeFieldName(pred.left.property), value: renderValue(pred.right) }
      }
      // Right is param.field (reversed operand order)
      if (pred.right.kind === 'member' && pred.right.object.kind === 'identifier' && pred.right.object.name === param) {
        return { field: capitalizeFieldName(pred.right.property), value: renderValue(pred.left) }
      }
    }
    return null
  }

  /**
   * Emit a higher-order method through the runtime evaluator (#2018 P2):
   * `bf_filter_eval` / `bf_every_eval` / `bf_some_eval` / `bf_find_eval` /
   * `bf_find_index_eval`, carrying the serialized predicate body + captured
   * env. Returns null when the predicate is outside the evaluator surface
   * (caller falls back to the structured helper / template block). The find /
   * findLast (and findIndex / findLastIndex) pair share a helper, differing
   * only by the `forward` bool argument.
   */
  private renderHigherOrderEval(
    expr: HigherOrderShape,
    arrayExpr: string,
    emit: (e: ParsedExpr) => string,
  ): string | null {
    const { method, predicate, param } = expr
    const pe = (fn: string, extra: string[] = []) =>
      emitPredicateEval(fn, arrayExpr, predicate, param, emit, extra)
    switch (method) {
      case 'filter':
        // `.filter(Boolean)` (identity predicate `_t => _t`) keeps its
        // dedicated `bf_filter_truthy` lowering — identical render, and it
        // composes through the array-method chain (`.filter(Boolean).join`).
        if (predicate.kind === 'identifier' && predicate.name === param) return null
        return pe('bf_filter_eval')
      case 'every':
        return pe('bf_every_eval')
      case 'some':
        return pe('bf_some_eval')
      case 'find':
        return pe('bf_find_eval', ['true'])
      case 'findLast':
        return pe('bf_find_eval', ['false'])
      case 'findIndex':
        return pe('bf_find_index_eval', ['true'])
      case 'findLastIndex':
        return pe('bf_find_index_eval', ['false'])
    }
    return null
  }

  /**
   * Render a higher-order expression (filter, every, some, find, findIndex) to
   * Go template, or null when the shape isn't supported. `renderArray` is passed
   * in so the array can recurse through different lowering methods.
   */
  private renderHigherOrderExpr(
    expr: HigherOrderShape,
    renderArray: (e: ParsedExpr) => string
  ): string | null {
    const arrayExpr = renderArray(expr.object)

    // Evaluator path (#2018 P2): the predicate body is already a ParsedExpr on
    // the IR node, so serialize it and emit the matching `bf_*_eval` helper.
    // This generalizes the field-equality / truthiness predicate catalogue
    // below to ANY pure predicate body; a method-call predicate (which
    // `serializeParsedExpr` refuses) returns null here and falls through to the
    // structured helpers / template-block fallback.
    const evalForm = this.renderHigherOrderEval(expr, arrayExpr, renderArray)
    if (evalForm !== null) return evalForm

    if (expr.method === 'every' || expr.method === 'some') {
      const { field } = this.extractFieldPredicate(expr.predicate, expr.param)
      if (!field) return null
      return expr.method === 'every'
        ? `bf_every ${arrayExpr} "${field}"`
        : `bf_some ${arrayExpr} "${field}"`
    }

    if (expr.method === 'filter') {
      // .filter(Boolean) — synthesised by the parser as an identity predicate
      // (`x => x`) so adapters can reuse the higher-order lowering path. Lower to
      // `bf_filter_truthy` so a `[a, b].filter(Boolean).join(' ')` chain renders
      // server-side on Go templates.
      if (
        expr.predicate.kind === 'identifier' &&
        expr.predicate.name === expr.param
      ) {
        return `bf_filter_truthy (${arrayExpr})`
      }
      const { field, negated } = this.extractFieldPredicate(expr.predicate, expr.param)
      if (!field) return null
      const value = negated ? 'false' : 'true'
      return `bf_filter ${arrayExpr} "${field}" ${value}`
    }

    if (expr.method === 'find' || expr.method === 'findIndex' || expr.method === 'findLast' || expr.method === 'findLastIndex') {
      const eqPred = this.extractEqualityPredicate(
        expr.predicate, expr.param, e => this.renderParsedExpr(e)
      )
      if (!eqPred) return null
      const funcMap: Record<string, string> = {
        find: 'bf_find', findIndex: 'bf_find_index',
        findLast: 'bf_find_last', findLastIndex: 'bf_find_last_index',
      }
      return `${funcMap[expr.method]} ${arrayExpr} "${eqPred.field}" ${eqPred.value}`
    }

    return null
  }

  /**
   * Render find/findIndex/findLast/findLastIndex with complex predicates
   * using range/if blocks. Falls back from bf_find/bf_find_last helpers
   * when extractEqualityPredicate returns null.
   *
   * find/findIndex use break on first match (forward scan).
   * findLast/findLastIndex iterate forward and keep overwriting a result
   * variable; the final value is the last match.
   */
  private renderFindTemplateBlock(
    expr: HigherOrderShape,
    renderArray: (e: ParsedExpr) => string,
    propertyAccess?: string
  ): string | null {
    const arrayExpr = renderArray(expr.object)
    // A refused predicate already reported BF101; `false` keeps the block valid.
    const condition = renderFilterExpr(this.conditionExprHost, expr.predicate, expr.param) ?? 'false'

    if (expr.method === 'find') {
      const output = propertyAccess ? `{{.${propertyAccess}}}` : '{{.}}'
      return `{{range ${arrayExpr}}}{{if ${condition}}}${output}{{break}}{{end}}{{end}}`
    }

    if (expr.method === 'findIndex') {
      return `{{range $i, $_ := ${arrayExpr}}}{{if ${condition}}}{{$i}}{{break}}{{end}}{{end}}`
    }

    if (expr.method === 'findLast') {
      const v = `$bf_r${this.state.templateVarCounter++}`
      const capture = propertyAccess ? `.${propertyAccess}` : '.'
      return `{{${v} := ""}}{{range ${arrayExpr}}}{{if ${condition}}}{{${v} = ${capture}}}{{end}}{{end}}{{${v}}}`
    }

    if (expr.method === 'findLastIndex') {
      const v = `$bf_r${this.state.templateVarCounter++}`
      return `{{${v} := -1}}{{range $i, $_ := ${arrayExpr}}}{{if ${condition}}}{{${v} = $i}}{{end}}{{end}}{{${v}}}`
    }

    return null
  }

  /**
   * Render every()/some() with complex predicates as a `{{range}}{{if}}` with
   * variable reassignment — the fallback from bf_every/bf_some when
   * extractFieldPredicate returns null.
   *
   *   every: start true, set false on first failure, break early
   *   some:  start false, set true on first match, break early
   */
  private renderEverySomeTemplateBlock(
    expr: HigherOrderShape,
    renderArray: (e: ParsedExpr) => string
  ): string | null {
    const arrayExpr = renderArray(expr.object)
    // A refused predicate already reported BF101; `false` keeps the block valid.
    const condition = renderFilterExpr(this.conditionExprHost, expr.predicate, expr.param) ?? 'false'

    if (expr.method === 'every') {
      const v = `$bf_r${this.state.templateVarCounter++}`
      const negated = this.negateGoCondition(condition)
      return `{{${v} := true}}{{range ${arrayExpr}}}{{if ${negated}}}{{${v} = false}}{{break}}{{end}}{{end}}{{${v}}}`
    }

    if (expr.method === 'some') {
      const v = `$bf_r${this.state.templateVarCounter++}`
      return `{{${v} := false}}{{range ${arrayExpr}}}{{if ${condition}}}{{${v} = true}}{{break}}{{end}}{{end}}{{${v}}}`
    }

    return null
  }

  /**
   * Negate a Go template condition: `not (...)` when it's a Go function call
   * (eq, ne, gt, …), else `not condition`.
   */
  private negateGoCondition(condition: string): string {
    const goFuncPattern = /^(eq|ne|gt|lt|ge|le|and|or|not|bf_)\b/
    if (goFuncPattern.test(condition)) {
      return `not (${condition})`
    }
    return `not ${condition}`
  }

  /**
   * Render `.length` on a filter higher-order expression, e.g.
   * `todos().filter(t => !t.done).length` → `len (bf_filter .Todos "Done" false)`.
   */
  private renderFilterLengthExpr(
    filterExpr: HigherOrderShape,
    renderArray: (e: ParsedExpr) => string
  ): string | null {
    if (filterExpr.method !== 'filter') {
      return null
    }

    const arrayExpr = renderArray(filterExpr.object)

    // Evaluator path (#2018 P2): `len (bf_filter_eval …)` for any pure
    // predicate. Falls back to the structured `bf_filter` below for a
    // method-call predicate the evaluator can't model.
    const evalForm = emitPredicateEval(
      'bf_filter_eval', arrayExpr, filterExpr.predicate, filterExpr.param, renderArray,
    )
    if (evalForm !== null) return `len (${evalForm})`

    const { field, negated } = this.extractFieldPredicate(filterExpr.predicate, filterExpr.param)
    if (!field) {
      return null
    }

    const value = negated ? 'false' : 'true'
    return `len (bf_filter ${arrayExpr} "${field}" ${value})`
  }

  /** Convert a JS expression to Go template syntax. */
  private convertExpressionToGo(
    jsExpr: string,
    out?: { parsed?: ParsedExpr },
    // Pre-parsed tree from the IR (`IRExpression.parsed`), reused instead of
    // re-parsing `jsExpr` here — but only after the string-based early returns
    // below, which resolve null/undefined, static record indexes, inlined
    // consts, and helper/url lowerings without a parse. Recursive calls (with
    // derived strings) pass none and parse normally.
    preParsed?: ParsedExpr,
  ): string {
    const trimmed = jsExpr.trim()

    if (trimmed === 'null' || trimmed === 'undefined') {
      return '""'
    }

    // #2224: inside a `renderUnrolledStaticElementLoop` pass, there is no
    // real `{{range}}` establishing a per-item dot context — every
    // expression in the body must instead resolve directly against the
    // active item via `evaluateStaticLiteral` and lower to a literal Go
    // value. Highest priority (even over the static-record-index / inlined-
    // const early returns below): those string-keyed checks were never
    // designed to reason about a loop item and could otherwise misfire on
    // text that merely happens to match their shape. `analyzeBakeable-
    // StaticElementLoop` has already verified every expression in this body
    // resolves for every item, so the `staticLoopBakeFailed` branch is a
    // defensive invariant, not a real code path — if it ever fires, the two
    // passes disagreed and the safest move is a sentinel, not a `.Field`
    // reference with no range context behind it.
    if (this.staticLoopItemStack.length > 0) {
      const parsedForBake = preParsed ?? parseExpression(trimmed)
      const resolved = evaluateStaticLiteral(parsedForBake, this.staticLoopBindings())
      const literal = resolved !== null ? scalarToGoLiteral(resolved.value) : null
      if (literal !== null) {
        // Deliberately leave `out.parsed` unset — a `template-literal`-kind
        // source (`` `Hi ${item.label}` ``) must NOT be treated as
        // already-fragment text by `renderExpression`'s `isTemplateFragment`
        // check (it would skip the `{{...}}` wrap and print the Go literal's
        // quote characters raw into the HTML).
        return literal
      }
      this.staticLoopBakeFailed = true
      return '""'
    }

    // `IDENT['key']` over a module object-literal const with a STRING-LITERAL key
    // is a fully static lookup — resolve it at compile time. The generic member
    // lowering below would otherwise capitalize the bracket access into a field
    // reference and emit an invalid hyphenated path
    // (`strokePaths['chevron-down']` → `.StrokePaths.Chevron-down`).
    const staticIndexed = this.resolveStaticRecordLiteralIndex(trimmed)
    if (staticIndexed !== null) {
      return staticIndexed
    }

    // A bare identifier bound to a literal const inlines at compile time
    // (`totalPages` is a function-scope `const totalPages = 5`, not a prop, so
    // the generic lowering would reference a nonexistent `.TotalPages` field).
    // Only pure numeric / single-quoted-string initializers qualify; anything
    // else may be runtime-dependent.
    //
    // #2236: this is a string-keyed fast path over `jsExpr` reached directly
    // by call sites like attribute emission (`key={count}` → `data-key`) that
    // never go through `identifier()`'s loop-shadow guards below — so it must
    // carry its OWN guard. When `.map((count) => ...)` shadows the outer
    // `const count = 7`, the occurrence inside the loop body must resolve to
    // the range value (via the normal parse-and-lower fallthrough), not the
    // outer literal.
    if (!this.isLoopShadowedName(trimmed) && /^[A-Za-z_$][\w$]*$/.test(trimmed)) {
      const litConst = (this.state.localConstants ?? []).find(c => c.name === trimmed)
      if (litConst?.value !== undefined) {
        const v = litConst.value.trim()
        if (/^-?\d+(\.\d+)?$/.test(v)) return v
        const strLit = /^'([^'\\]*)'$/.exec(v) ?? /^"([^"\\]*)"$/.exec(v)
        if (strLit) return JSON.stringify(strLit[1])
      }
    }

    // Registered call lowerings (#2057) — e.g. `queryHref(base, { … })` (#2042)
    // → a `bf_query` action. Tried before the generic path because such calls'
    // object-literal args are otherwise `unsupported` at the support gate.
    const loweredCall = lowerRegisteredCall(this.emitCtx, trimmed, preParsed)
    if (loweredCall !== null) return loweredCall

    // Inline a call to a local, expression-bodied helper arrow
    // (`sortClass(k)` / `tagClass(t)`) by substituting its params with the call
    // args and lowering the resulting expression. There is no Go method backing
    // a `.SortClass "date"` call, so the call site must carry the computation
    // (`{{if eq .Params.Sort "date"}}sort on{{else}}sort{{end}}`). Only self-
    // contained helpers are inlined; one that delegates to another local helper
    // (e.g. `sortHref` → `hrefFor`) is left for a later capability.
    const inlined = inlineLocalHelperCall(this.emitCtx, trimmed, preParsed)
    if (inlined !== null) {
      // Lower the substituted body *tree* directly (as `preParsed`), so operator
      // precedence is carried by the structure — a compound arg subtree
      // (`props.a ?? props.b`) substituted into `sig() === k` keeps `===` the
      // outer op without parenthesisation. The stringified form only drives the
      // string-keyed early returns above. The inliner rejects method-call
      // bodies, so the tree never carries a generic `call` that
      // `parseExpression` would have specialised into `array-method`.
      return this.convertExpressionToGo(stringifyParsedExpr(inlined), out, inlined)
    }

    // Parse only here — *after* the early returns above, which resolve
    // `null`/`undefined`, static record indexes, and inlined literal consts
    // without a parse. The result is reported to the caller via `out` below
    // (after the support gate) so `renderExpression` can classify the
    // expression (template literal vs. not) off this single `parseExpression`,
    // with no extra `ts.createSourceFile` on the `bf build` hot path and no
    // parse at all for the early-return shapes.
    // A computed const reads as its initializer (#3494).
    const parsed = inlineComputedConsts(preParsed ?? parseExpression(trimmed), this.state.computedConsts)
    const support = isSupported(parsed)

    if (!support.supported) {
      this.state.errors.push({
        code: 'BF101',
        severity: 'error',
        message: `Expression not supported: ${trimmed}`,
        loc: this.makeLoc(),
        suggestion: {
          message: buildUnsupportedSuggestion(support),
        },
      })
      // Return the `""` sentinel. Deliberately leave `out.parsed` unset: the
      // sentinel must take the normal wrap path in `renderExpression` (→
      // `{{""}}`), not the template-literal "already template text" path —
      // otherwise an unsupported interpolation (`template-literal` kind) would
      // emit `""` outside an action and render literal quotes into the HTML.
      return `""`
    }

    // Report the supported parse to the caller (template-literal classification
    // for `renderExpression`) only after the support gate, so the wrap-skip path
    // can never trigger on the error sentinel above.
    if (out) out.parsed = parsed

    return this.renderParsedExpr(parsed)
  }

  /**
   * Whether `name` at the CURRENT emission position is bound by an enclosing
   * loop callback — its item param, an outer loop's range variable, a
   * destructured binding name, an index var, or a preamble local. `scope`
   * (`BindingScope`, #2482 Stage 3) covers all of those EXCEPT a
   * `.keys()`-shape loop's own key param (never bound in `scope` at all —
   * see `scope`'s field docstring), which stays reachable only through
   * `loopVarRefCount` — so both are still consulted. Shared by the
   * string-keyed fast paths (#2236, #2242 Copilot review) that resolve raw
   * `jsExpr` text before `identifier()`'s own guards can see it. Mirrors the
   * checks in `resolveModuleStringConst` / `resolveModuleConstAsGo`.
   */
  private isLoopShadowedName(name: string): boolean {
    return this.scope.isBound(name) || this.loopVarRefCount.has(name)
  }

  /**
   * Resolve `IDENT['key']` / `IDENT["key"]` where `IDENT` is a module-scope
   * object-literal const and the key is a string literal — a compile-time-static
   * lookup (the icon registry's `strokePaths['chevron-down']`). Returns the
   * looked-up value as a Go literal (quoted string / bare number) usable inside a
   * template action, or `null` for any other shape so the caller falls through to
   * the generic lowering. The prop-keyed variant lives in `parseRecordIndexAccess`
   * (shared with Mojo); this helper covers the literal-key case parse rejects.
   */
  private resolveStaticRecordLiteralIndex(jsExpr: string): string | null {
    const m =
      /^([A-Za-z_$][\w$]*)\[\s*(?:'([^']*)'|"([^"]*)")\s*\]$/.exec(jsExpr) ??
      // Property-access form of the same static lookup (`variantClasses.ghost`)
      // — only when the base resolves to a module object-literal const below, so
      // ordinary props/locals never match.
      /^([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)$/.exec(jsExpr)
    if (!m) return null
    // The base name may be an enclosing loop callback's own (shadowing)
    // param (`rows.map((cfg) => cfg.x)` under a module `const cfg = {...}`)
    // — the record-member sibling of the #2236 bare-identifier gap, found
    // by the loop-param-shadows-record-const fixture. Fall through to the
    // generic lowering, which resolves the member through the loop binding.
    if (this.isLoopShadowedName(m[1])) return null
    const key = m[2] ?? m[3]
    const constInfo = (this.state.localConstants ?? []).find(
      c => c.name === m[1] && c.isModule,
    )
    if (constInfo?.value === undefined) return null

    // Read the IR-carried structured value: the analyzer parses a module
    // record's `{ key: 'lit' }` once into an `object-literal`, so the key lookup
    // reads the structured tree here.
    //   - string values map to `JSON.stringify(text)`;
    //   - number values emit `literal.raw`, TypeScript's normalised
    //     `NumericLiteral.text` token (`1e3`/`1_000`/`0x10` → `1000`/`1000`/`16`,
    //     not the source spelling) — exactly what the adapter's own numeric
    //     lowering emits, and avoiding the lossy `parseFloat`-derived `value`.
    // Any non-record / non-string-or-number value resolves to null. The corpus's
    // record consts are all plain string-keyed string/number object literals
    // (icon registries, variant/size class maps), so this fully covers them.
    const carried = constInfo.parsed
    if (carried?.kind === 'object-literal') {
      // A spread entry (`{ ...t }`, #2696 Step 2) has no static key to match
      // against — skip it, same as before this kind existed (a record const
      // containing spread already couldn't reach here as a whole).
      const hit = carried.properties.find(
        (prop): prop is Extract<ObjectLiteralProperty, { kind: 'prop' }> => prop.kind === 'prop' && prop.key === key,
      )
      if (hit && hit.value.kind === 'literal') {
        if (hit.value.literalType === 'string') return JSON.stringify(hit.value.value)
        if (hit.value.literalType === 'number') return hit.value.raw ?? String(hit.value.value)
      }
    }
    return null
  }

  /** Create a source location for error reporting. */
  private makeLoc(): SourceLocation {
    return {
      file: this.state.componentName + '.tsx',
      start: { line: 1, column: 0 },
      end: { line: 1, column: 0 },
    }
  }

  private renderIfStatement(ifStmt: IRIfStatement, ctx?: { isRootOfClientComponent?: boolean }): string {
    const { condition: goCondition, preamble } = this.convertConditionToGo(ifStmt.condition, ifStmt.parsedCondition)
    const consequent = this.renderNode(ifStmt.consequent, ctx)
    let result = `${preamble}{{if ${goCondition}}}${consequent}`

    if (ifStmt.alternate) {
      if (ifStmt.alternate.type === 'if-statement') {
        const altIfStmt = ifStmt.alternate as IRIfStatement
        const { condition: altCondition, preamble: altPreamble } = this.convertConditionToGo(altIfStmt.condition, altIfStmt.parsedCondition)
        if (altPreamble) {
          // A preamble in else-if context is not supported.
          this.state.errors.push({
            code: 'BF102',
            severity: 'error',
            message: `Complex predicate in else-if is not supported: ${altIfStmt.condition}`,
            loc: this.makeLoc(),
            suggestion: {
              message: GO_REMEDIATION_OPTIONS,
            },
          })
        }
        const altConsequent = this.renderNode(altIfStmt.consequent, ctx)
        result += `{{else if ${altCondition}}}${altConsequent}`
        if (altIfStmt.alternate) {
          const altElse = this.renderNode(altIfStmt.alternate, ctx)
          result += `{{else}}${altElse}`
        }
      } else {
        const alternate = this.renderNode(ifStmt.alternate, ctx)
        result += `{{else}}${alternate}`
      }
    }

    result += '{{end}}'
    return result
  }

  renderConditional(cond: IRConditional): string {
    // @client directive → comment markers for client-side evaluation.
    if (cond.clientOnly) {
      return this.renderClientOnlyConditional(cond)
    }

    const { condition: goCondition, preamble } = this.convertConditionToGo(cond.condition, cond.parsedCondition)
    const whenTrue = this.renderNode(cond.whenTrue)

    // Reactive (has slotId): wrap each branch with a cond marker.
    if (cond.slotId) {
      const whenTrueWrapped = this.wrapWithCondMarker(whenTrue, cond.slotId)
      let result = `${preamble}{{if ${goCondition}}}${whenTrueWrapped}`

      if (cond.whenFalse) {
        // null/undefined branches get empty comment markers for client hydration.
        if (cond.whenFalse.type === 'expression') {
          const exprNode = cond.whenFalse as IRExpression
          if (exprNode.expr === 'null' || exprNode.expr === 'undefined') {
            // Empty markers so the client can insert content later.
            const emptyMarkers = `{{bfComment "cond-start:${cond.slotId}"}}{{bfComment "cond-end:${cond.slotId}"}}`
            result += `{{else}}${emptyMarkers}`
          } else {
            const whenFalse = this.renderNode(cond.whenFalse)
            const whenFalseWrapped = this.wrapWithCondMarker(whenFalse, cond.slotId)
            result += `{{else}}${whenFalseWrapped}`
          }
        } else {
          const whenFalse = this.renderNode(cond.whenFalse)
          const whenFalseWrapped = this.wrapWithCondMarker(whenFalse, cond.slotId)
          result += `{{else}}${whenFalseWrapped}`
        }
      }

      result += '{{end}}'
      return result
    }

    // Non-reactive path.
    let result = `${preamble}{{if ${goCondition}}}${whenTrue}`

    if (cond.whenFalse && cond.whenFalse.type !== 'expression') {
      const whenFalse = this.renderNode(cond.whenFalse)
      if (whenFalse && whenFalse !== '{{""}}') {
        result += `{{else}}${whenFalse}`
      }
    } else if (cond.whenFalse && cond.whenFalse.type === 'expression') {
      const exprNode = cond.whenFalse as IRExpression
      if (exprNode.expr !== 'null' && exprNode.expr !== 'undefined') {
        const whenFalse = this.renderNode(cond.whenFalse)
        if (whenFalse && whenFalse !== '{{""}}') {
          result += `{{else}}${whenFalse}`
        }
      }
    }

    result += '{{end}}'
    return result
  }

  /**
   * Convert a JS condition to Go template condition syntax. `preamble` holds
   * template blocks that must be emitted before the `{{if}}` (e.g. every/some
   * range blocks).
   */
  private convertConditionToGo(
    jsCondition: string,
    // Pre-parsed tree from the IR (`IRConditional.parsedCondition` /
    // `IRIfStatement.parsedCondition`), reused instead of re-parsing here.
    preParsed?: ParsedExpr,
  ): { condition: string; preamble: string } {
    const trimmed = jsCondition.trim()
    const parsed = inlineComputedConsts(preParsed ?? parseExpression(trimmed), this.state.computedConsts)

    // #2898: inside a #2224 per-item unrolled static-array loop body there is
    // no `{{range}}` dot-context for an item-bound condition to resolve
    // against, so it must bake to a Go literal here (same reasoning as the
    // `staticLoopItemStack` override in `convertExpressionToGo`). An
    // item-independent condition needs no such rewrite and falls through to
    // the normal path below. `classifyBakedCondition` returning `null` here
    // is the same pre-verified invariant `convertExpressionToGo`'s override
    // guards against, not a real path.
    if (this.staticLoopItemStack.length > 0) {
      const classified = classifyBakedCondition(parsed, this.staticLoopBindings())
      if (classified === null) {
        this.staticLoopBakeFailed = true
        return { condition: 'false', preamble: '' }
      }
      if (classified.kind === 'literal') {
        return { condition: classified.go, preamble: '' }
      }
      // 'independent' — fall through to the normal lowering below.
    }

    const support = isSupported(parsed)

    if (!support.supported) {
      this.state.errors.push({
        code: 'BF102',
        severity: 'error',
        message: `Condition not supported: ${trimmed}`,
        loc: this.makeLoc(),
        suggestion: {
          message: buildUnsupportedSuggestion(support),
        },
      })
      return { condition: `false`, preamble: '' }
    }

    const { preamble, expr: condition } = renderConditionExpr(this.conditionExprHost, parsed)
    // A bare value read as the whole test (`{tags() ? … : …}`) gets JS
    // truthiness: `{{if}}` alone reads an empty slice or map as false, where
    // JS reads `[]` / `{}` as true. Operator tests (`&&`, comparisons) keep
    // their own lowering.
    return { condition: isBareValueRead(parsed) ? lowerJsTruthyTest(parsed, condition) : condition, preamble }
  }

  /** The destructure accessor `name` resolves to, or undefined when the
   * nearest binding of `name` in `scope` is not a destructure binding: an
   * inner item, index or preamble local shadows it (#3392). */
  private lookupDestructureBinding(name: string): string | undefined {
    const hit = this.scope.lookup(name)
    if (hit?.binding.source !== 'destructure') return undefined
    return this.destructureAccessors.get(hit.frame)?.get(name)
  }

  /** Innermost-first lookup mirroring `loopBindingStack`'s search in
   * `identifier()`, but over the object-rest exclude-key side table. */
  private lookupRestExclude(name: string): { parent: string; excludeKeys: string[] } | undefined {
    for (let i = this.loopRestExcludeStack.length - 1; i >= 0; i--) {
      const info = this.loopRestExcludeStack[i].get(name)
      if (info) return info
    }
    return undefined
  }

  /**
   * Memoized bakeability check for a static-array loop whose body is a
   * single child component (#2208) — see `analyzeBakeableStaticChildLoop`'s
   * docstring. Accepts either an `IRLoop` (the `renderLoop` gate) or a
   * `NestedComponentInfo` (`generateNewPropsFunction`/Input-struct sites) —
   * both carry the same `loopArrayParsed`/`loopParam`/`loopKey`/props data,
   * just under different field names, so this normalizes to one shape and
   * caches by marker id so all three call sites agree.
   */
  private getBakedStaticChildLoop(
    markerId: string,
    childComponent: { props: IRLoopChildComponent['props'] },
    arrayParsed: ParsedExpr | undefined,
    param: string | undefined,
    key: string | undefined,
  ): BakedStaticChildLoop | null {
    if (this.bakedStaticChildLoopCache.has(markerId)) {
      return this.bakedStaticChildLoopCache.get(markerId) ?? null
    }
    // #2482 Stage 3: this method is called from TWO sites outside the live
    // `renderLoop` tree walk (`generateNewPropsFunction`'s Input-struct
    // field list and constructor-generation pass, per the docstring above)
    // where there is no live `this.scope` to consult — so, unlike
    // `renderLoop`'s own `analyzeBakeableStaticElementLoop` call, this stays
    // on the coarse whole-component shadow-name Set `primeCompileState`
    // populates. A genuinely-legitimate surviving use of the pre-#2482
    // device (flagged for Stage 4 rather than migrated here).
    const result = analyzeBakeableStaticChildLoop(
      { props: childComponent.props, loopArrayParsed: arrayParsed, loopParam: param, loopKey: key },
      this.state.localConstants,
      { isNameShadowed: name => this.state.staticLoopSourceBoundNames.has(name) },
    )
    this.bakedStaticChildLoopCache.set(markerId, result)
    return result
  }

  /**
   * BF101 for a loop over a computed const no template binds. The source is
   * read from its parsed tree, which unwraps parentheses: `(items).map(…)`
   * names the same const as `items.map(…)` (#3473).
   */
  private refuseComputedConstLoopSource(loop: IRLoop): void {
    const arraySource = loop.arrayParsed ?? parseExpression(loop.array.trim())
    const arrayName = arraySource.kind === 'identifier' ? arraySource.name : null
    // #2482 Stage 4: guard against an ENCLOSING loop's own item param
    // shadowing a same-named module/component const (`items.map(items =>
    // items.map(...))`) — without this, a bare-identifier array reference
    // that resolves to the outer loop's per-row value could misresolve to
    // the shadowed const below and raise a false BF101. `this.scope` here
    // is the position-accurate ancestor scope (see the comment above
    // `bakedElementLoop`) — same shadow-guard shape as
    // `prop-handling.ts`'s `expandDynamicPropValue`.
    if (arrayName !== null && !this.scope.isBound(arrayName)) {
      const arrayConst = this.state.localConstants.find(c => c.name === arrayName)
      if (arrayConst && arrayConst.parsed && !this.isStringExpr(arrayConst.parsed, new Set())) {
        this.state.refusedLoopArrayConsts.add(arrayName)
        this.state.errors.push({
          code: 'BF101',
          severity: 'error',
          message: `Loop array \`${arrayName}\` is a const (module- or function-scope) computed value (\`${arrayConst.value}\`) that the Go template adapter cannot bind as a template variable — only a string-derived local resolves to a generated struct field.`,
          loc: loop.loc ?? this.makeLoc(),
          suggestion: {
            message:
              'Pre-compute the array server-side and pass it as a prop, or mark the loop position as @client-only so it runs in JS on the client.',
            escape: [{ kind: 'prop-precompute' }, { kind: 'client-directive' }],
          },
        })
      }
    }
  }

  /** Render a `.map()` loop as a Go `{{range}}` (`loop/render-loop.ts`). */
  renderLoop(loop: IRLoop): string {
    return renderLoopWithHost(this.loopRenderHost, loop)
  }

  /**
   * When `comp`'s JSX children contain template actions (nested components,
   * dynamic text) — i.e. none of the static bake paths in
   * `collectStaticChildInstances` apply — render them into a companion define
   * and return its name; `renderComponent` then routes the child call through
   * `bf_with_children` + `bf_tmpl`. Returns null for childless or
   * statically-bakeable children, which keep the constructor-baked `Children`
   * value.
   */
  private queueDynamicChildrenDefine(comp: IRComponent): string | null {
    const effectiveChildren = comp.children.length > 0
      ? comp.children
      : resolveJsxChildrenProp(comp.props)
    if (effectiveChildren.length === 0) return null
    if (this.extractTextChildren(effectiveChildren) !== null) return null
    if (this.extractHtmlChildren(effectiveChildren) !== null) return null
    if (this.extractScopedHtmlChildren(effectiveChildren) !== null) return null
    const name = `${this.state.componentName}__children_${comp.slotId}`
    if (!this.state.pendingChildrenDefines.some(d => d.name === name)) {
      this.state.pendingChildrenDefines.push({
        name,
        content: this.renderWrapperRowDefine(effectiveChildren),
      })
    }
    return name
  }

  /**
   * #2703/B2: extend `queueDynamicChildrenDefine`'s companion-define delivery
   * from the reserved `children` slot to NAMED jsx-children props (any
   * JSX-valued prop other than `children`, e.g. `header={<strong>Title</strong>}`).
   * A named prop whose value can't be baked into a static Go string by
   * `emitStaticChildInstances`'s bake chain (`extractTextChildren` /
   * `extractHtmlChildren` / `extractScopedHtmlChildren`, all null) is queued
   * here instead, the same way; the caller composes the result into
   * `bf_with_props` + `bf_tmpl` at the STATIC (non-loop) call site — the one
   * shape `emitStaticChildInstances` bakes for at all (a component nested in
   * a loop row never reaches `collectStaticChildInstances`).
   *
   * Returns the flat `"FieldName" (bf_tmpl "name" .) ...` argument list ready
   * to splice into `bf_with_props` (`fieldArgs`, null when no declared-field
   * prop needs it), plus any props that instead route into the child's
   * rest bag (`bagEntries`, #2805) — each needs its OWN `bf_with_bag` call
   * at the call site rather than a `bf_with_props` argument pair, since
   * `WithProps` only ever targets a named struct field.
   */
  private queueDynamicPropDefine(
    comp: IRComponent,
  ): { fieldArgs: string | null; bagEntries: Array<{ bagField: string; key: string; defineName: string }> } {
    const args: string[] = []
    const bagEntries: Array<{ bagField: string; key: string; defineName: string }> = []
    // #2822: cross-file shapes/field-name maps are keyed by the child's own
    // declared name, not the caller-local alias — see `importAliases`.
    const declaredName = this.resolveChildName(comp.name)
    const childShape = this.childComponentShapes.get(declaredName)
    for (const prop of comp.props) {
      if (prop.value.kind !== 'jsx-children' || prop.name === 'children') continue
      const children = prop.value.children
      if (this.extractTextChildren(children) !== null) continue
      if (this.extractHtmlChildren(children) !== null) continue
      if (this.extractScopedHtmlChildren(children) !== null) continue
      const name = `${this.state.componentName}__prop_${prop.name}_${comp.slotId}`
      if (!this.state.pendingChildrenDefines.some(d => d.name === name)) {
        this.state.pendingChildrenDefines.push({
          name,
          content: this.renderWrapperRowDefine(children),
        })
      }
      // A prop routed into the child's rest bag (no declared param —
      // `emitChildField`/`loopRowChildPropOverrides`'s identical guard) has
      // no named Go field for `bf_with_props`/`WithProps` to target; route
      // it through `bf_with_bag`/`WithBagEntry` instead (#2805), keyed by
      // the RAW JSX attribute name — a rest-bag entry has no local alias to
      // resolve through `childPropFieldNames` the way a declared field does.
      // Synced onto every render-consulted bag field (`restBagOverrideFields`,
      // #3062) — a child that ALSO spreads this same rest binding onto an
      // element root reads a separate `Spread_N` field, which patching only
      // `restBagField` would leave stale.
      if (routesToRestBag(childShape, prop.name)) {
        for (const bagField of restBagOverrideFields(childShape)) {
          bagEntries.push({ bagField, key: prop.name, defineName: name })
        }
        continue
      }
      // `bf_with_props`/`WithProps` patches the child's Props struct, keyed
      // by the child's own LOCAL destructured field name — not necessarily
      // the caller's JSX attribute name (`function Card({ header: h })`
      // reads `h`, whose field is `H`, not `Header`). `WithProps` silently
      // no-ops on an unmatched field name, so skipping this lookup would
      // turn an aliased prop's dynamic delivery into a silent dropped
      // render. `childPropFieldNames` resolves this exact hazard for the
      // sibling `bf_with_props` call site (`loopRowChildPropOverrides`,
      // below) — mirrored here.
      const fieldName = this.childPropFieldNames.get(declaredName)?.get(prop.name) ?? capitalizeFieldName(prop.name)
      args.push(`${JSON.stringify(fieldName)} (bf_tmpl ${JSON.stringify(name)} .)`)
    }
    return { fieldArgs: args.length > 0 ? args.join(' ') : null, bagEntries }
  }

  /**
   * Queue a companion define for a loop body component's JSX children. Like
   * `queueDynamicChildrenDefine` but temporarily exits the `inLoop` context so
   * nested component calls render with the normal `.NameSlotN` field-access
   * pattern (the fields live on the wrapper struct that the
   * companion define receives as its data context). The loop param stack
   * stays intact so datum-field references (`payment.id` → `.Id`) still
   * resolve.
   *
   * `wrapperRow`: the define runs with a wrapper-slice row as its data (the
   * loop body IS `comp`), so a nested component's `.NameSlotN` is the ONE
   * instance the constructor built for every row
   * (`emitLoopRowBodyChildInstances`) and a prop reading the row must be
   * re-applied per row — see `renderingWrapperRowChildren`.
   */
  private queueLoopBodyChildrenDefine(comp: IRComponent, wrapperRow: boolean): string | null {
    const effectiveChildren = comp.children.length > 0
      ? comp.children
      : resolveJsxChildrenProp(comp.props)
    if (effectiveChildren.length === 0) return null
    if (this.extractTextChildren(effectiveChildren) !== null) return null
    if (this.extractHtmlChildren(effectiveChildren) !== null) return null
    if (this.extractScopedHtmlChildren(effectiveChildren) !== null) return null
    const name = `${this.state.componentName}__loop_children_${comp.slotId}`
    if (!this.state.pendingChildrenDefines.some(d => d.name === name)) {
      const wasInLoop = this.inLoop
      const wasWrapperRow = this.renderingWrapperRowChildren
      const wasRowVars = this.wrapperRowVars
      const wasDestructureVar = this.wrapperRowDestructureVar
      const wasRowFrame = this.wrapperRowFrame
      const wasScalarCallSite = this.scalarWrapperRowCallSite
      const wasRowScalar = this.wrapperRowScalar
      this.inLoop = false
      this.renderingWrapperRowChildren = wrapperRow
      this.scalarWrapperRowCallSite = false
      const scalarRow = this.loopScalarItemStack[this.loopScalarItemStack.length - 1] ?? false
      this.wrapperRowScalar = wrapperRow && scalarRow
      const rowVarNames = wrapperRow ? this.innermostRowVarNames() : []
      this.wrapperRowVars = rowVarNames.length > 0 ? { names: new Set(rowVarNames), used: new Set() } : null
      this.wrapperRowDestructureVar = wrapperRow ? this.innermostDestructureRangeVar : null
      this.wrapperRowFrame = wrapperRow ? this.innermostRowFrame() : null
      try {
        const content = this.renderWrapperRowDefine(effectiveChildren)
        this.state.pendingChildrenDefines.push({ name, content })
        const used = this.wrapperRowVars ? rowVarNames.filter(v => this.wrapperRowVars!.used.has(v)) : []
        if (used.length > 0) this.wrapperRowVarsByDefine.set(name, used)
        else this.wrapperRowVarsByDefine.delete(name)
      } finally {
        this.inLoop = wasInLoop
        this.renderingWrapperRowChildren = wasWrapperRow
        this.wrapperRowVars = wasRowVars
        this.wrapperRowDestructureVar = wasDestructureVar
        this.wrapperRowFrame = wasRowFrame
        this.scalarWrapperRowCallSite = wasScalarCallSite
        this.wrapperRowScalar = wasRowScalar
      }
    }
    return name
  }

  /**
   * The innermost loop's own `{{range}}`/preamble variables besides its row
   * value — its index (`$i`) and each callback-body local (`$t`) — as the
   * shared `scope` records them. A `.keys()` loop's key param isn't bound
   * in `scope` (see `enterLoopRow`'s caller), so it isn't delivered.
   */
  private innermostRowVarNames(): string[] {
    return [...this.scope.boundNames()].filter(name => {
      const hit = this.scope.lookup(name)
      return hit !== null && hit.depth === 0 && (hit.binding.source === 'index' || hit.binding.source === 'preamble')
    })
  }

  /** The innermost loop's row frame in `scope`, or null when it binds nothing. */
  private innermostRowFrame(): ScopeFrame | null {
    for (const name of this.scope.boundNames()) {
      const hit = this.scope.lookup(name)
      if (hit !== null && hit.depth === 0) return hit.frame
    }
    return null
  }

  /**
   * Render `children` as the body of a companion define. For a wrapper
   * row's forwarded children the define is a separate template that can't
   * see the calling `{{range}}`'s variables, so it rebinds, at its top, the
   * ones its lowering resolved a read to (`wrapperRowReads`). Its data is
   * the row wrapper (the loop's own define, or a companion define it
   * executes with that same `.`), so a destructured row's range variable
   * (`$__bf_item0.Tone`) and the row value's own variable (`$o`, read
   * from a nested loop where `.` is the inner row, #3596) are `.` itself
   * (#3313), and the loop's index or a callback local is one
   * `{{$v := index .BfRowVars "v"}}`, recorded so the call site hands it
   * over (`wrapperRowVars`).
   */
  private renderWrapperRowDefine(children: IRNode[]): string {
    const wasReads = this.wrapperRowReads
    const reads = new Set<string>()
    this.wrapperRowReads = this.renderingWrapperRowChildren ? reads : null
    let content: string
    try {
      content = this.renderChildren(children)
    } finally {
      this.wrapperRowReads = wasReads
    }
    if (!this.renderingWrapperRowChildren) return content
    let prefix = ''
    const rangeVar = this.wrapperRowDestructureVar
    const frame = this.wrapperRowFrame
    if (rangeVar && [...reads].some(name => frame?.bindings.get(name)?.source === 'destructure')) {
      prefix += `{{$${rangeVar} := .}}`
    }
    // The row value itself, read as its range variable where `.` is
    // something else — a nested loop's predicate or body (`t !== o.label`,
    // #3596) — is the define's `.` too.
    let itemPrefix = ''
    for (const name of [...reads].filter(n => frame?.bindings.get(n)?.source === 'item')) {
      itemPrefix += `{{$${name} := .}}`
    }
    let varsPrefix = ''
    const rowVars = this.wrapperRowVars
    for (const v of rowVars ? [...rowVars.names].filter(name => reads.has(name)) : []) {
      rowVars!.used.add(v)
      varsPrefix += `{{$${v} := index .BfRowVars ${JSON.stringify(v)}}}`
    }
    // A scalar row's define reads the bare value as `.`. Handed the wrapper
    // instead so it can rebind the row variables above, it ranges once over
    // the value (`bf_arr`, so a falsy `0`/`""`/`false` still renders).
    if (this.wrapperRowScalar && varsPrefix) {
      return `${varsPrefix}{{range bf_arr .${SCALAR_ROW_ITEM_FIELD}}}${prefix}${itemPrefix}${content}{{end}}`
    }
    return prefix + itemPrefix + varsPrefix + content
  }

  /**
   * Record that the lowering just resolved `name` to `rendered` — a
   * `{{range}}`/preamble variable or a destructure accessor over the range
   * variable — for the wrapper-row define being rendered, when `name` is
   * bound by that define's calling row (`wrapperRowFrame`); an inner loop's
   * binding of the same name is its own `{{range}}` variable and needs no
   * rebinding. Returns `rendered`.
   */
  private noteWrapperRowRead(name: string, rendered: string): string {
    if (this.wrapperRowReads && this.wrapperRowFrame && this.scope.lookup(name)?.frame === this.wrapperRowFrame) {
      this.wrapperRowReads.add(name)
    }
    return rendered
  }

  /** A loop variable read as its `$name` template variable (`noteWrapperRowRead`). */
  private rowVarRef(name: string): string {
    return this.noteWrapperRowRead(name, `$${name}`)
  }

  /** Run `render` with its row variable reads kept out of `wrapperRowReads`. */
  private withoutWrapperRowReads<T>(render: () => T): T {
    const wasReads = this.wrapperRowReads
    this.wrapperRowReads = null
    try {
      return render()
    } finally {
      this.wrapperRowReads = wasReads
    }
  }

  /**
   * Wrap a child call's props value in the per-row prop re-application
   * `loopRowChildPropOverrides` asked for: `bf_reprops` (re-runs the child's
   * constructor) or `bf_with_props` for named fields, then one `bf_with_bag`
   * per rest-bag entry (#3062 — disjoint from the named fields, so the order
   * between the two doesn't matter). Shared by every call site that renders
   * a row's child through a once-built instance.
   */
  private wrapLoopRowPropOverrides(
    base: string,
    declaredName: string,
    overrides: ReturnType<typeof loopRowChildPropOverrides>,
  ): string {
    let out = base
    if (overrides?.args) {
      out = overrides.helper === 'bf_reprops'
        ? `(bf_reprops ${JSON.stringify(declaredName)} ${out} ${overrides.args})`
        : `(bf_with_props ${out} ${overrides.args})`
    }
    for (const entry of overrides?.bagEntries ?? []) {
      out = `(bf_with_bag ${out} ${JSON.stringify(entry.bagField)} ${JSON.stringify(entry.key)} ${entry.go})`
    }
    return out
  }

  renderComponent(comp: IRComponent, ctx?: { isRootOfClientComponent?: boolean }): string {
    // Portal collects its content for emission at </body>.
    if (comp.name === 'Portal') {
      return this.renderPortalComponent(comp)
    }

    // Dynamic-tag local (`const Tag = children.tag`): there is no template named
    // `<Tag>` to call — emitting `{{template "Tag" .TagSlot0}}` would reference a
    // template that can never be registered, and Go's html/template escape-walks
    // ALL registered templates (even dead branches), so the whole render fails
    // with `no such template "Tag"`. Lower it to its children passthrough so the
    // dead branch renders harmlessly and the Slot template registers cleanly.
    if (comp.dynamicTag) {
      return this.renderChildren(comp.children)
    }

    // In Go templates, components are rendered via {{template "name" data}}.
    // #2822: the STRING passed to `{{template "..."}}` (and the `bf_reprops`
    // registry-key argument below) must be the child's own DECLARED name —
    // that's what the child's own compiled Go file registers its
    // `{{define "..."}}` block under. A field-access expression like
    // `.${comp.name}${suffix}` stays keyed by `comp.name` (the caller-local
    // alias) — it names THIS parent's own struct field, declared and read
    // consistently within this one parent's generated code, with no
    // cross-file identity to match.
    const declaredName = this.resolveChildName(comp.name)
    let templateCall: string
    if (this.inLoop && (this.loopWrapperStack[this.loopWrapperStack.length - 1] ?? false)) {
      // Wrapper-slice loop (body IS this component): `.` is the wrapper struct
      // embedding the child's Props. Loop body component with JSX children:
      // render children through a companion define so `bf_with_children`
      // injects them at template execution time. Temporarily exit loop context
      // so nested component calls (e.g. TableCell inside TableRow) use the
      // normal non-loop rendering path (`.TableCellSlotN` fields on the
      // wrapper struct), while the loop param stack stays intact so datum
      // references resolve.
      //
      // A prop of this component that reads the row (`tone={item.shade}`) is
      // re-applied per row here (`loopRowChildPropOverrides`), the same
      // delivery the non-wrapper branch below uses: the constructor builds
      // each row's embedded `<Name>Props` without it (`lowerChildInputFields`
      // skips a row read). The override patches that embedded Props value,
      // never the wrapper, so a row datum field of the same name
      // (`Tone` from `item.tone`) can't absorb it; the forwarded children
      // still get the whole wrapper.
      // Only a row with forwarded children has the wrapper (and its
      // embedded `<Name>Props`); a bare child row is its own `<Name>Props`,
      // built per row from its full Input (`loopRowChildInputFields`).
      const overrides = comp.children.length > 0 ? loopRowChildPropOverrides(this.loopRenderHost, comp) : null
      const base = overrides
        ? this.wrapLoopRowPropOverrides(`.${declaredName}Props`, declaredName, overrides)
        : '.'
      const loopBodyDefine = this.queueLoopBodyChildrenDefine(comp, true)
      if (loopBodyDefine) {
        // Scalar-item loop: feed the body define the wrapper's `.BfLoopItem` (the
        // bare range value) so `{n}` → `{{.}}` renders it; object loops keep `.`
        // (the wrapper, whose embedded fields the body reads as `.Field`).
        // A define reading the loop's index or a callback local gets them in
        // the wrapper's `BfRowVars` (`renderWrapperRowDefine`).
        // A scalar row's define that reads them gets the wrapper too, and
        // ranges over its `BfLoopItem` itself.
        const rowVars = this.wrapperRowVarsByDefine.get(loopBodyDefine) ?? []
        const bodyData = rowVars.length > 0
          ? `(bf_with_props . "BfRowVars" (bf_map ${rowVars.map(v => `${JSON.stringify(v)} $${v}`).join(' ')}))`
          : this.loopScalarItemStack[this.loopScalarItemStack.length - 1]
            ? `.${SCALAR_ROW_ITEM_FIELD}`
            : '.'
        templateCall = `{{template "${declaredName}" (bf_with_children ${base} (bf_tmpl "${loopBodyDefine}" ${bodyData}))}}`
      } else {
        templateCall = `{{template "${declaredName}" ${base}}}`
      }
    } else if (this.inLoop && comp.slotId) {
      // Non-wrapper loop (component nested inside an element item, #2130):
      // the range iterates the REAL collection, so `.` is the raw datum and
      // carries none of the child's props by default. Call through the
      // parent's once-per-slot instance via the root context (`$` — the
      // define's own data, i.e. the parent's Props). Two kinds of per-row
      // content have to reach that shared instance at template-execution
      // time: JSX children, injected via a loop-body children define
      // executed with the datum (`bf_with_children`), and any PROP that
      // reads the row (`text={row.label}`, #2445) — the instance is built
      // ONCE outside `{{range}}`, so a loop-dependent prop is stale there
      // and is reapplied per row via `bf_with_props`
      // (`loopRowChildPropOverrides`). The shared BASE instance (built once)
      // still carries identical child scope IDs across rows — the same
      // contract the wrapper machinery's `bodyChildInstances` already uses.
      const suffix = slotIdToFieldSuffix(comp.slotId)
      const overrides = loopRowChildPropOverrides(this.loopRenderHost, comp)
      const loopBodyDefine = this.queueLoopBodyChildrenDefine(comp, false)
      // `bf_reprops` re-runs the child's constructor and so takes the
      // component name; `bf_with_props` patches fields and doesn't (#2448).
      // Either way the props helper stays INNER — `bf_with_children` applies
      // the row's children last, on the rebuilt value.
      const base = this.wrapLoopRowPropOverrides(`$.${comp.name}${suffix}`, declaredName, overrides)
      templateCall = loopBodyDefine
        ? `{{template "${declaredName}" (bf_with_children ${base} (bf_tmpl "${loopBodyDefine}" .))}}`
        : `{{template "${declaredName}" ${base}}}`
    } else if (this.inLoop) {
      // Loop-nested component without a slotId: no parent field to route
      // through — legacy passthrough of the current dot.
      templateCall = `{{template "${declaredName}" .}}`
    } else if (comp.slotId) {
      // Static children with slotId: unique field name based on slotId.
      const suffix = slotIdToFieldSuffix(comp.slotId)
      const childrenDefine = this.queueDynamicChildrenDefine(comp)
      // #2703/B2: a NAMED jsx-children prop (any JSX-valued prop other than
      // `children`) that couldn't be baked into the constructor gets the
      // same treatment `children` already has — delivered at the call site
      // via a companion define. Props helper stays INNER, same ordering
      // rule as the loop-nested branch above: `bf_with_children` applies
      // last, on the props-patched value.
      const propResult = this.queueDynamicPropDefine(comp)
      let base = propResult.fieldArgs
        ? `(bf_with_props .${comp.name}${suffix} ${propResult.fieldArgs})`
        : `.${comp.name}${suffix}`
      // Each rest-bag prop (#2805) wraps in its OWN `bf_with_bag` call,
      // outside the (optional) `bf_with_props` wrap — the two helpers patch
      // disjoint fields (a declared struct field vs. a rest-bag map key), so
      // ordering between them doesn't matter; `bf_with_props` stays
      // innermost only because it was already there.
      for (const entry of propResult.bagEntries) {
        base = `(bf_with_bag ${base} ${JSON.stringify(entry.bagField)} ${JSON.stringify(entry.key)} (bf_tmpl ${JSON.stringify(entry.defineName)} .))`
      }
      // Inside a wrapper-slice row's forwarded-children define, `.NameSlotN`
      // is the one instance the constructor built for every row, so a prop
      // reading the row (`<Mark tone={o.tone}>`) is re-applied per row here —
      // the same delivery a component nested in an element row gets above.
      //
      // This puts the row's props helper OUTSIDE the named-prop/bag helpers
      // above, the reverse of the loop-nested branch's order. That is safe
      // because the two can only meet as `bf_reprops` over `bf_with_props`: a
      // `bf_with_bag` entry needs a child with a rest bag, and a child with a
      // rest bag never gets a props rebuilder (`recordRepropsSpec` declines
      // `restPropsName`), so it is only ever patched by `bf_with_props` /
      // `bf_with_bag`, which touch disjoint fields in any order. `bf_reprops`
      // rebuilds the Input from every declared Props field, so a named prop
      // patched just inside it is carried into the re-run constructor.
      if (this.renderingWrapperRowChildren) {
        base = this.wrapLoopRowPropOverrides(base, declaredName, loopRowChildPropOverrides(this.loopRenderHost, comp, true))
      }
      templateCall = childrenDefine
        ? `{{template "${declaredName}" (bf_with_children ${base} (bf_tmpl "${childrenDefine}" .))}}`
        : `{{template "${declaredName}" ${base}}}`
    } else {
      // Static children without slotId: fall back to .ComponentName.
      templateCall = `{{template "${declaredName}" .${comp.name}}}`
    }

    // A root component in a client component needs a scope comment for the
    // hydration boundary. #3141: this used to emit ONLY the opening marker
    // — the missing end marker is the #2289 sibling-leak shape (queries
    // from this scope could read into later siblings the parent owns).
    // Matches `comp.needsScopeComment` (`IRComponent.needsScopeComment`,
    // #3141's shared IR flag) whenever `comp` is literally the render root,
    // which is the only case `ctx?.isRootOfClientComponent` is set true for
    // outside an if-statement branch.
    if (ctx?.isRootOfClientComponent) {
      return this.wrapComponentRootScopeComment(templateCall)
    }
    return templateCall
  }

  /**
   * Render a Portal component by adding its children to PortalCollector. Portal
   * content is rendered at </body> instead of inline: static content via a plain
   * string literal, dynamic content via `bfPortalHTML()` (parses and executes
   * the template string with the provided data).
   */
  private renderPortalComponent(comp: IRComponent): string {
    const children = this.renderChildren(comp.children)

    // Escape for a Go double-quoted string literal.
    const escapedContent = children
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')

    // Dynamic content (has template expressions) → bfPortalHTML.
    if (children.includes('{{')) {
      return `{{.Portals.Add .ScopeID (bfPortalHTML . "${escapedContent}")}}`
    }

    return `{{.Portals.Add .ScopeID "${escapedContent}"}}`
  }

  /**
   * Wrap already-rendered output in the comment-based scope marker pair.
   * Shared by a `needsScopeComment` fragment root and a root component call
   * (#3141) — both are "this scope has no DOM element of its own to carry
   * a struct-derived scope id", so both lean on the same runtime helpers.
   */
  private wrapComponentRootScopeComment(rendered: string): string {
    return `{{bfScopeComment .}}${rendered}{{bfScopeCommentEnd .}}`
  }

  private renderSlot(slot: IRSlot): string {
    // Slots use Go template's `block`.
    const slotName = slot.name === 'default' ? 'children' : slot.name
    return `{{block "${slotName}" .}}{{end}}`
  }

  override renderAsync(node: IRAsync): string {
    const fallback = this.renderNode(node.fallback)
    const children = this.renderChildren(node.children)
    // Go templates use the OOS protocol: render a placeholder with fallback,
    // the StreamRenderer resolves boundaries and streams replacement chunks.
    return `{{bfAsyncBoundary "${node.id}" "${escapeGoString(fallback)}"}}\n${children}`
  }

  /**
   * AttrValue lowering for intrinsic-element attributes. Routed through the
   * shared dispatcher so a new AttrValue kind becomes a TS compile error here.
   *
   * Components have no equivalent AttrValueEmitter: Go templates pass
   * component-instance props as Go struct fields (built by
   * `collectStaticChildInstances`), not as string-emitted markup, so that path
   * doesn't share a contract with the intrinsic-attribute one.
   */
  private readonly elementAttrEmitter: AttrValueEmitter = {
    emitLiteral: (value, name) => `${name}="${escapeHtml(value.value)}"`,
    emitExpression: (source, name) => {
      // A computed const reads as its initializer (#3494).
      const value = inlineComputedConstAttr(source, this.state.computedConsts)
      const unparsed = emitStyleOrPresenceAttr(this.elementAttrHost, value, name)
      if (unparsed !== null) return unparsed
      const parsed = value.parsed ?? parseExpression(value.expr.trim())
      // The reads of the attribute's source text for the nil-guarded omission
      // paths (`attr/element-attrs.ts`) stay here, next to the parse above.
      // A props-object access (`props.id`) is normalized to its bare prop name
      // (`id`); a closed-type `{...rest}` key (#3057) is a bare `rest.key`.
      const bareId = value.expr.trim()
      const propName =
        this.state.propsObjectName && bareId.startsWith(`${this.state.propsObjectName}.`)
          ? bareId.slice(this.state.propsObjectName.length + 1)
          : bareId
      const restKeyRead = Boolean(
        this.state.restPropsName &&
        bareId.startsWith(`${this.state.restPropsName}.`) &&
        /^[A-Za-z_$][\w$]*$/.test(bareId.slice(this.state.restPropsName.length + 1)),
      )
      return emitParsedExpressionAttr(this.elementAttrHost, value, name, parsed, {
        nillablePropName: /^[A-Za-z_$][\w$]*$/.test(propName) ? propName : null,
        viaPropsObject: propName !== bareId,
        restKeyRead,
      })
    },
    emitBooleanAttr: (_value, name) => name,
    emitSpread: (value) => emitSpreadAttr(this.elementAttrHost, value),
    emitTemplate: (value, name) => emitTemplateAttr(this.elementAttrHost, value, name),
    // Neither variant is legal on intrinsic elements.
    emitBooleanShorthand: () => '',
    emitJsxChildren: () => '',
  }

  /** The adapter-owned renders and lookups the attribute emission (`attr/element-attrs.ts`) reads. */
  private readonly elementAttrHost: ElementAttrHost = {
    ctx: this.emitCtx,
    renderParsedExpr: (expr) => this.renderParsedExpr(expr),
    isTemplateFragment: (go, kind) => this.isTemplateFragment(go, kind),
    numericTextExpression: (goExpr, expr) => this.numericTextExpression(goExpr, expr),
    nillablePropFieldRef: (propName, viaPropsObject) => this.nillablePropFieldRef(propName, viaPropsObject),
    isBound: (name) => this.scope.isBound(name),
    inLoop: () => this.inLoop,
    isCurrentLoopItem: (name) => this.isCurrentLoopItem(name),
    lookupRestExclude: (name) => this.lookupRestExclude(name),
    noteWrapperRowRead: (name, rendered) => this.noteWrapperRowRead(name, rendered),
    makeLoc: () => this.makeLoc(),
  }

  /** The adapter-owned renders and lookups the condition and filter-predicate lowering (`expr/condition-expr.ts`) reads. */
  private readonly conditionExprHost: ConditionExprHost = {
    ctx: this.emitCtx,
    renderParsedExpr: (expr) => this.renderParsedExpr(expr),
    makeLoc: () => this.makeLoc(),
    hasScopeBinding: (name) => Boolean(this.scope.lookup(name)),
    filterCaptureAlias: (name) => this.filterCaptureAliases.get(name),
    lookupDestructureBinding: (name) => this.lookupDestructureBinding(name),
    noteWrapperRowRead: (name, rendered) => this.noteWrapperRowRead(name, rendered),
    isOuterRowItem: (name) => this.isOuterRowItem(name),
    hasLoopVarRef: (name) => this.loopVarRefCount.has(name),
    rowVarRef: (name) => this.rowVarRef(name),
    filterRootFieldRef: (name) => this.filterRootFieldRef(name),
    rootFieldRef: (name) => this.rootFieldRef(name),
    propKeyFieldRef: (key) => this.propKeyFieldRef(key),
    renderOptionalMember: (object, property) => this.renderOptionalMember(object, property),
    higherOrderShapeOf: (node) => this.higherOrderShapeOf(node),
    renderFilterLengthExpr: (filterExpr, renderArray) => this.renderFilterLengthExpr(filterExpr, renderArray),
    emitPlus: (leftExpr, rightExpr, leftRendered, rightRendered) => this._emitPlus(leftExpr, rightExpr, leftRendered, rightRendered),
    resolveLiteralConstAsGo: (name) => this.resolveLiteralConstAsGo(name),
    isCurrentLoopItem: (name) => this.isCurrentLoopItem(name),
    currentLoopItemRef: () => this.currentLoopItemRef(),
    isOuterLoopParam: (name) => this.isOuterLoopParam(name),
    isCurrentLoopRecord: (name) => this.isCurrentLoopRecord(name),
    conditionLengthFn: (expr) => this.conditionLengthFn(expr),
    isMapSeededSignalChain: (node) => this.isMapSeededSignalChain(node),
    isNillableNullishLeft: (expr) => this.isNillableNullishLeft(expr),
    isTemplatePrimitive: (path) => Boolean(this.templatePrimitives[path]),
  }

  /** The adapter-owned renders and lookups the member and array-method lowering (`expr/member-and-methods.ts`) reads. */
  private readonly memberAndMethodsHost: MemberAndMethodsHost = {
    ctx: this.emitCtx,
    makeLoc: () => this.makeLoc(),
    inLoop: () => this.inLoop,
    isBound: (name) => this.scope.isBound(name),
    higherOrderShapeOf: (node) => this.higherOrderShapeOf(node),
    renderFilterLengthExpr: (filterExpr, renderArray) => this.renderFilterLengthExpr(filterExpr, renderArray),
    renderHigherOrderExpr: (expr, renderArray) => this.renderHigherOrderExpr(expr, renderArray),
    renderFindTemplateBlock: (expr, renderArray, propertyAccess) => this.renderFindTemplateBlock(expr, renderArray, propertyAccess),
    renderEverySomeTemplateBlock: (expr, renderArray) => this.renderEverySomeTemplateBlock(expr, renderArray),
    propKeyFieldRef: (key) => this.propKeyFieldRef(key),
    rootFieldRef: (name) => this.rootFieldRef(name),
    isMapRootedContextChain: (node) => this.isMapRootedContextChain(node),
    isMapRootedPropChain: (node) => this.isMapRootedPropChain(node),
    isMapSeededSignalChain: (node) => this.isMapSeededSignalChain(node),
    resolveStaticRecordLiteralIndex: (jsExpr) => this.resolveStaticRecordLiteralIndex(jsExpr),
    isCurrentLoopRecord: (name) => this.isCurrentLoopRecord(name),
    renderOptionalMember: (object, property) => this.renderOptionalMember(object, property),
    emitOperand: (n, emit) => this.emitOperand(n, emit),
  }

  /** The adapter-owned renders, render-position state and lookups the loop lowering (`loop/render-loop.ts`) reads. */
  private readonly loopRenderHost: LoopRenderHost = {
    ctx: this.emitCtx,
    conditionExprHost: this.conditionExprHost,
    makeLoc: () => this.makeLoc(),
    renderParsedExpr: (expr) => this.renderParsedExpr(expr),
    renderChildren: (children) => this.renderChildren(children),
    scope: () => this.scope,
    setScope: (scope) => { this.scope = scope },
    inLoop: () => this.inLoop,
    setInLoop: (inLoop) => { this.inLoop = inLoop },
    innermostDestructureRangeVar: () => this.innermostDestructureRangeVar,
    setInnermostDestructureRangeVar: (rangeVar) => { this.innermostDestructureRangeVar = rangeVar },
    scalarWrapperRowCallSite: () => this.scalarWrapperRowCallSite,
    setScalarWrapperRowCallSite: (callSite) => { this.scalarWrapperRowCallSite = callSite },
    filterCaptureAliases: () => this.filterCaptureAliases,
    setFilterCaptureAliases: (aliases) => { this.filterCaptureAliases = aliases },
    staticLoopBakeFailed: () => this.staticLoopBakeFailed,
    setStaticLoopBakeFailed: (failed) => { this.staticLoopBakeFailed = failed },
    loopVarRefCount: () => this.loopVarRefCount,
    loopBindingStack: () => this.loopBindingStack,
    destructureAccessors: () => this.destructureAccessors,
    loopRestExcludeStack: () => this.loopRestExcludeStack,
    loopScalarItemStack: () => this.loopScalarItemStack,
    loopWrapperStack: () => this.loopWrapperStack,
    staticLoopItemStack: () => this.staticLoopItemStack,
    wrapperRowVarNames: () => this.wrapperRowVars?.names,
    getBakedStaticChildLoop: (markerId, childComponent, arrayParsed, param, key) =>
      this.getBakedStaticChildLoop(markerId, childComponent, arrayParsed, param, key),
    staticLoopBindings: () => this.staticLoopBindings(),
    refuseComputedConstLoopSource: (loop) => this.refuseComputedConstLoopSource(loop),
    nestedRowsField: (site) => this.nestedRowsField(site),
    scalarLiteralLoopGoType: (arrayParsed, itemType) => this.scalarLiteralLoopGoType(arrayParsed, itemType),
    lookupDestructureBinding: (name) => this.lookupDestructureBinding(name),
    isOuterRowItem: (name) => this.isOuterRowItem(name),
    rowVarRef: (name) => this.rowVarRef(name),
    isLoopShadowedName: (name) => this.isLoopShadowedName(name),
    resolveChildName: (name) => this.resolveChildName(name),
    childShape: (declaredName) => this.childComponentShapes.get(declaredName),
    childDerivedFieldDeps: (declaredName) => this.childDerivedFieldDeps.get(declaredName),
    childRepropsReady: (declaredName) => this.childRepropsReady.has(declaredName),
    childPropFieldName: (declaredName, propName) => this.childPropFieldNames.get(declaredName)?.get(propName),
    repropsOwner: () => this.repropsOwner,
    isTemplateFragment: (go, kind) => this.isTemplateFragment(go, kind),
  }

  /** The adapter-owned children bakes and provider-context lowering the static child-instance collection (`children/static-children.ts`) reads. */
  private readonly staticChildrenHost: StaticChildrenHost = {
    ctx: this.emitCtx,
    extractTextChildren: (children) => this.extractTextChildren(children),
    extractHtmlChildren: (children) => this.extractHtmlChildren(children),
    extractScopedHtmlChildren: (children) => this.extractScopedHtmlChildren(children),
    extendProviderContext: (current, p, propsParams) => this.extendProviderContext(current, p, propsParams),
  }

  /** The adapter-owned cross-file type registry, struct derivation and loop-array lookups the type synthesis (`type/type-synthesis.ts`) reads. */
  private readonly typeSynthesisHost: TypeSynthesisHost = {
    ctx: this.emitCtx,
    crossFileTypeAliases: () => this.crossFileTypeAliases,
    crossFileStructFields: () => this.crossFileStructFields,
    crossFileTypeDefinitions: () => this.crossFileTypeDefinitions,
    scannedCrossFileSources: () => this.scannedCrossFileSources,
    structFieldsFor: (owner, td) => this.structFieldsFor(owner, td),
    registerSynthStruct: (lines, name, fields, properties, comment) =>
      this.registerSynthStruct(lines, name, fields, properties, comment),
    propArrayLoopRowSource: (ir, nested) => this.propArrayLoopRowSource(ir, nested),
    extractMemoNameFromLoopArray: (loopArray) => this.extractMemoNameFromLoopArray(loopArray),
    makeLoc: () => this.makeLoc(),
  }

  renderScopeMarker(_instanceIdExpr: string): string {
    // bfScopeAttr returns the bare scope id (no `~` prefix). bfHydrationAttrs
    // emits bf-h / bf-m / bf-r conditionally (slot identity +
    // root-of-client-component marker).
    return `bf-s="{{bfScopeAttr .}}" {{bfHydrationAttrs .}} {{bfPropsAttr .}}`
  }

  renderSlotMarker(slotId: string): string {
    return `bf="${slotId}"`
  }

  renderCondMarker(condId: string): string {
    return `bf-c="${condId}"`
  }

  private wrapWithCondMarker(content: string, condId: string): string {
    // A single HTML element gets a bf-c attribute; fragments (multiple sibling
    // elements) use comment markers.
    if (content.startsWith('<')) {
      const match = content.match(/^<(\w+)/)
      if (match) {
        const tag = match[1]
        const trimmed = content.trim()
        const isSingle = trimmed.endsWith(`</${tag}>`) ||
          (trimmed.endsWith('/>') && trimmed.indexOf('>') === trimmed.length - 1)
        if (isSingle) {
          return content.replace(`<${match[1]}`, `<${match[1]} ${this.renderCondMarker(condId)}`)
        }
      }
    }
    // Go's html/template strips raw HTML comments, so emit comment markers via
    // the custom `bfComment` (which prepends "bf-", so "cond-start:x" becomes
    // "<!--bf-cond-start:x-->").
    return `{{bfComment "cond-start:${condId}"}}${content}{{bfComment "cond-end:${condId}"}}`
  }
}

export const goTemplateAdapter = new GoTemplateAdapter()

/** `s` as the body of a Go double-quoted string literal. */
function escapeGoTemplateString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
}

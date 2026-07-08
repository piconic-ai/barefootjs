/** BarefootJS adapter: BarefootJS IR → Go `html/template` files. */

import ts from 'typescript'

import type {
  ComponentIR,
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
  IRTemplatePart,
  IRProp,
  TypeInfo,
  TypeDefinition,
  CompilerError,
  SourceLocation,
  ParsedExpr,
  ObjectLiteralProperty,
  ParsedStatement,
  SortComparator,
  FlatDepth,
  TemplatePart,
  IRIfStatement,
  IRProvider,
  IRAsync,
  IRMetadata,
  TemplatePrimitiveRegistry,
  LoopBindingPathSegment,
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
  type SupportResult,
  isBooleanAttr,
  parseExpression,
  stringifyParsedExpr,
  parseStyleObjectEntries,
  isSupported,
  exprToString,
  identifierPath,
  asCallbackMethodCall,
  sortComparatorFromArrow,
  emitParsedExpr,
  emitIRNode,
  emitAttrValue,
  augmentInheritedPropAccesses,
  collectContextConsumers,
  isLowerableLoopDestructure,
  type ContextConsumer,
  collectModuleStringConsts as collectModuleStringConstsShared,
  prepareLoweringMatchers,
  envSignalReaderFor,
  computeSsrSeedPlan,
} from '@barefootjs/jsx'
import { findInterpolationEnd } from '@barefootjs/jsx/scanner'
import { BF_REGION, escapeHtml } from '@barefootjs/shared'

import {
  GO_IDENTIFIER,
  GO_KEYWORDS,
  capitalize,
  capitalizeFieldName,
  goFieldNameForKey,
  slotIdToFieldSuffix,
  loopKeyToGoFieldPath,
} from "./lib/go-naming.ts"
import {
  escapeGoString,
  wrapIfMultiToken,
  wrapGoArg,
  emitBfSort,
  emitSortEval,
  emitReduceEval,
  emitPredicateEval,
  emitFlatMapEval,
  emitMapEval,
  stringTolerantEqOperands,
  buildUnsupportedSuggestion,
  GO_REMEDIATION_OPTIONS,
  goPropDefault,
  applyGoFallback,
  goLiteral,
} from "./lib/go-emit.ts"
import type {
  GoRenderCtx,
  NestedComponentInfo,
  StaticChildInstance,
  ChildComponentShape,
  SpreadSlotInfo,
  PropFallbackVar,
  CtorLowerEnv,
  GoTemplateAdapterOptions,
} from "./lib/types.ts"
import { collectRootScopeNodes } from "./lib/ir-scope.ts"
import { GO_TEMPLATE_PRIMITIVES } from "./lib/constants.ts"
import { CompileState } from "./lib/compile-state.ts"
import { hasClientInteractivity, findNestedComponents } from "./analysis/component-tree.ts"
import type { GoEmitContext } from "./emit-context.ts"
import { inlineLocalHelperCall } from "./expr/helper-inline.ts"
import { lowerRegisteredCall } from "./expr/url-builder.ts"
import {
  convertInitialValue,
  jsLiteralToGo,
  objectLiteralToGoMap,
} from "./value/value-lowering.ts"
import { parsedLiteralToGo } from "./value/parsed-literal-to-go.ts"
import { typeInfoToGo } from "./type/type-codegen.ts"
import { isBooleanMemo, isListFilterMemo, isStringTernaryMemo } from "./memo/memo-type.ts"
import { lowerCtorExpr } from "./memo/ctor-lowering.ts"
import { resolveBlockBodyMemoModuleConst } from "./memo/memo-value.ts"
import { computeMemoInitialValue, computeMemoInitialValueOrNull, filterArmEarlierSiblingRefs } from "./memo/memo-compute.ts"
import { collectSpreadSlots, buildSpreadInitializer } from "./spread/spread-codegen.ts"
import { buildPropTypeOverrides, resolvePropGoType, collectNillablePropNames } from "./props/prop-types.ts"

export type { GoTemplateAdapterOptions } from "./lib/types.ts"

/**
 * Local re-materialisation of the (removed) `higher-order` ParsedExpr variant
 * (#2018 P5). Predicate callback methods (`.filter`/`.find`/`.every`/…) now
 * arrive as a generic `call` routed through `callbackMethod`; the structured
 * template-block / `bf_*` fallbacks still want the old destructured shape, so
 * `callbackMethod` rebuilds this from the arrow and threads it through the
 * `renderHigherOrder*` helpers unchanged.
 */
type HigherOrderShape = {
  method: HigherOrderMethod
  object: ParsedExpr
  param: string
  predicate: ParsedExpr
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

export class GoTemplateAdapter extends BaseAdapter implements ParsedExprEmitter, IRNodeEmitter<GoRenderCtx> {
  name = 'go-template'
  extension = '.tmpl'

  // Sentinel marking a parent-scope `bf-s` slot inside a hoisted-JSX children
  // bake (see `extractScopedHtmlChildren`). Can't appear in real HTML text.
  private static readonly SCOPE_SENTINEL = '__BF_SCOPE_SENTINEL__'
  importMapInjection = 'html-snippet' as const

  // `renderFilterExpr` recursion state. `filterExprDepth` lets the outer call
  // reset `filterExprUnsupported` per independent filter expression; the flag,
  // set in the `default` branch (BF101), is propagated up so the template stays
  // syntactically valid when a child rendered the fallback sentinel.
  private filterExprDepth = 0
  private filterExprUnsupported = false

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
    extractPropNameFromInitialValue: (initialValue) => this.extractPropNameFromInitialValue(initialValue),
    extractPropFallback: (initialValue) => this.extractPropFallback(initialValue),
    resolveModuleStringConst: (name) => this.resolveModuleStringConst(name),
  }

  /** Diagnostics from the current compile (backed by `CompileState`); `generate()` also merges these into `ir.errors`. */
  get errors(): CompilerError[] {
    return this.state.errors
  }

  private inLoop: boolean = false
  private loopParamStack: string[] = []
  /**
   * Per-loop: true when the body renders the bare range value (scalar-item
   * inline-literal loop), so the `bf_tmpl` companion is fed `.BfLoopItem` (the
   * wrapper's synthetic scalar field) instead of `.`. Innermost last.
   */
  private loopScalarItemStack: boolean[] = []
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
  private primeCompileState(ir: ComponentIR): void {
    this.state.propsObjectName = ir.metadata.propsObjectName
    this.state.restPropsName = ir.metadata.restPropsName ?? null
    this.state.moduleStringConsts = this.collectModuleStringConsts(ir.metadata.localConstants)
    this.state.localConstants = ir.metadata.localConstants ?? []
    this.state.localHelperNames = new Set(
      this.state.localConstants.filter(c => !c.isModule && c.containsArrow).map(c => c.name),
    )
    this.state.currentMemos = ir.metadata.memos ?? []
    this.state.currentTypeDefinitions = ir.metadata.typeDefinitions ?? []
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
  }

  /** Generate template output for a component. */
  generate(ir: ComponentIR, options?: AdapterGenerateOptions): AdapterOutput {
    this.state.componentName = ir.metadata.componentName
    this.state.errors = []
    this.state.referencedDerivedConsts = new Set()
    this.state.templateVarCounter = 0
    this.state.pendingChildrenDefines = []
    this.primeCompileState(ir)
    this.state.nillablePropNames = collectNillablePropNames(this.emitCtx, ir)

    // Surface loop-body usages of sibling-imported components (see
    // `checkImportedLoopChildComponents`). The barefoot CLI compiles a
    // source dir together onto one `*template.Template`, so it sets
    // `siblingTemplatesRegistered` and the check would be noise; stand-alone
    // `compileJSX` callers leave it unset and get the loud build-time error.
    if (!options?.siblingTemplatesRegistered) {
      this.checkImportedLoopChildComponents(ir)
    }

    const hasInteractivity = hasClientInteractivity(ir)
    const isRootComponent = ir.root.type === 'component'
    const isIfStatement = ir.root.type === 'if-statement'

    this.state.rootScopeNodes = collectRootScopeNodes(ir.root)
    // Map each array memo backing a loop (`<memo>().map(...)`) to that loop's
    // handler-filled slice field, so `<memo>().length` lowers to the slice's
    // length. Built before rendering — `.length` can precede the loop in source.
    this.state.memoBackedLoopSlice = new Map()
    for (const nested of findNestedComponents(ir.root)) {
      const memoName = this.extractMemoNameFromLoopArray(nested.loopArray)
      if (memoName) this.state.memoBackedLoopSlice.set(memoName, `${nested.name}s`)
    }
    const templateBody = isIfStatement
      ? this.renderIfStatement(ir.root as IRIfStatement, { isRootOfClientComponent: hasInteractivity })
      : this.renderNode(ir.root, { isRootOfClientComponent: hasInteractivity && isRootComponent })

    const scriptRegistrations = options?.skipScriptRegistration
      ? ''
      : this.generateScriptRegistrations(ir, options?.scriptBaseName)

    let template = `{{define "${this.state.componentName}"}}\n${scriptRegistrations}${templateBody}\n{{end}}\n`
    // Companion children defines execute with the parent's data via `bf_tmpl`.
    for (const d of this.state.pendingChildrenDefines) {
      template += `{{define "${d.name}"}}${d.content}{{end}}\n`
    }
    const types = this.generateTypes(ir)

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
   * Script registration code for the template start. Reads `.Scripts` (on every
   * Props struct) and guards the registrations with `{{if .Scripts}}` for a nil
   * collector.
   */
  private generateScriptRegistrations(ir: ComponentIR, scriptBaseName?: string): string {
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

    return `{{if .Scripts}}${registrations.join('')}{{end}}\n`
  }

  /**
   * Register a child component's shape (see `childComponentShapes`). Call once
   * per known child IR before the parent's `generateTypes`. Idempotent. Takes
   * only the IR's `metadata` so orchestrators that never build the full IR
   * (the CLI's cross-file shape pre-pass, #2131) can register from a bare
   * analyzer pass — a full `ComponentIR` still satisfies it structurally.
   */
  registerChildComponentShape(ir: Pick<ComponentIR, 'metadata'>): void {
    const name = ir.metadata.componentName
    if (!name) return
    const paramNames = new Set((ir.metadata.propsParams ?? []).map(p => p.name))
    const restPropsName = ir.metadata.restPropsName ?? null
    const restBagField = restPropsName ? capitalizeFieldName(restPropsName) : null
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
        .map(p => p.name),
    )
    this.childComponentShapes.set(name, { paramNames, restBagField, mapTypedParamNames })
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

  /** Go type for a context-consumer field, from its `createContext` default's type. */
  private contextConsumerGoType(c: ContextConsumer): string {
    if (typeof c.defaultValue === 'number') return 'int'
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

  generateTypes(ir: ComponentIR): string | null {
    this.state.usesHtmlTemplate = false
    this.state.usesFmt = false
    // Prime identically to `generate()` so the standalone `generateTypes` entry
    // can't drift the structs (e.g. a `{...props}` bag field in one entry only).
    this.primeCompileState(ir)
    const lines: string[] = []

    const componentName = ir.metadata.componentName

    this.buildLocalTypeTables(ir, componentName)

    this.emitLocalTypeStructs(lines, ir, componentName)

    this.emitSynthStructs(lines, ir, componentName)

    const nestedComponents = findNestedComponents(ir.root)

    this.resolveNestedLoopItemTypes(ir, nestedComponents)

    for (const nested of nestedComponents) {
      if (!nested.bodyChildren || nested.bodyChildren.length === 0) continue
      this.generateLoopBodyWrapperStruct(lines, componentName, nested)
    }

    const propTypeOverrides = buildPropTypeOverrides(this.emitCtx, ir)

    // Computed once (the walk is shared by all three generators). Also gates the
    // `Spread_<N> map[string]any` field `generateInputStruct` adds for
    // `input-bag` slots (the open-ended restPropsName spread bag).
    const spreadSlots = collectSpreadSlots(this.emitCtx, ir.root)

    this.generateInputStruct(lines, ir, componentName, nestedComponents, propTypeOverrides, spreadSlots)

    this.state.needsStringsImport = false
    this.generatePropsStruct(lines, ir, componentName, nestedComponents, propTypeOverrides, spreadSlots)

    this.generateNewPropsFunction(lines, ir, componentName, nestedComponents, spreadSlots, propTypeOverrides)

    return this.composeFileHeader(lines)
  }

  /** Convert a TS type definition to Go: object types → structs, string-literal unions → a `string` alias. */
  private typeDefinitionToGo(td: TypeDefinition): string | null {
    // A string-literal union (`type Filter = 'all' | 'active'`) carries no
    // `properties`, so detect the alias from the definition text.
    if (td.definition.match(/^type \w+ = ('[^']*'(\s*\|\s*'[^']*')*)/)) {
      return `// ${td.name} is a string type.\ntype ${td.name} = string`
    }

    const fields = this.structFieldsFor(td)
    if (fields.length === 0) return null

    const goFields = fields.map(
      f => `\t${f.goName} ${f.goType} \`json:"${this.toJsonTag(f.tsName)}"\``,
    )
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
   */
  private structFieldsFor(td: TypeDefinition): Array<{ tsName: string; goName: string; goType: string }> {
    const fields: Array<{ tsName: string; goName: string; goType: string }> = []
    const seenGoNames = new Set<string>()
    for (const prop of td.properties ?? []) {
      const goName = goFieldNameForKey(prop.name)
      if (seenGoNames.has(goName)) continue
      seenGoNames.add(goName)
      fields.push({
        tsName: prop.name,
        goName,
        goType: typeInfoToGo(this.emitCtx, prop.type),
      })
    }
    return fields
  }

  /**
   * Synthesise a Go struct from an untyped object-array signal's inline initial
   * value, or `null` (caller keeps `[]interface{}`/`nil`). Requires: untyped
   * array type; a non-empty array literal of object literals; every element
   * sharing the same Go-identifier key set; every value a scalar literal with a
   * per-key-consistent Go type (mixed int/float64 widens to float64). Any
   * deviation, or a name collision with an existing type, returns `null`.
   */
  private synthesizeStructFromSignal(
    signal: { getter: string; type: TypeInfo; initialValue: string; parsed?: ParsedExpr },
    componentName: string,
  ): { name: string; fields: Array<{ tsName: string; goName: string; goType: string }> } | null {
    // Only untyped arrays: typed (`Item[]`) / scalar (`string[]`) elements bake
    // through the normal path.
    if (signal.type.kind !== 'array') return null
    const elem = signal.type.elementType
    if (elem && elem.kind !== 'unknown') return null

    const node = signal.parsed
    if (!node || node.kind !== 'array-literal' || node.elements.length === 0) return null

    // Field order + per-key Go types from the first element; every other element
    // must match exactly.
    const order: string[] = []
    const goTypes = new Map<string, string>()
    for (let i = 0; i < node.elements.length; i++) {
      const el = node.elements[i]
      if (el.kind !== 'object-literal') return null
      const seen = new Set<string>()
      for (const prop of el.properties) {
        if (prop.shorthand) return null
        const key = prop.key
        if (!GO_IDENTIFIER.test(key)) return null
        const goType = this.scalarParsedGoType(prop.value)
        if (!goType) return null
        seen.add(key)
        const prev = goTypes.get(key)
        if (prev === undefined) {
          if (i !== 0) return null // key absent from the first element → shape differs
          order.push(key)
          goTypes.set(key, goType)
        } else {
          const merged = this.mergeScalarGoType(prev, goType)
          if (!merged) return null
          goTypes.set(key, merged)
        }
      }
      // A first-element key missing here → shape differs.
      if (seen.size !== order.length) return null
    }

    const name = `${componentName}${capitalizeFieldName(signal.getter)}Item`
    // Don't shadow an existing (user-defined or already-synthesised) type.
    if (this.state.localTypeNames.has(name)) return null

    return {
      name,
      fields: order.map(key => ({
        tsName: key,
        goName: capitalizeFieldName(key),
        goType: goTypes.get(key)!,
      })),
    }
  }

  /**
   * Go type for a scalar-literal `ParsedExpr` field value, else `null` (caller
   * bails out of synthesis). string/no-substitution template → `string`;
   * numeric (optionally negated) → int/float64; boolean → `bool`.
   */
  private scalarParsedGoType(value: ParsedExpr): string | null {
    // `-5` is a unary minus over a numeric literal; classify by the inner one.
    if (value.kind === 'unary' && value.op === '-' && value.argument.kind === 'literal') {
      const inner = value.argument
      if (inner.literalType === 'number') return this.numericLiteralGoType(inner.raw ?? String(inner.value))
      return null
    }
    if (value.kind !== 'literal') return null
    if (value.literalType === 'string') return 'string'
    if (value.literalType === 'number') return this.numericLiteralGoType(value.raw ?? String(value.value))
    if (value.literalType === 'boolean') return 'bool'
    return null
  }

  /** `float64` when the literal has a fraction or exponent, else `int`. */
  private numericLiteralGoType(text: string): string {
    return /[.eE]/.test(text) && !text.startsWith('0x') ? 'float64' : 'int'
  }

  /** Reconcile two per-key Go types: equal stays; mixed numeric widens to float64; else null. */
  private mergeScalarGoType(a: string, b: string): string | null {
    if (a === b) return a
    const numeric = new Set(['int', 'float64'])
    if (numeric.has(a) && numeric.has(b)) return 'float64'
    return null
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
    // Every other field-producing source: a `SearchParams` collision would
    // redeclare the field and break the Go compile.
    const taken = new Set<string>([
      ...ir.metadata.propsParams.map(p => capitalizeFieldName(p.name)),
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
    spreadSlots: SpreadSlotInfo[]
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
    // dynamic ones are template-only.
    const inputNested = nestedComponents.filter(n => !n.isDynamic || n.isPropDerived)

    const nestedArrayFields = new Set(nestedComponents.map(n => `${n.name}s`))

    for (const param of ir.metadata.propsParams) {
      const fieldName = capitalizeFieldName(param.name)
      if (nestedArrayFields.has(fieldName)) continue
      const goType = resolvePropGoType(this.emitCtx, param, propTypeOverrides)
      lines.push(`\t${fieldName} ${goType}`)
    }

    for (const nested of inputNested) {
      lines.push(`\t${nested.name}s []${nested.name}Input`)
    }

    // `useContext` consumer fields — settable by an enclosing provider; default
    // applied in NewXxxProps.
    const takenInput = new Set(ir.metadata.propsParams.map(p => capitalizeFieldName(p.name)))
    for (const c of this.nonCollidingContextConsumers(takenInput)) {
      lines.push(`\t${this.contextFieldName(c)} ${this.contextConsumerGoType(c)}`)
    }

    // Input-side bag for restPropsName spreads. The destructured-rest pattern
    // (`function({a, ...rest}: P) { <el {...rest}/> }`) is a `bagSource:
    // 'input-bag'` slot; Go can't enumerate the open-ended key set, so the
    // caller passes a `map[string]any`. Field + JSON tag use the rest binding
    // name (`rest` → `Rest`) so call sites and JSON round-trips line up.
    const restPropsName = ir.metadata.restPropsName
    if (restPropsName) {
      const seen = new Set<string>()
      for (const slot of spreadSlots) {
        if (slot.bagSource !== 'input-bag') continue
        const fieldName = capitalizeFieldName(restPropsName)
        if (seen.has(fieldName)) continue
        seen.add(fieldName)
        const jsonTag = this.toJsonTag(restPropsName)
        lines.push(`\t${fieldName} map[string]any \`json:"${jsonTag}"\``)
      }
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

    this.emitPropsDataFields(lines, ir, nestedComponents, propTypeOverrides)

    this.emitPropsAuxFields(lines, ir, componentName, nestedComponents, spreadSlots)

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
    parentComponentName: string,
    nested: NestedComponentInfo,
  ): void {
    const wrapperName = this.loopBodyWrapperName(parentComponentName, nested)
    const datumFields = this.resolveLoopDatumFields(nested.loopItemType)
    const bodyChildInstances = this.collectBodyChildInstances(nested.bodyChildren!)

    lines.push(`// ${wrapperName} wraps ${nested.name}Props with per-row loop datum`)
    lines.push(`// fields and child component slots for the loop body children. (#1897)`)
    lines.push(`type ${wrapperName} struct {`)
    lines.push(`\t${nested.name}Props`)
    for (const f of datumFields) {
      lines.push(`\t${f.goName} ${f.goType} \`json:"-"\``)
    }
    // Scalar-item loop (`[1,2,3,4,5].map(n => …{n}…)`) — no datum fields, so
    // carry the whole range value; the body define is fed `.BfLoopItem`.
    const scalarLoopType = this.scalarLiteralLoopGoType(nested.loopArrayParsed, nested.loopItemType)
    if (scalarLoopType && datumFields.length === 0) {
      lines.push(`\tBfLoopItem ${scalarLoopType} \`json:"-"\``)
    }
    for (const child of bodyChildInstances) {
      lines.push(`\t${child.fieldName} ${child.name}Props \`json:"-"\``)
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
    const typeName = itemType.raw?.replace(/\[\]$/, '') ?? itemType.raw
    if (!typeName) return []
    for (const td of this.state.currentTypeDefinitions) {
      if (td.name === typeName) {
        const fields: Array<{ tsName: string; goName: string; goType: string }> = []
        for (const prop of td.properties ?? []) {
          if (!GO_IDENTIFIER.test(prop.name)) continue
          fields.push({
            tsName: prop.name,
            goName: capitalizeFieldName(prop.name),
            goType: typeInfoToGo(this.emitCtx, prop.type),
          })
        }
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
   * `'interface{}'` for a loop over an inline primitive-literal array whose body
   * renders the bare item (`[1,2,3,4,5].map(n => …{n}…)`), else null. Such
   * scalar-item loops have no datum fields, so the value is carried on the
   * wrapper's synthetic `BfLoopItem`; object/field loops and non-literal sources
   * keep the datum-field path.
   */
  private scalarLiteralLoopGoType(
    arrayParsed: ParsedExpr | undefined,
    itemType: TypeInfo | null | undefined,
  ): string | null {
    if (this.resolveLoopDatumFields(itemType).length > 0) return null
    if (!arrayParsed) return null
    if (arrayParsed.kind !== 'array-literal' || arrayParsed.elements.length === 0) {
      return null
    }
    for (const el of arrayParsed.elements) {
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

  /** Collect static child instances from loop body children for the wrapper struct. */
  private collectBodyChildInstances(
    bodyChildren: IRNode[],
    propsParams: ReadonlyArray<{ name: string }> = [],
  ): StaticChildInstance[] {
    const result: StaticChildInstance[] = []
    for (const child of bodyChildren) {
      this.collectStaticChildInstancesRecursive(child, result, false, new Map(), propsParams)
    }
    return result
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

    // Static + prop-derived nested components auto-populate from input.
    const staticNested = nestedComponents.filter(n => !n.isDynamic || n.isPropDerived)

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
      const varName = `${nested.name.charAt(0).toLowerCase()}${nested.name.slice(1)}s`
      lines.push(`\t${varName} := make([]${nested.name}Props, len(in.${nested.name}s))`)
      lines.push(`\tfor i, item := range in.${nested.name}s {`)
      lines.push(`\t\t${varName}[i] = New${nested.name}Props(item)`)
      lines.push(`\t\t${varName}[i].BfParent = scopeID`)
      lines.push(`\t\t${varName}[i].BfMount = "${nested.slotId}"`)
      const keyField = loopKeyToGoFieldPath(nested.loopKey, nested.loopParam)
      if (keyField) {
        lines.push(`\t\t${varName}[i].BfDataKey = fmt.Sprint(${keyField})`)
        this.state.usesFmt = true
      }
      lines.push('\t}')
      lines.push('')
    }

    this.emitStaticBodyWrappers(lines, ir, componentName, staticWithBody, emittedWrapperVars)

    // Signal-time prop fallbacks: `createSignal(props.X ?? N)` hoists `N` as a
    // local so the signal, any derived memo, and the prop field share one
    // fallback-applied value. Go zero values can't tell an explicit `Initial: 0`
    // from an omitted field, so it also fires on the type's zero value.
    const propFallbackVars = this.collectPropFallbackVars(ir)
    for (const [, info] of propFallbackVars) {
      lines.push(`\t${info.varName} := in.${info.fieldName}`)
      lines.push(`\tif ${info.varName} == ${info.zeroLiteral} {`)
      lines.push(`\t\t${info.varName} = ${info.goFallback}`)
      lines.push(`\t}`)
    }
    if (propFallbackVars.size > 0) lines.push('')

    this.emitDynamicBodyWrappers(lines, ir, componentName, dynamicWithBody, propFallbackVars, emittedWrapperVars)

    // Sibling-memo hoisting (#2075/#2077 review finding 3): a filter-arm memo
    // whose predicate free vars reference an EARLIER sibling memo would
    // otherwise recompute that sibling's whole expression a second time
    // inline in its `bf.FilterEval` env map, duplicating it against the
    // sibling's own field. Two-pass: first collect which memos are
    // referenced this way, then hoist each into a local emitted once before
    // the `return`; the memo-field loop below (and the referencing memo's own
    // env-map entry, via `ctx.state.hoistedMemoLocals`) both reuse the local
    // instead of re-emitting the expression. Declared `var name Type = value`
    // (not `:=`) because an unresolved computation can fall back to the bare
    // `nil` literal, which `:=` can't type-infer.
    const memoPropsParamMap = new Map(ir.metadata.propsParams.map(p => [p.name, p]))
    this.state.hoistedMemoLocals = new Map()
    const hoistNames = new Set<string>()
    for (const memo of ir.metadata.memos) {
      for (const name of filterArmEarlierSiblingRefs(this.emitCtx, memo, ir.metadata.signals, ir.metadata.propsParams)) {
        hoistNames.add(name)
      }
    }
    if (hoistNames.size > 0) {
      for (const memo of ir.metadata.memos) {
        if (!hoistNames.has(memo.name)) continue
        const goType = this.inferMemoType(memo, ir.metadata.signals, memoPropsParamMap)
        const value = computeMemoInitialValue(this.emitCtx, memo, ir.metadata.signals, ir.metadata.propsParams, propFallbackVars, goType)
        let localName = `memo${capitalizeFieldName(memo.name)}`
        while (GO_KEYWORDS.has(localName)) localName += '_'
        lines.push(`\tvar ${localName} ${goType} = ${value}`)
        this.state.hoistedMemoLocals.set(memo.name, localName)
      }
      lines.push('')
    }

    lines.push(`\treturn ${propsTypeName}{`)
    lines.push('\t\tScopeID: scopeID,')
    // Host context, for when *this* component is itself a slot-attached child.
    lines.push('\t\tBfParent: in.BfParent,')
    lines.push('\t\tBfMount: in.BfMount,')
    if (this.usesSearchParams(ir)) {
      lines.push('\t\tSearchParams: in.SearchParams,')
    }

    const nestedArrayFields = new Set(nestedComponents.map(n => `${n.name}s`))

    // Props params (field names tracked to skip duplicate signal assignments).
    // A JSX-declared default (`variant = 'default'`) or signal-side fallback
    // (`props.X ?? N`, via the hoisted var) is baked in so a Go zero value can't
    // shadow it. A memo shadowing a same-named prop
    // (`const className = createMemo(() => props.className ?? '')`) shares the
    // prop's field, so its `?? fallback` folds into the prop initializer.
    const memoFallbacks = new Map<string, { goFallback: string; goType: string }>()
    for (const memo of ir.metadata.memos) {
      const stripped = memo.computation.replace(/^\(\)\s*=>\s*/, '')
      const m = this.extractPropFallback(stripped)
      if (!m) continue
      if (capitalizeFieldName(m.propName) !== capitalizeFieldName(memo.name)) continue
      // `applyGoFallback` emits a string-typed zero check; only `string` /
      // `interface{}` fields take the fold (the latter via the nil-tolerant
      // wrapper below), so restrict here.
      const param = ir.metadata.propsParams.find(
        p => capitalizeFieldName(p.name) === capitalizeFieldName(memo.name),
      )
      if (!param) continue
      const goType = resolvePropGoType(this.emitCtx, param, propTypeOverrides)
      if (goType !== 'string' && goType !== 'interface{}') continue
      memoFallbacks.set(capitalizeFieldName(memo.name), { goFallback: m.goFallback, goType })
    }

    const propFieldNames = new Set<string>()
    for (const param of ir.metadata.propsParams) {
      const fieldName = capitalizeFieldName(param.name)
      if (nestedArrayFields.has(fieldName)) continue
      const hoisted = propFallbackVars.get(param.name)
      if (hoisted) {
        lines.push(`\t\t${fieldName}: ${hoisted.varName},`)
      } else {
        const paramDefault = goPropDefault(param.defaultValue)
        const memoFold = memoFallbacks.get(fieldName)
        if (paramDefault !== null) {
          lines.push(`\t\t${fieldName}: ${applyGoFallback(`in.${fieldName}`, paramDefault)},`)
        } else if (memoFold !== undefined && memoFold.goType === 'string') {
          lines.push(`\t\t${fieldName}: ${applyGoFallback(`in.${fieldName}`, memoFold.goFallback)},`)
        } else if (memoFold !== undefined) {
          // interface{} field (`size ?? 'icon'`): the string zero-check doesn't
          // compile, so wrap in a nil/empty-tolerant IIFE.
          lines.push(
            `\t\t${fieldName}: func() interface{} { v := interface{}(in.${fieldName}); if v == nil || v == "" { return ${memoFold.goFallback} }; return v }(),`,
          )
        } else {
          lines.push(`\t\t${fieldName}: in.${fieldName},`)
        }
      }
      propFieldNames.add(fieldName)
    }

    // Signal initial values (skip a name already emitted as a prop field).
    for (const signal of ir.metadata.signals) {
      // Env signals are the request-scoped `SearchParams` reader field, not a
      // stored value — no baked initial value to emit here (#2057).
      if (signal.envReader) continue
      const fieldName = capitalizeFieldName(signal.getter)
      if (propFieldNames.has(fieldName)) continue
      // `props.X ?? N` reuses the hoisted fallback var so signal and memo share
      // one value.
      const fallbackMatch = this.extractPropFallback(signal.initialValue)
      const hoisted = fallbackMatch ? propFallbackVars.get(fallbackMatch.propName) : undefined
      if (hoisted) {
        lines.push(`\t\t${fieldName}: ${hoisted.varName},`)
      } else {
        // Bake against the synthesised struct type if one was inferred for this
        // untyped object-array signal, else the signal's own type.
        const bakeType = this.state.synthStructTypes.get(signal.getter) ?? signal.type
        const initialValue = convertInitialValue(this.emitCtx, signal.initialValue, bakeType, ir.metadata.propsParams, signal.parsed)
        lines.push(`\t\t${fieldName}: ${initialValue},`)
      }
    }

    // Nested component arrays. Static-without-body always emitted; the
    // with-body paths only when their wrapper var was built.
    for (const nested of staticWithoutBody) {
      const varName = `${nested.name.charAt(0).toLowerCase()}${nested.name.slice(1)}s`
      lines.push(`\t\t${nested.name}s: ${varName},`)
    }
    for (const nested of [...staticWithBody, ...dynamicWithBody]) {
      const varName = `${nested.name.charAt(0).toLowerCase()}${nested.name.slice(1)}s`
      if (!emittedWrapperVars.has(varName)) continue
      lines.push(`\t\t${nested.name}s: ${varName},`)
    }

    // Memo initial values (from signal initials). Prop-shadowing memos were
    // folded into the prop field above; a memo the pre-pass already hoisted
    // (above) reuses that local instead of recomputing its expression.
    for (const memo of ir.metadata.memos) {
      const fieldName = capitalizeFieldName(memo.name)
      if (propFieldNames.has(fieldName)) continue
      const hoistedLocal = this.state.hoistedMemoLocals.get(memo.name)
      if (hoistedLocal) {
        lines.push(`\t\t${fieldName}: ${hoistedLocal},`)
        continue
      }
      // Pass the inferred Go type so an unresolved computation zeroes to that
      // type (`false` for a boolean memo), not the int `0`.
      const goType = this.inferMemoType(memo, ir.metadata.signals, memoPropsParamMap)
      const memoValue = computeMemoInitialValue(this.emitCtx, memo, ir.metadata.signals, ir.metadata.propsParams, propFallbackVars, goType)
      lines.push(`\t\t${fieldName}: ${memoValue},`)
    }

    // Computed derived-const fields (`Root: func() string { … }()`), matching
    // `generatePropsStruct`.
    const takenDerivedInit = new Set<string>([
      ...ir.metadata.propsParams.map(p => capitalizeFieldName(p.name)),
      ...ir.metadata.signals.map(s => capitalizeFieldName(s.getter)),
      ...ir.metadata.memos.map(m => capitalizeFieldName(m.name)),
    ])
    for (const f of this.computeDerivedConstFields(takenDerivedInit)) {
      lines.push(`\t\t${f.name}: ${f.init},`)
    }

    // `useContext` consumer fields default to the `createContext` default when
    // the provider didn't set them.
    const takenInit = new Set<string>([
      ...ir.metadata.propsParams.map(p => capitalizeFieldName(p.name)),
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

    this.emitStaticChildInstances(lines, ir)

    this.emitSpreadBagInits(lines, ir, spreadSlots)

    lines.push('\t}')
    lines.push('}')
  }

  private emitStaticChildInstances(lines: string[], ir: ComponentIR): void {
    const staticChildren = this.collectStaticChildInstances(ir.root, ir.metadata.propsParams)
    for (const child of staticChildren) {
      lines.push(`\t\t${child.fieldName}: New${child.name}Props(${child.name}Input{`)
      lines.push(`\t\t\tScopeID: scopeID + "_${child.slotId}",`)
      lines.push(`\t\t\tBfParent: scopeID,`)
      lines.push(`\t\t\tBfMount: "${child.slotId}",`)
      // SSR context propagation: a child wrapped in a `<Ctx.Provider value>` it
      // consumes gets the provider value set on its consumer field (else its own
      // NewProps applies the `createContext` default).
      if (child.contextBindings) {
        for (const consumer of this.childContextConsumers.get(child.name) ?? []) {
          const goVal = child.contextBindings.get(consumer.contextName)
          if (goVal !== undefined) {
            lines.push(`\t\t\t${this.contextFieldName(consumer)}: ${goVal},`)
          }
        }
      }
      // Non-param attrs route into the child's rest bag (see
      // `childComponentShapes`); `restBagEntries` collects `"jsx-attr-name":
      // goValue` pairs for that map.
      const childShape = this.childComponentShapes.get(child.name)
      const restBagEntries: string[] = []
      const emitChildField = (jsxName: string, goValue: string): void => {
        if (
          childShape &&
          childShape.restBagField &&
          !childShape.paramNames.has(jsxName)
        ) {
          restBagEntries.push(`${JSON.stringify(jsxName)}: ${goValue}`)
          return
        }
        // A hyphenated attr (`aria-label`) can't be a Go field and, with no rest
        // bag to route it into, has nowhere to go — skip over emitting invalid Go.
        if (jsxName.includes('-')) return
        lines.push(`\t\t\t${capitalizeFieldName(jsxName)}: ${goValue},`)
      }
      for (const prop of child.props) {
        switch (prop.value.kind) {
          case 'literal':
            emitChildField(prop.name, goLiteral(prop.value.value))
            break
          case 'boolean-shorthand':
          case 'boolean-attr':
            emitChildField(prop.name, 'true')
            break
          case 'expression':
          case 'spread':
          case 'template': {
            // Prefer parsed template parts when present (carried on both
            // `expression` and `template`): handles the shadcn variant lookup
            // (`record-index-lookup-via-child-prop`) that
            // `resolveDynamicPropValue` can't represent.
            const parts =
              prop.value.kind === 'template' || prop.value.kind === 'expression'
                ? prop.value.parts
                : undefined
            if (parts) {
              const goExpr = this.templatePartsToGoCode(parts, ir.metadata.propsParams)
              if (goExpr !== null) {
                emitChildField(prop.name, goExpr)
                break
              }
              // Parts opted out (unsupported kind) → bare-expression path below.
            }

            // `template` kind has no raw expr string (discarded for the parts).
            const exprText = prop.value.kind === 'template' ? '' : prop.value.expr
            if (!exprText) break
            // Inline object literal to a child's optional object prop
            // (`opts={{ align: 'start' }}`) bakes to a Go map literal (the field
            // is `map[string]interface{}`). Only an `expression` attr carries
            // `.parsed`.
            const parsedValue =
              prop.value.kind === 'expression' ? prop.value.parsed : undefined
            if (
              parsedValue &&
              childShape?.mapTypedParamNames.has(prop.name)
            ) {
              const goMap = objectLiteralToGoMap(this.emitCtx, parsedValue)
              if (goMap !== null) {
                emitChildField(prop.name, goMap)
                break
              }
            }
            const resolvedValue = this.resolveDynamicPropValue(
              exprText,
              ir.metadata.signals,
              ir.metadata.memos,
              ir.metadata.propsParams
            )
            if (resolvedValue !== null) {
              emitChildField(prop.name, resolvedValue)
            }
            break
          }
          case 'jsx-children':
            // Handled below via `child.childrenText` / `child.childrenHtml`.
            break
        }
      }
      // Rest-bag entries → the child's open-ended bag field
      // (`Props: map[string]any{...}`).
      if (childShape?.restBagField && restBagEntries.length > 0) {
        lines.push(
          `\t\t\t${childShape.restBagField}: map[string]any{${restBagEntries.join(', ')}},`,
        )
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
      lines.push(`\t\t}),`)
    }
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
      const arrayField = `${nested.name}s`
      lines.push(`//`)
      lines.push(`// NOTE: \`${arrayField}\` is populated by the route handler, not by`)
      lines.push(`// New${componentName}Props — the SSR template iterates over it`)
      lines.push(`// dynamically (\`.${arrayField}\`). Build the slice from your source data and`)
      lines.push(`// assign it before passing the props to your renderer. Example:`)
      lines.push(`//`)
      lines.push(`//   props := New${componentName}Props(${inputTypeName}{ /* ... */ })`)
      lines.push(`//   props.${arrayField} = make([]${nested.name}Props, len(items))`)
      lines.push(`//   for i, item := range items {`)
      lines.push(`//     props.${arrayField}[i] = New${nested.name}Props(${nested.name}Input{ /* fields */ })`)
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

  private emitStaticBodyWrappers(
    lines: string[],
    ir: ComponentIR,
    componentName: string,
    staticWithBody: NestedComponentInfo[],
    emittedWrapperVars: Set<string>,
  ): void {
    // Bake the module-const array into the constructor so wrappers get their
    // datum fields from the data (Input items carry only child-component params).
    for (const nested of staticWithBody) {
      const loopArray = nested.loopArray
      const moduleConst = loopArray
        ? (ir.metadata.localConstants ?? []).find(
            c => c.name === loopArray && c.origin?.scope === 'module' && c.value && c.type,
          )
        : null
      const scalarLoopType = this.scalarLiteralLoopGoType(nested.loopArrayParsed, nested.loopItemType)
      let bakedValue = moduleConst?.type
        ? convertInitialValue(this.emitCtx, moduleConst.value!, moduleConst.type, ir.metadata.propsParams, moduleConst.parsed)
        : null
      // Inline primitive-literal array (`[1,2,3,4,5].map(...)`): no named const,
      // so bake the literal slice directly (else SSR renders an empty loop).
      if (!bakedValue && scalarLoopType) {
        bakedValue = jsLiteralToGo(
          this.emitCtx,
          { kind: 'unknown', raw: 'unknown' },
          nested.loopArrayParsed,
        )
      }
      if (!bakedValue || bakedValue === 'nil' || bakedValue === '0') continue

      const varName = `${nested.name.charAt(0).toLowerCase()}${nested.name.slice(1)}s`
      const wrapperType = this.loopBodyWrapperName(componentName, nested)
      const datumFields = this.resolveLoopDatumFields(nested.loopItemType)
      const bodyChildInstances = this.collectBodyChildInstances(nested.bodyChildren!, ir.metadata.propsParams)

      for (const child of bodyChildInstances) {
        const childVar = `child_${child.fieldName}`
        lines.push(`\t${childVar} := New${child.name}Props(${child.name}Input{`)
        lines.push(`\t\tScopeID: scopeID + "_${child.slotId}",`)
        lines.push(`\t\tBfParent: scopeID,`)
        lines.push(`\t\tBfMount: "${child.slotId}",`)
        for (const prop of child.props) {
          if (prop.value.kind === 'literal') {
            lines.push(`\t\t${capitalizeFieldName(prop.name)}: ${goLiteral(prop.value.value)},`)
          } else if (prop.value.kind === 'boolean-shorthand' || prop.value.kind === 'boolean-attr') {
            lines.push(`\t\t${capitalizeFieldName(prop.name)}: true,`)
          }
        }
        lines.push(`\t})`)
      }
      if (bodyChildInstances.length > 0) lines.push('')

      const dataVar = `${varName}Data`
      lines.push(`\t${dataVar} := ${bakedValue}`)
      lines.push(`\t${varName} := make([]${wrapperType}, len(${dataVar}))`)
      lines.push(`\tfor i, item := range ${dataVar} {`)
      lines.push(`\t\t${varName}[i] = ${wrapperType}{`)
      lines.push(`\t\t\t${nested.name}Props: New${nested.name}Props(${nested.name}Input{`)
      lines.push(`\t\t\t\tBfParent: scopeID,`)
      lines.push(`\t\t\t\tBfMount: "${nested.slotId}",`)
      // Loop-body component's own static props. `key` → BfDataKey below; children
      // flow through `bf_with_children`; hyphenated names have no Go field.
      for (const prop of nested.props ?? []) {
        if (prop.name === 'key' || prop.name === 'children' || prop.name.includes('-')) continue
        if (prop.value.kind === 'literal') {
          lines.push(`\t\t\t\t${capitalizeFieldName(prop.name)}: ${goLiteral(prop.value.value)},`)
        } else if (prop.value.kind === 'boolean-shorthand' || prop.value.kind === 'boolean-attr') {
          lines.push(`\t\t\t\t${capitalizeFieldName(prop.name)}: true,`)
        }
      }
      lines.push(`\t\t\t}),`)
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
      const keyField = loopKeyToGoFieldPath(nested.loopKey, nested.loopParam)
      if (keyField) {
        lines.push(`\t\t${varName}[i].BfDataKey = fmt.Sprint(${keyField})`)
        this.state.usesFmt = true
      } else if (scalarLoopType && nested.loopKey && nested.loopKey === nested.loopParam) {
        // `key={n}` where `n` is the scalar item — the key is the range value.
        lines.push(`\t\t${varName}[i].BfDataKey = fmt.Sprint(item)`)
        this.state.usesFmt = true
      }
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

      const goType = this.inferMemoType(memo, ir.metadata.signals, propsParamMap)
      const bakedValue = computeMemoInitialValue(this.emitCtx, 
        memo, ir.metadata.signals, ir.metadata.propsParams, propFallbackVars, goType,
      )
      if (bakedValue === 'nil' || bakedValue === '0') continue

      const wrapperType = this.loopBodyWrapperName(componentName, nested)
      const varName = `${nested.name.charAt(0).toLowerCase()}${nested.name.slice(1)}s`
      const datumFields = this.resolveLoopDatumFields(nested.loopItemType)
      const bodyChildInstances = this.collectBodyChildInstances(nested.bodyChildren!, ir.metadata.propsParams)

      // Child sub-component instances created once (identical scope IDs per row).
      for (const child of bodyChildInstances) {
        const childVar = `child_${child.fieldName}`
        lines.push(`\t${childVar} := New${child.name}Props(${child.name}Input{`)
        lines.push(`\t\tScopeID: scopeID + "_${child.slotId}",`)
        lines.push(`\t\tBfParent: scopeID,`)
        lines.push(`\t\tBfMount: "${child.slotId}",`)
        for (const prop of child.props) {
          if (prop.value.kind === 'literal') {
            lines.push(`\t\t${capitalizeFieldName(prop.name)}: ${goLiteral(prop.value.value)},`)
          } else if (prop.value.kind === 'boolean-shorthand' || prop.value.kind === 'boolean-attr') {
            lines.push(`\t\t${capitalizeFieldName(prop.name)}: true,`)
          }
        }
        lines.push(`\t})`)
      }
      if (bodyChildInstances.length > 0) lines.push('')

      lines.push(`\tbakedData := ${bakedValue}`)
      lines.push(`\t${varName} := make([]${wrapperType}, len(bakedData))`)
      lines.push(`\tfor i, item := range bakedData {`)
      lines.push(`\t\t${varName}[i] = ${wrapperType}{`)
      lines.push(`\t\t\t${nested.name}Props: New${nested.name}Props(${nested.name}Input{`)
      lines.push(`\t\t\t\tBfParent: scopeID,`)
      lines.push(`\t\t\t\tBfMount: "${nested.slotId}",`)
      lines.push(`\t\t\t}),`)
      for (const f of datumFields) {
        lines.push(`\t\t\t${f.goName}: item.${f.goName},`)
      }
      for (const child of bodyChildInstances) {
        lines.push(`\t\t\t${child.fieldName}: child_${child.fieldName},`)
      }
      lines.push(`\t\t}`)
      const keyField = loopKeyToGoFieldPath(nested.loopKey, nested.loopParam)
      if (keyField) {
        lines.push(`\t\t${varName}[i].BfDataKey = fmt.Sprint(${keyField})`)
        this.state.usesFmt = true
      }
      lines.push(`\t}`)
      lines.push('')
      emittedWrapperVars.add(varName)
    }
  }

  private buildLocalTypeTables(ir: ComponentIR, componentName: string): void {
    // Locally-defined type names and aliases so typeInfoToGo can resolve them.
    this.state.localTypeNames = new Set<string>()
    this.state.localTypeAliases = new Map<string, string>()
    this.state.localStructFields = new Map<string, Map<string, string>>()
    for (const td of ir.metadata.typeDefinitions) {
      // Skip the Props type (not reusable) and child Props (emitted by the child).
      if (td.name === 'Props' || td.name === `${componentName}Props`) continue
      if (td.name.endsWith('Props')) continue
      this.state.localTypeNames.add(td.name)
      if (td.definition.match(/^type \w+ = ('[^']*'(\s*\|\s*'[^']*')*)/)) {
        this.state.localTypeAliases.set(td.name, 'string')
      } else {
        // Source-key → Go-field-name map for the baker, from the same field
        // derivation the struct emitter uses.
        const fields = this.structFieldsFor(td)
        if (fields.length > 0) {
          this.state.localStructFields.set(td.name, new Map(fields.map(f => [f.tsName, f.goName])))
        }
      }
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
    // Synthesise a struct for each untyped object-array signal and emit it, so
    // the signal field can be typed `[]Synth` and its inline items baked (the
    // loop body reaches each item via struct field access). Registered in
    // localTypeNames/localStructFields so the baker resolves the element type.
    this.state.synthStructTypes = new Map<string, TypeInfo>()
    for (const signal of ir.metadata.signals) {
      if (signal.envReader) continue // env signal has no bakeable initial shape (#2057)
      const synth = this.synthesizeStructFromSignal(signal, componentName)
      if (!synth) continue
      this.state.localTypeNames.add(synth.name)
      this.state.localStructFields.set(synth.name, new Map(synth.fields.map(f => [f.tsName, f.goName])))
      this.state.synthStructTypes.set(signal.getter, {
        kind: 'array',
        raw: `${synth.name}[]`,
        elementType: { kind: 'interface', raw: synth.name },
      })
      const goFields = synth.fields.map(
        f => `\t${f.goName} ${f.goType} \`json:"${this.toJsonTag(f.tsName)}"\``,
      )
      lines.push(`// ${synth.name} is a synthesised element type for the ${signal.getter} signal.`)
      lines.push(`type ${synth.name} struct {\n${goFields.join('\n')}\n}`)
      lines.push('')
    }
  }

  private resolveNestedLoopItemTypes(ir: ComponentIR, nestedComponents: NestedComponentInfo[]): void {
    // When a loop's `itemType` is null, resolve the element type from the source
    // array so wrapper structs get correct datum fields. Two cases:
    //   1. Memo-derived: `sortedData()` → resolve through the memo's SSR path to
    //      the module const it returns (block-body memo baking).
    //   2. Direct module const: `payments` → look up the constant directly.
    for (const nested of nestedComponents) {
      if (nested.loopItemType || !nested.loopArray) continue

      // Case 1: memo-derived loop array (`sortedData()`)
      const memoName = this.extractMemoNameFromLoopArray(nested.loopArray)
      if (memoName) {
        const memo = ir.metadata.memos.find(m => m.name === memoName)
        if (memo) {
          const blockReturn = resolveBlockBodyMemoModuleConst(this.emitCtx,
            memo, ir.metadata.signals,
          )
          if (blockReturn) {
            const constant = (ir.metadata.localConstants ?? []).find(
              c => c.name === blockReturn.constName && c.origin?.scope === 'module',
            )
            if (constant?.type?.elementType) {
              nested.loopItemType = constant.type.elementType
            }
          }
        }
        continue
      }

      // Case 2: direct module-const array reference (`payments`)
      const directConst = (ir.metadata.localConstants ?? []).find(
        c => c.name === nested.loopArray && c.origin?.scope === 'module',
      )
      if (directConst?.type?.elementType) {
        nested.loopItemType = directConst.type.elementType
      }
    }
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
    lines.push('\tScopeID string `json:"scopeID"`')
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

    // Request-scoped `searchParams()` SSR value. Read by the template as
    // `.SearchParams.Get "key"`. Not serialised for hydration (`json:"-"`) — the
    // client re-reads `window.location.search` itself.
    if (this.usesSearchParams(ir)) {
      lines.push('\tSearchParams bf.SearchParams `json:"-"`')
    }
  }

  private emitPropsDataFields(
    lines: string[],
    ir: ComponentIR,
    nestedComponents: NestedComponentInfo[],
    propTypeOverrides: Map<string, string>,
  ): void {
    // Nested-component array fields are emitted as typed arrays below, not as
    // their raw prop; track them (and emitted names) to skip duplicates.
    const nestedArrayFields = new Set(nestedComponents.map(n => `${n.name}s`))
    const propFieldNames = new Set<string>()

    for (const param of ir.metadata.propsParams) {
      const fieldName = capitalizeFieldName(param.name)
      if (nestedArrayFields.has(fieldName)) continue
      const goType = resolvePropGoType(this.emitCtx, param, propTypeOverrides)
      // Children are already rendered in the DOM; serialising them into bf-p
      // leaks nested scope ids and bloats the attribute. Exclude from JSON so
      // BfPropsAttr never marshals them.
      const jsonTag = param.name === 'children' ? '-' : this.toJsonTag(param.name)
      lines.push(`\t${fieldName} ${goType} \`json:"${jsonTag}"\``)
      propFieldNames.add(fieldName)
    }

    const propsParamMap = new Map(ir.metadata.propsParams.map(p => [p.name, p]))

    for (const signal of ir.metadata.signals) {
      // Env signals are bound as the `SearchParams bf.SearchParams` reader field
      // (see generateInputStruct), not as a generic value field (#2057).
      if (signal.envReader) continue
      const fieldName = capitalizeFieldName(signal.getter)
      if (propFieldNames.has(fieldName)) continue
      const jsonTag = this.toJsonTag(signal.getter)
      // A synthesised struct type wins outright — the signal is an untyped
      // object array we gave a concrete element type.
      const synthType = this.state.synthStructTypes.get(signal.getter)
      if (synthType) {
        lines.push(`\t${fieldName} ${typeInfoToGo(this.emitCtx, synthType)} \`json:"${jsonTag}"\``)
        continue
      }
      let goType: string
      let referencedProp = propsParamMap.get(signal.initialValue)
      if (!referencedProp) {
        const propName = this.extractPropNameFromInitialValue(signal.initialValue)
        if (propName) referencedProp = propsParamMap.get(propName)
      }
      if (referencedProp) {
        const propGoType = typeInfoToGo(this.emitCtx, referencedProp.type, referencedProp.defaultValue)
        const signalGoType = typeInfoToGo(this.emitCtx, signal.type, signal.initialValue)
        // The "prop type wins" heuristic helps when the signal infer is less
        // specific than the prop (e.g. `createSignal(props.todos)` wants
        // `[]Todo`, not `interface{}`). It HURTS when the initial expression
        // transforms the prop type — `createSignal((props.todos ?? []).length)`
        // is a `number`, not the prop's `[]Todo`. Let a specific signal type
        // override a less-specific prop type in either direction so
        // `.length` / `.some()` / `.every()` chains land on their actual Go type.
        if (propGoType.includes('interface{}')) {
          goType = signalGoType
        } else if (
          !signalGoType.includes('interface{}') &&
          signalGoType !== propGoType
        ) {
          // Both sides resolved but disagree — trust the signal's inferred shape
          // (based on the literal expression text, including the trailing
          // accessor).
          goType = signalGoType
        } else {
          goType = propGoType
        }
      } else {
        goType = typeInfoToGo(this.emitCtx, signal.type, signal.initialValue)
      }
      lines.push(`\t${fieldName} ${goType} \`json:"${jsonTag}"\``)
    }

    // Memos for SSR. A memo whose name collides with an emitted prop field
    // (`const className = createMemo(() => props.className ?? '')`) is skipped:
    // both readers lower to the same `.Field`, and the memo's `?? fallback` folds
    // into the prop initializer in `generateNewPropsFunction`.
    for (const memo of ir.metadata.memos) {
      const fieldName = capitalizeFieldName(memo.name)
      if (propFieldNames.has(fieldName)) continue
      const jsonTag = this.toJsonTag(memo.name)
      const goType = this.inferMemoType(memo, ir.metadata.signals, propsParamMap)
      lines.push(`\t${fieldName} ${goType} \`json:"${jsonTag}"\``)
    }
  }

  private emitPropsAuxFields(
    lines: string[],
    ir: ComponentIR,
    componentName: string,
    nestedComponents: NestedComponentInfo[],
    spreadSlots: SpreadSlotInfo[],
  ): void {
    // Computed fields for component-scope derived string consts the template
    // references (e.g. `root = base || '/'`). Not serialised — the route handler
    // doesn't supply them; `NewXxxProps` computes them.
    const takenForDerivedConsts = new Set<string>([
      ...ir.metadata.propsParams.map(p => capitalizeFieldName(p.name)),
      ...ir.metadata.signals.map(s => capitalizeFieldName(s.getter)),
      ...ir.metadata.memos.map(m => capitalizeFieldName(m.name)),
    ])
    for (const f of this.computeDerivedConstFields(takenForDerivedConsts)) {
      lines.push(`\t${f.name} string \`json:"-"\``)
    }

    // `useContext` consumer fields (skip names already taken by a prop /
    // signal / memo field).
    const takenProps = new Set<string>([
      ...ir.metadata.propsParams.map(p => capitalizeFieldName(p.name)),
      ...ir.metadata.signals.map(s => capitalizeFieldName(s.getter)),
      ...ir.metadata.memos.map(m => capitalizeFieldName(m.name)),
    ])
    for (const c of this.nonCollidingContextConsumers(takenProps)) {
      const jsonTag = this.toJsonTag(c.localName)
      lines.push(`\t${this.contextFieldName(c)} ${this.contextConsumerGoType(c)} \`json:"${jsonTag}"\``)
    }

    for (const nested of nestedComponents) {
      // Loop body with JSX children → use the wrapper struct type.
      const elemType = nested.bodyChildren?.length
        ? this.loopBodyWrapperName(componentName, nested)
        : `${nested.name}Props`
      if (nested.isDynamic && !nested.isPropDerived) {
        // Dynamic signal-array loops are template-only.
        lines.push(`\t${nested.name}s []${elemType} \`json:"-"\``)
      } else {
        // Static + prop-derived arrays go in JSON so the client can hydrate.
        const jsonTag = this.toJsonTag(`${nested.name.charAt(0).toLowerCase()}${nested.name.slice(1)}s`)
        lines.push(`\t${nested.name}s []${elemType} \`json:"${jsonTag}"\``)
      }
    }

    const staticChildren = this.collectStaticChildInstances(ir.root, ir.metadata.propsParams)
    for (const child of staticChildren) {
      lines.push(`\t${child.fieldName} ${child.name}Props \`json:"-"\``)
    }

    // Top-level intrinsic-element spreads: each gets a `Spread_<slotId>
    // map[string]any` field the template reads via `{{bf_spread_attrs}}`.
    // Loop-internal spreads emit inline and don't appear here.
    for (const slot of spreadSlots) {
      const jsonTag = this.toJsonTag(slot.slotId)
      lines.push(`\t${slot.slotId} map[string]any \`json:"${jsonTag}"\``)
    }
  }

  /** Convert a field name to its JSON tag (camelCase). */
  private toJsonTag(name: string): string {
    return name.charAt(0).toLowerCase() + name.slice(1)
  }

  /**
   * Collect all static child component instances from the IR tree. Excludes
   * components inside loops (handled by nestedComponents). Each instance carries
   * its component `name`, `slotId`, `props`, and Go `fieldName`.
   */
  private collectStaticChildInstances(
    node: IRNode,
    propsParams: ReadonlyArray<{ name: string }> = [],
  ): Array<StaticChildInstance> {
    const result: StaticChildInstance[] = []
    this.collectStaticChildInstancesRecursive(node, result, false, new Map(), propsParams)
    return result
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

  /**
   * Pull the IR nodes out of a `children={<…/>}` attribute (a `jsx-children`
   * prop value). Empty when the component takes no such prop.
   */
  private jsxChildrenPropNodes(props: IRProp[]): IRNode[] {
    for (const p of props) {
      if (p.value.kind === 'jsx-children') return p.value.children
    }
    return []
  }

  private extractHtmlChildren(children: IRNode[]): string | null {
    if (children.length === 0) return null
    if (children.every(c => c.type === 'text')) return null
    const html = this.renderChildren(children)
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
  private extractScopedHtmlChildren(children: IRNode[]): string | null {
    if (children.length === 0) return null
    if (children.every(c => c.type === 'text')) return null
    const html = this.renderChildren(children)
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

  private collectStaticChildInstancesRecursive(
    node: IRNode,
    result: StaticChildInstance[],
    inLoop: boolean,
    providerCtx: ReadonlyMap<string, string>,
    propsParams: ReadonlyArray<{ name: string }> = [],
  ): void {
    if (node.type === 'component') {
      const comp = node as IRComponent
      // Dynamic-tag locals (`const Tag = children.tag`) have no registrable
      // template, so they get no `.<Name>SlotN` struct field. Recurse into
      // their children (which lower as a passthrough) so any real static
      // child components nested inside still get their slot fields.
      if (comp.dynamicTag) {
        for (const child of comp.children) {
          this.collectStaticChildInstancesRecursive(child, result, inLoop, providerCtx, propsParams)
        }
        return
      }
      // Skip Portal (handled via PortalCollector) and loop-internal components
      // (handled by nestedComponents).
      if (comp.name !== 'Portal' && !inLoop && comp.slotId) {
        const suffix = slotIdToFieldSuffix(comp.slotId)
        // Children handed in as a `children={<…/>}` attribute land as a
        // `jsx-children` prop rather than nested between the tags; treat them as
        // the child's effective children when no nested ones exist, so the bake
        // paths below see them.
        const effectiveChildren = comp.children.length > 0
          ? comp.children
          : this.jsxChildrenPropNodes(comp.props)
        result.push({
          name: comp.name,
          slotId: comp.slotId,
          props: comp.props,
          fieldName: `${comp.name}${suffix}`,
          childrenText: this.extractTextChildren(effectiveChildren),
          childrenHtml: this.extractHtmlChildren(effectiveChildren),
          childrenScopedHtmlExpr: this.extractScopedHtmlChildren(effectiveChildren),
          contextBindings: providerCtx.size > 0 ? providerCtx : undefined,
        })
        // Action-bearing JSX children render through a companion define with the
        // PARENT's data (see `queueDynamicChildrenDefine`), so component
        // instances nested inside them need their own `<Name>SlotN` fields +
        // constructor inits on THIS component's props. Statically-baked children
        // never contain components (any nested component renders a `{{template}}`
        // action, which the bake extractors reject), so recursing is a no-op.
        for (const child of effectiveChildren) {
          this.collectStaticChildInstancesRecursive(child, result, inLoop, providerCtx, propsParams)
        }
      }
      // Recurse into Portal's children to find nested components
      if (comp.name === 'Portal' && comp.children) {
        for (const child of comp.children) {
          this.collectStaticChildInstancesRecursive(child, result, inLoop, providerCtx, propsParams)
        }
      }
    } else if (node.type === 'loop') {
      const loop = node as IRLoop
      // A loop whose body IS a single component is the nestedComponents /
      // wrapper-slice machinery's case — mark its subtree as in-loop so the
      // component (and its body children, which live on the wrapper struct)
      // are skipped here. A component merely nested inside an element item
      // (`<li><Badge/></li>`, #2130) gets NO wrapper slice: keep collecting,
      // so it registers a normal once-per-slot instance (shared across rows,
      // like the wrapper's `bodyChildInstances`); per-item content reaches it
      // through the loop-body children define (see `renderComponent`).
      for (const child of loop.children) {
        this.collectStaticChildInstancesRecursive(
          child,
          result,
          inLoop || !!loop.childComponent,
          providerCtx,
          propsParams,
        )
      }
    } else if (node.type === 'element') {
      const element = node as IRElement
      for (const child of element.children) {
        this.collectStaticChildInstancesRecursive(child, result, inLoop, providerCtx, propsParams)
      }
    } else if (node.type === 'fragment') {
      const fragment = node as IRFragment
      for (const child of fragment.children) {
        this.collectStaticChildInstancesRecursive(child, result, inLoop, providerCtx, propsParams)
      }
    } else if (node.type === 'conditional') {
      const cond = node as IRConditional
      this.collectStaticChildInstancesRecursive(cond.whenTrue, result, inLoop, providerCtx, propsParams)
      if (cond.whenFalse) {
        this.collectStaticChildInstancesRecursive(cond.whenFalse, result, inLoop, providerCtx, propsParams)
      }
    } else if (node.type === 'if-statement') {
      // An early-return if-statement root (e.g. an asChild split) keeps its
      // subtrees in consequent/alternate — the non-asChild branch's nested icon
      // needs its slot field like any other static child.
      const stmt = node as IRIfStatement
      this.collectStaticChildInstancesRecursive(stmt.consequent, result, inLoop, providerCtx, propsParams)
      if (stmt.alternate) {
        this.collectStaticChildInstancesRecursive(stmt.alternate, result, inLoop, providerCtx, propsParams)
      }
    } else if (node.type === 'provider') {
      // SSR context propagation: record the provider's value against its context
      // name and extend the active binding map for descendants. A literal value
      // lowers to a Go literal; an object-literal value lowers to a Go map when
      // every member is a supported shape (#2087 — see `extendProviderContext`);
      // anything else is left unbound (the consumer keeps its default).
      const p = node as IRProvider
      const childCtx = this.extendProviderContext(providerCtx, p, propsParams)
      for (const child of p.children) {
        this.collectStaticChildInstancesRecursive(child, result, inLoop, childCtx, propsParams)
      }
    } else if (node.type === 'async') {
      // Async fallback + children render server-side via the OOS
      // protocol; static child components inside them still need slot
      // fields on the parent struct.
      const a = node as IRAsync
      this.collectStaticChildInstancesRecursive(a.fallback, result, inLoop, providerCtx, propsParams)
      for (const child of a.children) {
        this.collectStaticChildInstancesRecursive(child, result, inLoop, providerCtx, propsParams)
      }
    }
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
    propsParams: ReadonlyArray<{ name: string }>,
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
      if (propsParams.some(param => param.name === propName)) {
        const fieldRef = `in.${capitalizeFieldName(propName)}`
        return (
          `func() map[string]interface{} { ` +
          `if m := bf.AsMap(${fieldRef}); m != nil { return m }; ` +
          `return map[string]interface{}{} }()`
        )
      }
    }
    return null
  }

  /**
   * Convert a template literal's parsed parts into a `string`-typed Go
   * expression in `NewXxxProps` scope (destructured prop refs → `in.FieldName`),
   * or null so the caller falls back to `resolveDynamicPropValue`. A `string`
   * part emits a Go literal; a `lookup` (`${MAP[KEY]}` over a `Record<T,string>`,
   * key must be a bare prop ident) emits a switch-on-key IIFE. `ternary` opts out
   * — the element-attribute path handles it via `{{if}}`.
   */
  private templatePartsToGoCode(
    parts: IRTemplatePart[],
    propsParams: { name: string }[]
  ): string | null {
    const segments: string[] = []
    for (const part of parts) {
      if (part.type === 'string') {
        // The IR analyzer already inlined identifier references into the
        // `lookup` part shape. A residual `${ident}` in a `string` part only
        // occurs when resolution failed (e.g. a destructured prop the analyzer
        // couldn't trace). Emit verbatim — a Go equivalent that walks the string
        // and emits `in.FieldName` references isn't yet hit by the conformance
        // suite.
        segments.push(JSON.stringify(part.value))
        continue
      }
      if (part.type === 'lookup') {
        const keyExpr = part.key.trim()
        const param = propsParams.find(p => p.name === keyExpr)
        if (!param) return null
        const fieldName = capitalizeFieldName(keyExpr)
        const caseEntries = Object.entries(part.cases)
        if (caseEntries.length === 0) {
          segments.push('""')
          continue
        }
        const lines: string[] = []
        lines.push('func() string {')
        // `fmt.Sprint` is type-tolerant: the key field is `interface{}` when the
        // analyzer typed the prop, but a `string` when the shared inherited-prop
        // augmentation synthesised it — a `.(string)` assertion would compile
        // for the former only.
        this.state.usesFmt = true
        lines.push(`\t\t\tswitch fmt.Sprint(in.${fieldName}) {`)
        for (const [k, v] of caseEntries) {
          lines.push(`\t\t\tcase ${JSON.stringify(k)}: return ${JSON.stringify(v)}`)
        }
        lines.push('\t\t\t}')
        lines.push('\t\t\treturn ""')
        lines.push('\t\t}()')
        segments.push(lines.join('\n'))
        continue
      }
      // ternary or future part kinds — opt out so the caller falls back to the
      // bare-expression path.
      return null
    }
    if (segments.length === 0) return '""'
    return segments.join(' + ')
  }

  private resolveDynamicPropValue(
    expr: string,
    signals: { getter: string; setter: string | null; initialValue: string; type: TypeInfo; parsed?: ParsedExpr }[],
    memos: { name: string; computation: string; deps: string[] }[],
    propsParams: { name: string }[]
  ): string | null {
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
      const getterName = getterMatch[1]

      const signal = signals.find(s => s.getter === getterName)
      if (signal) {
        return convertInitialValue(this.emitCtx, signal.initialValue, signal.type, propsParams, signal.parsed)
      }

      // A memo: when no pattern applies, return null so the caller OMITS the
      // field and Go's typed zero value applies. Seed the resolution stack
      // with this memo's own name — a fresh top-level computation, so
      // self-reference must be caught on the first recursion.
      const memo = memos.find(m => m.name === getterName)
      if (memo) {
        return computeMemoInitialValueOrNull(
          this.emitCtx, memo, signals, propsParams, undefined, new Set([memo.name]),
        )
      }
    }

    return null
  }

  /** Infer the Go type for a memo from its computation and dependencies. */
  private inferMemoType(
    memo: { name: string; computation: string; type: TypeInfo; deps: string[]; bodyIsTemplateLiteral?: boolean; parsed?: ParsedExpr; parsedBlock?: ParsedStatement[] },
    signals: { getter: string; initialValue: string; type: TypeInfo }[],
    propsParamMap: Map<string, { name: string; type: TypeInfo; defaultValue?: string }>
  ): string {
    // A LIST-valued `.filter(arrow)` memo (#2075 — the blog PostList `visible`
    // shape) is a slice of the receiver's boxed elements, not a scalar.
    // Decided FIRST, ahead of the memo's declared `type` and every other
    // heuristic below: the analyzer's simple per-memo type inference doesn't
    // model `.filter`'s predicate shape and can land on a bogus primitive
    // (observed: `boolean`, from the predicate's own `!`/`||` structure),
    // which would otherwise sail through the `typeInfoToGo(memo.type) ===
    // 'interface{}'` gates below unchallenged. `bf.FilterEval` (the SSR
    // constructor lowering, memo-compute.ts) returns `[]any`; the template's
    // `range` / reflective field access handle the boxed elements the same
    // way it already handles other `interface{}`-typed slices.
    if (isListFilterMemo(memo)) return '[]any'

    // A template-literal memo always produces a string. Decide this first so a
    // class-string `/` (e.g. `ring-ring/50`) doesn't trip the arithmetic
    // heuristic below into `int`. The analyzer classified the body shape from
    // the arrow AST (`MemoInfo.bodyIsTemplateLiteral`).
    if (memo.bodyIsTemplateLiteral) return 'string'

    // Arithmetic operators → likely a number.
    if (memo.computation.includes('*') || memo.computation.includes('/') ||
        memo.computation.includes('+') || memo.computation.includes('-')) {
      // Number-typed dependency signals confirm it.
      for (const dep of memo.deps) {
        const signal = signals.find(s => s.getter === dep)
        if (signal) {
          let referencedProp = propsParamMap.get(signal.initialValue)
          if (!referencedProp) {
            const propName = this.extractPropNameFromInitialValue(signal.initialValue)
            if (propName) referencedProp = propsParamMap.get(propName)
          }
          if (referencedProp) {
            const propType = typeInfoToGo(this.emitCtx, referencedProp.type, referencedProp.defaultValue)
            if (propType === 'int' || propType === 'float64') {
              return 'int'
            }
          }
          const signalType = typeInfoToGo(this.emitCtx, signal.type, signal.initialValue)
          if (signalType === 'int' || signalType === 'float64') {
            return 'int'
          }
        }
      }
    }

    // Boolean memo: a comparison/negation/ternary whose dependency signals are
    // all boolean (`isChecked = isControlled() ? controlledChecked() :
    // internalChecked()`). Inferring `bool` makes the field render `false` (not
    // the int `0`) for `aria-checked={isChecked()}`. Only fires when the declared
    // memo type is unknown so an explicitly-typed memo still wins.
    // A string-literal-branch ternary memo (`directionClasses`) is a string even
    // though its condition has `===`. Decide before the boolean heuristic so it's
    // typed `string` (zero value `""`), not `interface{}` (whose nil zero renders
    // `<nil>`).
    if (typeInfoToGo(this.emitCtx, memo.type) === 'interface{}' && isStringTernaryMemo(this.emitCtx, memo.parsed)) {
      return 'string'
    }
    if (typeInfoToGo(this.emitCtx, memo.type) === 'interface{}' && isBooleanMemo(this.emitCtx, memo, signals, propsParamMap)) {
      return 'bool'
    }

    // Block-body memo returning a module-const array: use the constant's array
    // type instead of the memo's generic `object`.
    const blockReturn = resolveBlockBodyMemoModuleConst(this.emitCtx, memo, signals)
    if (blockReturn?.constType?.kind === 'array') {
      return typeInfoToGo(this.emitCtx, blockReturn.constType)
    }

    // Default to the memo's declared type
    return typeInfoToGo(this.emitCtx, memo.type)
  }

  /**
   * Walk signals to collect prop fallbacks. Skips props that already have a
   * destructure-side default (`{ X = N }`) or signals whose fallback resolves to
   * the type's Go zero value (no-op).
   */
  private collectPropFallbackVars(ir: ComponentIR): Map<string, PropFallbackVar> {
    const result = new Map<string, PropFallbackVar>()
    const localTaken = new Set(['scopeID'])
    for (const nested of findNestedComponents(ir.root)) {
      localTaken.add(`${nested.name.charAt(0).toLowerCase()}${nested.name.slice(1)}s`)
    }

    for (const signal of ir.metadata.signals) {
      const match = this.extractPropFallback(signal.initialValue)
      if (!match) continue
      if (result.has(match.propName)) continue
      const param = ir.metadata.propsParams.find(p => p.name === match.propName)
      if (!param) continue
      // A destructure default already wins via applyGoFallback below.
      if (goPropDefault(param.defaultValue) !== null) continue
      const fieldName = capitalizeFieldName(match.propName)
      // Pick the zero literal based on the fallback's literal shape. Bool
      // fallbacks (`?? true`) hoist against the `false` zero — the same Go-zero
      // conflation the int / string cases accept: the caller can't distinguish
      // "explicit false" from "unset", the documented SSR-default trade-off.
      let zeroLiteral: string
      if (match.goFallback === 'true' || match.goFallback === 'false') {
        zeroLiteral = 'false'
      } else if (/^-?\d+(\.\d+)?$/.test(match.goFallback)) {
        zeroLiteral = '0'
      } else if (match.goFallback.startsWith('"')) {
        zeroLiteral = '""'
      } else {
        continue
      }
      // Zero-equivalent fallback is a no-op against the Go zero value
      // (`?? 0`, `?? ''`, `?? false`, `?? 0.0`). Compare against the computed
      // zeroLiteral so spelling variants like `0.0` collapse to the same skip
      // as `0`.
      if (match.goFallback === zeroLiteral) continue
      if (zeroLiteral === '0' && Number(match.goFallback) === 0) continue
      // The JSX-side identifier is the natural local name; suffix with `_` if it
      // collides with a Go keyword or a local we already emit.
      let varName = match.propName
      while (localTaken.has(varName) || GO_KEYWORDS.has(varName)) {
        varName += '_'
      }
      localTaken.add(varName)
      result.set(match.propName, { varName, fieldName, goFallback: match.goFallback, zeroLiteral })
    }
    return result
  }

  /**
   * Parse a signal-time initial value of the form `props.X ?? <literal>` into
   * the source prop name and the Go-formatted fallback. Returns null when the
   * expression isn't a `??` against a property access on `propsObjectName`, or
   * the fallback isn't a simple literal `goPropDefault` can translate.
   *
   * Keeps the original prop reference (not just the resolved value) so
   * caller-supplied non-zero inputs are honoured.
   */
  private extractPropFallback(initialValue: string): { propName: string; goFallback: string } | null {
    if (!this.state.propsObjectName) return null
    const trimmed = initialValue.trim()
    const name = this.state.propsObjectName

    // `props.X ?? <rhs>` — capture RHS greedily up to end of string.
    const re = new RegExp(`^${name}\\.(\\w+)\\s*\\?\\?\\s*(.+)$`)
    const m = trimmed.match(re)
    if (!m) return null
    const goFallback = goPropDefault(m[2].trim())
    if (goFallback === null) return null
    return { propName: m[1], goFallback }
  }

  /**
   * Extract the prop name from a signal's `props.xxx`-pattern initialValue,
   * e.g. `"props.initial ?? 0"` → `"initial"`, `"props.checked"` → `"checked"`.
   */
  private extractPropNameFromInitialValue(initialValue: string): string | null {
    if (!this.state.propsObjectName) return null
    const trimmed = initialValue.trim()
    const name = this.state.propsObjectName

    // "props.initial ?? 0", "props.checked", "p.value || ''"
    const direct = new RegExp(`^${name}\\.(\\w+)(?:\\s*(?:\\?\\?|\\|\\|)\\s*.+)?$`)
    const m1 = trimmed.match(direct)
    if (m1) return m1[1]

    // "(props.initialTodos ?? []).map(...)"
    const wrapped = new RegExp(`^\\(${name}\\.(\\w+)\\s*(?:\\?\\?|\\|\\|)\\s*[^)]+\\)(.*)$`)
    const m2 = trimmed.match(wrapped)
    if (m2) {
      const tail = m2[2]
      // The propagation rule is "this signal's Go type is the prop's Go type".
      // That breaks when the trailing access transforms the prop type — e.g.
      // `(props.initial ?? []).length` is a `number`, not the prop's `[]Todo`.
      // Bail so the caller falls back to `inferTypeFromValue` on the full
      // expression, which recognises `.length` / `.some()` / `.every()` etc.
      if (/^\s*\.(length|size|some|every|includes|indexOf|findIndex|lastIndexOf)\b/.test(tail)) {
        return null
      }
      return m2[1]
    }

    return null
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
    return this.renderFragment(node)
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
    const attrs = this.renderAttributes(element)
    const children = this.renderChildren(element.children)

    let hydrationAttrs = ''
    if (element.needsScope) {
      hydrationAttrs += ` ${this.renderScopeMarker('.ScopeID')}`
    }
    // A root scope element carries `data-key` for a keyed loop item — the
    // parent's loop init stamped `.BfDataKey`, so a non-keyed render emits
    // nothing. Applies to early-return (if-statement) roots too, where every
    // branch's top element qualifies.
    if (this.state.rootScopeNodes.has(element) && element.needsScope) {
      hydrationAttrs += `{{if .BfDataKey}} data-key="{{.BfDataKey}}"{{end}}`
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

    const voidElements = [
      'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
      'link', 'meta', 'param', 'source', 'track', 'wbr',
    ]

    if (voidElements.includes(tag.toLowerCase())) {
      return `<${tag}${attrs}${hydrationAttrs}>`
    }

    return `<${tag}${attrs}${hydrationAttrs}>${children}</${tag}>`
  }

  renderExpression(expr: IRExpression): string {
    // @client directive: render a comment marker; ClientJS evaluates the
    // expression via updateClientMarker().
    if (expr.clientOnly) {
      if (expr.slotId) {
        return `{{bfComment "client:${expr.slotId}"}}`
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

    // Mark expressions with slotId using comment nodes for client JS to find.
    // This includes reactive expressions AND loop-param-dependent expressions.
    if (expr.slotId) {
      return `{{bfTextStart "${expr.slotId}"}}{{${goExpr}}}{{bfTextEnd}}`
    }

    return `{{${goExpr}}}`
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
    for (let i = this.loopBindingStack.length - 1; i >= 0; i--) {
      const acc = this.loopBindingStack[i].get(name)
      if (acc !== undefined) return acc
    }
    const inlined = this.resolveModuleStringConst(name)
    if (inlined !== null) return inlined
    // Module numeric const (e.g. `const TRACK = 8` used in a width expression):
    // inline the literal value rather than emit `{{.TRACK}}` against a Props
    // field that never exists. Mirrors the string-const inlining above.
    const inlinedNum = this.resolveModuleNumericConst(name)
    if (inlinedNum !== null) return inlinedNum
    const currentLoopParam = this.loopParamStack[this.loopParamStack.length - 1]
    if (currentLoopParam && name === currentLoopParam) return '.'
    // An *outer* loop's value variable (we're in a nested loop) is in scope as
    // the Go range variable `$name` declared by that loop's `{{range … := …}}`;
    // the inner dot no longer refers to it, and it's not a root field.
    if (this.isOuterLoopParam(name)) return `$${name}`
    if (this.loopVarRefCount.has(name)) return `$${name}`
    // A bare reference to a component-scope derived const (e.g. `root`) lowers to
    // `.Root`; note it so `generateTypes` emits a computed field.
    if (this.state.localConstants.some(c => c.name === name && !c.isModule && !c.containsArrow)) {
      this.state.referencedDerivedConsts.add(name)
    }
    // Env-signal binding (incl. an alias) → canonical `.SearchParams`.
    return this.searchParamsFieldRef(name) ?? this.rootFieldRef(name)
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
      const c = this.state.localConstants.find(lc => lc.name === name && !lc.isModule && lc.value)
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
      const c = this.state.localConstants.find(lc => lc.name === node.name && !lc.isModule && lc.value)
      if (c?.value) {
        const inner = c.parsed
        if (inner) return this.isStringExpr(inner, new Set([...seen, node.name]))
      }
    }
    return false
  }

  /**
   * True when `name` is a loop value variable from an enclosing (not the
   * current) loop — i.e. it sits on `loopParamStack` below the top. Such a
   * reference resolves to the Go range variable `$name`, not the inner dot or
   * the root data.
   */
  private isOuterLoopParam(name: string): boolean {
    const top = this.loopParamStack.length - 1
    for (let i = 0; i < top; i++) {
      if (this.loopParamStack[i] === name) return true
    }
    return false
  }

  /**
   * A reference to a root-scope field — a signal, a prop, or a derived value
   * that lives on the component's top-level data struct. Inside a `{{range}}`
   * the dot is rebound to the iteration element, so root data must be reached
   * through Go template's `$` (the top-level argument to Execute), which never
   * rebinds. Outside any loop the root *is* the dot, so we emit `.Field`.
   */
  private rootFieldRef(name: string): string {
    const prefix = this.loopParamStack.length > 0 ? '$.' : '.'
    return `${prefix}${capitalizeFieldName(name)}`
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
    if (this.loopParamStack.length > 0 && this.loopParamStack[this.loopParamStack.length - 1] === name) {
      return null
    }
    if (this.loopVarRefCount.has(name)) return null
    if (this.isOuterLoopParam(name)) return null
    const value = this.state.moduleStringConsts.get(name)
    if (value === undefined) return null
    return `"${escapeGoString(value)}"`
  }

  /**
   * Inline a module-level numeric const (`const TRACK = 8`) as its literal
   * value. Only a plain numeric initializer qualifies — anything computed or
   * non-numeric falls through to the normal field/ident resolution. Scoped to
   * module consts (like the string variant) and guarded against loop vars so a
   * range variable that shadows a const name still wins.
   */
  private resolveModuleNumericConst(name: string): string | null {
    if (this.loopParamStack.length > 0 && this.loopParamStack[this.loopParamStack.length - 1] === name) {
      return null
    }
    if (this.loopVarRefCount.has(name)) return null
    if (this.isOuterLoopParam(name)) return null
    const c = this.state.localConstants.find(
      (k) => k.name === name && k.isModule && !k.containsArrow,
    )
    if (!c || c.value === undefined) return null
    // `value` is reconstructed from source text, so a valid TS literal may carry
    // numeric separators (`100_000`). Strip them between digits, then accept a
    // plain decimal / float; Go template numeric literals don't allow `_`.
    const v = c.value.trim().replace(/(?<=\d)_(?=\d)/g, '')
    return /^-?\d+(\.\d+)?$/.test(v) ? v : null
  }

  literal(value: string | number | boolean | null, literalType: LiteralType): string {
    if (literalType === 'string') return `"${value}"`
    if (literalType === 'null') return 'nil'
    return String(value)
  }

  call(callee: ParsedExpr, args: ParsedExpr[], emit: (e: ParsedExpr) => string): string {
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
    // Generic call: render callee and args.
    const calleeStr = emit(callee)
    if (args.length === 0) return calleeStr
    const argsStr = args.map(emit).join(' ')
    return `${calleeStr} ${argsStr}`
  }

  member(
    object: ParsedExpr,
    property: string,
    _computed: boolean,
    emit: (e: ParsedExpr) => string,
  ): string {
    // .length on a `.filter(...)` callback call → len (bf_filter ...)
    const objHO = this.higherOrderShapeOf(object)
    if (property === 'length' && objHO) {
      const result = this.renderFilterLengthExpr(objHO, emit)
      if (result) return result
    }

    // `<memo>().length` where the memo's `.map()` feeds a handler-filled loop
    // slice → `len .<Slice>` (`visible().length` → `len .PostListItems`). The
    // slice holds the rendered (filtered) items, so its length is the count —
    // unlike the memo's own field, which is unset.
    if (
      property === 'length' &&
      object.kind === 'call' &&
      object.callee.kind === 'identifier' &&
      object.args.length === 0
    ) {
      const slice = this.state.memoBackedLoopSlice.get(object.callee.name)
      if (slice) {
        // Root field, so reach it through `$.` inside a loop.
        const prefix = this.loopParamStack.length > 0 ? '$.' : '.'
        return `len ${prefix}${slice}`
      }
    }

    // find().property / findLast().property → {{with bf_find ...}}{{.Property}}{{end}}
    if (objHO && (objHO.method === 'find' || objHO.method === 'findLast')) {
      const findResult = this.renderHigherOrderExpr(objHO, emit)
      if (findResult) {
        return `{{with ${findResult}}}{{.${goFieldNameForKey(property)}}}{{end}}`
      }
      const templateBlock = this.renderFindTemplateBlock(
        objHO, emit, goFieldNameForKey(property),
      )
      if (templateBlock) return templateBlock
    }

    // SolidJS-style props pattern: props.xxx -> .Xxx (or $.Xxx inside a loop,
    // since props live on the root data struct, not the iteration element).
    if (object.kind === 'identifier' && this.state.propsObjectName && object.name === this.state.propsObjectName) {
      return this.rootFieldRef(property)
    }

    // A member chain rooted in a `useContext` local whose `createContext`
    // default is object-shaped (#2087 — `defaultKind === 'object'`) reads off
    // a `map[string]interface{}` field, not a struct: plain Go template dot
    // access (`.Ctx.Config`) does an EXACT-string `MapIndex`, so it would
    // only resolve a capitalized key the provider never bakes (see
    // `providerObjectValueToGoMap`, which keeps SOURCE/JS-cased keys). Route
    // through `bf_get` (the runtime's case-tolerant `getFieldValue`, bf.go)
    // instead, recursively — once a chain is map-rooted every further
    // `.property` is ALSO opaque (the map's value type is `interface{}`, so
    // there's no static struct to fall back to), hence checking the object
    // rather than just the top-level identifier.
    if (this.isMapRootedContextChain(object)) {
      const objGo = emit(object)
      return `bf_get ${wrapIfMultiToken(objGo)} ${JSON.stringify(property)}`
    }

    // Static property access on a module object-literal const
    // (`variantClasses.ghost` in a class template literal) resolves at compile
    // time — same lookup as the bracket-index form in
    // `resolveStaticRecordLiteralIndex`, reached here when the access is nested
    // inside a larger ParsedExpr tree.
    if (object.kind === 'identifier') {
      const staticValue = this.resolveStaticRecordLiteralIndex(
        `${object.name}.${property}`,
      )
      if (staticValue !== null) return staticValue
    }

    // Inside a loop, the loop param variable refers to the current item
    // (dot). e.g. `msg.role` inside `{{range $_, $msg := .Messages}}` → `.Role`
    //
    // Field names route through `goFieldNameForKey` — the same sanitizer the
    // struct/map bake side uses — NOT bare `capitalizeFieldName`: a
    // non-identifier property (`meta["data-x"]`, parsed as computed member
    // access) would otherwise emit `.Data-x`, which is not even valid Go
    // template syntax, let alone a reachable field (PR #2089 review). For
    // identifier keys (snake_case included) the two functions agree, so
    // nothing previously reachable changes shape.
    const currentLoopParam = this.loopParamStack[this.loopParamStack.length - 1]
    if (object.kind === 'identifier' && currentLoopParam && object.name === currentLoopParam) {
      return `.${goFieldNameForKey(property)}`
    }

    const obj = emit(object)
    if (property === 'length') return `len ${obj}`
    return `${obj}.${goFieldNameForKey(property)}`
  }

  indexAccess(object: ParsedExpr, index: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    // Go's `index` builtin: `index $arr $i`. Both operands render through the
    // same emitter so a loop-variable / arithmetic index lowers correctly. A
    // multi-token operand (`bf_add $i 1`) must be parenthesised or Go parses it
    // as extra `index` arguments.
    return `index ${wrapIfMultiToken(emit(object))} ${wrapIfMultiToken(emit(index))}`
  }

  binary(op: string, left: ParsedExpr, right: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    const l = emit(left)
    const r = emit(right)
    // Every Go form below is a prefix function call (`bf_mul a b`, `gt a b`,
    // `eq a b`), so a COMPOUND operand must be parenthesised or the template
    // parser folds its tokens into the call's argument list — e.g.
    // `(elapsed / TRACK) * 100` would emit `bf_mul bf_div .Elapsed .TRACK 100`,
    // handing `bf_mul` four args. `wrapIfMultiToken` is a no-op for single tokens
    // and quoted literals.
    const wl = wrapIfMultiToken(l)
    const wr = wrapIfMultiToken(r)
    switch (op) {
      case '===':
      case '==': {
        const [el, er] = stringTolerantEqOperands(l, r)
        return `eq ${wrapIfMultiToken(el)} ${wrapIfMultiToken(er)}`
      }
      case '!==':
      case '!=': {
        const [el, er] = stringTolerantEqOperands(l, r)
        return `ne ${wrapIfMultiToken(el)} ${wrapIfMultiToken(er)}`
      }
      case '>':
        return `gt ${wl} ${wr}`
      case '<':
        return `lt ${wl} ${wr}`
      case '>=':
        return `ge ${wl} ${wr}`
      case '<=':
        return `le ${wl} ${wr}`
      case '+':
        return `bf_add ${wl} ${wr}`
      case '-':
        return `bf_sub ${wl} ${wr}`
      case '*':
        return `bf_mul ${wl} ${wr}`
      case '/':
        return `bf_div ${wl} ${wr}`
      case '%':
        return `bf_mod ${wl} ${wr}`
      default:
        return `${l} ${op} ${r}`
    }
  }

  unary(op: string, argument: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    const arg = emit(argument)
    if (op === '!') return `not ${arg}`
    if (op === '-') return `bf_neg ${arg}`
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
    const wrapLeft = wrapIfMultiToken(emit(left))
    const wrapRight = wrapIfMultiToken(emit(right))
    if (op === '&&') return `and ${wrapLeft} ${wrapRight}`
    return `or ${wrapLeft} ${wrapRight}`
  }

  // JSX-level ternaries (`{expr ? a : b}`) are handled at the IR level as
  // IRConditional (via convertConditionToGo → renderConditionExpr). This method
  // is only reached for ternaries nested inside other ParsedExpr trees (e.g.
  // template-literal interpolation), where the test is always a simple pipeline
  // expression (runtime helpers, not template blocks).
  conditional(
    test: ParsedExpr,
    consequent: ParsedExpr,
    alternate: ParsedExpr,
    emit: (e: ParsedExpr) => string,
  ): string {
    const t = emit(test)
    const c = this.renderConditionalBranch(consequent)
    const a = this.renderConditionalBranch(alternate)
    return `{{if ${t}}}${c}{{else}}${a}{{end}}`
  }

  templateLiteral(parts: TemplatePart[], emit: (e: ParsedExpr) => string): string {
    let result = ''
    for (const part of parts) {
      if (part.type === 'string') {
        result += part.value
      } else {
        // A nested ternary emits a complete `{{if …}}…{{end}}` action chain (see
        // `conditional` above) — wrapping it again produces `{{{{if …}}` and a
        // template parse error. Same `isTemplateFragment` guard as
        // `renderExpression`.
        const e = emit(part.expr)
        result += this.isTemplateFragment(e, part.expr.kind) ? e : `{{${e}}}`
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

  objectLiteral(_properties: ObjectLiteralProperty[], raw: string, _emit: (e: ParsedExpr) => string): string {
    // The shared `isSupported` gate now admits an EMPTY object literal
    // (`?? {}`) as `??`'s right operand (expression-parser.ts, `logical`
    // case) — every other adapter has a native `{}` dict/hashref literal to
    // emit here, but `text/template` has none, so this dispatcher is the
    // one place left to refuse the shape. Unlike the sibling adapters, Go
    // can't silently fall back to a safe sentinel text: `this.unsupported`'s
    // `[UNSUPPORTED: …]` marker would be spliced into a Go template action
    // (e.g. as an `or`/`and` operand) and break template parsing, and the
    // shared gate no longer reports BF101 for this shape itself (it now
    // considers `x ?? {}` supported). So self-report BF101 here — mirroring
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

  /** Set of predicate (boolean-callback) higher-order methods. */
  private static readonly PREDICATE_METHODS: ReadonlySet<string> = new Set([
    'filter', 'find', 'findIndex', 'findLast', 'findLastIndex', 'every', 'some',
  ])

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
    if (!GoTemplateAdapter.PREDICATE_METHODS.has(cb.method)) return null
    return {
      method: cb.method as HigherOrderMethod,
      object: cb.object,
      param: cb.arrow.params[0] ?? '_',
      predicate: cb.arrow.body,
    }
  }

  /**
   * Push BF101 for a callback method whose shape has no Go template form.
   *
   * `selfContained` callbacks (`reduce` / `flatMap` off the eval-lowerable
   * catalogue — a `.reduce` with no init, a tuple `.flatMap` with a non-leaf
   * element) carry the self-contained "no SSR" remedy and must NOT get the
   * generic Options block appended (mirrors `isSupported`'s `selfContained`
   * flag for `UNSUPPORTED_METHODS`). Predicate callbacks that exhaust their
   * template-block fallbacks keep the generic Options remediation.
   */
  private pushCallbackBF101(method: string, selfContained = false): string {
    this.state.errors.push({
      code: 'BF101',
      severity: 'error',
      message: `Higher-order method '.${method}' shape cannot be lowered to a Go template action`,
      loc: this.makeLoc(),
      suggestion: {
        message: selfContained
          ? `'${method}()' can't render on the server. Pre-compute the value, or add /* @client */ for client-only (no SSR).`
          : GO_REMEDIATION_OPTIONS,
      },
    })
    return `""`
  }

  callbackMethod(
    method: string,
    object: ParsedExpr,
    arrow: Extract<ParsedExpr, { kind: 'arrow' }>,
    restArgs: ParsedExpr[],
    emit: (e: ParsedExpr) => string,
  ): string {
    const recv = emit(object)
    const body = arrow.body
    const params = arrow.params

    if (GoTemplateAdapter.PREDICATE_METHODS.has(method)) {
      const shape: HigherOrderShape = {
        method: method as HigherOrderMethod,
        object,
        param: params[0] ?? '_',
        predicate: body,
      }
      const result = this.renderHigherOrderExpr(shape, emit)
      if (result) return result
      if (
        method === 'find' || method === 'findIndex' ||
        method === 'findLast' || method === 'findLastIndex'
      ) {
        const templateBlock = this.renderFindTemplateBlock(shape, emit)
        if (templateBlock) return templateBlock
      }
      if (method === 'every' || method === 'some') {
        const templateBlock = this.renderEverySomeTemplateBlock(shape, emit)
        if (templateBlock) return templateBlock
      }
      return this.pushCallbackBF101(method)
    }

    if (method === 'sort' || method === 'toSorted') {
      // Evaluator-first (#2018): the comparator body is serialized and evaluated
      // per comparison. Falls back to the structured `bf_sort` for a comparator
      // the evaluator can't model (e.g. localeCompare).
      const evalForm = emitSortEval(recv, body, params, emit)
      if (evalForm !== null) return evalForm
      const cmp = sortComparatorFromArrow(arrow)
      if (cmp !== null) return emitBfSort(recv, cmp)
      return this.pushCallbackBF101(method)
    }

    if (method === 'reduce' || method === 'reduceRight') {
      // `.reduce(fn, init)` / `.reduceRight(fn, init)` fold via the evaluator.
      // The arithmetic-fold catalogue always serializes, so there's no
      // structured fallback — a body / init the evaluator can't model is BF101.
      const direction = method === 'reduceRight' ? 'right' : 'left'
      const init = restArgs[0]
      if (init) {
        const evalForm = emitReduceEval(recv, body, params, init, direction, emit)
        if (evalForm !== null) return evalForm
      }
      return this.pushCallbackBF101(method, true)
    }

    if (method === 'flatMap') {
      const evalForm = emitFlatMapEval(recv, body, params[0] ?? '_', emit)
      if (evalForm !== null) return evalForm
      return this.pushCallbackBF101(method, true)
    }

    // Value-producing `.map(cb)` (#2073): eval-only. (The JSX-returning
    // `.map` is an IRLoop upstream and never reaches this dispatch.)
    if (method === 'map') {
      const evalForm = emitMapEval(recv, body, params[0] ?? '_', emit)
      if (evalForm !== null) return evalForm
      return this.pushCallbackBF101(method, true)
    }

    return this.pushCallbackBF101(method, true)
  }

  arrayMethod(
    method: ArrayMethod,
    object: ParsedExpr,
    args: ParsedExpr[],
    emit: (e: ParsedExpr) => string,
  ): string {
    // `bf_join` etc. are registered in the runtime FuncMap. The exhaustive
    // switch on `method` mirrors the IR-level discriminator — adding a new
    // `ArrayMethod` variant becomes a TS compile error until every adapter
    // declares its lowering.
    switch (method) {
      case 'join': {
        const obj = emit(object)
        // `.join()` defaults the separator to `,`; extra arguments are ignored.
        const sep = args.length >= 1 ? emit(args[0]) : '","'
        // Paren-wrap a multi-token separator so Go template doesn't fold its
        // tokens into `bf_join`'s argument list.
        return `bf_join (${obj}) ${wrapIfMultiToken(sep)}`
      }
      case 'includes': {
        // Both `arr.includes(x)` and `str.includes(sub)` route here — the parser
        // can't disambiguate the receiver type. The runtime `Includes` helper
        // inspects `reflect.Kind()`: slices/arrays use DeepEqual element search,
        // strings use `strings.Contains`.
        const obj = emit(object)
        const needle = emit(args[0])
        return `bf_includes ${wrapIfMultiToken(obj)} ${wrapIfMultiToken(needle)}`
      }
      case 'indexOf':
      case 'lastIndexOf': {
        // Value-equality search (DeepEqual), for the bare `.indexOf(x)` /
        // `.lastIndexOf(x)` shape with no `.field` accessor on the elements
        // (unlike `bf_find_index`, which keys on struct-field equality).
        const fn = method === 'indexOf' ? 'bf_index_of' : 'bf_last_index_of'
        const obj = emit(object)
        const needle = emit(args[0])
        return `${fn} ${wrapIfMultiToken(obj)} ${wrapIfMultiToken(needle)}`
      }
      case 'at': {
        // `.at(i)` supports negative indices (`.at(-1)` → last element). No
        // argument is `.at(0)`; extra arguments are ignored.
        const obj = emit(object)
        const idx = args.length >= 1 ? emit(args[0]) : '0'
        return `bf_at ${wrapIfMultiToken(obj)} ${wrapIfMultiToken(idx)}`
      }
      case 'concat': {
        // `.concat(other)` merges two arrays; `bf_concat` reflects over both
        // operands so callers can mix `[]string` + `[]any` etc. `.concat()` with
        // no argument is a shallow copy, indistinguishable from the receiver in
        // an SSR snapshot, so it lowers to the receiver.
        if (args.length === 0) {
          return emit(object)
        }
        const a = emit(object)
        const b = emit(args[0])
        return `bf_concat ${wrapIfMultiToken(a)} ${wrapIfMultiToken(b)}`
      }
      case 'slice': {
        // `.slice()` / `.slice(start)` / `.slice(start, end)`. Missing `start`
        // defaults to 0; an absent `end` means "to length". Out-of-bounds
        // indices clamp (JS-compat); `start > end` returns empty. Only
        // `args[0]` / `args[1]` are read.
        const recv = emit(object)
        const start = args.length >= 1 ? emit(args[0]) : '0'
        if (args.length <= 1) {
          return `bf_slice ${wrapIfMultiToken(recv)} ${wrapIfMultiToken(start)}`
        }
        const end = emit(args[1])
        return `bf_slice ${wrapIfMultiToken(recv)} ${wrapIfMultiToken(start)} ${wrapIfMultiToken(end)}`
      }
      case 'reverse':
      case 'toReversed': {
        // SSR renders a state snapshot, so JS's mutate-receiver (`reverse`) vs
        // return-new (`toReversed`) distinction has no template-level meaning.
        // Both route through `bf_reverse`, which always returns a fresh `[]any`.
        const recv = emit(object)
        return `bf_reverse ${wrapIfMultiToken(recv)}`
      }
      case 'toLowerCase': {
        const recv = emit(object)
        return `bf_lower ${wrapIfMultiToken(recv)}`
      }
      case 'toUpperCase': {
        const recv = emit(object)
        return `bf_upper ${wrapIfMultiToken(recv)}`
      }
      case 'trim': {
        const recv = emit(object)
        return `bf_trim ${wrapIfMultiToken(recv)}`
      }
      case 'trimStart':
      case 'trimEnd': {
        // `.trimStart()` / `.trimEnd()` — the one-sided siblings of `.trim()`
        // (#2183 follow-up). Dedicated `bf_trim_start` / `bf_trim_end`
        // helpers, not `bf_trim` with a flag.
        const fn = method === 'trimStart' ? 'bf_trim_start' : 'bf_trim_end'
        const recv = emit(object)
        return `${fn} ${wrapIfMultiToken(recv)}`
      }
      case 'toFixed': {
        // `.toFixed(digits?)` → `bf_to_fixed` (`fmt.Sprintf("%.*f", …)`); default
        // 0 digits when the argument is omitted.
        const recv = emit(object)
        const digits = args.length >= 1 ? emit(args[0]) : '0'
        return `bf_to_fixed ${wrapIfMultiToken(recv)} ${wrapIfMultiToken(digits)}`
      }
      case 'split': {
        // `.split()` / `.split(sep)` / `.split(sep, limit)` — string → `[]any`.
        // No separator → the whole string as a single element (`bf_arr`).
        // Otherwise `bf_split`; a second `limit` argument caps the pieces. A
        // third+ argument is ignored.
        const recv = emit(object)
        if (args.length === 0) {
          return `bf_arr ${wrapIfMultiToken(recv)}`
        }
        const sep = emit(args[0])
        if (args.length === 1) {
          return `bf_split ${wrapIfMultiToken(recv)} ${wrapIfMultiToken(sep)}`
        }
        const limit = emit(args[1])
        return `bf_split ${wrapIfMultiToken(recv)} ${wrapIfMultiToken(sep)} ${wrapIfMultiToken(limit)}`
      }
      case 'startsWith':
      case 'endsWith': {
        // `.startsWith(prefix, position?)` / `.endsWith(suffix, endPosition?)` —
        // string → boolean via `bf_starts_with` / `bf_ends_with`. The optional
        // second argument re-anchors the test; a third+ argument is ignored.
        const fn = method === 'startsWith' ? 'bf_starts_with' : 'bf_ends_with'
        const recv = emit(object)
        const arg = emit(args[0])
        const base = `${fn} ${wrapIfMultiToken(recv)} ${wrapIfMultiToken(arg)}`
        if (args.length >= 2) {
          return `${base} ${wrapIfMultiToken(emit(args[1]))}`
        }
        return base
      }
      case 'replace': {
        // `.replace(old, new)` — string-pattern form, first occurrence only, via
        // `bf_replace` (`strings.Replace` with n=1). The regex-pattern form is
        // refused upstream at the parser.
        const recv = emit(object)
        const oldS = emit(args[0])
        const newS = emit(args[1])
        return `bf_replace ${wrapIfMultiToken(recv)} ${wrapIfMultiToken(oldS)} ${wrapIfMultiToken(newS)}`
      }
      case 'replaceAll': {
        // `.replaceAll(old, new)` — string-pattern form, EVERY occurrence, via
        // `bf_replace_all` (`strings.ReplaceAll`). A dedicated helper, not
        // `bf_replace` with a different n — the regex-pattern form is refused
        // upstream at the parser, same as `.replace`.
        const recv = emit(object)
        const oldS = emit(args[0])
        const newS = emit(args[1])
        return `bf_replace_all ${wrapIfMultiToken(recv)} ${wrapIfMultiToken(oldS)} ${wrapIfMultiToken(newS)}`
      }
      case 'repeat': {
        // `.repeat(n)` — string repeated `n` times. `bf_repeat` clamps a negative
        // count to "" instead of letting `strings.Repeat` panic. No argument is
        // `repeat(0)` → ""; a second+ argument is ignored.
        const recv = emit(object)
        const count = args.length === 0 ? '0' : emit(args[0])
        return `bf_repeat ${wrapIfMultiToken(recv)} ${wrapIfMultiToken(count)}`
      }
      case 'padStart':
      case 'padEnd': {
        // `.padStart(target, pad?)` / `.padEnd(target, pad?)` — pad to `target`
        // runes with `pad` (default a single space, supplied by the variadic
        // helper). No argument is `padStart(0)` → the receiver unchanged; a
        // third+ argument is ignored.
        const fn = method === 'padStart' ? 'bf_pad_start' : 'bf_pad_end'
        const recv = emit(object)
        if (args.length === 0) {
          return `${fn} ${wrapIfMultiToken(recv)} 0`
        }
        const target = emit(args[0])
        if (args.length === 1) {
          return `${fn} ${wrapIfMultiToken(recv)} ${wrapIfMultiToken(target)}`
        }
        const pad = emit(args[1])
        return `${fn} ${wrapIfMultiToken(recv)} ${wrapIfMultiToken(target)} ${wrapIfMultiToken(pad)}`
      }
      default: {
        const _exhaustive: never = method
        throw new Error(`Go arrayMethod: unhandled ArrayMethod '${(_exhaustive as string)}'`)
      }
    }
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

  unsupported(raw: string, _reason: string): string {
    // Should not happen if `isSupported` was checked at parse time.
    return `[UNSUPPORTED: ${raw}]`
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
    const condition = this.renderFilterExpr(expr.predicate, expr.param)
    if (condition.includes('[UNSUPPORTED')) return null

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
    const condition = this.renderFilterExpr(expr.predicate, expr.param)
    if (condition.includes('[UNSUPPORTED')) return null

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

  /**
   * Render a predicate for use in Go template `{{if}}` conditions, substituting
   * the loop parameter (e.g. `t` in `t.done`) with dot notation.
   */
  private renderPredicateCondition(pred: ParsedExpr, param: string): string {
    return this.renderFilterExpr(pred, param)
  }

  /** Whether an expression needs parentheses when used in and/or. */
  private needsParens(expr: ParsedExpr): boolean {
    return expr.kind === 'logical' || expr.kind === 'unary' || expr.kind === 'conditional'
  }

  /**
   * Split a rendered template block into preamble + final expression.
   * The last `{{...}}` must be a variable reference (`$bf_rN` or
   * `$bf_result`). Control tokens like `{{end}}` or `{{break}}` are
   * rejected — those template blocks (e.g. find's range/break form)
   * can't be composed in binary/logical expressions.
   */
  private splitPreamble(rendered: string): { preamble: string; expr: string } | null {
    if (!rendered.includes('{{')) return null
    const lastOpen = rendered.lastIndexOf('{{')
    const lastClose = rendered.lastIndexOf('}}')
    if (lastOpen >= 0 && lastClose > lastOpen) {
      const candidate = rendered.substring(lastOpen + 2, lastClose)
      if (!candidate.startsWith('$')) return null
      return {
        preamble: rendered.substring(0, lastOpen),
        expr: candidate,
      }
    }
    return null
  }

  /**
   * Render a filter predicate expression (`t => !t.done`, or a block body
   * normalized to one — #2040). `localVarMap` is a vestigial empty default kept
   * on the recursion; block-body locals are now inlined upstream, so no caller
   * populates it.
   */
  private renderFilterExpr(
    expr: ParsedExpr,
    param: string,
    localVarMap: Map<string, string> = new Map()
  ): string {
    // Top-of-recursion: clear the unsupported sentinel so a previous filter
    // expression's failure doesn't poison this one. Parents (`member` /
    // `binary` / `unary` / `logical` / `call`) check the flag after each child
    // render and propagate `false` upward so the emitted template stays
    // syntactically valid even when the default branch had to bail out.
    if (this.filterExprDepth === 0) this.filterExprUnsupported = false
    this.filterExprDepth++
    try {
      return this.renderFilterExprNode(expr, param, localVarMap)
    } finally {
      this.filterExprDepth--
    }
  }

  private renderFilterExprNode(
    expr: ParsedExpr,
    param: string,
    localVarMap: Map<string, string>
  ): string {
    switch (expr.kind) {
      case 'identifier': {
        if (expr.name === param) {
          return '.'
        }
        // A local variable mapped to a signal.
        const signal = localVarMap.get(expr.name)
        if (signal) {
          return `$.${capitalizeFieldName(signal)}`
        }
        return `.${capitalizeFieldName(expr.name)}`
      }

      case 'literal':
        if (expr.literalType === 'string') {
          return `"${expr.value}"`
        }
        if (expr.literalType === 'null') {
          return 'nil'
        }
        return String(expr.value)

      case 'member': {
        // t.done -> .Done
        if (expr.object.kind === 'identifier' && expr.object.name === param) {
          return `.${capitalizeFieldName(expr.property)}`
        }
        // `.length` on a higher-order filter result (e.g.
        // `x.tags.filter(t => t.active).length > 0`). Reuse
        // `renderFilterLengthExpr` so the inner filter lowers to
        // `bf_filter <arr> "<field>" <value>` and the outer `.length` wraps it in
        // `len (...)`. Wrap in parens because the filter-context `binary` /
        // `unary` arms emit prefix function calls (`gt <l> <r>`) and Go template
        // would otherwise parse `gt len (bf_filter ...) 0` as four siblings.
        if (expr.property === 'length') {
          const innerHO = this.higherOrderShapeOf(expr.object)
          if (innerHO && innerHO.method === 'filter') {
            const lenExpr = this.renderFilterLengthExpr(innerHO, e =>
              this.renderFilterExpr(e, param, localVarMap),
            )
            if (lenExpr) return `(${lenExpr})`
          }
        }
        // Nested member access or local var.prop.
        const obj = this.renderFilterExpr(expr.object, param, localVarMap)
        if (this.filterExprUnsupported) return 'false'
        return `${obj}.${capitalizeFieldName(expr.property)}`
      }

      case 'call': {
        // `t.isDone()` -> `.IsDone`
        if (expr.callee.kind === 'member' && expr.callee.object.kind === 'identifier' && expr.callee.object.name === param) {
          return `.${capitalizeFieldName(expr.callee.property)}`
        }
        // Signal calls: `filter()` -> `$.Filter`
        if (expr.callee.kind === 'identifier' && expr.args.length === 0) {
          return `$.${capitalizeFieldName(expr.callee.name)}`
        }
        // A nested callback method call (`other.some(r => …)`) reaching this
        // arm has no Go template form in filter context — the fallthrough
        // below renders only the callee and silently DROPS the arrow argument,
        // changing predicate semantics (#2038). The one faithful nested shape
        // (`.filter(cb).length` → `len (bf_filter_eval …)`) is intercepted at
        // the `member` arm before this node is visited; everything else must
        // be loud.
        if (asCallbackMethodCall(expr) !== null) {
          return this.refuseFilterExprNode(expr)
        }
        const result = this.renderFilterExpr(expr.callee, param, localVarMap)
        if (this.filterExprUnsupported) return 'false'
        return result
      }

      case 'unary': {
        const arg = this.renderFilterExpr(expr.argument, param, localVarMap)
        if (this.filterExprUnsupported) return 'false'
        if (expr.op === '!') {
          // Wrap in parens if arg is a function call (eq, ne, gt, …).
          const needsParens = this.isGoFunctionCall(expr.argument)
          return needsParens ? `not (${arg})` : `not ${arg}`
        }
        if (expr.op === '-') {
          return `bf_neg ${arg}`
        }
        return arg
      }

      case 'binary': {
        const left = this.renderFilterExpr(expr.left, param, localVarMap)
        if (this.filterExprUnsupported) return 'false'
        const right = this.renderFilterExpr(expr.right, param, localVarMap)
        if (this.filterExprUnsupported) return 'false'

        switch (expr.op) {
          case '===':
          case '==':
            return `eq ${left} ${right}`
          case '!==':
          case '!=':
            return `ne ${left} ${right}`
          case '>':
            return `gt ${left} ${right}`
          case '<':
            return `lt ${left} ${right}`
          case '>=':
            return `ge ${left} ${right}`
          case '<=':
            return `le ${left} ${right}`
          case '+':
            return `bf_add ${left} ${right}`
          case '-':
            return `bf_sub ${left} ${right}`
          case '*':
            return `bf_mul ${left} ${right}`
          case '/':
            return `bf_div ${left} ${right}`
          default:
            return `${left} ${expr.op} ${right}`
        }
      }

      case 'logical': {
        const left = this.renderFilterExpr(expr.left, param, localVarMap)
        if (this.filterExprUnsupported) return 'false'
        const right = this.renderFilterExpr(expr.right, param, localVarMap)
        if (this.filterExprUnsupported) return 'false'
        if (expr.op === '&&') {
          return `and (${left}) (${right})`
        }
        return `or (${left}) (${right})`
      }

      default:
        // The filter predicate body contains a node kind we can't lower to a
        // Go template action. Shared refusal with the nested-callback guard in
        // the `call` arm (#2038).
        return this.refuseFilterExprNode(expr)
    }
  }

  /**
   * Refuse a filter-predicate node that has no Go template lowering. Surfaces
   * BF101 with the offending expression and sets the recursion-wide
   * `filterExprUnsupported` flag so parent branches return `false` instead of
   * wrapping the sentinel into `false.Length` / `gt false.Length 0` etc.: the
   * build fails on BF101 anyway, but the emitted template must stay
   * syntactically valid so `text/template` parsing doesn't cascade into
   * confusing secondary errors.
   */
  private refuseFilterExprNode(expr: ParsedExpr): string {
    this.filterExprUnsupported = true
    this.state.errors.push({
      code: 'BF101',
      severity: 'error',
      message: `Filter predicate contains an expression that cannot be lowered to a Go template action: ${exprToString(expr)}`,
      loc: this.makeLoc(),
      suggestion: {
        message: 'Options:\n1. Use /* @client */ for client-side evaluation\n2. Rewrite the predicate to avoid nested higher-order methods (`.filter()` / `.map()` / etc. inside the predicate body)',
      },
    })
    return 'false'
  }

  /**
   * Whether a ParsedExpr renders as a Go template function call (so it needs
   * parentheses around it).
   */
  private isGoFunctionCall(expr: ParsedExpr): boolean {
    switch (expr.kind) {
      case 'binary':
        // Comparison operators → eq, ne, gt, lt, …
        return ['===', '==', '!==', '!=', '>', '<', '>=', '<='].includes(expr.op)
      case 'logical':
        // → and, or
        return true
      case 'unary':
        // → not, bf_neg
        return true
      case 'member':
        // .length → len
        return expr.property === 'length'
      default:
        return false
    }
  }

  /**
   * Render a branch of a conditional expression. String literals render as bare
   * text (no quotes); nested conditionals render as complete `{{if}}…{{end}}`
   * blocks; everything else is wrapped in `{{...}}`.
   */
  private renderConditionalBranch(expr: ParsedExpr): string {
    if (expr.kind === 'literal' && expr.literalType === 'string') {
      return String(expr.value)
    }
    if (expr.kind === 'conditional') {
      const test = this.renderParsedExpr(expr.test)
      const consequent = this.renderConditionalBranch(expr.consequent)
      const alternate = this.renderConditionalBranch(expr.alternate)
      return `{{if ${test}}}${consequent}{{else}}${alternate}{{end}}`
    }
    return `{{${this.renderParsedExpr(expr)}}}`
  }

  /**
   * Whether a ParsedExpr renders to a Go template function call (`len .X`,
   * `bf_add .A .B`) that needs parentheses when used as an argument to a
   * comparison operator (eq, gt, lt, …).
   */
  private needsParensInGoTemplate(expr: ParsedExpr): boolean {
    switch (expr.kind) {
      case 'member':
        // .length → `len .X`
        return expr.property === 'length'

      case 'binary':
        // Arithmetic operators → bf_add, bf_sub, …
        return ['+', '-', '*', '/', '%'].includes(expr.op)

      case 'unary':
        // Negation → `bf_neg .X`
        return expr.op === '-'

      default:
        return false
    }
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
    if (/^[A-Za-z_$][\w$]*$/.test(trimmed)) {
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
    const parsed = preParsed ?? parseExpression(trimmed)
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
      const hit = carried.properties.find(prop => prop.key === key)
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
    const parsed = preParsed ?? parseExpression(trimmed)
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

    const { preamble, expr: condition } = this.renderConditionExpr(parsed)
    return { condition, preamble }
  }

  private renderConditionExpr(expr: ParsedExpr): { preamble: string; expr: string } {
    const plain = (e: string) => ({ preamble: '', expr: e })

    switch (expr.kind) {
      case 'identifier':
        {
          const inlined = this.resolveModuleStringConst(expr.name)
          if (inlined !== null) return plain(inlined)
          const currentLoopParam = this.loopParamStack[this.loopParamStack.length - 1]
          if (currentLoopParam && expr.name === currentLoopParam) {
            return plain('.')
          }
          // Outer loop value variable (nested loop) → its range var `$name`.
          if (this.isOuterLoopParam(expr.name)) {
            return plain(`$${expr.name}`)
          }
          if (this.loopVarRefCount.has(expr.name)) {
            return plain(`$${expr.name}`)
          }
        }
        return plain(this.rootFieldRef(expr.name))

      case 'literal':
        if (expr.literalType === 'string') return plain(`"${expr.value}"`)
        if (expr.literalType === 'null') return plain('nil')
        return plain(String(expr.value))

      case 'call': {
        if (expr.callee.kind === 'identifier' && expr.args.length === 0) {
          return plain(this.rootFieldRef(expr.callee.name))
        }
        // `isValidElement(x)` — the framework "is this a renderable element?"
        // predicate. In the Go SSR children model an element is represented by
        // its already-rendered markup, so this evaluates faithfully as a
        // truthiness check on the argument (an element is "valid" when there is
        // something to render). Lowering it as a real, evaluatable expression —
        // rather than a fabricated `.IsValidElement` field access — is what lets
        // the `Slot` dynamic-tag guard register and run cleanly on Go.
        if (
          expr.callee.kind === 'identifier' &&
          (identifierPath(expr.callee) ?? expr.callee.name) === 'isValidElement' &&
          expr.args.length === 1
        ) {
          return this.renderConditionExpr(expr.args[0])
        }
        // Any other user-defined predicate call with arguments (e.g.
        // `isAdmin(user)`) has no server-side evaluator and is not a registered
        // template primitive. Silently forcing it (to true OR false) is a
        // correctness hazard — a forced-true could expose auth-gated content, a
        // forced-false could hide required content. Refuse with a hard BF102 so
        // the author moves the predicate to a supported primitive or defers it
        // with `/* @client */`.
        if (
          expr.callee.kind === 'identifier' &&
          !this.templatePrimitives[identifierPath(expr.callee) ?? '']
        ) {
          const path = identifierPath(expr.callee) ?? expr.callee.name
          this.state.errors.push({
            code: 'BF102',
            severity: 'error',
            message:
              `Predicate '${path}(...)' cannot be evaluated in a Go template. ` +
              `A server-side template cannot call user-defined JavaScript predicates.`,
            loc: this.makeLoc(),
            suggestion: { message: GO_REMEDIATION_OPTIONS },
          })
          // Go template actions must be self-contained; emit a literal so the
          // partial still parses while the build fails on the BF102 error.
          return plain('false')
        }
        // A higher-order callback call (`arr.find(...)`, `arr.some(...)`) lowers
        // via `renderParsedExpr` → `callbackMethod`, which may emit a
        // template-block form (`{{$bf_r0 := …}}…{{$bf_r0}}`) whose leading
        // assignment block must move to the `preamble`. Split it out — mirrors
        // the (removed) `higher-order` case.
        if (asCallbackMethodCall(expr)) {
          const rendered = this.renderParsedExpr(expr)
          const split = this.splitPreamble(rendered)
          if (split) return split
          return plain(rendered)
        }
        return plain(this.renderParsedExpr(expr))
      }

      case 'member': {
        if (expr.property === 'length') {
          const innerHO = this.higherOrderShapeOf(expr.object)
          if (innerHO) {
            // renderFilterLengthExpr uses bf_filter runtime helpers (not template
            // blocks), so `.preamble` is always empty here. A future higher-order
            // method producing preambles through this path would need the callback
            // to propagate them.
            const result = this.renderFilterLengthExpr(innerHO, e => this.renderConditionExpr(e).expr)
            if (result) return plain(result)
          }
        }

        if (expr.object.kind === 'identifier' && this.state.propsObjectName && expr.object.name === this.state.propsObjectName) {
          return plain(this.rootFieldRef(expr.property))
        }

        {
          const currentLoopParam = this.loopParamStack[this.loopParamStack.length - 1]
          if (expr.object.kind === 'identifier' && currentLoopParam && expr.object.name === currentLoopParam) {
            return plain(`.${capitalizeFieldName(expr.property)}`)
          }
        }

        const obj = this.renderConditionExpr(expr.object)
        if (expr.property === 'length') {
          return { preamble: obj.preamble, expr: `len ${obj.expr}` }
        }
        return { preamble: obj.preamble, expr: `${obj.expr}.${capitalizeFieldName(expr.property)}` }
      }

      case 'index-access': {
        // Go's `index` builtin: `index $arr $i`. A multi-token operand
        // (`bf_add $i 1`) must be parenthesised or Go parses it as extra
        // `index` arguments.
        const obj = this.renderConditionExpr(expr.object)
        const idx = this.renderConditionExpr(expr.index)
        return {
          preamble: obj.preamble + idx.preamble,
          expr: `index ${wrapIfMultiToken(obj.expr)} ${wrapIfMultiToken(idx.expr)}`,
        }
      }

      case 'binary': {
        const leftNeedsParens = this.needsParensInGoTemplate(expr.left)
        const leftResult = this.renderConditionExpr(expr.left)
        const left = leftNeedsParens ? `(${leftResult.expr})` : leftResult.expr

        const rightNeedsParens = this.needsParensInGoTemplate(expr.right)
        const rightResult = this.renderConditionExpr(expr.right)
        const right = rightNeedsParens ? `(${rightResult.expr})` : rightResult.expr

        const preamble = leftResult.preamble + rightResult.preamble

        let result: string
        switch (expr.op) {
          case '===':
          case '==': {
            const [el, er] = stringTolerantEqOperands(left, right)
            result = `eq ${el} ${er}`; break
          }
          case '!==':
          case '!=': {
            const [el, er] = stringTolerantEqOperands(left, right)
            result = `ne ${el} ${er}`; break
          }
          case '>':
            result = `gt ${left} ${right}`; break
          case '<':
            result = `lt ${left} ${right}`; break
          case '>=':
            result = `ge ${left} ${right}`; break
          case '<=':
            result = `le ${left} ${right}`; break
          case '+':
            result = `bf_add ${left} ${right}`; break
          case '-':
            result = `bf_sub ${left} ${right}`; break
          case '*':
            result = `bf_mul ${left} ${right}`; break
          case '/':
            result = `bf_div ${left} ${right}`; break
          default:
            result = `${left} ${expr.op} ${right}`
        }
        return { preamble, expr: result }
      }

      case 'unary': {
        const arg = this.renderConditionExpr(expr.argument)
        if (expr.op === '!') return { preamble: arg.preamble, expr: `not ${arg.expr}` }
        if (expr.op === '-') return { preamble: arg.preamble, expr: `bf_neg ${arg.expr}` }
        return arg
      }

      case 'logical': {
        const leftResult = this.renderConditionExpr(expr.left)
        const rightResult = this.renderConditionExpr(expr.right)
        const preamble = leftResult.preamble + rightResult.preamble
        const wrapLeft = this.needsParens(expr.left) ? `(${leftResult.expr})` : leftResult.expr
        const wrapRight = this.needsParens(expr.right) ? `(${rightResult.expr})` : rightResult.expr
        const result = expr.op === '&&'
          ? `and ${wrapLeft} ${wrapRight}`
          : `or ${wrapLeft} ${wrapRight}`
        return { preamble, expr: result }
      }

      case 'conditional': {
        const test = this.renderConditionExpr(expr.test)
        return test
      }

      case 'template-literal':
        return plain(this.renderParsedExpr(expr))

      case 'arrow':
        // A standalone arrow has no Go condition form (callbacks reach the
        // `call` arm via `asCallbackMethodCall`).
        return plain('[ARROW-FN]')

      case 'regex':
        return plain(this.renderParsedExpr(expr))

      case 'array-literal':
        return plain(this.renderParsedExpr(expr))

      case 'array-method':
        return plain(this.renderParsedExpr(expr))

      case 'unsupported':
      // `raw` holds the original expression string, so a bare object literal in
      // a condition lowers to that raw text.
      case 'object-literal':
        return plain(expr.raw)
    }
  }

  /**
   * Walk a destructure binding's structured `segments` path (#2087 Phase A) into
   * a Go accessor over `base`. A `field` step appends `.<GoFieldName>` — dot
   * access resolves against a struct field OR a map key (Go template's
   * `evalField` supports both), and `goFieldNameForKey` produces a valid Go
   * identifier regardless of whether the SOURCE key was one (`cells` → `Cells`,
   * `data-priority` → `DataPriority`) — Go dot-syntax only requires the EMITTED
   * name to be a legal identifier, not the original JS key. An `index` step
   * has no dot-notation form, so it wraps in Go's `index` builtin
   * (`(index <acc> N)`); the wrap also parenthesises the whole accessor so a
   * following step or an outer composition (`len (...)`) can't swallow it as
   * extra call arguments.
   */
  private buildSegmentAccessor(base: string, segments: readonly LoopBindingPathSegment[]): string {
    let acc = base
    for (const seg of segments) {
      acc = seg.kind === 'field' ? `${acc}.${goFieldNameForKey(seg.key)}` : `(index ${acc} ${seg.index})`
    }
    return acc
  }

  /**
   * Map each destructure binding to its Go accessor on the range var (#2087
   * Phase B — `isLowerableLoopDestructure` admits every shape below):
   *
   *   - fixed binding (any depth): the FULL `segments` path over the range var
   *     (`id` → `$item.Id`, `head` in `cells: [head]` → `(index $item.Cells 0)`,
   *     `k` in `[k, v]` → `(index $item 0)`).
   *   - array-rest (`[first, ...tail]`): the PARENT `segments` prefix wrapped in
   *     `bf_slice` (`tail` → `(bf_slice $item 1)`) — this IS the binding's whole
   *     value, so it composes correctly both bare and under `.length` (`len
   *     (bf_slice $item 1)`, via the `member()` emitter's generic `len <obj>`
   *     arm).
   *   - object-rest (`{ id, ...rest }`): the bare PARENT accessor, so a member
   *     read (`rest.flag`) renders `$item.Flag` — the simplest lowering that
   *     keeps the already-green `rest-destructure-object-in-map` fixture byte-
   *     exact. A `{...rest}` SPREAD needs the residual (item minus the
   *     destructured siblings), which this map alone can't express; that case
   *     is tracked separately in the returned `restExcludes` map and consumed
   *     by `emitSpread`'s `bf_omit` lowering, not through this binding value.
   */
  private buildDestructureBindingMap(
    loop: IRLoop,
    rangeVar: string,
  ): {
    bindings: Map<string, string>
    restExcludes: Map<string, { parent: string; excludeKeys: string[] }>
  } {
    const bindings = new Map<string, string>()
    const restExcludes = new Map<string, { parent: string; excludeKeys: string[] }>()
    const base = `$${rangeVar}`
    for (const b of loop.paramBindings ?? []) {
      const parent = this.buildSegmentAccessor(base, b.segments ?? [])
      if (!b.rest) {
        bindings.set(b.name, parent)
      } else if (b.rest.kind === 'array') {
        bindings.set(b.name, `(bf_slice ${parent} ${b.rest.from})`)
      } else {
        bindings.set(b.name, parent)
        restExcludes.set(b.name, { parent, excludeKeys: b.rest.exclude.map(k => k.key) })
      }
    }
    return { bindings, restExcludes }
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

  renderLoop(loop: IRLoop): string {
    // clientOnly loops: emit SSR markers so the client can insert DOM nodes. The
    // marker id disambiguates sibling `.map()` calls under the same parent.
    if (loop.clientOnly) {
      return `{{bfComment "loop:${loop.markerId}"}}{{bfComment "/loop:${loop.markerId}"}}`
    }

    // An array/object-destructure loop param (`([emoji, users]) => ...` or
    // `({ name, age }) => ...`) requires multi-variable `{{range $k, $v := ...}}`
    // semantics that Go templates don't provide for arbitrary tuples — the
    // adapter would otherwise emit `{{range $_, $[emoji, users] := .Entries}}`,
    // invalid Go template syntax. Surface this at build time instead of shipping
    // a broken `{{range}}` line.
    //
    // Check the IR's structured `paramBindings` field rather than string-matching
    // `loop.param`: Phase 1 populates it iff the param is a destructure pattern,
    // and the structured check is robust to formatting variants. `isLowerableLoopDestructure`
    // (#2087 Phase A/B) admits fixed bindings at ANY depth (`.field`, array-index,
    // nested combinations of either — `buildSegmentAccessor` walks the structured
    // `segments` path), array-rest (`[a, ...t]` → `bf_slice`), and object-rest
    // whose every use is a member read (`rest.flag`) or a `{...rest}` spread onto
    // an intrinsic element (→ `bf_omit`, see `emitSpread`). Still refused (BF104):
    // a bare-value object-rest use (`String(rest)`, `{rest}`, spread onto a
    // component), and a `.filter().map(destructure)` chain — those need either the
    // actual residual object or a filter-param retarget this lowering doesn't do.
    const destructure = !!(loop.paramBindings && loop.paramBindings.length > 0)
    const supportableDestructure = destructure && isLowerableLoopDestructure(loop)
    if (destructure && !supportableDestructure) {
      this.state.errors.push({
        code: 'BF104',
        severity: 'error',
        message: `Loop callback uses an array/object destructure pattern (\`${loop.param}\`) that the Go template adapter cannot lower — Go's \`{{range}}\` only supports single-name bindings.`,
        loc: loop.loc ?? this.makeLoc(),
        suggestion: {
          message:
            `Options:\n` +
            `  1. Rename the parameter to a single name and access tuple elements with index syntax in the body (e.g. \`entry => entry[0]\` instead of \`([k, v]) => ...\`).\n` +
            `  2. Mark the loop position as @client-only so the destructure runs in JS on the client.\n` +
            `  3. Move the loop into a primitive that the adapter registers explicitly.`,
        },
      })
    }

    // A loop array that's a bare reference to a FUNCTION-SCOPE local const with
    // a computed initializer (`const entries = Object.entries(props.x ??
    // {}).filter(...)`) can't be bound as a Go template value: module-scope
    // consts (`isModule`) are a different, already-working case (statically
    // evaluated and seeded into the render context elsewhere), but a
    // function-scope local only reaches the template at all via
    // `computeDerivedConstFields`'s STRING-typed derived-const lowering
    // (`isStringExpr`) — an array-typed initializer like this one never
    // qualifies, so `identifier()` would still emit `.Entries` (the naive
    // `rootFieldRef` fallback) while `generateTypes` emits no such field.
    // `html/template` resolves struct fields dynamically at EXECUTE time, not
    // at Go compile time, so left unchecked this fails loudly only when the
    // template actually runs (`can't evaluate field Entries in type
    // ...Props`) instead of at build time. Pre-existing, general limitation,
    // orthogonal to #2087's destructure-binding work — newly reachable in this
    // adapter's test corpus only because the widened destructure gate (#2087
    // Phase A/B) no longer refuses `static-array-from-props`'s `([emoji,
    // users]) => ...` param first. Cross-adapter policy: Jinja / ERB apply the
    // same narrow check in their own `renderLoop` (see `jinja-adapter.ts`).
    const arrayName = loop.array.trim()
    if (/^[A-Za-z_$][\w$]*$/.test(arrayName)) {
      const arrayConst = this.state.localConstants.find(c => c.name === arrayName)
      if (arrayConst && !arrayConst.isModule && arrayConst.parsed && !this.isStringExpr(arrayConst.parsed, new Set())) {
        this.state.errors.push({
          code: 'BF101',
          severity: 'error',
          message: `Loop array \`${arrayName}\` is a local computed value (\`${arrayConst.value}\`) that the Go template adapter cannot bind as a template variable — only a string-derived local resolves to a generated struct field.`,
          loc: loop.loc ?? this.makeLoc(),
          suggestion: {
            message:
              'Pre-compute the array server-side and pass it as a prop, or mark the loop position as @client-only so it runs in JS on the client.',
          },
        })
      }
    }

    let goArray = this.convertExpressionToGo(loop.array)
    const param = loop.param
    let index = loop.index || '_'

    // `.keys().map(k => ...)` — the callback param is the *index*, not the value.
    // Swap into the Go range's first binding slot so `{{range $k, $_ := .Arr}}`
    // makes `$k` the 0-based index.
    let rangeIndex = index
    // A supported destructure param can't be the Go range var verbatim
    // (`$__bf_itemN` is a synthetic single name; bindings resolve against it via
    // `loopBindingStack`); otherwise the value var is the param itself. The
    // reserved `__bf_item` prefix avoids colliding with a user binding, and the
    // nesting-depth suffix keeps an inner destructure loop from shadowing an
    // outer one's range var.
    let rangeValue = supportableDestructure ? `__bf_item${this.loopBindingStack.length}` : param
    if (loop.iterationShape === 'keys') {
      rangeIndex = param
      rangeValue = '_'
    }

    // If the loop body IS a single component, range over `.{ComponentName}s`,
    // which carries a ScopeID per item (TodoItem → `.TodoItems`). Gate on the
    // IR's `loop.childComponent` — the SAME condition `findNestedComponents`
    // uses to generate that slice field — not on a deep search of the body:
    // a component merely nested inside an element item (`<li><Badge/></li>`)
    // generates NO `.Badges` slice, so retargeting the range at it 500s at
    // render with `can't evaluate field Badges in type *XxxProps` (#2130).
    // Such loops keep iterating the real collection; the nested child renders
    // through the parent's once-per-slot instance (see `renderComponent`'s
    // non-wrapper in-loop branch).
    if (loop.childComponent) {
      goArray = `.${loop.childComponent.name}s`
    }

    this.inLoop = true
    // Track Go template loop variables. The range *value* variable is the dot
    // context (`.`) and goes on `loopParamStack`; the range *index* variable
    // needs `$name` notation and goes on `loopVarRefCount`. For `.keys()`, the
    // user's param IS the index (the `$k, $_` position), so it needs `$name` —
    // don't push it to loopParamStack (`.` would resolve to the value, not key);
    // push falsy `''` so the `currentLoopParam &&` guard in `identifier()` /
    // `renderConditionExpr` short-circuits. Ref-counting (not a flat Set) keeps
    // nested loops with the same index var name from clobbering the outer entry
    // on cleanup.
    const addedLoopVars: string[] = []
    let pushedBindingMap = false
    if (supportableDestructure) {
      // Bindings resolve against the synthetic `$__bf_item` range var; don't push
      // a loop param (the param is a pattern, not a name).
      const built = this.buildDestructureBindingMap(loop, rangeValue)
      this.loopBindingStack.push(built.bindings)
      this.loopRestExcludeStack.push(built.restExcludes)
      pushedBindingMap = true
      this.loopParamStack.push('')
      if (rangeIndex !== '_') {
        this.loopVarRefCount.set(rangeIndex, (this.loopVarRefCount.get(rangeIndex) ?? 0) + 1)
        addedLoopVars.push(rangeIndex)
      }
    } else if (loop.iterationShape === 'keys') {
      this.loopParamStack.push('')
      this.loopVarRefCount.set(param, (this.loopVarRefCount.get(param) ?? 0) + 1)
      addedLoopVars.push(param)
    } else {
      this.loopParamStack.push(param)
      if (rangeIndex !== '_') {
        this.loopVarRefCount.set(rangeIndex, (this.loopVarRefCount.get(rangeIndex) ?? 0) + 1)
        addedLoopVars.push(rangeIndex)
      }
    }
    // Tell the loop-body component renderer whether this is a scalar-item loop,
    // so its `bf_tmpl` companion is fed `.BfLoopItem` instead of `.`. Pushed
    // around the body render only; mirrors the wrapper/constructor
    // `scalarLiteralLoopGoType` gate.
    this.loopScalarItemStack.push(
      this.scalarLiteralLoopGoType(loop.arrayParsed, loop.itemType) !== null,
    )
    this.loopWrapperStack.push(!!loop.childComponent)
    const children = this.renderChildren(loop.children)
    this.loopWrapperStack.pop()
    this.loopScalarItemStack.pop()
    // Build the per-item anchor marker while the loop param is still on the
    // stack, so a `bodyIsItemConditional` key expression resolves against the
    // range item (`.` context) like `data-key` does — popping first would
    // rewrite `t.id` to `.T.ID` instead of `.ID`.
    const itemMarker = this.loopItemMarker(loop)
    for (const v of addedLoopVars) {
      const rc = (this.loopVarRefCount.get(v) ?? 1) - 1
      if (rc <= 0) this.loopVarRefCount.delete(v)
      else this.loopVarRefCount.set(v, rc)
    }
    this.loopParamStack.pop()
    if (pushedBindingMap) {
      this.loopBindingStack.pop()
      this.loopRestExcludeStack.pop()
    }
    this.inLoop = false

    // Apply sort if present: wrap the array in a sort pipeline before `range`.
    // Evaluator-first (#2018 P3): serialize the comparator body + emit
    // `bf_sort_eval`, the same path the standalone `callbackMethod` sort arm uses;
    // fall back to the structured `bf_sort` for a comparator the evaluator
    // can't model (e.g. `localeCompare`). The sort runs after the loop-scope
    // cleanup above, so the captured-free-var env renders in the outer scope.
    if (loop.sortComparator) {
      const sortEmit = (e: ParsedExpr) => this.renderParsedExpr(e)
      const cmpArrow = loop.sortComparator.arrow
      const body = cmpArrow.kind === 'arrow' ? cmpArrow.body : cmpArrow
      const params = cmpArrow.kind === 'arrow' ? cmpArrow.params : []
      const sorted =
        emitSortEval(goArray, body, params, sortEmit) ??
        emitBfSort(goArray, sortComparatorFromArrow(cmpArrow)!)
      goArray = `(${sorted})`
    }

    // filter().map(): gate the body on an `{{if}}` condition.
    if (loop.filterPredicate) {
      let filterCond: string

      if (loop.filterPredicate.predicate) {
        filterCond = this.renderPredicateCondition(
          loop.filterPredicate.predicate,
          loop.filterPredicate.param
        )
      } else {
        filterCond = 'true'
      }

      return `{{bfComment "loop:${loop.markerId}"}}{{range $${rangeIndex}, $${rangeValue} := ${goArray}}}{{if ${filterCond}}}${itemMarker}${children}{{end}}{{end}}{{bfComment "/loop:${loop.markerId}"}}`
    }

    return `{{bfComment "loop:${loop.markerId}"}}{{range $${rangeIndex}, $${rangeValue} := ${goArray}}}${itemMarker}${children}{{end}}{{bfComment "/loop:${loop.markerId}"}}`
  }

  /**
   * Per-item `<!--bf-loop-i-->` / `<!--bf-loop-i:KEY-->` start marker emitted
   * inside a `{{range}}` body. Multi-root Fragment items get the bare anchor;
   * whole-item conditional items get the key-bearing anchor so the client's
   * `mapArrayAnchored` can hydrate items that render no element.
   */
  private loopItemMarker(loop: { bodyIsMultiRoot?: boolean; bodyIsItemConditional?: boolean; key?: string | null }): string {
    if (loop.bodyIsMultiRoot) return `{{bfComment "bf-loop-i"}}`
    if (loop.bodyIsItemConditional && loop.key) {
      // `bfComment` prepends `bf-`, so `printf "loop-i:%v"` yields
      // `<!--bf-loop-i:KEY-->`. The key expression resolves against the current
      // range item (`.` context), matching `data-key`'s emission.
      return `{{bfComment (printf "loop-i:%v" ${this.convertExpressionToGo(loop.key)})}}`
    }
    return ''
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
      : this.jsxChildrenPropNodes(comp.props)
    if (effectiveChildren.length === 0) return null
    if (this.extractTextChildren(effectiveChildren) !== null) return null
    if (this.extractHtmlChildren(effectiveChildren) !== null) return null
    if (this.extractScopedHtmlChildren(effectiveChildren) !== null) return null
    const name = `${this.state.componentName}__children_${comp.slotId}`
    if (!this.state.pendingChildrenDefines.some(d => d.name === name)) {
      this.state.pendingChildrenDefines.push({
        name,
        content: this.renderChildren(effectiveChildren),
      })
    }
    return name
  }

  /**
   * Queue a companion define for a loop body component's JSX children. Like
   * `queueDynamicChildrenDefine` but temporarily exits the `inLoop` context so
   * nested component calls render with the normal `.NameSlotN` field-access
   * pattern (the fields live on the wrapper struct that the
   * companion define receives as its data context). The loop param stack
   * stays intact so datum-field references (`payment.id` → `.Id`) still
   * resolve.
   */
  private queueLoopBodyChildrenDefine(comp: IRComponent): string | null {
    const effectiveChildren = comp.children.length > 0
      ? comp.children
      : this.jsxChildrenPropNodes(comp.props)
    if (effectiveChildren.length === 0) return null
    if (this.extractTextChildren(effectiveChildren) !== null) return null
    if (this.extractHtmlChildren(effectiveChildren) !== null) return null
    if (this.extractScopedHtmlChildren(effectiveChildren) !== null) return null
    const name = `${this.state.componentName}__loop_children_${comp.slotId}`
    if (!this.state.pendingChildrenDefines.some(d => d.name === name)) {
      const wasInLoop = this.inLoop
      this.inLoop = false
      const content = this.renderChildren(effectiveChildren)
      this.inLoop = wasInLoop
      this.state.pendingChildrenDefines.push({ name, content })
    }
    return name
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
      const loopBodyDefine = this.queueLoopBodyChildrenDefine(comp)
      if (loopBodyDefine) {
        // Scalar-item loop: feed the body define the wrapper's `.BfLoopItem` (the
        // bare range value) so `{n}` → `{{.}}` renders it; object loops keep `.`
        // (the wrapper, whose embedded fields the body reads as `.Field`).
        const bodyData = this.loopScalarItemStack[this.loopScalarItemStack.length - 1]
          ? '.BfLoopItem'
          : '.'
        templateCall = `{{template "${comp.name}" (bf_with_children . (bf_tmpl "${loopBodyDefine}" ${bodyData}))}}`
      } else {
        templateCall = `{{template "${comp.name}" .}}`
      }
    } else if (this.inLoop && comp.slotId) {
      // Non-wrapper loop (component nested inside an element item, #2130):
      // the range iterates the REAL collection, so `.` is the raw datum and
      // carries none of the child's props. Call through the parent's
      // once-per-slot instance via the root context (`$` — the define's own
      // data, i.e. the parent's Props), injecting per-item content through a
      // loop-body children define executed with the datum (`.`). The shared
      // instance means identical child scope IDs across rows — the same
      // contract the wrapper machinery's `bodyChildInstances` already uses.
      const suffix = slotIdToFieldSuffix(comp.slotId)
      const loopBodyDefine = this.queueLoopBodyChildrenDefine(comp)
      templateCall = loopBodyDefine
        ? `{{template "${comp.name}" (bf_with_children $.${comp.name}${suffix} (bf_tmpl "${loopBodyDefine}" .))}}`
        : `{{template "${comp.name}" $.${comp.name}${suffix}}}`
    } else if (this.inLoop) {
      // Loop-nested component without a slotId: no parent field to route
      // through — legacy passthrough of the current dot.
      templateCall = `{{template "${comp.name}" .}}`
    } else if (comp.slotId) {
      // Static children with slotId: unique field name based on slotId.
      const suffix = slotIdToFieldSuffix(comp.slotId)
      const childrenDefine = this.queueDynamicChildrenDefine(comp)
      templateCall = childrenDefine
        ? `{{template "${comp.name}" (bf_with_children .${comp.name}${suffix} (bf_tmpl "${childrenDefine}" .))}}`
        : `{{template "${comp.name}" .${comp.name}${suffix}}}`
    } else {
      // Static children without slotId: fall back to .ComponentName.
      templateCall = `{{template "${comp.name}" .${comp.name}}}`
    }

    // A root component in a client component needs a scope comment for the
    // hydration boundary.
    if (ctx?.isRootOfClientComponent) {
      return `{{bfScopeComment .}}${templateCall}`
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

  private renderFragment(fragment: IRFragment): string {
    const children = this.renderChildren(fragment.children)
    if (fragment.needsScopeComment) {
      // Comment-based scope marker for fragment roots.
      return `{{bfScopeComment .}}${children}`
    }
    return children
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
    emitExpression: (value, name) => {
      // `style={{ … }}` object literal → a CSS string with dynamic values
      // interpolated, instead of refusing the bare object with BF101.
      if (name === 'style') {
        const css = this.tryLowerStyleObject(value.expr)
        if (css !== null) return `style="${css}"`
      }
      if (isBooleanAttr(name) || value.presenceOrUndefined) {
        const { condition: goCond, preamble } = this.convertConditionToGo(value.expr, value.parsed)
        // ARIA attributes are string-valued ("true"/"false"), not HTML5 presence
        // booleans — the truthy presence form renders as `aria-x="true"`
        // (`aria-disabled={isDisabled() || undefined}`).
        const body = name.startsWith('aria-') ? `${name}="true"` : name
        return `${preamble}{{if ${goCond}}}${body}{{end}}`
      }
      const parsed = value.parsed ?? parseExpression(value.expr.trim())
      if (parsed.kind === 'conditional') {
        // A ternary whose falsy branch is `undefined` / `null` OMITS the
        // attribute entirely (`aria-current={props.isActive ? 'page' :
        // undefined}`) — wrap the whole attribute in the condition instead of
        // rendering `attr=""`.
        const undef = (e: ParsedExpr): boolean =>
          (e.kind === 'identifier' && (e.name === 'undefined' || e.name === 'null')) ||
          (e.kind === 'literal' && (e.value === null || e.value === undefined))
        const test = parsed.test
        if (undef(parsed.alternate) && !undef(parsed.consequent)) {
          const { condition: goCond, preamble } = this.convertConditionToGo(
            // Re-render the test from its source span via the parsed tree. If it
            // lowered to a self-contained action block, re-parse the whole
            // ternary source; otherwise slice off the test portion.
            this.isTemplateFragment(this.renderParsedExpr(test), test.kind)
              ? value.expr
              : value.expr.slice(0, value.expr.indexOf('?')).trim(),
          )
          const valueExpr = this.renderParsedExpr(parsed.consequent)
          const body = `${name}="{{${valueExpr}}}"`
          return `${preamble}{{if ${goCond}}}${body}{{end}}`
        }
        // Inline Go template syntax with embedded `{{...}}` actions.
        return `${name}="${this.renderParsedExpr(parsed)}"`
      }
      if (parsed.kind === 'template-literal') {
        // Inline Go template syntax with embedded `{{...}}` actions.
        return `${name}="${this.renderParsedExpr(parsed)}"`
      }
      // Nullish-attribute omission: when the attribute value is a BARE reference
      // to a nillable (`interface{}`) prop field, guard emission on `ne .X nil`
      // so an unset optional prop drops the attribute entirely instead of
      // rendering `attr=""`. Scope is deliberately narrow — bare identifiers only
      // — so member exprs, calls, ternaries, template literals, and
      // concrete-typed props (never nil) still emit `attr=""` / `attr="0"`.
      const bareId = value.expr.trim()
      // Normalize a props-object access (`props.id`) to its bare prop name
      // (`id`) so the nillable set — keyed by bare prop name — matches the
      // SolidJS-style props-object pattern too, not just destructured params.
      const propName =
        this.state.propsObjectName && bareId.startsWith(`${this.state.propsObjectName}.`)
          ? bareId.slice(this.state.propsObjectName.length + 1)
          : bareId
      if (/^[A-Za-z_$][\w$]*$/.test(propName) && this.state.nillablePropNames.has(propName)) {
        const field = `.${capitalizeFieldName(propName)}`
        return `{{if ne ${field} nil}}${name}="{{${this.convertExpressionToGo(value.expr, undefined, value.parsed)}}}"{{end}}`
      }
      // Lower once; if the result is already a self-contained action block (e.g.
      // an inlined `sortClass(k)` → `{{if …}}…{{end}}`), embed it as-is rather
      // than double-wrapping it in another `{{…}}`.
      const exprOut: { parsed?: ParsedExpr } = {}
      const go = this.convertExpressionToGo(value.expr, exprOut, value.parsed)
      return this.isTemplateFragment(go, exprOut.parsed?.kind)
        ? `${name}="${go}"`
        : `${name}="{{${go}}}"`
    },
    emitBooleanAttr: (_value, name) => name,
    // Spread attributes (`<div {...attrs()} />`) lower through the
    // `bf_spread_attrs` runtime helper. Two paths:
    //   - Top-level spread: the bag was plumbed onto the component's Props struct
    //     as `.Spread_<slotId>`; emit a reference to it.
    //   - Loop-internal spread: the bag lives in the loop iteration variable
    //     (Go template's `.` plus property access). Translate the JS expression
    //     via `convertExpressionToGo` and emit `{{bf_spread_attrs <e>}}` inline.
    // Slot IDs are assigned at IR build time so identity is stable across
    // re-emits; a missing one falls back to BF101.
    emitSpread: (value) => {
      if (!value.slotId) {
        this.state.errors.push({
          code: 'BF101',
          severity: 'error',
          message: `JSX spread '{...${value.expr}}' on an intrinsic element has no Go template lowering (missing slot id)`,
          loc: this.makeLoc(),
          suggestion: {
            message: 'This usually means a closed-type rest-prop spread was unexpectedly routed through the bag path — file a bug with the source.',
          },
        })
        return ''
      }
      if (this.inLoop) {
        // Inside `{{range $_, $t := .Tasks}}`, the iteration value surfaces as Go
        // template's `.` (current context). A bare reference to the loop param
        // therefore translates to `.`, not `.T` (the generic identifier path).
        // Property access through the loop param (`t.attrs`) is already handled
        // by the member-expression path that returns `.Attrs`.
        //
        // A per-item spread whose operand is a plain object/array field read
        // (not a destructure-rest binding) is otherwise gated on whether the
        // enclosing signal's literal initial value bakes at all — see
        // `parsed-literal-to-go.ts`'s nested object/array property support
        // (#2087), which lifted the flat-object-only restriction for the
        // destructure-residual fixtures below.
        const trimmed = value.expr.trim()
        const currentLoopParam = this.loopParamStack[this.loopParamStack.length - 1]
        if (currentLoopParam && trimmed === currentLoopParam) {
          return `{{bf_spread_attrs .}}`
        }
        // Destructure object-rest spread onto an element (`{...rest}`, #2087
        // Phase B): `rest` alone would spread the WHOLE item (every field,
        // including the ones the pattern already destructured out as `id` /
        // `title`) — route through `bf_omit` instead so the residual excludes
        // exactly those sibling keys. Only a spread whose expr is the BARE
        // rest name matches (`isLowerableLoopDestructure`'s admitted shape);
        // anything else (`{...fn(rest)}`) already refused at the IR gate.
        const restInfo = this.lookupRestExclude(trimmed)
        if (restInfo) {
          const excludeArgs = restInfo.excludeKeys.map(k => JSON.stringify(k)).join(' ')
          const omitArgs = excludeArgs ? `${restInfo.parent} ${excludeArgs}` : restInfo.parent
          return `{{bf_spread_attrs (bf_omit ${omitArgs})}}`
        }
        const goExpr = this.convertExpressionToGo(value.expr)
        // `convertExpressionToGo` already pushes BF101 for unsupported
        // expressions and returns `""`; pass through so the template still
        // compiles.
        return `{{bf_spread_attrs ${goExpr}}}`
      }
      return `{{bf_spread_attrs .${value.slotId}}}`
    },
    emitTemplate: (value, name) => `${name}="${this.renderTemplateLiteralParts(value.parts)}"`,
    // Neither variant is legal on intrinsic elements.
    emitBooleanShorthand: () => '',
    emitJsxChildren: () => '',
  }

  /**
   * Lower a `style={{ … }}` object-literal value to a CSS string with dynamic
   * values interpolated as Go template actions, e.g.
   * `{ backgroundColor: color, padding: '8px' }` →
   * `background-color:{{.Color}};padding:8px`. Returns null when the object
   * shape is unsupported or any value expression can't be lowered (the caller
   * then falls through to the generic BF101 path).
   */
  private tryLowerStyleObject(expr: string): string | null {
    const entries = parseStyleObjectEntries(expr)
    if (!entries) return null
    // Pre-check every dynamic value so an unsupported one bails the whole
    // object (rather than recording a partial BF101 mid-build).
    for (const e of entries) {
      if (e.kind === 'expr' && !isSupported(parseExpression(e.expr)).supported) return null
    }
    // The static CSS key + literal value are inlined into a double-quoted
    // `style="..."` attribute, so HTML-attr escape them (a value like `'"'`
    // would otherwise terminate the attribute / inject markup). The dynamic
    // arm's `{{…}}` action is escaped by `html/template`'s attribute context.
    return entries
      .map(e =>
        e.kind === 'literal'
          ? `${this.escapeAttrText(e.cssKey)}:${this.escapeAttrText(e.value)}`
          : `${this.escapeAttrText(e.cssKey)}:{{${this.convertExpressionToGo(e.expr)}}}`,
      )
      .join(';')
  }

  private renderAttributes(element: IRElement): string {
    const parts: string[] = []

    for (const attr of element.attrs) {
      // `/* @client */` attribute bindings are deferred to hydrate: the client
      // runtime sets/patches the attribute in a mount effect. Skip SSR emission
      // so the server omits the attribute — and, crucially, so the
      // unsupported-expression lowering below is never reached for a deferred
      // predicate (no BF101 / BF102). This keeps the BF102 remediation ("defer
      // it with /* @client */") accurate for attribute-only state.
      if (attr.clientOnly) continue
      // Rewrite JSX special-prop names to their HTML-attribute counterparts. The
      // Go template adapter has no JSX runtime to strip `key` / emit `data-key`,
      // so the rewrite happens at attribute-emit time. Mirror of the `key`
      // branch in `ir-to-client-js/html-template.ts`.
      let attrName: string
      if (attr.name === 'className') attrName = 'class'
      else if (attr.name === 'key') attrName = 'data-key'
      else attrName = attr.name
      const lowered = emitAttrValue(attr.value, this.elementAttrEmitter, attrName)
      if (lowered) parts.push(lowered)
    }

    return parts.length > 0 ? ' ' + parts.join(' ') : ''
  }

  /**
   * Replace `${EXPR}` interpolations with Go actions (`{{<expr-as-go>}}`) and
   * HTML-escape the surrounding literal text — UnoCSS arbitrary values
   * (`[class*="size-"]:size-4`) contain `"` that would otherwise close the
   * `class="..."` attribute. Brace-depth aware (nested `{...}` skipped to find
   * the outer `}`); an unterminated `${` falls back to literal text.
   */
  private substituteJsInterpolations(s: string): string {
    let out = ''
    let i = 0
    while (i < s.length) {
      const open = s.indexOf('${', i)
      if (open === -1) {
        out += this.escapeAttrText(s.slice(i))
        break
      }
      out += this.escapeAttrText(s.slice(i, open))
      const close = findInterpolationEnd(s, open + 2)
      if (close === -1) {
        // Unterminated `${` — emit the rest as escaped literal rather than
        // silently dropping content.
        out += this.escapeAttrText(s.slice(open))
        break
      }
      const inner = s.slice(open + 2, close).trim()
      if (inner) {
        // Thread the parsed kind out of `convertExpressionToGo` (reusing its
        // single parse) so a nested template literal here is handled too.
        const cls: { parsed?: ParsedExpr } = {}
        const goExpr = this.convertExpressionToGo(inner, cls)
        const parsed = cls.parsed
        if (parsed?.kind === 'template-literal') {
          // Attribute context: a template literal lowers to literal text
          // interleaved with `{{...}}` actions. That literal text sits OUTSIDE
          // any action, so — unlike the actions, which Go escapes for the
          // attribute context — it bypasses escaping. A `"`, `<`, or `&` in a
          // UnoCSS arbitrary value (`content-["x"]`) would then break the
          // surrounding `class="..."`. Escape each string part with
          // `escapeAttrText`, keeping interpolations as fragment-aware actions.
          for (const part of parsed.parts) {
            if (part.type === 'string') {
              out += this.escapeAttrText(part.value)
            } else {
              const e = this.renderParsedExpr(part.expr)
              out += this.isTemplateFragment(e, part.expr.kind) ? e : `{{${e}}}`
            }
          }
        } else {
          // Same `isTemplateFragment` guard as `renderExpression`: a ternary
          // lowers to a complete `{{if}}` action chain — don't re-wrap.
          out += this.isTemplateFragment(goExpr, parsed?.kind) ? goExpr : `{{${goExpr}}}`
        }
      } else {
        out += s.slice(open, close + 1)
      }
      i = close + 1
    }
    return out
  }

  /**
   * HTML-attribute-safe escaping for double-quoted attribute values. `&`/`"`/`<`
   * are non-negotiable — without them the surrounding `class="..."` quoting
   * breaks (e.g. UnoCSS's `[class*="size-"]`). `>`/`'` are belt-and-suspenders:
   * HTML5 permits both inside double-quoted attrs, but Go's `html/template`
   * lexer is contextual, so escape them too.
   */
  private escapeAttrText(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }

  private renderTemplateLiteralParts(parts: IRTemplatePart[]): string {
    let output = ''
    for (const part of parts) {
      if (part.type === 'string') {
        // String parts can carry unresolved `${expr}` placeholders (e.g. for
        // function params the IR analyzer couldn't substitute structurally).
        // Translate each span to a Go template action; static text passes
        // through as-is.
        output += this.substituteJsInterpolations(part.value)
      } else if (part.type === 'ternary') {
        const { condition: goCond, preamble } = this.convertConditionToGo(part.condition)
        output += `${preamble}{{if ${goCond}}}${part.whenTrue}{{else}}${part.whenFalse}{{end}}`
      } else if (part.type === 'lookup') {
        // `${MAP[KEY]}` against a Record<T, string> literal — emit a chained
        // `{{if eq .Key "<case>"}}<value>{{else if ...}}{{end}}` so the right
        // case lights up at SSR time. Empty when no case matches; consumers
        // shouldn't rely on a default fallback here (the JSX-side
        // `variant = 'default'` default already shows up via the per-prop
        // fallback in `NewXxxProps`).
        const rawKeyExpr = this.convertExpressionToGo(part.key)
        // A compound key (`props.placement ?? 'top'` → `or .Placement "top"`)
        // must be parenthesized inside `eq` — unwrapped, Go's template parser
        // reads `eq or .Placement "top" "left"` as four arguments with a zero-arg
        // `or`.
        const keyExpr = /\s/.test(rawKeyExpr) ? `(${rawKeyExpr})` : rawKeyExpr
        const caseEntries = Object.entries(part.cases)
        if (caseEntries.length === 0) continue
        const branches = caseEntries.map(([k, v], i) => {
          const head = i === 0 ? '{{if' : '{{else if'
          // The case value is a static Record<T,string> literal emitted straight
          // into attribute-value text, so HTML-escape it like `string` parts
          // (via substituteJsInterpolations → escapeAttrText). Otherwise UnoCSS
          // tokens like `has-[>svg]:px-2.5` would leak a raw `>`.
          return `${head} eq ${keyExpr} ${JSON.stringify(k)}}}${this.escapeAttrText(v)}`
        })
        output += branches.join('') + '{{end}}'
      }
    }
    return output
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
        const isSingle = new RegExp(`</${tag}>\\s*$`).test(trimmed) || /^<\w+[^>]*\/>$/.test(trimmed)
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

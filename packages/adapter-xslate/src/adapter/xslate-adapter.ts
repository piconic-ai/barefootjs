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
  type IRNodeEmitter,
  type EmitIRNode,
  type AttrValueEmitter,
  isBooleanAttr,
  parseExpression,
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
  isLowerableObjectRestDestructure,
  type ContextConsumer,
  lookupStaticRecordLiteral,
  searchParamsLocalNames,
} from '@barefootjs/jsx'
import { isAriaBooleanAttr, isBooleanResultExpr } from './boolean-result.ts'
import ts from 'typescript'
import type { ParsedExpr, ParsedStatement } from '@barefootjs/jsx'
import { BF_SLOT, BF_COND, BF_REGION } from '@barefootjs/shared'

import type { XslateRenderCtx } from './lib/types.ts'
import { XSLATE_PRIMITIVE_EMIT_MAP } from './lib/constants.ts'
import { kolonHashKey } from './lib/kolon-naming.ts'
import {
  resolveJsxChildrenProp,
  collectRootScopeNodes,
} from './lib/ir-scope.ts'
import { renderSortMethod } from './expr/array-method.ts'
import { XslateFilterEmitter, XslateTopLevelEmitter } from './expr/emitters.ts'
import type { XslateEmitContext } from './emit-context.ts'
import {
  hasClientInteractivity,
  collectImportedLoopChildComponentErrors,
} from './analysis/component-tree.ts'
import {
  conditionalSpreadToKolon,
  objectLiteralExprToKolonHashref,
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

export type { XslateAdapterOptions } from './lib/types.ts'
import type { XslateAdapterOptions } from './lib/types.ts'

export class XslateAdapter extends BaseAdapter implements IRNodeEmitter<XslateRenderCtx>, XslateEmitContext {
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

  componentName: string = ''
  /** Component root scope element(s) — each carries `data-key` for a keyed loop
   *  item (set by the child renderer from the JSX `key` prop). A plain element
   *  root is one node; an `if-statement` (early-return) root contributes the
   *  top element of every branch. */
  private rootScopeNodes: Set<IRNode> = new Set()
  private options: Required<XslateAdapterOptions>
  errors: CompilerError[] = []
  private inLoop: boolean = false
  /**
   * SolidJS-style props identifier (`function(props: P)`) and the
   * analyzer-extracted prop names. Stashed at `generate()` entry so the
   * per-attribute `emitSpread` callback can build a propsObject spread bag as
   * an inline Kolon hashref literal without re-walking the IR.
   */
  private propsObjectName: string | null = null
  propsParams: { name: string }[] = []
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
  localConstants: IRMetadata['localConstants'] = []

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
    // Per-compile prop classifications (see `props/prop-classes.ts`).
    this.booleanTypedProps = collectBooleanTypedProps(ir)
    this.localConstants = ir.metadata.localConstants ?? []
    this.nullableOptionalProps = collectNullableOptionalProps(ir)
    this.stringValueNames = collectStringValueNames(ir)
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
    const memoSeed = generateDerivedMemoSeed(this, ir)

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
      // Inline object-literal child prop (carousel's `opts={{ align: 'start' }}`):
      // lower to a Kolon hashref so the child can serialize it (`data-opts`),
      // instead of refusing the bare object with BF101. (#1971 Perl) Cheap `{`
      // guard so the common non-object case skips the AST parse.
      if (value.expr.trim().startsWith('{')) {
        const hashref = objectLiteralExprToKolonHashref(this, value.expr)
        if (hashref !== null) return `${kolonHashKey(name)} => ${hashref}`
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
      const ternaryHashref = conditionalSpreadToKolon(this, trimmed)
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
            const resolved = conditionalSpreadToKolon(this, initTrimmed)
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

  convertExpressionToKolon(expr: string): string {
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

export const xslateAdapter = new XslateAdapter()

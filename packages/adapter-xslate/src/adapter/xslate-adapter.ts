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
  isSupported,
  identifierPath,
  emitParsedExpr,
  emitIRNode,
  emitAttrValue,
} from '@barefootjs/jsx'
import { isAriaBooleanAttr, isBooleanResultExpr } from './boolean-result'

/**
 * Xslate adapter's IRNode render context. Like the Mojo adapter, Kolon's
 * lowering doesn't consume any render-position flags, so the Ctx is empty.
 * Kept as a named alias so future flags can extend it without changing the
 * `IRNodeEmitter` interface.
 */
type XslateRenderCtx = Record<string, never>
import type { ParsedExpr, ParsedStatement, SortComparator, ReduceOp, FlatDepth, FlatMapOp, TemplatePart } from '@barefootjs/jsx'
import { BF_SLOT, BF_COND } from '@barefootjs/shared'

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
function resolveJsxChildrenProp(props: readonly IRProp[]): IRNode[] {
  const prop = props.find(p => p.name === 'children')
  if (!prop) return []
  if (prop.value.kind !== 'jsx-children') return []
  return prop.value.children
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
  /**
   * Names (signal getters + props) whose value is a string, so `===`/`!==`
   * against them lowers to Perl `eq`/`ne` rather than numeric `==`/`!=`.
   * Kolon comparison operators delegate to Perl semantics, so the same
   * string-vs-numeric distinction the Mojo adapter makes applies here.
   */
  private stringValueNames: Set<string> = new Set()

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
    this.propsParams = ir.metadata.propsParams.map(p => ({ name: p.name }))
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

    const templateBody = ir.root.type === 'if-statement'
      ? this.renderIfStatement(ir.root as IRIfStatement)
      : this.renderNode(ir.root)

    // Generate script registration
    const scriptReg = options?.skipScriptRegistration
      ? ''
      : this.generateScriptRegistrations(ir, options?.scriptBaseName)

    const template = `${scriptReg}${templateBody}\n`

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
    return this.renderChildren(node.children)
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
    if (element.slotId) {
      hydrationAttrs += ` ${this.renderSlotMarker(element.slotId)}`
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
    if (loop.paramBindings && loop.paramBindings.length > 0) {
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
    const loopVar = loop.iterationShape === 'keys' ? '__bf_item' : param

    // Index alias: when an explicit `index` param is present (`.map((x, i) =>
    // ...)`) or the iteration is `keys`-shaped, expose it via a `: my` Kolon
    // local bound to the loop variable's `.index` accessor.
    const indexLocalLines: string[] = []
    if (loop.iterationShape === 'keys') {
      indexLocalLines.push(`: my $${param} = $~${loopVar}.index;`)
    } else if (loop.index) {
      indexLocalLines.push(`: my $${loop.index} = $~${loopVar}.index;`)
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
    emitLiteral: (value, name) => `${name} => '${value.value}'`,
    emitExpression: (value, name) => {
      if (value.parts) {
        return `${name} => ${this.convertTemplateLiteralPartsToKolon(value.parts)}`
      }
      return `${name} => ${this.convertExpressionToKolon(value.expr)}`
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
      `${name} => ${this.convertTemplateLiteralPartsToKolon(value.parts)}`,
    emitBooleanAttr: (_value, name) => `${name} => 1`,
    emitBooleanShorthand: (_value, name) => `${name} => 1`,
    // JSX children flow through the Kolon macro capture below; they're not
    // part of the hashref entry list.
    emitJsxChildren: () => '',
  }

  renderComponent(comp: IRComponent): string {
    const propParts: string[] = []
    for (const p of comp.props) {
      // Skip callback props (onXxx) — event handlers are client-only for SSR.
      if (p.name.match(/^on[A-Z]/) && p.value.kind === 'expression') continue
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
      const childrenBody = this.renderChildren(effectiveChildren)
      const macroName = `bf_children_${comp.slotId ?? 'c' + this.childrenCaptureCounter++}`
      const childrenEntry = `children => ${macroName}()`
      const allParts = [...propParts, childrenEntry]
      return `<: macro ${macroName} -> () { :>${childrenBody}<: } :><: $bf.render_child('${tplName}', { ${allParts.join(', ')} }) | mark_raw :>`
    }

    const hashEntries = propParts.length > 0 ? `, { ${propParts.join(', ')} }` : ''
    return `<: $bf.render_child('${tplName}'${hashEntries}) | mark_raw :>`
  }

  private childrenCaptureCounter = 0

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
    // The slot's content arrives as the `content` template var.
    return `<: $content :>`
  }

  renderAsync(node: IRAsync): string {
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
      // Refuse shapes that the lowering pipeline can't represent in Kolon —
      // object literals (`style={{...}}`) and tagged-template-literal call
      // expressions (`cn\`base \${tone()}\``). Same gate as the Mojo adapter.
      if (this.refuseUnsupportedAttrExpression(value.expr, name)) {
        return ''
      }
      if (isBooleanAttr(name) || value.presenceOrUndefined) {
        // Boolean attributes: render conditionally (present or absent).
        return `<: ${this.convertExpressionToKolon(value.expr)} ? '${name}' : '' :>`
      }
      // Boolean-result handling: route boolean-shaped values through
      // `$bf.bool_str` so the wire bytes match JS `String(boolean)`.
      const perl = this.convertExpressionToKolon(value.expr)
      if (isBooleanResultExpr(value.expr) || isAriaBooleanAttr(name)) {
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
      const perlExpr = this.convertExpressionToKolon(value.expr)
      return `<: $bf.spread_attrs(${perlExpr}) | mark_raw :>`
    },
    // Neither variant is legal on intrinsic elements.
    emitBooleanShorthand: () => '',
    emitJsxChildren: () => '',
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
      const end = args.length >= 2 ? emit(args[1]) : 'undef'
      return `$bf.slice(${recv}, ${start}, ${end})`
    }
    case 'reverse':
    case 'toReversed': {
      const recv = emit(object)
      return `$bf.reverse(${recv})`
    }
    case 'toLowerCase': {
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
    if (literalType === 'null') return 'undef'
    return String(value)
  }

  member(object: ParsedExpr, property: string, _computed: boolean, emit: (e: ParsedExpr) => string): string {
    // `.length` on an array — Kolon's array length is `$arr.size()`.
    if (property === 'length') {
      return `${emit(object)}.size()`
    }
    // Hash field access — Kolon dot works on hash refs.
    return `${emit(object)}.${property}`
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
    return `$${name}`
  }

  literal(value: string | number | boolean | null, literalType: LiteralType): string {
    if (literalType === 'string') return `'${value}'`
    if (literalType === 'boolean') return value ? '1' : '0'
    if (literalType === 'null') return 'undef'
    return String(value)
  }

  member(object: ParsedExpr, property: string, _computed: boolean, emit: (e: ParsedExpr) => string): string {
    // `props.x` flattens to the bare `$x` the SSR caller binds each prop to
    // (props arrive as individual top-level vars, not a `$props` hashref).
    if (object.kind === 'identifier' && object.name === 'props') {
      return `$${property}`
    }
    const obj = emit(object)
    // Kolon array length is `$arr.size()`.
    if (property === 'length') return `${obj}.size()`
    // Kolon dot access works for hash refs.
    return `${obj}.${property}`
  }

  call(callee: ParsedExpr, args: ParsedExpr[], emit: (e: ParsedExpr) => string): string {
    // Signal getter: count() → $count
    if (callee.kind === 'identifier' && args.length === 0) {
      return `$${callee.name}`
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
    // `.filter` / `.every` / `.some` route through `$bf` array helpers that
    // accept a Kolon code-ref predicate. `.find*` have no lowering yet.
    if (method === 'find' || method === 'findIndex' || method === 'findLast' || method === 'findLastIndex') {
      this.adapter._recordExprBF101(
        `Xslate adapter has not lowered Array.prototype.${method} yet`,
      )
      return "''"
    }
    // Standalone `.filter` / `.every` / `.some` would need v1 runtime array
    // helpers that accept a Kolon code-ref predicate, which the Xslate runtime
    // doesn't expose. Refuse with a clear diagnostic rather than emit a call to
    // a non-existent helper. The common `.filter(...).map(...)` *loop* form is
    // handled separately by renderLoop's inline predicate, so it still works.
    if (method === 'filter' || method === 'every' || method === 'some') {
      this.adapter._recordExprBF101(
        `Xslate adapter does not lower a standalone Array.prototype.${method} yet ` +
        `(the .filter(...).map(...) loop form is supported). ` +
        `Use /* @client */ or precompute the value.`,
      )
      return "''"
    }
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

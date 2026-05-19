/**
 * BarefootJS Mojolicious EP Template Adapter
 *
 * Generates Mojolicious EP template files (.html.ep) from BarefootJS IR.
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
  AttrValue,
  CompilerError,
  TemplatePrimitiveRegistry,
} from '@barefootjs/jsx'
import {
  BaseAdapter,
  type AdapterOutput,
  type AdapterGenerateOptions,
  type TemplateSections,
  type ParsedExprEmitter,
  type HigherOrderMethod,
  type LiteralType,
  type IRNodeEmitter,
  type EmitIRNode,
  type AttrValueEmitter,
  isBooleanAttr,
  parseExpression,
  isSupported,
  identifierPath,
  stringifyParsedExpr,
  emitParsedExpr,
  emitIRNode,
  emitAttrValue,
} from '@barefootjs/jsx'

/**
 * Mojo adapter's IRNode render context. Mojo's lowering currently
 * doesn't consume any render-position flags (`isRootOfClientComponent`
 * is handled differently here than in Hono/Go), so the Ctx is empty.
 * Kept as a named alias so future flags can extend it without changing
 * the `IRNodeEmitter` interface.
 */
type MojoRenderCtx = Record<string, never>
import type { ParsedExpr, ParsedStatement, TemplatePart } from '@barefootjs/jsx'
import { BF_SLOT, BF_COND } from '@barefootjs/shared'

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
 * Cheap substring pre-check: skip the (expensive) `parseExpression`
 * call when no primitive callee path appears in the source string.
 * The common case is "no primitive present"; building the regex
 * once from the registry keys keeps the gate in sync as new
 * primitives land.
 */
const PRIMITIVE_SUBSTRING_RE = new RegExp(
  Object.keys(MOJO_TEMPLATE_PRIMITIVES)
    .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')
)

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
  private inLoop: boolean = false
  /**
   * Re-entry guard for `convertHigherOrderExpr` (#1421).
   *
   * `MojoTopLevelEmitter.unsupported` falls back to the regex pipeline
   * via `_convertExpressionToPerlPublic`, which re-detects the
   * `.filter|every|some` short-circuit and re-enters
   * `convertHigherOrderExpr` with the same raw text. When the parser
   * carries the full original expression down to every nested
   * `unsupported` node (e.g. an array-literal callee that the AST
   * can't classify), the cycle has no terminator and the JS stack
   * blows. The guard records the expression on entry, emits BF101 on
   * second visit, and bails out — so the user sees an actionable
   * diagnostic instead of `RangeError: Maximum call stack size`.
   */
  private higherOrderInFlight: Set<string> = new Set()
  /**
   * SolidJS-style props identifier (`function(props: P)`) and the
   * analyzer-extracted prop names. Stashed at `generate()` entry so
   * the per-attribute `emitSpread` callback can build a propsObject
   * spread bag as an inline Perl hashref literal without re-walking
   * the IR (#1407 follow-up).
   */
  private propsObjectName: string | null = null
  private propsParams: { name: string }[] = []

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
    this.propsParams = ir.metadata.propsParams.map(p => ({ name: p.name }))
    this.errors = []
    this.higherOrderInFlight = new Set()
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
    return this.renderChildren(node.children)
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
    if (loop.paramBindings && loop.paramBindings.length > 0) {
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

    const array = this.convertExpressionToPerl(loop.array)
    const param = loop.param
    const indexVar = loop.index ? `$${loop.index}` : '$_i'
    const prevInLoop = this.inLoop
    this.inLoop = true
    const children = this.renderChildren(loop.children)
    this.inLoop = prevInLoop

    const lines: string[] = []
    // Scoped per-call-site marker so sibling `.map()`s under the same parent
    // each get their own reconciliation range (#1087).
    lines.push(`<%== bf->comment("loop:${loop.markerId}") %>`)
    lines.push(`% for my ${indexVar} (0..$#{${array}}) {`)
    lines.push(`% my $${param} = ${array}->[${indexVar}];`)

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
    emitLiteral: (value, name) => `${name} => '${value.value}'`,
    emitExpression: (value, name) => {
      // The IR producer collapses component-prop `template` kinds
      // into `expression` for client-runtime reasons but preserves
      // the parsed parts on `v.parts`. Prefer the structured form
      // when available — the bare-expression path can't handle
      // `${MAP[KEY]}` shapes (the JS object literal leaks into the
      // Perl template).
      if (value.parts) {
        return `${name} => ${this.convertTemplateLiteralPartsToPerl(value.parts)}`
      }
      return `${name} => ${this.convertExpressionToPerl(value.expr)}`
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
      `${name} => ${this.convertTemplateLiteralPartsToPerl(value.parts)}`,
    emitBooleanAttr: (_value, name) => `${name} => 1`,
    emitBooleanShorthand: (_value, name) => `${name} => 1`,
    // JSX children flow through Mojo's `begin %>…<% end` capture
    // below; they're not part of the named-arg list.
    emitJsxChildren: () => '',
  }

  renderComponent(comp: IRComponent): string {
    const propParts: string[] = []
    for (const p of comp.props) {
      // Skip callback props (onXxx) — event handlers are client-only for SSR.
      if (p.name.match(/^on[A-Z]/) && p.value.kind === 'expression') continue
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
      const childrenBody = this.renderChildren(effectiveChildren)
      const varName = `$bf_children_${comp.slotId ?? 'c' + this.childrenCaptureCounter++}`
      return `<% my ${varName} = begin %>${childrenBody}<% end %><%== bf->render_child('${tplName}'${propsStr}, children => ${varName}) %>`
    }
    return `<%== bf->render_child('${tplName}'${propsStr}) %>`
  }

  private childrenCaptureCounter = 0

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

  renderAsync(node: IRAsync): string {
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
      // Refuse shapes that the regex pipeline silently mangles into
      // invalid Perl (#1322). Object literals (`style={{...}}`) and
      // tagged-template-literal call expressions (`cn\`base \${tone()}\``)
      // have no idiomatic Mojo template form; the Go adapter raises
      // BF101 here via `convertExpressionToGo` + `isSupported`. Lift the
      // same gate so the user gets a clear diagnostic instead of broken
      // output. The check runs before `convertExpressionToPerl` so the
      // regex pipeline never produces template-text fragments for a
      // shape we've already rejected.
      if (this.refuseUnsupportedAttrExpression(value.expr, name)) {
        return ''
      }
      if (isBooleanAttr(name) || value.presenceOrUndefined) {
        // Boolean attributes: render conditionally (present or absent).
        return `<%= ${this.convertExpressionToPerl(value.expr)} ? '${name}' : '' %>`
      }
      return `${name}="<%= ${this.convertExpressionToPerl(value.expr)} %>"`
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
      const perlExpr = this.convertExpressionToPerl(value.expr)
      return `<%== bf->spread_attrs(${perlExpr}) %>`
    },
    // Neither variant is legal on intrinsic elements.
    emitBooleanShorthand: () => '',
    emitJsxChildren: () => '',
  }

  private renderAttributes(element: IRElement): string {
    const parts: string[] = []

    for (const attr of element.attrs) {
      const attrName = attr.name === 'className' ? 'class' : attr.name
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
    return emitParsedExpr(expr, new MojoFilterEmitter(param, localVarMap))
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

  private convertExpressionToPerl(expr: string): string {
    // Handle higher-order array methods via ParsedExpr AST
    if (/\.\s*(?:filter|every|some)\s*\(/.test(expr)) {
      return this.convertHigherOrderExpr(expr)
    }

    // templatePrimitives substitution (#1189): rewrite identifier-path
    // calls like `JSON.stringify(props.config)` / `Math.floor(x)` to
    // their Mojo helper-call form (`bf->json($config)` etc.) BEFORE
    // the regex pipeline below runs. Using the AST avoids fighting
    // the existing regex transforms — a registered call's args go
    // back through `convertExpressionToPerl` recursively so prop
    // refs / signal calls / member access in the args still get the
    // standard transforms.
    expr = this.rewriteTemplatePrimitives(expr)

    // Signal getter calls: count() → $count
    let result = expr.replace(/\b([a-z_]\w*)\(\)/g, (_, name) => `$${name}`)

    // Props access: props.xxx → $xxx
    result = result.replace(/\bprops\.(\w+)/g, (_, prop) => `$${prop}`)

    // Bare identifier property access: item.field → $item->{field}
    // Must run before $-prefixed property access to catch bare identifiers
    // Use negative lookbehind to skip $-prefixed variables (avoid $$var double-prefix)
    result = result.replace(/(?<!\$)\b([a-z_]\w*)\.(\w+)/g, (match, obj, field) => {
      if (match.startsWith('$')) return match
      return `$${obj}->{${field}}`
    })

    // $-prefixed property access: $item.field → $item->{field}
    result = result.replace(/\$(\w+)\.(\w+)/g, (_, obj, field) => `$${obj}->{${field}}`)

    // Chained property access: $item->{field}.sub → $item->{field}->{sub}
    result = result.replace(/\}->\{(\w+)\}\.(\w+)/g, (_, f1, f2) => `}->{${f1}}->{${f2}}`)

    // .length → scalar(@{...})
    result = result.replace(/\$(\w+)->\{length\}/g, (_, arr) => `scalar(@{$${arr}})`)

    // Nullish coalescing: a ?? b → a // b (Perl defined-or)
    result = result.replace(/\?\?/g, '//')

    // String comparison: expr === 'str' → expr eq 'str', expr !== 'str' → expr ne 'str'
    result = result.replace(/\s*===\s*(['"])/g, ' eq $1')
    result = result.replace(/\s*!==\s*(['"])/g, ' ne $1')
    // Also handle: 'str' === expr
    result = result.replace(/(['"])\s*===\s*/g, '$1 eq ')
    result = result.replace(/(['"])\s*!==\s*/g, '$1 ne ')

    // Numeric comparison (remaining === / !==)
    result = result.replace(/===/g, '==')
    result = result.replace(/!==/g, '!=')

    // Logical not: !expr → !expr (works in Perl too)
    // No conversion needed

    // Template literals: `str ${expr}` → "str $expr"
    result = result.replace(/`([^`]*)`/g, (_, content) => {
      const perlStr = content.replace(/\$\{([^}]+)\}/g, (_: string, e: string) => `${this.convertExpressionToPerl(e)}`)
      return `"${perlStr}"`
    })

    // Ensure top-level identifiers become variables
    if (/^[a-z_]\w*$/i.test(result) && !result.startsWith('$')) {
      result = `$${result}`
    }

    return result
  }
  /**
   * Walk the parsed AST of `expr` and substitute each registered
   * primitive call (e.g. `JSON.stringify(props.config)`) with its
   * Mojo helper-call equivalent (e.g. `bf->json($config)`). All
   * other shapes round-trip back to source text via
   * `stringifyParsedExpr`, so the result is still a JS-shaped
   * string that the existing regex pipeline in
   * `convertExpressionToPerl` can finish translating.
   *
   * Bails out (returns the input unchanged) when:
   *   - the expression doesn't parse cleanly,
   *   - no primitive call is found in the AST, or
   *   - a primitive's arity doesn't match the registered shape
   *     (BF101 is recorded so the user sees the diagnostic).
   *
   * Identifier-path-only matching (#1187 R1) — same constraint the
   * Go adapter applies in #1188.
   */
  private rewriteTemplatePrimitives(expr: string): string {
    // Common case: no registered primitive substring — skip the
    // TS parser entirely. `parseExpression` invokes
    // `ts.createSourceFile`, which is the dominant compile-hot-path
    // cost added by this PR.
    if (!PRIMITIVE_SUBSTRING_RE.test(expr)) return expr

    const parsed = parseExpression(expr)
    if (parsed.kind === 'unsupported') return expr

    let mutated = false
    const walk = (n: ParsedExpr): ParsedExpr => {
      if (n.kind === 'call') {
        const path = identifierPath(n.callee)
        const spec = path ? MOJO_TEMPLATE_PRIMITIVES[path] : undefined
        if (path && spec) {
          if (n.args.length !== spec.arity) {
            this.errors.push({
              code: 'BF101',
              severity: 'error',
              message: `templatePrimitive '${path}' expects ${spec.arity} arg(s), got ${n.args.length}`,
              loc: { file: this.componentName + '.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
              suggestion: {
                message: `Call '${path}' with exactly ${spec.arity} argument(s), or wrap the JSX expression in /* @client */ to defer evaluation.`,
              },
            })
            return { kind: 'call', callee: walk(n.callee), args: n.args.map(walk) }
          }
          // Render each arg through the AST-aware sub-pipeline:
          // walk for nested primitive substitution, then pass the
          // resulting AST node directly to convertExpressionToPerl
          // via stringification. The substring pre-check above
          // guards against re-parsing strings that don't carry a
          // primitive, so the recursive cost stays bounded.
          const renderedArgs = n.args.map(a => this.convertExpressionToPerl(stringifyParsedExpr(walk(a))))
          mutated = true
          return { kind: 'identifier', name: spec.emit(renderedArgs) }
        }
      }
      switch (n.kind) {
        case 'call':
          return { kind: 'call', callee: walk(n.callee), args: n.args.map(walk) }
        case 'member':
          return { kind: 'member', object: walk(n.object), property: n.property, computed: n.computed }
        case 'binary':
          return { kind: 'binary', op: n.op, left: walk(n.left), right: walk(n.right) }
        case 'unary':
          return { kind: 'unary', op: n.op, argument: walk(n.argument) }
        case 'logical':
          return { kind: 'logical', op: n.op, left: walk(n.left), right: walk(n.right) }
        case 'conditional':
          return { kind: 'conditional', test: walk(n.test), consequent: walk(n.consequent), alternate: walk(n.alternate) }
        default:
          return n
      }
    }

    const transformed = walk(parsed)
    if (!mutated) return expr
    return stringifyParsedExpr(transformed)
  }

  /**
   * Convert expressions containing higher-order array methods to Perl.
   * Parses the full expression as AST and renders recursively.
   *
   * Handles patterns like:
   * - todos().filter(t => !t.done).length → scalar(grep { !$_->{done} } @{$todos})
   * - todos().every(t => t.done) → !(grep { !$_->{done} } @{$todos})
   * - todos().filter(t => t.done).length > 0 → scalar(grep { $_->{done} } @{$todos}) > 0
   */
  private convertHigherOrderExpr(expr: string): string {
    if (this.higherOrderInFlight.has(expr)) {
      this.errors.push({
        code: 'BF101',
        severity: 'error',
        message: `Cannot lower higher-order chain to Embedded Perl: ${expr.trim()}`,
        loc: { file: this.componentName + '.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
        suggestion: {
          message: "The Mojo adapter cannot lower this `.filter()` / `.every()` / `.some()` chain — typically because the array source is a JS array literal or a non-signal expression the AST classifier doesn't recognise. Move the expression into a `'use client'` component (so hydration computes it client-side), or rewrite it to operate on a signal getter or a prop directly.",
        },
      })
      // Return a Perl empty-string literal — safe in every context the
      // result might land in (`<%= '' %>`, `% if ('') {`, attribute
      // interpolation, template-literal substitution). Returning a raw
      // empty string here would produce `<%= %>`, which Embedded Perl
      // rejects as a syntax error and would mask the BF101 diagnostic
      // behind an opaque template-compilation failure.
      return "''"
    }
    this.higherOrderInFlight.add(expr)
    try {
      const parsed = parseExpression(expr)
      return this.renderParsedExprToPerl(parsed)
    } finally {
      this.higherOrderInFlight.delete(expr)
    }
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

  /** Internal hook exposed to the top-level emitter for unsupported nodes. */
  _convertExpressionToPerlPublic(raw: string): string {
    return this.convertExpressionToPerl(raw)
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
    return `${emit(object)}->{${property}}`
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
    if ((op === '===' || op === '==') && right.kind === 'literal' && right.literalType === 'string') {
      return `${l} eq ${r}`
    }
    if ((op === '!==' || op === '!=') && right.kind === 'literal' && right.literalType === 'string') {
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
    const predBody = emitParsedExpr(predicate, new MojoFilterEmitter(param, this.localVarMap))
    const grepBody = predBody.replace(new RegExp(`\\$${param}\\b`, 'g'), '$_')
    if (method === 'filter') return `[grep { ${grepBody} } @{${arrayExpr}}]`
    if (method === 'every') return `!(grep { !(${grepBody}) } @{${arrayExpr}})`
    if (method === 'some') return `!!(grep { ${grepBody} } @{${arrayExpr}})`
    return arrayExpr
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
    return `$${name}`
  }

  literal(value: string | number | boolean | null, literalType: LiteralType): string {
    if (literalType === 'string') return `'${value}'`
    if (literalType === 'boolean') return value ? '1' : '0'
    if (literalType === 'null') return 'undef'
    return String(value)
  }

  member(object: ParsedExpr, property: string, _computed: boolean, emit: (e: ParsedExpr) => string): string {
    const obj = emit(object)
    if (property === 'length') return `scalar(@{${obj}})`
    return `${obj}->{${property}}`
  }

  call(callee: ParsedExpr, args: ParsedExpr[], emit: (e: ParsedExpr) => string): string {
    // Signal getter: count() → $count
    if (callee.kind === 'identifier' && args.length === 0) {
      return `$${callee.name}`
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
    if ((op === '===' || op === '==') && right.kind === 'literal' && right.literalType === 'string') {
      return `${l} eq ${r}`
    }
    if ((op === '!==' || op === '!=') && right.kind === 'literal' && right.literalType === 'string') {
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
    return arrayExpr
  }

  conditional(
    test: ParsedExpr,
    consequent: ParsedExpr,
    alternate: ParsedExpr,
    emit: (e: ParsedExpr) => string,
  ): string {
    return `(${emit(test)} ? ${emit(consequent)} : ${emit(alternate)})`
  }

  templateLiteral(_parts: TemplatePart[]): string {
    // Template literals don't appear at top level inside Mojo expressions
    // — they're handled by `convertTemplateLiteralPartsToPerl` at the
    // attribute / interpolation layer, not the expression dispatcher.
    return ''
  }

  arrowFn(_param: string, _body: ParsedExpr): string {
    return ''
  }

  unsupported(raw: string, _reason: string): string {
    // Legacy fallback: the regex pipeline handles shapes the AST can't
    // classify (mostly hand-written JS that pre-dates the parser).
    return this.adapter._convertExpressionToPerlPublic(raw)
  }
}

export const mojoAdapter = new MojoAdapter()

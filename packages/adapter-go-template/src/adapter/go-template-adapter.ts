/**
 * BarefootJS Go html/template Adapter
 *
 * Generates Go html/template files from BarefootJS IR.
 */

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
  CompilerError,
  SourceLocation,
  ParsedExpr,
  ParsedStatement,
  SortComparator,
  TemplatePart,
  IRIfStatement,
  IRProvider,
  IRAsync,
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
  exprToString,
  identifierPath,
  emitParsedExpr,
  emitIRNode,
  emitAttrValue,
} from '@barefootjs/jsx'
import { findInterpolationEnd } from '@barefootjs/jsx/scanner'

/**
 * Go-template adapter's IRNode render context. Only `isRootOfClientComponent`
 * is consumed today (forwarded into `renderComponent` / `renderIfStatement`);
 * the type stays open so future render-position flags can be added without
 * widening the `IRNodeEmitter` contract.
 */
type GoRenderCtx = {
  isRootOfClientComponent?: boolean
}

/**
 * Extended nested component info that tracks whether the component
 * comes from a dynamic (signal) array loop vs a static array loop.
 */
interface NestedComponentInfo extends IRLoopChildComponent {
  isDynamic: boolean
  isPropDerived: boolean
}

interface StaticChildInstance {
  name: string
  slotId: string
  props: IRProp[]
  fieldName: string
  /** Concatenated text content from JSX children (e.g. `+1` for
   *  `<Button>+1</Button>`). Null when children include any non-text
   *  node; those go through the `childrenHtml` path when they're
   *  purely static HTML, otherwise they're dropped. */
  childrenText: string | null
  /** Rendered Go-template fragment for purely-static, non-text JSX
   *  children (e.g. `<Card><span>x</span></Card>`). Forwarded to the
   *  child via `Children: template.HTML(...)` so the child's
   *  `{{or .Children ""}}` skips re-escaping. Null when children are
   *  text-only or absent — and also null when the rendered fragment
   *  contains any `{{...}}` action (signal expressions, nested
   *  components, conditionals, etc.) since those wouldn't re-evaluate
   *  through the parent's `{{.Children}}` read; those cases stay on
   *  the existing drop path. */
  childrenHtml: string | null
}

/**
 * Top-level (non-loop) JSX intrinsic-element spread slot (#1407).
 * Collected by `collectSpreadSlots` so the adapter can emit one
 * `Spread_<slotId> map[string]any` field on the component's Props
 * struct and initialise it in `NewXxxProps` from the source JS
 * expression. Loop-internal spreads don't appear here — they emit
 * the bag inline via the loop's iteration variable instead.
 *
 * `bagSource` records how the bag is supplied so the Input struct
 * and `NewXxxProps` can be wired correctly (#1407 follow-up):
 *
 * - `'inline'`: bag is constructed inside `NewXxxProps` from
 *   compile-time-known data (signal initial values, prop refs,
 *   propsObject enumeration). No Input field needed.
 * - `'input-bag'`: bag is provided by the caller as a
 *   `Spread_<slotId> map[string]any` field on the Input struct
 *   (used for `restPropsName` spreads where the rest's keys are
 *   open-ended and Go's static typing can't enumerate them).
 */
interface SpreadSlotInfo {
  slotId: string
  expr: string
  templateExpr: string | undefined
  bagSource: 'inline' | 'input-bag'
}

/**
 * (#1423) Hoisted local var representing a prop with a signal-time
 * `??` fallback. Used by `generateNewPropsFunction` to share the
 * fallback-applied value across the prop, signal, and memo fields.
 */
interface PropFallbackVar {
  /** Local variable name (typically the lowercase prop identifier). */
  varName: string
  /** Capitalised Go field name on the `Input` struct. */
  fieldName: string
  /** Go literal used when the input value equals its zero value. */
  goFallback: string
  /** Go zero literal for the prop's type (`0`, `""`, etc.). */
  zeroLiteral: string
}

export interface GoTemplateAdapterOptions {
  /** Go package name for generated types (default: 'components') */
  packageName?: string

  /**
   * Base path for client JS files (e.g., '/static/client/').
   * Used to generate script registration paths.
   */
  clientJsBasePath?: string

  /**
   * Path to barefoot.js runtime (e.g., '/static/client/barefoot.js').
   */
  barefootJsPath?: string
}

/**
 * Wrap a rendered Go template fragment in parens when it would
 * otherwise parse as multiple sibling args of an enclosing prefix
 * call. A bare identifier / dotted path / quoted literal stays
 * uncluttered; anything containing whitespace (a function call,
 * `len ...`, etc.) gets `(...)` so `bf_join (...) bf_trim .Raw`
 * doesn't degrade to four args of `bf_join`. Used by emitters that
 * compose runtime helpers (#1443 / #1445 Copilot review).
 */
function wrapIfMultiToken(rendered: string): string {
  // Already wrapped — don't double-wrap.
  if (rendered.startsWith('(') && rendered.endsWith(')')) return rendered
  // Quoted literals can contain spaces inside the string but parse
  // as a single token; leave them alone.
  if (rendered.startsWith('"') && rendered.endsWith('"')) return rendered
  if (/\s/.test(rendered)) return `(${rendered})`
  return rendered
}

/**
 * Emit the `bf_sort` call shared by the standalone `sortMethod()`
 * arm and the chained `.sort().map()` loop hoist. The runtime helper
 * takes 4 string operands so a future `nulls` knob can grow on the
 * end without rewriting either call site (#1448 Tier B):
 *
 *   bf_sort <recv> <keyKind> <keyName> <compareType> <direction>
 *
 *   keyKind:      "self" | "field"
 *   keyName:      "" when keyKind=self; capitalised field name otherwise
 *   compareType:  "numeric" | "string"
 *   direction:    "asc" | "desc"
 *
 * The capitalisation mirrors the Go-side struct-field convention
 * (`bf_sort .Items "field" "Price" "numeric" "asc"`) so the runtime
 * helper's reflect lookup matches without a recapitalise step.
 */
function emitBfSort(recv: string, c: SortComparator): string {
  const keyKind = c.key.kind
  const keyName = c.key.kind === 'field' ? capitalize(c.key.field) : ''
  return `bf_sort ${wrapIfMultiToken(recv)} "${keyKind}" "${keyName}" "${c.type}" "${c.direction}"`
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1)
}

/**
 * Convert a slot ID (e.g., 's6') to a Go struct field suffix (e.g., 'Slot6').
 * Keeps field names human-readable regardless of the internal slot ID format.
 */
function slotIdToFieldSuffix(slotId: string): string {
  // Strip parent-owned prefix (^) for Go struct field names
  const cleanId = slotId.startsWith('^') ? slotId.slice(1) : slotId
  const match = cleanId.match(/^s(\d+)$/)
  if (match) {
    return `Slot${match[1]}`
  }
  // Fallback for legacy format or non-standard IDs
  return cleanId.replace('slot_', 'Slot')
}

/**
 * Single source of truth for the Go adapter's template-primitive
 * surface (#1188). Each entry pairs the expected arity with the
 * emit function so adding / removing a primitive is a one-line
 * change and the two derived maps (`templatePrimitives` and
 * `templatePrimitiveArities`) can't drift out of sync.
 */
interface PrimitiveSpec {
  arity: number
  emit: (args: string[]) => string
}

const GO_TEMPLATE_PRIMITIVES: Record<string, PrimitiveSpec> = {
  'JSON.stringify': { arity: 1, emit: (args) => `bf_json ${args[0]}` },
  'String':         { arity: 1, emit: (args) => `bf_string ${args[0]}` },
  'Number':         { arity: 1, emit: (args) => `bf_number ${args[0]}` },
  'Math.floor':     { arity: 1, emit: (args) => `bf_floor ${args[0]}` },
  'Math.ceil':      { arity: 1, emit: (args) => `bf_ceil ${args[0]}` },
  'Math.round':     { arity: 1, emit: (args) => `bf_round ${args[0]}` },
}

export class GoTemplateAdapter extends BaseAdapter implements ParsedExprEmitter, IRNodeEmitter<GoRenderCtx> {
  name = 'go-template'
  extension = '.tmpl'

  // Recursion-scoped state for `renderFilterExpr`. `filterExprDepth`
  // tracks nesting so the outer call resets `filterExprUnsupported`
  // before each independent filter expression; the flag itself is set
  // in the `default` branch (BF101 emission) and propagated by parent
  // branches so the final template stays syntactically valid even
  // when a child rendered to the fallback sentinel (#1440 review).
  private filterExprDepth = 0
  private filterExprUnsupported = false

  /**
   * Identifier-path callees the Go runtime can render in template
   * scope (#1188). The relocate pass consults this map to mark
   * matching calls as template-safe so the surrounding expression
   * stays inlinable; the SSR template emitter (`renderParsedExpr`'s
   * `call` branch) uses the same map to substitute the JS call with
   * the registered Go template form.
   *
   * Keys are the textual callee path as written in the JSX
   * expression. Values are emit functions that receive the already-
   * Go-rendered argument expressions (e.g. `.Config`, `_p.Score`)
   * and return the substituted Go template body — without the
   * surrounding `{{ }}` action delimiters, so callers can wrap the
   * result in `{{...}}` or compose into larger expressions like
   * `{{if eq (bf_json .X) "..."}}`.
   *
   * V1 scope (#1187 R1): identifier-path callees only. Method calls
   * on values (`(arr).join(",")`) require analyzer-resolved receiver
   * type and are explicitly out of scope — users fall back to
   * `/* @client *\/` for those.
   *
   * Public because the `TemplateAdapter` interface contract requires
   * the relocate pass to read this for boolean acceptance. The arity
   * map below is implementation detail (private) — the asymmetry is
   * deliberate.
   */
  templatePrimitives: TemplatePrimitiveRegistry =
    Object.fromEntries(
      Object.entries(GO_TEMPLATE_PRIMITIVES).map(([k, v]) => [k, v.emit])
    )

  /**
   * Expected arg count per primitive. Consulted before invoking the
   * registered emit fn so a 0-arg `JSON.stringify()` or 2-arg
   * `JSON.stringify(x, replacer)` doesn't silently produce invalid
   * Go template syntax (the V1 emit fns blindly read `args[0]`).
   *
   * Derived from `GO_TEMPLATE_PRIMITIVES` so it can't drift from
   * `templatePrimitives` — a wrong-arity call falls back to the
   * standard BF101 unsupported-call diagnostic.
   */
  private readonly templatePrimitiveArities: Record<string, number> =
    Object.fromEntries(
      Object.entries(GO_TEMPLATE_PRIMITIVES).map(([k, v]) => [k, v.arity])
    )

  private componentName: string = ''
  private options: Required<GoTemplateAdapterOptions>
  private inLoop: boolean = false
  private loopParamStack: string[] = []
  private errors: CompilerError[] = []
  private propsObjectName: string | null = null
  /**
   * Component-scoped rest binding identifier (`function({ a, ...rest }: P)`
   * → `'rest'`). Stashed at `generate()` entry so per-attribute
   * emitter callbacks can classify a spread expression against it
   * without threading the IR through each recursion (#1407
   * follow-up).
   */
  private restPropsName: string | null = null
  private templateVarCounter: number = 0
  /** Local type names resolved from typeDefinitions (populated during generateTypes) */
  private localTypeNames: Set<string> = new Set()
  /** Local type aliases mapping type name to base type (e.g., Filter → 'string') */
  private localTypeAliases: Map<string, string> = new Map()

  /** Set during type generation when any emit references
   *  `template.HTML(...)`; toggles the `"html/template"` import. */
  private usesHtmlTemplate: boolean = false

  constructor(options: GoTemplateAdapterOptions = {}) {
    super()
    this.options = {
      packageName: options.packageName ?? 'components',
      clientJsBasePath: options.clientJsBasePath ?? '/static/client/',
      barefootJsPath: options.barefootJsPath ?? '/static/client/barefoot.js',
    }
  }

  /**
   * Generate template output for a component.
   * @param ir - The component IR
   * @param options - Generation options
   */
  generate(ir: ComponentIR, options?: AdapterGenerateOptions): AdapterOutput {
    this.componentName = ir.metadata.componentName
    this.errors = []
    this.templateVarCounter = 0
    this.propsObjectName = ir.metadata.propsObjectName
    this.restPropsName = ir.metadata.restPropsName ?? null

    // Surface loop-body usages of components imported from sibling
    // .tsx files. The adapter emits `{{template "X" .}}` for these,
    // which Go's template engine resolves only if the user has
    // compiled the sibling file with the same adapter and registered
    // the resulting `{{define "X"}}` block on the same Template
    // instance. When that doesn't happen, the failure is silent at
    // build time and surfaces as a `template: "X" is undefined` at
    // request time — the exact "silent-when-should-be-loud" shape
    // #1266 calls out. The check is scoped to loop bodies because
    // that's the natural Hono-style pattern (factor a list item
    // into a sibling file, .map() over data) and is where users
    // are most likely to hit the request-time failure unawares.
    //
    // The barefoot CLI passes `siblingTemplatesRegistered: true`
    // because it compiles every source-dir file together and
    // registers them all on the same `*template.Template` instance —
    // for that caller the cross-template lookup always resolves, so
    // the diagnostic would be noise. Stand-alone `compileJSX` callers
    // (conformance runner, third-party tooling) leave the flag unset
    // and get the loud build-time error.
    if (!options?.siblingTemplatesRegistered) {
      this.checkImportedLoopChildComponents(ir)
    }

    const hasInteractivity = this.hasClientInteractivity(ir)
    const isRootComponent = ir.root.type === 'component'
    const isIfStatement = ir.root.type === 'if-statement'

    const templateBody = isIfStatement
      ? this.renderIfStatement(ir.root as IRIfStatement, { isRootOfClientComponent: hasInteractivity })
      : this.renderNode(ir.root, { isRootOfClientComponent: hasInteractivity && isRootComponent })

    // Generate script registration code at template start (unless skipped)
    const scriptRegistrations = options?.skipScriptRegistration
      ? ''
      : this.generateScriptRegistrations(ir, options?.scriptBaseName)

    const template = `{{define "${this.componentName}"}}\n${scriptRegistrations}${templateBody}\n{{end}}\n`
    const types = this.generateTypes(ir)

    // Merge collected errors into IR errors
    if (this.errors.length > 0) {
      ir.errors.push(...this.errors)
    }

    // Go templates have no JS-style imports / types / default-export sections;
    // the entire `{{define}}…{{end}}` block is the component body. The compiler
    // assembles multi-component files by concatenating the `component` parts.
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
   * Check if a component has client interactivity (needs client JS).
   * A component has client interactivity if it has:
   * - Signals (reactive state)
   * - Effects (side effects)
   * - Events on elements
   */
  private hasClientInteractivity(ir: ComponentIR): boolean {
    // Check for signals
    if (ir.metadata.signals.length > 0) return true

    // Check for effects
    if (ir.metadata.effects.length > 0) return true

    // Check for onMounts
    if (ir.metadata.onMounts.length > 0) return true

    // Check for events in the IR tree
    if (this.hasEventsInTree(ir.root)) return true

    // Check for child components (they need parent's hydration)
    if (this.findChildComponentNames(ir.root).size > 0) return true

    return false
  }

  /**
   * Recursively check if any element in the tree has events.
   */
  private hasEventsInTree(node: IRNode): boolean {
    if (node.type === 'element') {
      const element = node as IRElement
      if (element.events.length > 0) return true
      for (const child of element.children) {
        if (this.hasEventsInTree(child)) return true
      }
    } else if (node.type === 'fragment') {
      const fragment = node as IRFragment
      for (const child of fragment.children) {
        if (this.hasEventsInTree(child)) return true
      }
    } else if (node.type === 'conditional') {
      const cond = node as IRConditional
      if (this.hasEventsInTree(cond.whenTrue)) return true
      if (cond.whenFalse && this.hasEventsInTree(cond.whenFalse)) return true
    } else if (node.type === 'loop') {
      const loop = node as IRLoop
      for (const child of loop.children) {
        if (this.hasEventsInTree(child)) return true
      }
    } else if (node.type === 'if-statement') {
      const ifStmt = node as IRIfStatement
      if (this.hasEventsInTree(ifStmt.consequent)) return true
      if (ifStmt.alternate && this.hasEventsInTree(ifStmt.alternate)) return true
    }
    return false
  }

  /**
   * Find all child component names used in the IR tree.
   */
  private findChildComponentNames(node: IRNode): Set<string> {
    const names = new Set<string>()
    this.collectChildComponentNames(node, names)
    return names
  }

  private collectChildComponentNames(node: IRNode, names: Set<string>): void {
    if (node.type === 'component') {
      const comp = node as IRComponent
      names.add(comp.name)
    } else if (node.type === 'element') {
      const element = node as IRElement
      for (const child of element.children) {
        this.collectChildComponentNames(child, names)
      }
    } else if (node.type === 'fragment') {
      const fragment = node as IRFragment
      for (const child of fragment.children) {
        this.collectChildComponentNames(child, names)
      }
    } else if (node.type === 'conditional') {
      const cond = node as IRConditional
      this.collectChildComponentNames(cond.whenTrue, names)
      if (cond.whenFalse) {
        this.collectChildComponentNames(cond.whenFalse, names)
      }
    } else if (node.type === 'loop') {
      const loop = node as IRLoop
      for (const child of loop.children) {
        this.collectChildComponentNames(child, names)
      }
    } else if (node.type === 'if-statement') {
      const ifStmt = node as IRIfStatement
      this.collectChildComponentNames(ifStmt.consequent, names)
      if (ifStmt.alternate) {
        this.collectChildComponentNames(ifStmt.alternate, names)
      }
    }
  }

  /**
   * Push a `BF103` diagnostic for every component reference inside a
   * loop body whose name is imported from a relative-path module
   * (i.e. a sibling .tsx file). The Go adapter renders these as
   * `{{template "X" .}}` calls, which Go's template engine resolves
   * only against templates registered on the same `*template.Template`
   * — so a user who factored a list item into `./list-item.tsx` and
   * mapped over it gets a working build and a `template: "X" is
   * undefined` at request time. Surfacing this at build time matches
   * the louder-over-silent contract (#1266).
   *
   * Scoped to loop bodies because that's the natural Hono-style
   * pattern the issue calls out; static (non-loop) usage of imported
   * components is left alone so existing static-layout patterns
   * keep working without noise.
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

    const visit = (node: IRNode, inLoop: boolean): void => {
      switch (node.type) {
        case 'component': {
          const comp = node as IRComponent
          if (inLoop && relativeImports.has(comp.name)) {
            this.errors.push({
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
   * Generate script registration code for the template.
   * Scripts are registered at the beginning of the template.
   * Uses .Scripts which is available on all Props structs.
   * The same ScriptCollector should be shared across parent and child props.
   * Wrapped in {{if .Scripts}} to safely handle nil Scripts.
   */
  private generateScriptRegistrations(ir: ComponentIR, scriptBaseName?: string): string {
    // Check if this component has client interactivity
    const hasInteractivity = this.hasClientInteractivity(ir)

    if (!hasInteractivity) {
      return ''
    }

    const registrations: string[] = []

    // Register barefoot.js runtime first
    registrations.push(`{{.Scripts.Register "${this.options.barefootJsPath}"}}`)

    // Register this component's script
    // Use scriptBaseName if provided (for non-default exports sharing parent's .client.js)
    const scriptName = scriptBaseName || ir.metadata.componentName
    registrations.push(`{{.Scripts.Register "${this.options.clientJsBasePath}${scriptName}.client.js"}}`)

    // Wrap in nil check to safely handle cases where Scripts is not set
    return `{{if .Scripts}}${registrations.join('')}{{end}}\n`
  }

  generateTypes(ir: ComponentIR): string | null {
    this.usesHtmlTemplate = false
    const lines: string[] = []

    const componentName = ir.metadata.componentName

    // Build set of locally-defined type names and aliases so typeInfoToGo can resolve them
    this.localTypeNames = new Set<string>()
    this.localTypeAliases = new Map<string, string>()
    for (const td of ir.metadata.typeDefinitions) {
      // Skip the Props type itself (it's the component's own props, not a reusable type)
      if (td.name === 'Props' || td.name === `${componentName}Props`) continue
      // Skip child component Props — they are generated by the child's own generatePropsStruct()
      if (td.name.endsWith('Props')) continue
      this.localTypeNames.add(td.name)
      // Track string literal union aliases (e.g., type Filter = 'all' | 'active')
      if (td.definition.match(/^type \w+ = ('[^']*'(\s*\|\s*'[^']*')*)/)) {
        this.localTypeAliases.set(td.name, 'string')
      }
    }

    // Generate Go structs for local type definitions (e.g., Todo, Filter → string alias)
    for (const td of ir.metadata.typeDefinitions) {
      if (td.name === 'Props' || td.name === `${componentName}Props`) continue
      if (td.name.endsWith('Props')) continue
      const goStruct = this.typeDefinitionToGo(td)
      if (goStruct) {
        lines.push(goStruct)
        lines.push('')
      }
    }

    // Find nested components (loops with childComponent)
    const nestedComponents = this.findNestedComponents(ir.root)

    // Build prop type overrides from signal types
    const propTypeOverrides = this.buildPropTypeOverrides(ir)

    // Compute spread slot info once and thread it through all three
    // generators — `collectSpreadSlots` walks the IR tree, so caching
    // here saves repeated walks (#1411 review). `spreadSlots` also
    // controls whether `generateInputStruct` adds a
    // `Spread_<N> map[string]any` field for `input-bag` slots so the
    // caller can populate the open-ended restPropsName spread bag
    // (#1407 follow-up).
    const spreadSlots = this.collectSpreadSlots(ir.root)

    // Generate Input struct for main component
    this.generateInputStruct(lines, ir, componentName, nestedComponents, propTypeOverrides, spreadSlots)

    // Generate Props struct for main component
    this.generatePropsStruct(lines, ir, componentName, nestedComponents, propTypeOverrides, spreadSlots)

    // Generate NewXxxProps function
    this.generateNewPropsFunction(lines, ir, componentName, nestedComponents, spreadSlots)

    // Imports come at the top, but `usesHtmlTemplate` is only known
    // after the body has been generated. Compose package + imports +
    // body once everything has been collected.
    const header: string[] = []
    header.push(`package ${this.options.packageName}`)
    header.push('')
    header.push('import (')
    if (this.usesHtmlTemplate) header.push('\t"html/template"')
    header.push('\t"math/rand"')
    header.push('')
    header.push('\tbf "github.com/barefootjs/runtime/bf"')
    header.push(')')
    header.push('')

    return [...header, ...lines].join('\n')
  }

  /**
   * Convert a TypeScript type definition to a Go type.
   * Handles object types → Go structs, and union string literals → string alias.
   */
  private typeDefinitionToGo(td: { kind: string; name: string; definition: string }): string | null {
    const def = td.definition

    // String literal union: type Filter = 'all' | 'active' | 'completed'
    if (def.match(/^type \w+ = ('[^']*'(\s*\|\s*'[^']*')*)/)) {
      // Map to Go string (union of string literals → just string in Go)
      return `// ${td.name} is a string type.\ntype ${td.name} = string`
    }

    // Object/interface type: type Todo = { id: number; text: string; ... }
    const bodyMatch = def.match(/(?:type \w+ = |interface \w+ )\{([\s\S]*)\}/)
    if (!bodyMatch) return null

    const body = bodyMatch[1]
    const goFields: string[] = []

    // Parse each field: "fieldName: type" or "fieldName?: type"
    // Handle both semicolon-separated and newline-separated
    const fieldEntries = body.split(/[;\n]/).map(s => s.trim()).filter(Boolean)
    for (const entry of fieldEntries) {
      const fieldMatch = entry.match(/^(\w+)\??\s*:\s*(.+)$/)
      if (!fieldMatch) continue
      const [, fieldName, tsType] = fieldMatch
      const goFieldName = this.capitalizeFieldName(fieldName)
      const goType = this.tsTypeStringToGo(tsType.trim())
      const jsonTag = this.toJsonTag(fieldName)
      goFields.push(`\t${goFieldName} ${goType} \`json:"${jsonTag}"\``)
    }

    if (goFields.length === 0) return null

    return `// ${td.name} represents a ${td.name.toLowerCase()}.\ntype ${td.name} struct {\n${goFields.join('\n')}\n}`
  }

  /**
   * Convert a raw TypeScript type string to a Go type string.
   * Handles primitives (number, string, boolean) and basic arrays.
   */
  private tsTypeStringToGo(tsType: string): string {
    const t = tsType.trim()
    if (t === 'number') return 'int'
    if (t === 'string') return 'string'
    if (t === 'boolean' || t === 'bool') return 'bool'
    if (t.endsWith('[]')) {
      const elem = t.slice(0, -2)
      return `[]${this.tsTypeStringToGo(elem)}`
    }
    const arrayMatch = t.match(/^Array<(.+)>$/)
    if (arrayMatch) return `[]${this.tsTypeStringToGo(arrayMatch[1])}`
    // Check if it's a known local type
    if (this.localTypeNames.has(t)) return t
    return 'interface{}'
  }

  /**
   * Build a map from prop name to a better Go type inferred from signals.
   * When a signal is initialized from a prop (e.g., createSignal(props.initial ?? 0)),
   * the signal's type annotation may be more specific than the prop's TypeInfo.
   */
  private buildPropTypeOverrides(ir: ComponentIR): Map<string, string> {
    const overrides = new Map<string, string>()
    for (const signal of ir.metadata.signals) {
      // Check simple identifier reference
      const propNames = [signal.initialValue]
      const extracted = this.extractPropNameFromInitialValue(signal.initialValue)
      if (extracted) propNames.push(extracted)

      for (const propName of propNames) {
        const param = ir.metadata.propsParams.find(p => p.name === propName)
        if (!param) continue
        const propGoType = this.typeInfoToGo(param.type, param.defaultValue)
        // Override when prop type is generic (interface{} or contains interface{})
        if (propGoType.includes('interface{}')) {
          const signalGoType = this.typeInfoToGo(signal.type, signal.initialValue)
          if (!signalGoType.includes('interface{}')) {
            overrides.set(propName, signalGoType)
          }
        }
      }
    }
    return overrides
  }

  /**
   * Generate Input struct for a component
   */
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
    // (#1249) Slot identity for child scopes mounted as a slot of an
    // outer component. Forwarded to Props's BfParent / BfMount.
    lines.push('\tBfParent string // Optional: parent scope id')
    lines.push('\tBfMount string // Optional: slot id in parent')

    // Static + prop-derived nested components appear in Input;
    // signal-backed dynamic ones are template-only
    const inputNested = nestedComponents.filter(n => !n.isDynamic || n.isPropDerived)

    // Collect nested component array field names to skip from propsParams
    const nestedArrayFields = new Set(nestedComponents.map(n => `${n.name}s`))

    // Add props params (excluding nested array fields)
    for (const param of ir.metadata.propsParams) {
      const fieldName = this.capitalizeFieldName(param.name)
      if (nestedArrayFields.has(fieldName)) continue
      const goType = propTypeOverrides.get(param.name) ?? this.typeInfoToGo(param.type, param.defaultValue)
      lines.push(`\t${fieldName} ${goType}`)
    }

    // Add nested component input arrays
    for (const nested of inputNested) {
      lines.push(`\t${nested.name}s []${nested.name}Input`)
    }

    // (#1407 follow-up) Input-side bag field for restPropsName spreads.
    // The destructured-rest pattern
    // (`function({a, ...rest}: P) { <el {...rest}/> }`) surfaces
    // as a `bagSource: 'input-bag'` slot — Go's static typing
    // can't enumerate the open-ended key set, so the caller passes
    // the bag as a `map[string]any` field. The field is named
    // after the JS-side rest binding (`rest` → `Rest`) so
    // callers — `parent.NewXxxProps(XxxInput{Rest: ...})`
    // construction sites, including the bun-test harness — can
    // address it by the same identifier they used in source. The
    // JSON tag uses the rest binding name too so JSON round-trips
    // line up.
    const restPropsName = ir.metadata.restPropsName
    if (restPropsName) {
      const seen = new Set<string>()
      for (const slot of spreadSlots) {
        if (slot.bagSource !== 'input-bag') continue
        const fieldName = this.capitalizeFieldName(restPropsName)
        if (seen.has(fieldName)) continue
        seen.add(fieldName)
        const jsonTag = this.toJsonTag(restPropsName)
        lines.push(`\t${fieldName} map[string]any \`json:"${jsonTag}"\``)
      }
    }

    lines.push('}')
    lines.push('')
  }

  /**
   * Generate Props struct for a component
   */
  private generatePropsStruct(
    lines: string[],
    ir: ComponentIR,
    componentName: string,
    nestedComponents: NestedComponentInfo[],
    propTypeOverrides: Map<string, string>,
    spreadSlots: SpreadSlotInfo[]
  ): void {
    const propsTypeName = `${componentName}Props`
    lines.push(`// ${propsTypeName} is the props type for the ${componentName} component.`)
    lines.push(`type ${propsTypeName} struct {`)
    lines.push('\tScopeID string `json:"scopeID"`')
    lines.push('\tBfIsRoot bool `json:"-"`')
    lines.push('\tBfIsChild bool `json:"-"`')
    // (#1249) Slot identity for child scopes: host scope id + slot id.
    // Emitted as bf-h / bf-m HTML attributes by `bfHydrationAttrs`.
    lines.push('\tBfParent string `json:"-"`')
    lines.push('\tBfMount string `json:"-"`')

    // Add Scripts field for dynamic script collection
    lines.push('\tScripts *bf.ScriptCollector `json:"-"`')

    // Collect nested component array field names to skip from propsParams
    const nestedArrayFields = new Set(nestedComponents.map(n => `${n.name}s`))

    // Track emitted prop field names to avoid duplicate fields when signal name matches prop name
    const propFieldNames = new Set<string>()

    for (const param of ir.metadata.propsParams) {
      const fieldName = this.capitalizeFieldName(param.name)
      // Skip if this field will be replaced by a typed array for nested components
      if (nestedArrayFields.has(fieldName)) continue
      const goType = propTypeOverrides.get(param.name) ?? this.typeInfoToGo(param.type, param.defaultValue)
      const jsonTag = this.toJsonTag(param.name)
      lines.push(`\t${fieldName} ${goType} \`json:"${jsonTag}"\``)
      propFieldNames.add(fieldName)
    }

    // Find signal types by looking at their initial values
    const propsParamMap = new Map(ir.metadata.propsParams.map(p => [p.name, p]))

    for (const signal of ir.metadata.signals) {
      const fieldName = this.capitalizeFieldName(signal.getter)
      // Skip if a prop field with the same name was already emitted
      if (propFieldNames.has(fieldName)) continue
      const jsonTag = this.toJsonTag(signal.getter)
      // Infer type from initial value or referenced prop's type
      let goType: string
      let referencedProp = propsParamMap.get(signal.initialValue)
      if (!referencedProp) {
        const propName = this.extractPropNameFromInitialValue(signal.initialValue)
        if (propName) referencedProp = propsParamMap.get(propName)
      }
      if (referencedProp) {
        const propGoType = this.typeInfoToGo(referencedProp.type, referencedProp.defaultValue)
        const signalGoType = this.typeInfoToGo(signal.type, signal.initialValue)
        // The "prop type wins" heuristic exists for cases where the
        // signal infer is less specific than the prop (e.g. the signal
        // is `createSignal(props.todos)` and we want `[]Todo`, not
        // `interface{}`). It actively HURTS when the initial expression
        // transforms the prop type — `createSignal((props.todos ?? []).length)`
        // is a `number`, not the prop's `[]Todo`. Let a specific signal
        // type override a less-specific prop type in either direction
        // so `.length` / `.some()` / `.every()` chains land on their
        // actual Go type (#1442 echo TodoApp repro).
        if (propGoType.includes('interface{}')) {
          goType = signalGoType
        } else if (
          !signalGoType.includes('interface{}') &&
          signalGoType !== propGoType
        ) {
          // Both sides resolved, but they disagree — trust the signal's
          // inferred shape (it's based on the literal expression text,
          // including the trailing accessor).
          goType = signalGoType
        } else {
          goType = propGoType
        }
      } else {
        goType = this.typeInfoToGo(signal.type, signal.initialValue)
      }
      lines.push(`\t${fieldName} ${goType} \`json:"${jsonTag}"\``)
    }

    // Add memos to Props (they are computed values needed for SSR)
    for (const memo of ir.metadata.memos) {
      const fieldName = this.capitalizeFieldName(memo.name)
      const jsonTag = this.toJsonTag(memo.name)
      // Memos that depend on number signals are usually numbers
      const goType = this.inferMemoType(memo, ir.metadata.signals, propsParamMap)
      lines.push(`\t${fieldName} ${goType} \`json:"${jsonTag}"\``)
    }

    // Add array fields for nested components (for template rendering)
    for (const nested of nestedComponents) {
      if (nested.isDynamic && !nested.isPropDerived) {
        // Dynamic signal array loops: template-only, not in JSON
        lines.push(`\t${nested.name}s []${nested.name}Props \`json:"-"\``)
      } else {
        // Static arrays and prop-derived dynamic arrays: include in JSON
        // so the client can hydrate via mapArray or forEach
        const jsonTag = this.toJsonTag(`${nested.name.charAt(0).toLowerCase()}${nested.name.slice(1)}s`)
        lines.push(`\t${nested.name}s []${nested.name}Props \`json:"${jsonTag}"\``)
      }
    }

    // Add fields for static child component instances
    const staticChildren = this.collectStaticChildInstances(ir.root)
    for (const child of staticChildren) {
      lines.push(`\t${child.fieldName} ${child.name}Props \`json:"-"\``)
    }

    // (#1407) Add fields for top-level JSX intrinsic-element spreads.
    // Each non-loop spread gets a `Spread_<slotId> map[string]any`
    // field; the Go template references it as `.Spread_<slotId>` via
    // `{{bf_spread_attrs}}`. Loop-internal spreads emit inline and
    // don't appear here. The slot list is computed once in
    // `generateTypes` and threaded through both struct/init emitters
    // so the IR walk runs exactly once per `generate()` call (#1411
    // review).
    for (const slot of spreadSlots) {
      const jsonTag = this.toJsonTag(slot.slotId)
      lines.push(`\t${slot.slotId} map[string]any \`json:"${jsonTag}"\``)
    }

    lines.push('}')
    lines.push('')
  }

  /**
   * Generate NewXxxProps function
   */
  private generateNewPropsFunction(
    lines: string[],
    ir: ComponentIR,
    componentName: string,
    nestedComponents: NestedComponentInfo[],
    spreadSlots: SpreadSlotInfo[]
  ): void {
    const inputTypeName = `${componentName}Input`
    const propsTypeName = `${componentName}Props`

    // Surface the "dynamic loop slices stay empty until the handler
    // populates them" rule as a doc comment above the generator, with
    // a concrete example per child component. Without it the contract
    // is implicit: `TodoAppProps` carries a `TodoItems []TodoItemProps`
    // field, the SSR template iterates over it, but
    // `NewTodoAppProps(TodoAppInput{Initial: ...})` returns it empty
    // and the page renders a blank list (#1442 echo TodoApp repro).
    const signalDynamicNested = nestedComponents.filter(n => n.isDynamic && !n.isPropDerived)
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
    lines.push(`func New${componentName}Props(in ${inputTypeName}) ${propsTypeName} {`)
    lines.push('\tscopeID := in.ScopeID')
    lines.push('\tif scopeID == "" {')
    lines.push(`\t\tscopeID = "${componentName}_" + randomID(6)`)
    lines.push('\t}')
    lines.push('')

    // Static + prop-derived nested components: auto-populate from input.
    // Signal-backed dynamic arrays are set manually by the handler.
    const staticNested = nestedComponents.filter(n => !n.isDynamic || n.isPropDerived)

    // Handle nested components
    if (staticNested.length > 0) {
      for (const nested of staticNested) {
        const varName = `${nested.name.charAt(0).toLowerCase()}${nested.name.slice(1)}s`
        lines.push(`\t${varName} := make([]${nested.name}Props, len(in.${nested.name}s))`)
        lines.push(`\tfor i, item := range in.${nested.name}s {`)
        lines.push(`\t\t${varName}[i] = New${nested.name}Props(item)`)
        // (#1249) Stamp slot identity on each child item so bf-h / bf-m
        // mark it as a slot-attached child of this scope.
        lines.push(`\t\t${varName}[i].BfParent = scopeID`)
        lines.push(`\t\t${varName}[i].BfMount = "${nested.slotId}"`)
        lines.push('\t}')
        lines.push('')
      }
    }

    // (#1423) Collect signal-time prop fallbacks: when a signal is
    // initialized via `createSignal(props.X ?? N)`, hoist `N` as a
    // local variable so the signal, any memo derived from it, and the
    // prop field itself all derive from the same fallback-applied
    // value. Mirrors the Mojo adapter's `ssrDefaults` consumption
    // (#1419) — Go's primitive zero values can't distinguish an
    // explicit `Initial: 0` from an omitted field, so the substitution
    // also fires when the caller passes the type's zero value.
    const propFallbackVars = this.collectPropFallbackVars(ir)
    for (const [, info] of propFallbackVars) {
      lines.push(`\t${info.varName} := in.${info.fieldName}`)
      lines.push(`\tif ${info.varName} == ${info.zeroLiteral} {`)
      lines.push(`\t\t${info.varName} = ${info.goFallback}`)
      lines.push(`\t}`)
    }
    if (propFallbackVars.size > 0) lines.push('')

    lines.push(`\treturn ${propsTypeName}{`)
    lines.push('\t\tScopeID: scopeID,')
    // (#1249) Forward host context for when *this* component is itself a
    // slot-attached child of an outer page/component.
    lines.push('\t\tBfParent: in.BfParent,')
    lines.push('\t\tBfMount: in.BfMount,')

    // Collect nested component array field names
    const nestedArrayFields = new Set(nestedComponents.map(n => `${n.name}s`))

    // Add props params, tracking field names to skip duplicate signal assignments.
    // When the JSX function declared a default (e.g. `variant = 'default'`),
    // bake that fallback into the generated assignment so a Go zero value
    // doesn't silently shadow the JSX-side default. The same logic
    // applies for signal-side fallbacks (`createSignal(props.X ?? N)`)
    // via the hoisted variable from `propFallbackVars` (#1423).
    const propFieldNames = new Set<string>()
    for (const param of ir.metadata.propsParams) {
      const fieldName = this.capitalizeFieldName(param.name)
      if (nestedArrayFields.has(fieldName)) continue
      const hoisted = propFallbackVars.get(param.name)
      if (hoisted) {
        lines.push(`\t\t${fieldName}: ${hoisted.varName},`)
      } else {
        const fallback = this.goPropDefault(param.defaultValue)
        if (fallback !== null) {
          lines.push(`\t\t${fieldName}: ${this.applyGoFallback(`in.${fieldName}`, fallback)},`)
        } else {
          lines.push(`\t\t${fieldName}: in.${fieldName},`)
        }
      }
      propFieldNames.add(fieldName)
    }

    // Add signal initial values (skip if prop field with same name already emitted)
    for (const signal of ir.metadata.signals) {
      const fieldName = this.capitalizeFieldName(signal.getter)
      if (propFieldNames.has(fieldName)) continue
      // (#1423) If this signal's initial value is `props.X ?? N` and we
      // hoisted a fallback variable for `X`, reuse the hoisted variable
      // so the signal and any memo computation share the same value.
      const fallbackMatch = this.extractPropFallback(signal.initialValue)
      const hoisted = fallbackMatch ? propFallbackVars.get(fallbackMatch.propName) : undefined
      if (hoisted) {
        lines.push(`\t\t${fieldName}: ${hoisted.varName},`)
      } else {
        const initialValue = this.convertInitialValue(signal.initialValue, signal.type, ir.metadata.propsParams)
        lines.push(`\t\t${fieldName}: ${initialValue},`)
      }
    }

    // Add nested component arrays (static only; dynamic ones are set by the handler)
    for (const nested of staticNested) {
      const varName = `${nested.name.charAt(0).toLowerCase()}${nested.name.slice(1)}s`
      lines.push(`\t\t${nested.name}s: ${varName},`)
    }

    // Add memo initial values (computed from signal initial values)
    for (const memo of ir.metadata.memos) {
      const fieldName = this.capitalizeFieldName(memo.name)
      const memoValue = this.computeMemoInitialValue(memo, ir.metadata.signals, ir.metadata.propsParams, propFallbackVars)
      lines.push(`\t\t${fieldName}: ${memoValue},`)
    }

    // Add static child component instances
    const staticChildren = this.collectStaticChildInstances(ir.root)
    for (const child of staticChildren) {
      lines.push(`\t\t${child.fieldName}: New${child.name}Props(${child.name}Input{`)
      lines.push(`\t\t\tScopeID: scopeID + "_${child.slotId}",`)
      // (#1249) Slot identity stamps onto the child's Props via its
      // own NewProps (BfParent/BfMount fields).
      lines.push(`\t\t\tBfParent: scopeID,`)
      lines.push(`\t\t\tBfMount: "${child.slotId}",`)
      // Add prop values
      for (const prop of child.props) {
        switch (prop.value.kind) {
          case 'literal':
            lines.push(`\t\t\t${this.capitalizeFieldName(prop.name)}: ${this.goLiteral(prop.value.value)},`)
            break
          case 'boolean-shorthand':
          case 'boolean-attr':
            lines.push(`\t\t\t${this.capitalizeFieldName(prop.name)}: true,`)
            break
          case 'expression':
          case 'spread':
          case 'template': {
            // Prefer the parsed template parts when present — `expression`
            // carries them in `parts` after the IR producer's
            // `template → expression` collapse for component props, and
            // `template` exposes them directly. This handles the
            // shadcn-style variant lookup (`record-index-lookup-via-child-prop`)
            // which `resolveDynamicPropValue` can't represent.
            const parts =
              prop.value.kind === 'template' || prop.value.kind === 'expression'
                ? prop.value.parts
                : undefined
            if (parts) {
              const goExpr = this.templatePartsToGoCode(parts, ir.metadata.propsParams)
              if (goExpr !== null) {
                // Parts path succeeded — emit and move on.
                lines.push(`\t\t\t${this.capitalizeFieldName(prop.name)}: ${goExpr},`)
                break
              }
              // Parts exist but templatePartsToGoCode opted out (unsupported
              // part kind). Fall through to the bare-expression path below.
            }

            // Bare-expression fallback. `template` kind has no raw expr string
            // (its JS was discarded in favour of the parts structure), so skip.
            const exprText = prop.value.kind === 'template' ? '' : prop.value.expr
            if (!exprText) break
            const resolvedValue = this.resolveDynamicPropValue(
              exprText,
              ir.metadata.signals,
              ir.metadata.memos,
              ir.metadata.propsParams
            )
            if (resolvedValue !== null) {
              lines.push(`\t\t\t${this.capitalizeFieldName(prop.name)}: ${resolvedValue},`)
            }
            break
          }
          case 'jsx-children':
            // Handled separately via `child.childrenText` / `child.childrenHtml` below.
            break
        }
      }
      // Pass through JSX children as the child slot's `Children` input.
      // Two paths:
      //   1. Plain text (`<Button>+1</Button>`) → quote with JSON.stringify
      //      to dodge `goLiteral`'s number-detection branch (which would
      //      silently emit `-1` as an int for `<Button>-1</Button>`).
      //   2. Mixed/HTML (`<Card><span>x</span></Card>`) → wrap in
      //      `template.HTML(...)` so html/template skips re-escaping the
      //      angle brackets at render time. The fragment is rendered up
      //      front via the adapter so any nested template directives are
      //      already in their final Go-template form.
      if (child.childrenText !== null) {
        lines.push(`\t\t\tChildren: ${JSON.stringify(child.childrenText)},`)
      } else if (child.childrenHtml !== null) {
        this.usesHtmlTemplate = true
        lines.push(`\t\t\tChildren: template.HTML(${JSON.stringify(child.childrenHtml)}),`)
      }
      lines.push(`\t\t}),`)
    }

    // (#1407) Initialise spread bag fields. Unsupported shapes (e.g.
    // signal getters whose initialValue isn't a plain object literal,
    // identifiers that don't resolve to a propsParam) fall through to
    // BF101 below — the field is still declared on the struct so the
    // template compiles even when the initializer is missing.
    // `spreadSlots` is computed once in `generateTypes` and threaded
    // through to avoid a second IR walk (#1411 review).
    for (const slot of spreadSlots) {
      const goExpr = this.buildSpreadInitializer(slot.expr, ir)
      if (goExpr) {
        lines.push(`\t\t${slot.slotId}: ${goExpr},`)
      } else {
        this.errors.push({
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

    lines.push('\t}')
    lines.push('}')
  }

  /**
   * Convert field name to JSON tag (camelCase)
   */
  private toJsonTag(name: string): string {
    return name.charAt(0).toLowerCase() + name.slice(1)
  }

  /**
   * Find all nested components (loops with childComponent).
   * Returns extended info that includes whether the component comes from a dynamic (signal) array loop.
   */
  private findNestedComponents(node: IRNode): NestedComponentInfo[] {
    const result: NestedComponentInfo[] = []
    this.collectNestedComponents(node, result)
    return result
  }

  private collectNestedComponents(node: IRNode, result: NestedComponentInfo[]): void {
    if (node.type === 'loop') {
      const loop = node as IRLoop
      if (loop.childComponent) {
        // Check for duplicates
        if (!result.some(c => c.name === loop.childComponent!.name)) {
          result.push({
            ...loop.childComponent,
            isDynamic: !loop.isStaticArray,
            isPropDerived: !!loop.isPropDerivedArray,
          })
        }
      }
      for (const child of loop.children) {
        this.collectNestedComponents(child, result)
      }
    } else if (node.type === 'element') {
      const element = node as IRElement
      for (const child of element.children) {
        this.collectNestedComponents(child, result)
      }
    } else if (node.type === 'fragment') {
      const fragment = node as IRFragment
      for (const child of fragment.children) {
        this.collectNestedComponents(child, result)
      }
    } else if (node.type === 'conditional') {
      const cond = node as IRConditional
      this.collectNestedComponents(cond.whenTrue, result)
      if (cond.whenFalse) {
        this.collectNestedComponents(cond.whenFalse, result)
      }
    }
  }

  /**
   * Collect all static child component instances from the IR tree.
   * Excludes components inside loops (which are handled by nestedComponents).
   *
   * Each instance is identified by:
   * - name: Component name (e.g., "ReactiveChild")
   * - slotId: Unique slot ID (e.g., "slot_6")
   * - props: Component props
   * - fieldName: Go field name (e.g., "ReactiveChildSlot6")
   */
  private collectStaticChildInstances(node: IRNode): Array<StaticChildInstance> {
    const result: StaticChildInstance[] = []
    this.collectStaticChildInstancesRecursive(node, result, false)
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
   * Render JSX children to a Go-template-ready HTML fragment when
   * children are non-text but produce purely-static HTML (no Go
   * template actions). Returns null when:
   *   - children are absent or text-only (handled by extractTextChildren), or
   *   - the rendered fragment contains any `{{...}}` action — passing
   *     such a fragment through `template.HTML` and the parent's
   *     `{{.Children}}` would output the actions verbatim instead of
   *     evaluating them, which is worse than the existing
   *     "drop children" fallback. Dynamic / component-bearing children
   *     stay on the drop path until a re-evaluation hook lands.
   */
  private extractHtmlChildren(children: IRNode[]): string | null {
    if (children.length === 0) return null
    if (children.every(c => c.type === 'text')) return null
    const html = this.renderChildren(children)
    if (html.includes('{{')) return null
    return html
  }

  private collectStaticChildInstancesRecursive(
    node: IRNode,
    result: StaticChildInstance[],
    inLoop: boolean
  ): void {
    if (node.type === 'component') {
      const comp = node as IRComponent
      // Skip Portal components (handled separately via PortalCollector)
      // Skip components inside loops (handled by nestedComponents)
      if (comp.name !== 'Portal' && !inLoop && comp.slotId) {
        const suffix = slotIdToFieldSuffix(comp.slotId)
        result.push({
          name: comp.name,
          slotId: comp.slotId,
          props: comp.props,
          fieldName: `${comp.name}${suffix}`,
          childrenText: this.extractTextChildren(comp.children),
          childrenHtml: this.extractHtmlChildren(comp.children),
        })
      }
      // Recurse into Portal's children to find nested components
      if (comp.name === 'Portal' && comp.children) {
        for (const child of comp.children) {
          this.collectStaticChildInstancesRecursive(child, result, inLoop)
        }
      }
    } else if (node.type === 'loop') {
      const loop = node as IRLoop
      // Mark children as inside loop
      for (const child of loop.children) {
        this.collectStaticChildInstancesRecursive(child, result, true)
      }
    } else if (node.type === 'element') {
      const element = node as IRElement
      for (const child of element.children) {
        this.collectStaticChildInstancesRecursive(child, result, inLoop)
      }
    } else if (node.type === 'fragment') {
      const fragment = node as IRFragment
      for (const child of fragment.children) {
        this.collectStaticChildInstancesRecursive(child, result, inLoop)
      }
    } else if (node.type === 'conditional') {
      const cond = node as IRConditional
      this.collectStaticChildInstancesRecursive(cond.whenTrue, result, inLoop)
      if (cond.whenFalse) {
        this.collectStaticChildInstancesRecursive(cond.whenFalse, result, inLoop)
      }
    } else if (node.type === 'provider') {
      // Provider is a transparent wrapper at the SSR layer — context
      // propagation is purely a client-runtime concern. Recurse into
      // its children so any static <Child/> nested under <Ctx.Provider>
      // still gets a slot field generated on the parent's props type.
      const p = node as IRProvider
      for (const child of p.children) {
        this.collectStaticChildInstancesRecursive(child, result, inLoop)
      }
    } else if (node.type === 'async') {
      // Async fallback + children render server-side via the OOS
      // protocol; static child components inside them still need slot
      // fields on the parent struct.
      const a = node as IRAsync
      this.collectStaticChildInstancesRecursive(a.fallback, result, inLoop)
      for (const child of a.children) {
        this.collectStaticChildInstancesRecursive(child, result, inLoop)
      }
    }
  }

  /**
   * Collect top-level (non-loop) JSX intrinsic-element spread slots
   * from the IR (#1407). Loop-internal spreads are skipped — they
   * emit the bag inline via the loop's iteration variable in
   * `elementAttrEmitter.emitSpread`, so they don't need a Props
   * struct field.
   *
   * Walks the IR tree, descending into elements, fragments,
   * conditionals, providers, async, and components, but stopping at
   * loop bodies. Each `IRElement.attrs[i].value` of kind `'spread'`
   * that has a `slotId` becomes one `SpreadSlotInfo` entry.
   */
  private collectSpreadSlots(node: IRNode): SpreadSlotInfo[] {
    const result: SpreadSlotInfo[] = []
    this.collectSpreadSlotsRecursive(node, result)
    return result
  }

  /**
   * Decide how a spread bag should be plumbed onto the Input/Props
   * structs (#1407 follow-up). A bare-identifier spread that
   * matches the component's `restPropsName` is open-ended (Go's
   * static typing can't enumerate the keys), so the caller must
   * supply the bag via an Input-side `map[string]any` field. Every
   * other shape — signal getter, `propsObjectName`, plain
   * propsParam, object literal — can be constructed inline in
   * `NewXxxProps` from compile-time-known data.
   *
   * Reads `this.restPropsName` (stashed at `generate()` entry)
   * rather than receiving the IR per-call — matches the existing
   * `this.propsObjectName` / `this.componentName` storage pattern.
   */
  private classifySpreadBagSource(spreadExpr: string): 'input-bag' | 'inline' {
    const trimmed = spreadExpr.trim()
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)
      && this.restPropsName === trimmed) {
      return 'input-bag'
    }
    return 'inline'
  }

  private collectSpreadSlotsRecursive(node: IRNode, result: SpreadSlotInfo[]): void {
    if (node.type === 'element') {
      const element = node as IRElement
      for (const attr of element.attrs) {
        if (attr.value.kind !== 'spread') continue
        if (!attr.value.slotId) continue
        result.push({
          slotId: attr.value.slotId,
          expr: attr.value.expr,
          templateExpr: attr.value.templateExpr,
          bagSource: this.classifySpreadBagSource(attr.value.expr),
        })
      }
      for (const child of element.children) {
        this.collectSpreadSlotsRecursive(child, result)
      }
      return
    }
    if (node.type === 'fragment') {
      const fragment = node as IRFragment
      for (const child of fragment.children) {
        this.collectSpreadSlotsRecursive(child, result)
      }
      return
    }
    if (node.type === 'conditional') {
      const cond = node as IRConditional
      this.collectSpreadSlotsRecursive(cond.whenTrue, result)
      if (cond.whenFalse) this.collectSpreadSlotsRecursive(cond.whenFalse, result)
      return
    }
    if (node.type === 'if-statement') {
      const stmt = node as IRIfStatement
      this.collectSpreadSlotsRecursive(stmt.consequent, result)
      if (stmt.alternate) this.collectSpreadSlotsRecursive(stmt.alternate, result)
      return
    }
    if (node.type === 'component') {
      const comp = node as IRComponent
      // `IRComponent.children` are the JSX children passed to *this*
      // component instance at the call site (`<Child>...</Child>`).
      // They are part of the PARENT's IR and evaluate in the parent's
      // render scope, so any spreads inside them belong on the parent's
      // Props struct. The child component's own template body is a
      // separate `ComponentIR` with its own `ir.root`, compiled in a
      // separate `generate()` pass — it never appears in the parent's
      // IR tree, so the recursion never crosses a component boundary
      // and the per-component `spreadIdCounter` can't collide across
      // unrelated components (#1411 review).
      for (const child of comp.children) {
        this.collectSpreadSlotsRecursive(child, result)
      }
      return
    }
    if (node.type === 'provider') {
      const p = node as IRProvider
      for (const child of p.children) {
        this.collectSpreadSlotsRecursive(child, result)
      }
      return
    }
    if (node.type === 'async') {
      const a = node as IRAsync
      this.collectSpreadSlotsRecursive(a.fallback, result)
      for (const child of a.children) {
        this.collectSpreadSlotsRecursive(child, result)
      }
      return
    }
    // Loops are intentionally not descended — loop-internal spreads
    // emit `{{bf_spread_attrs <go-expr>}}` inline from
    // `elementAttrEmitter.emitSpread` instead of plumbing through a
    // Props struct field.
  }

  /**
   * Parse a JS object-literal source text (the raw string captured
   * for a signal's `initialValue` or a spread expression's argument)
   * into a Go `map[string]any{...}` literal source (#1407).
   *
   * Supports a deliberately conservative subset so the Go output is
   * a 1:1 translation of the JS source: string/number/boolean/null
   * values keyed by identifier or string-literal keys. Returns null
   * for unsupported shapes (nested objects, computed values,
   * function calls, spread elements) — callers fall back to BF101.
   */
  private parseJsObjectLiteralToGoMap(jsText: string): string | null {
    const sf = ts.createSourceFile('inline.ts', `(${jsText})`, ts.ScriptTarget.Latest, true)
    if (sf.statements.length !== 1) return null
    const stmt = sf.statements[0]
    if (!ts.isExpressionStatement(stmt)) return null
    let expr: ts.Expression = stmt.expression
    while (ts.isParenthesizedExpression(expr)) expr = expr.expression
    if (!ts.isObjectLiteralExpression(expr)) return null
    const entries: string[] = []
    for (const prop of expr.properties) {
      if (!ts.isPropertyAssignment(prop)) return null
      let key: string
      if (ts.isIdentifier(prop.name)) {
        key = prop.name.text
      } else if (ts.isStringLiteral(prop.name) || ts.isNoSubstitutionTemplateLiteral(prop.name)) {
        key = prop.name.text
      } else {
        return null
      }
      const val = prop.initializer
      let goVal: string
      if (ts.isStringLiteral(val) || ts.isNoSubstitutionTemplateLiteral(val)) {
        goVal = JSON.stringify(val.text)
      } else if (ts.isNumericLiteral(val)) {
        goVal = val.text
      } else if (
        // TypeScript parses `-1` and `+1` as `PrefixUnaryExpression`
        // rather than `NumericLiteral` — accept both signs explicitly
        // so a bag like `{count: -1}` doesn't collapse to BF101
        // (#1411 review).
        ts.isPrefixUnaryExpression(val)
        && (val.operator === ts.SyntaxKind.MinusToken || val.operator === ts.SyntaxKind.PlusToken)
        && ts.isNumericLiteral(val.operand)
      ) {
        const sign = val.operator === ts.SyntaxKind.MinusToken ? '-' : ''
        goVal = `${sign}${val.operand.text}`
      } else if (val.kind === ts.SyntaxKind.TrueKeyword) {
        goVal = 'true'
      } else if (val.kind === ts.SyntaxKind.FalseKeyword) {
        goVal = 'false'
      } else if (val.kind === ts.SyntaxKind.NullKeyword) {
        goVal = 'nil'
      } else {
        return null
      }
      entries.push(`${JSON.stringify(key)}: ${goVal}`)
    }
    return `map[string]any{${entries.join(', ')}}`
  }

  /**
   * Build a Go expression for a JSX spread bag's initial value, to
   * be placed inside `NewXxxProps`'s return literal (#1407).
   *
   * Supported shapes:
   *   - Signal-getter call (e.g. `attrs()`): look up the signal,
   *     parse its `initialValue` as a JS object literal, and emit a
   *     Go `map[string]any{...}` literal.
   *   - Bare identifier matching a destructured `propsParam` (e.g.
   *     `function({ extras }: P) { <el {...extras}/> }`): emit
   *     `in.<FieldName>` — works when the prop's Go type is a map
   *     type the bag is assignable to.
   *   - Bare identifier matching `propsObjectName` (SolidJS-style
   *     `function(props: P) { <el {...props}/> }`): enumerate the
   *     analyzer-extracted `propsParams` into an inline
   *     `map[string]any{...}` literal so each typed Input field
   *     surfaces as a bag key (#1407 follow-up).
   *   - Bare identifier matching `restPropsName` (the destructured-
   *     rest pattern `function({a, ...rest}: P) { <el {...rest}/> }`):
   *     emit `in.<slotId>` against the `map[string]any` Input field
   *     that `generateInputStruct` adds for `input-bag` slots. The
   *     caller (parent component or test harness) populates the
   *     bag with the open-ended rest values (#1407 follow-up).
   *
   * Returns null for unsupported shapes so the caller can raise a
   * narrowed BF101 with the offending expression.
   */
  private buildSpreadInitializer(
    spreadExpr: string,
    ir: ComponentIR,
  ): string | null {
    const trimmed = spreadExpr.trim()
    // Signal-getter call: `attrs()` — pluck the signal's initialValue
    // and translate the JS object literal to a Go map literal.
    const callMatch = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*\(\s*\)$/.exec(trimmed)
    if (callMatch) {
      const getterName = callMatch[1]
      const signal = ir.metadata.signals.find(s => s.getter === getterName)
      if (signal && signal.initialValue) {
        const goMap = this.parseJsObjectLiteralToGoMap(signal.initialValue)
        if (goMap) return goMap
      }
      return null
    }
    // Bare-identifier paths.
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)) {
      // 1. Destructured-from-props parameter: `function({ extras }: P)`
      //    → spread `{...extras}` resolves to `in.Extras`.
      const param = ir.metadata.propsParams.find(p => p.name === trimmed)
      if (param) {
        return `in.${this.capitalizeFieldName(param.name)}`
      }
      // 2. SolidJS-style props object: `function(props: P)` → spread
      //    `{...props}` enumerates all analyzer-extracted propsParams
      //    into a `map[string]any` literal. Every Input field becomes
      //    a bag key. When `propsParams` is empty (analyzer couldn't
      //    enumerate the type — e.g. an unresolved interface
      //    `extends` chain), the literal is `map[string]any{}`. SSR
      //    then renders no spread attrs; the CSR `applyRestAttrs`
      //    hydrate path still applies them. Strictly worse than a
      //    full enumeration, but strictly better than BF101 blocking
      //    the build.
      if (ir.metadata.propsObjectName === trimmed) {
        const entries = ir.metadata.propsParams.map(p =>
          `${JSON.stringify(p.name)}: in.${this.capitalizeFieldName(p.name)}`,
        )
        return `map[string]any{${entries.join(', ')}}`
      }
      // 3. Destructured-rest identifier:
      //    `function({a, ...rest}: P) { <el {...rest}/> }`. The
      //    rest's key set is open-ended (Go can't enumerate it
      //    statically when the analyzer's `restPropsExpandedKeys`
      //    isn't populated), so `generateInputStruct` added an
      //    Input field named after the rest binding itself
      //    (`rest` → `Rest`) so callers can write
      //    `XxxInput{Rest: ...}` using the same identifier they
      //    saw in source. Forward it through.
      if (ir.metadata.restPropsName === trimmed) {
        return `in.${this.capitalizeFieldName(trimmed)}`
      }
    }
    return null
  }

  /**
   * Convert JavaScript initial value to Go value for NewXxxProps function.
   * References to props params are converted to in.FieldName format.
   */
  private convertInitialValue(value: string, typeInfo: TypeInfo, propsParams?: { name: string }[]): string {
    // Check if it's a simple identifier (props param reference)
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
      // Check if this matches a props param
      if (propsParams?.some(p => p.name === value)) {
        return `in.${this.capitalizeFieldName(value)}`
      }
    }

    // Check for props.xxx pattern (e.g., "props.initial ?? 0")
    const propName = this.extractPropNameFromInitialValue(value)
    if (propName && propsParams?.some(p => p.name === propName)) {
      return `in.${this.capitalizeFieldName(propName)}`
    }

    if (typeInfo.kind === 'primitive') {
      if (typeInfo.primitive === 'boolean') {
        return value === 'true' ? 'true' : 'false'
      }
      if (typeInfo.primitive === 'number') {
        // Check if it's a simple number
        if (/^\d+$/.test(value)) return value
        if (/^\d+\.\d+$/.test(value)) return value
        return '0'
      }
      if (typeInfo.primitive === 'string') {
        // Remove quotes if present and add Go string syntax
        if (value.startsWith("'") || value.endsWith("'")) {
          return value.replace(/'/g, '"')
        }
        if (value.startsWith('"') && value.endsWith('"')) {
          return value
        }
        return '""'
      }
    }

    // For arrays, use nil for complex JS expressions
    if (typeInfo.kind === 'array') {
      // Simple array literal or empty
      if (value === '[]' || value === 'null' || value === 'undefined') {
        return 'nil'
      }
      // Complex expression - use nil as placeholder
      return 'nil'
    }

    // String alias (e.g., Filter = string) — return string value instead of nil
    if (typeInfo.kind === 'interface' && typeInfo.raw) {
      const aliasBase = this.localTypeAliases.get(typeInfo.raw)
      if (aliasBase === 'string') {
        if (value.startsWith("'") || value.startsWith('"')) {
          return value.replace(/'/g, '"')
        }
        return '""'
      }
    }

    // Default for complex expressions
    return 'nil'
  }

  /**
   * Convert TypeInfo to Go type string.
   * If type is unknown, tries to infer from defaultValue.
   */
  private typeInfoToGo(typeInfo: TypeInfo, defaultValue?: string): string {
    switch (typeInfo.kind) {
      case 'primitive':
        switch (typeInfo.primitive) {
          case 'string':
            return 'string'
          case 'number':
            return 'int'
          case 'boolean':
            return 'bool'
          default:
            return 'interface{}'
        }
      case 'array':
        if (typeInfo.elementType) {
          return `[]${this.typeInfoToGo(typeInfo.elementType)}`
        }
        return '[]interface{}'
      case 'object':
        return 'map[string]interface{}'
      case 'interface':
        // Check if raw type name matches a locally-defined type
        if (typeInfo.raw && this.localTypeNames.has(typeInfo.raw)) {
          return typeInfo.raw
        }
        // Try to parse raw type string as a known pattern (e.g., Array<Todo>)
        if (typeInfo.raw) {
          const resolved = this.tsTypeStringToGo(typeInfo.raw)
          if (resolved !== 'interface{}') return resolved
        }
        return 'interface{}'
      case 'unknown':
        // Try to infer type from default value
        if (defaultValue !== undefined) {
          return this.inferTypeFromValue(defaultValue)
        }
        return 'interface{}'
      default:
        return 'interface{}'
    }
  }

  /**
   * Get signal's initial value as Go code.
   * Handles both literal values (0, true, "str") and props references (initial).
   *
   * (#1423) When the signal references a prop via `props.X ?? N` and
   * the caller hoisted a fallback variable for `X`, return the hoisted
   * variable's name so the memo inherits the signal-time fallback.
   */
  private getSignalInitialValueAsGo(
    initialValue: string,
    propsParams: { name: string }[],
    propFallbackVars: ReadonlyMap<string, PropFallbackVar> = GoTemplateAdapter.EMPTY_PROP_FALLBACK_VARS,
  ): string {
    // Check if it's a props param reference
    if (propsParams.some(p => p.name === initialValue)) {
      const hoisted = propFallbackVars.get(initialValue)
      if (hoisted) return hoisted.varName
      return `in.${this.capitalizeFieldName(initialValue)}`
    }

    // Check for props.xxx pattern (e.g., "props.initial ?? 0")
    const propName = this.extractPropNameFromInitialValue(initialValue)
    if (propName && propsParams.some(p => p.name === propName)) {
      const hoisted = propFallbackVars.get(propName)
      if (hoisted) return hoisted.varName
      return `in.${this.capitalizeFieldName(propName)}`
    }

    // Check if it's a literal value
    // Number literals
    if (/^-?\d+$/.test(initialValue)) {
      return initialValue
    }
    if (/^-?\d+\.\d+$/.test(initialValue)) {
      return initialValue
    }
    // Boolean literals
    if (initialValue === 'true' || initialValue === 'false') {
      return initialValue
    }
    // String literals
    if ((initialValue.startsWith("'") && initialValue.endsWith("'")) ||
        (initialValue.startsWith('"') && initialValue.endsWith('"'))) {
      return initialValue.replace(/'/g, '"')
    }

    // Default: return 0 for unknown
    return '0'
  }

  /**
   * Resolve dynamic prop value (e.g., signal/memo getter calls) to Go initial value.
   * Handles expressions like `count()` → signal's initial value
   */
  /**
   * Convert a template literal's parsed parts into a Go expression of
   * type `string`, evaluated in `NewXxxProps` scope (where destructured
   * prop refs resolve via `in.FieldName`). Returns null when any part
   * is not representable in static Go code so the caller can fall back
   * to `resolveDynamicPropValue` (which handles the simpler shapes).
   *
   * Supported parts:
   *   - `string`: emit as a Go string literal.
   *   - `lookup`: `${MAP[KEY]}` against a `Record<T, string>` literal —
   *     emit an IIFE that switches on the key prop and returns the
   *     matching case (empty when no case matches). The key must be a
   *     bare prop identifier today; other key shapes opt out.
   *
   * `ternary` is intentionally left unsupported — the existing
   * element-attribute path handles it via Go template `{{if}}` syntax,
   * and component-prop-via-ternary cases are rarer and can be added
   * incrementally.
   */
  private templatePartsToGoCode(
    parts: IRTemplatePart[],
    propsParams: { name: string }[]
  ): string | null {
    const segments: string[] = []
    for (const part of parts) {
      if (part.type === 'string') {
        // The IR analyzer already inlined identifier references into the
        // `lookup` part shape. Residual `${ident}` slips in a `string`
        // part only occur when resolution failed (e.g. a destructured
        // prop the analyzer couldn't trace). Emit verbatim for now —
        // the Mojo adapter substitutes these via
        // `substituteJsInterpolationsToPerl`; a Go equivalent would
        // walk the string and emit `in.FieldName` references, but that
        // path is not yet hit by the conformance suite.
        segments.push(JSON.stringify(part.value))
        continue
      }
      if (part.type === 'lookup') {
        const keyExpr = part.key.trim()
        const param = propsParams.find(p => p.name === keyExpr)
        if (!param) return null
        const fieldName = this.capitalizeFieldName(keyExpr)
        const caseEntries = Object.entries(part.cases)
        if (caseEntries.length === 0) {
          segments.push('""')
          continue
        }
        const lines: string[] = []
        lines.push('func() string {')
        lines.push(`\t\t\tk, _ := in.${fieldName}.(string)`)
        lines.push('\t\t\tswitch k {')
        for (const [k, v] of caseEntries) {
          lines.push(`\t\t\tcase ${JSON.stringify(k)}: return ${JSON.stringify(v)}`)
        }
        lines.push('\t\t\t}')
        lines.push('\t\t\treturn ""')
        lines.push('\t\t}()')
        segments.push(lines.join('\n'))
        continue
      }
      // ternary or future part kinds — opt out and let the caller
      // fall back to the bare-expression path.
      return null
    }
    if (segments.length === 0) return '""'
    return segments.join(' + ')
  }

  private resolveDynamicPropValue(
    expr: string,
    signals: { getter: string; setter: string | null; initialValue: string; type: TypeInfo }[],
    memos: { name: string; computation: string; deps: string[] }[],
    propsParams: { name: string }[]
  ): string | null {
    // Match signal/memo getter calls like count(), doubled()
    const getterMatch = expr.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\(\)$/)
    if (getterMatch) {
      const getterName = getterMatch[1]

      // Check if it's a signal
      const signal = signals.find(s => s.getter === getterName)
      if (signal) {
        return this.convertInitialValue(signal.initialValue, signal.type, propsParams)
      }

      // Check if it's a memo
      const memo = memos.find(m => m.name === getterName)
      if (memo) {
        return this.computeMemoInitialValue(memo, signals, propsParams)
      }
    }

    return null
  }

  /**
   * Compute the initial value for a memo based on its computation and signal initial values.
   * Handles simple cases like `() => count() * 2` → `in.Initial * 2`
   * Also handles props.xxx patterns like `() => props.value * 10` → `in.Value * 10`
   *
   * (#1423) When `propFallbackVars` carries a hoisted variable for the
   * referenced prop, substitute it for `in.FieldName` so the memo
   * inherits the signal-time `??` fallback.
   */
  private computeMemoInitialValue(
    memo: { name: string; computation: string; deps: string[] },
    signals: { getter: string; initialValue: string }[],
    propsParams: { name: string; type?: TypeInfo; defaultValue?: string }[],
    propFallbackVars: ReadonlyMap<string, PropFallbackVar> = GoTemplateAdapter.EMPTY_PROP_FALLBACK_VARS,
  ): string {
    const computation = memo.computation
    // Helper to pick the hoisted var (if any) or fall back to `in.X`.
    const propRef = (propName: string): string => {
      const hoisted = propFallbackVars.get(propName)
      if (hoisted) return hoisted.varName
      return `in.${this.capitalizeFieldName(propName)}`
    }

    // Pattern: () => dep() * N or () => dep() + N etc.
    const arithmeticMatch = computation.match(/\(\)\s*=>\s*(\w+)\(\)\s*([*+\-/])\s*(\d+)/)
    if (arithmeticMatch) {
      const [, depName, operator, operand] = arithmeticMatch
      const signal = signals.find(s => s.getter === depName)
      if (signal) {
        // Get the signal's initial value in Go format
        const signalInitial = this.getSignalInitialValueAsGo(signal.initialValue, propsParams, propFallbackVars)
        return `${signalInitial} ${operator} ${operand}`
      }
    }

    // Pattern: () => props.xxx * N (for SolidJS-style props object)
    const propsArithmeticMatch = computation.match(/\(\)\s*=>\s*props\.(\w+)\s*([*+\-/])\s*(\d+)/)
    if (propsArithmeticMatch) {
      const [, propName, operator, operand] = propsArithmeticMatch
      // Check if this prop is in propsParams (passed from parent)
      const param = propsParams.find(p => p.name === propName)
      if (param) {
        const hoisted = propFallbackVars.get(propName)
        if (hoisted) return `${hoisted.varName} ${operator} ${operand}`
        const fieldName = this.capitalizeFieldName(propName)
        // Guard: if the prop resolves to interface{}, use type assertion for arithmetic
        if (param.type) {
          const goType = this.typeInfoToGo(param.type, param.defaultValue)
          if (goType === 'interface{}') return `in.${fieldName}.(int) ${operator} ${operand}`
        }
        return `in.${fieldName} ${operator} ${operand}`
      }
    }

    // Pattern: () => dep() (just return the signal value)
    const simpleMatch = computation.match(/\(\)\s*=>\s*(\w+)\(\)$/)
    if (simpleMatch) {
      const [, depName] = simpleMatch
      const signal = signals.find(s => s.getter === depName)
      if (signal) {
        return this.getSignalInitialValueAsGo(signal.initialValue, propsParams, propFallbackVars)
      }
    }

    // Pattern: () => props.xxx (just return the prop value)
    const propsSimpleMatch = computation.match(/\(\)\s*=>\s*props\.(\w+)$/)
    if (propsSimpleMatch) {
      const [, propName] = propsSimpleMatch
      const param = propsParams.find(p => p.name === propName)
      if (param) {
        return propRef(propName)
      }
    }

    // Pattern: () => varName * N (for destructured props like { value })
    const varArithmeticMatch = computation.match(/\(\)\s*=>\s*(\w+)\s*([*+\-/])\s*(\d+)/)
    if (varArithmeticMatch) {
      const [, varName, operator, operand] = varArithmeticMatch
      // Check if this is a destructured prop (not a signal getter)
      const param = propsParams.find(p => p.name === varName)
      if (param) {
        const fieldName = this.capitalizeFieldName(varName)
        // Guard: if the prop resolves to interface{}, use type assertion for arithmetic
        if (param.type) {
          const goType = this.typeInfoToGo(param.type, param.defaultValue)
          if (goType === 'interface{}') return `in.${fieldName}.(int) ${operator} ${operand}`
        }
        return `in.${fieldName} ${operator} ${operand}`
      }
    }

    // Pattern: () => varName (just return the prop value for destructured props)
    const varSimpleMatch = computation.match(/\(\)\s*=>\s*(\w+)$/)
    if (varSimpleMatch) {
      const [, varName] = varSimpleMatch
      const param = propsParams.find(p => p.name === varName)
      if (param) {
        return `in.${this.capitalizeFieldName(varName)}`
      }
    }

    // Default: return 0 for unknown computations
    return '0'
  }

  /**
   * Infer the Go type for a memo based on its computation and dependencies.
   */
  private inferMemoType(
    memo: { name: string; computation: string; type: TypeInfo; deps: string[] },
    signals: { getter: string; initialValue: string; type: TypeInfo }[],
    propsParamMap: Map<string, { name: string; type: TypeInfo; defaultValue?: string }>
  ): string {
    // Check if computation involves multiplication (*) - likely number
    if (memo.computation.includes('*') || memo.computation.includes('/') ||
        memo.computation.includes('+') || memo.computation.includes('-')) {
      // Check if deps are number-typed signals
      for (const dep of memo.deps) {
        const signal = signals.find(s => s.getter === dep)
        if (signal) {
          let referencedProp = propsParamMap.get(signal.initialValue)
          if (!referencedProp) {
            const propName = this.extractPropNameFromInitialValue(signal.initialValue)
            if (propName) referencedProp = propsParamMap.get(propName)
          }
          if (referencedProp) {
            const propType = this.typeInfoToGo(referencedProp.type, referencedProp.defaultValue)
            if (propType === 'int' || propType === 'float64') {
              return 'int'
            }
          }
          // Check signal's own initial value
          const signalType = this.typeInfoToGo(signal.type, signal.initialValue)
          if (signalType === 'int' || signalType === 'float64') {
            return 'int'
          }
        }
      }
    }

    // Default to the memo's declared type
    return this.typeInfoToGo(memo.type)
  }

  /**
   * Infer Go type from a JavaScript value literal.
   */
  private inferTypeFromValue(value: string): string {
    // Boolean literals
    if (value === 'true' || value === 'false') return 'bool'
    // Number literals (int)
    if (/^-?\d+$/.test(value)) return 'int'
    // Number literals (float)
    if (/^-?\d+\.\d+$/.test(value)) return 'float64'
    // String literals
    if ((value.startsWith("'") && value.endsWith("'")) ||
        (value.startsWith('"') && value.endsWith('"'))) {
      return 'string'
    }
    // Empty string
    if (value === '""' || value === "''") return 'string'
    // Array literals
    if (value.startsWith('[')) return '[]interface{}'
    // Default
    return 'interface{}'
  }

  /**
   * (#1423) Hoisted-variable record for a prop with a signal-time
   * `??` fallback. The same record is referenced from the prop field
   * loop, the signal field loop, and the memo computation path.
   */
  private static EMPTY_PROP_FALLBACK_VARS: ReadonlyMap<string, PropFallbackVar> = new Map()

  /**
   * (#1423) Walk signals to collect prop fallbacks. Skips props that
   * already have a destructure-side default (`{ X = N }`) or signals
   * whose fallback resolves to the type's Go zero value (no-op).
   */
  private collectPropFallbackVars(ir: ComponentIR): Map<string, PropFallbackVar> {
    const result = new Map<string, PropFallbackVar>()
    const localTaken = new Set(['scopeID'])
    for (const nested of this.findNestedComponents(ir.root)) {
      localTaken.add(`${nested.name.charAt(0).toLowerCase()}${nested.name.slice(1)}s`)
    }

    for (const signal of ir.metadata.signals) {
      const match = this.extractPropFallback(signal.initialValue)
      if (!match) continue
      if (result.has(match.propName)) continue
      const param = ir.metadata.propsParams.find(p => p.name === match.propName)
      if (!param) continue
      // A destructure default already wins via applyGoFallback below.
      if (this.goPropDefault(param.defaultValue) !== null) continue
      const fieldName = this.capitalizeFieldName(match.propName)
      // Pick the zero literal based on the fallback's literal shape.
      // Bool fallbacks (`?? true`) hoist against the `false` zero —
      // matches the same Go-zero conflation the int / string cases
      // accept: caller can't distinguish "explicit false" from
      // "unset", but for SSR-time defaults that's the documented
      // trade-off (#1423 Option B).
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
      // (`?? 0`, `?? ''`, `?? false`, `?? 0.0`). Compare against the
      // computed zeroLiteral so spelling variants like `0.0` collapse
      // to the same skip as `0`.
      if (match.goFallback === zeroLiteral) continue
      if (zeroLiteral === '0' && Number(match.goFallback) === 0) continue
      // The JSX-side identifier is the natural local name.
      // Suffix with `_` if it collides with a Go keyword or a local we
      // already emit.
      let varName = match.propName
      while (localTaken.has(varName) || GoTemplateAdapter.GO_KEYWORDS.has(varName)) {
        varName += '_'
      }
      localTaken.add(varName)
      result.set(match.propName, { varName, fieldName, goFallback: match.goFallback, zeroLiteral })
    }
    return result
  }

  /**
   * (#1423) Parse a signal-time initial value of the form
   * `props.X ?? <literal>` into the source prop name and the Go-formatted
   * fallback. Returns null when:
   *   - the expression isn't a `??` against a property access on
   *     `propsObjectName`
   *   - the fallback isn't a simple literal `goPropDefault` can translate
   *
   * The Go-adapter equivalent of the same parse already done by the
   * static evaluator in `ssr-defaults.ts` — duplicated here because we
   * need the original prop reference (not just the resolved value)
   * to honour caller-supplied non-zero inputs.
   */
  private extractPropFallback(initialValue: string): { propName: string; goFallback: string } | null {
    if (!this.propsObjectName) return null
    const trimmed = initialValue.trim()
    const name = this.propsObjectName

    // `props.X ?? <rhs>` — capture RHS greedily up to end of string.
    const re = new RegExp(`^${name}\\.(\\w+)\\s*\\?\\?\\s*(.+)$`)
    const m = trimmed.match(re)
    if (!m) return null
    const goFallback = this.goPropDefault(m[2].trim())
    if (goFallback === null) return null
    return { propName: m[1], goFallback }
  }

  /**
   * Extract prop name from a signal's initialValue that uses props.xxx pattern.
   * e.g., "props.initial ?? 0" → "initial", "props.checked" → "checked"
   */
  private extractPropNameFromInitialValue(initialValue: string): string | null {
    if (!this.propsObjectName) return null
    const trimmed = initialValue.trim()
    const name = this.propsObjectName

    // "props.initial ?? 0", "props.checked", "p.value || ''"
    const direct = new RegExp(`^${name}\\.(\\w+)(?:\\s*(?:\\?\\?|\\|\\|)\\s*.+)?$`)
    const m1 = trimmed.match(direct)
    if (m1) return m1[1]

    // "(props.initialTodos ?? []).map(...)"
    const wrapped = new RegExp(`^\\(${name}\\.(\\w+)\\s*(?:\\?\\?|\\|\\|)\\s*[^)]+\\)(.*)$`)
    const m2 = trimmed.match(wrapped)
    if (m2) {
      const tail = m2[2]
      // The propagation rule is "this signal's Go type is the prop's Go
      // type". That breaks when the trailing access transforms the prop
      // type — e.g. `(props.initial ?? []).length` is a `number`, not the
      // prop's `[]Todo`. Bail out in those cases so the caller falls
      // back to `inferTypeFromValue` on the full expression, which
      // recognises `.length` / `.some()` / `.every()` etc.
      if (/^\s*\.(length|size|some|every|includes|indexOf|findIndex|lastIndexOf)\b/.test(tail)) {
        return null
      }
      return m2[1]
    }

    return null
  }

  /** Go common initialisms that should be fully uppercased (https://go.dev/wiki/CodeReviewComments#initialisms) */
  private static GO_INITIALISMS = new Set([
    'id', 'url', 'http', 'https', 'api', 'json', 'xml', 'html', 'css', 'sql',
    'ip', 'tcp', 'udp', 'dns', 'ssh', 'tls', 'ssl', 'uri', 'uid', 'uuid',
    'ascii', 'utf8', 'eof', 'grpc', 'rpc', 'cpu', 'gpu', 'ram', 'os',
  ])

  /**
   * (#1423) Go reserved keywords. When we hoist a local var named after
   * a JSX prop, the prop name could collide with one of these — append
   * `_` until the name is free.
   */
  private static GO_KEYWORDS = new Set([
    'break', 'case', 'chan', 'const', 'continue', 'default', 'defer',
    'else', 'fallthrough', 'for', 'func', 'go', 'goto', 'if', 'import',
    'interface', 'map', 'package', 'range', 'return', 'select', 'struct',
    'switch', 'type', 'var',
  ])

  private capitalizeFieldName(name: string): string {
    if (!name) return name
    // Check if the entire name is a Go initialism (e.g., 'id' → 'ID')
    if (GoTemplateAdapter.GO_INITIALISMS.has(name.toLowerCase())) {
      return name.toUpperCase()
    }
    return name.charAt(0).toUpperCase() + name.slice(1)
  }

  /**
   * Convert a JavaScript literal value to Go literal syntax.
   */
  /**
   * Translate a JSX param default (e.g. `'default'`, `0`, `false`) into
   * the corresponding Go literal. Returns null when the default is
   * absent or non-trivial (objects, arrow functions, etc.) — those
   * fall back to letting Go's zero value win.
   */
  private goPropDefault(defaultValue: string | undefined): string | null {
    if (!defaultValue) return null
    const trimmed = defaultValue.trim()
    if (trimmed === '') return null
    if (trimmed === 'true' || trimmed === 'false') return trimmed
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return trimmed
    // Single- and double-quoted strings.
    if (
      (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
      (trimmed.startsWith('"') && trimmed.endsWith('"'))
    ) {
      const body = trimmed.slice(1, -1)
      return JSON.stringify(body)
    }
    // Bail on anything richer (objects, arrays, expressions). The
    // generated Go would mis-execute a JS expression.
    return null
  }

  /**
   * Wrap an `in.X` reference in a Go expression that substitutes
   * `fallback` when the input is the zero value for its type. We pick
   * the comparison based on the fallback literal's shape.
   *
   * Asymmetry on bool defaults is intentional and worth flagging:
   *   - For a `true` default, the generated expression is
   *     `(in.X || true)` — which is **always `true`**. Go has no
   *     unset-vs-explicit-false distinction at the struct-field level,
   *     so any caller wanting to thread `false` through has to set it
   *     after `NewXxxProps` rather than via the input struct.
   *   - For a `false` default, the Go zero value already matches, so
   *     the helper is a no-op (returns `ref` unchanged).
   * Numeric `0` defaults are similarly indistinguishable from "unset"
   * and pass through as the zero value; non-zero numeric defaults
   * substitute, matching the JSX behavior of `(initial = 5) => ...`.
   */
  private applyGoFallback(ref: string, fallback: string): string {
    if (fallback === 'true' || fallback === 'false') {
      return fallback === 'true' ? `(${ref} || true)` : ref
    }
    if (/^-?\d+(\.\d+)?$/.test(fallback)) {
      if (fallback === '0') return ref
      return `func() int { if ${ref} == 0 { return ${fallback} }; return ${ref} }()`
    }
    // String fallback (quoted)
    return `func() string { if ${ref} == "" { return ${fallback} }; return ${ref} }()`
  }

  private goLiteral(value: string): string {
    // Boolean
    if (value === 'true' || value === 'false') return value
    // Number
    if (/^-?\d+(\.\d+)?$/.test(value)) return value
    // String with single quotes -> Go double quotes
    if (value.startsWith("'") && value.endsWith("'")) {
      return `"${value.slice(1, -1)}"`
    }
    // String with double quotes -> keep as is
    if (value.startsWith('"') && value.endsWith('"')) {
      return value
    }
    // Default: wrap in quotes
    return `"${value}"`
  }

  /**
   * Public entry point for node rendering. Delegates to the shared
   * `IRNodeEmitter` dispatcher (#1290 step 1); per-kind logic lives in
   * the `IRNodeEmitter` methods below.
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
    return node.value
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

  renderExpression(expr: IRExpression): string {
    // Handle @client directive - render comment marker for client-side evaluation
    // The expression will be evaluated in ClientJS via updateClientMarker()
    if (expr.clientOnly) {
      if (expr.slotId) {
        return `{{bfComment "client:${expr.slotId}"}}`
      }
      return ''
    }

    const goExpr = this.convertExpressionToGo(expr.expr)

    // If the expression already contains Go template blocks (e.g., {{with ...}}),
    // don't wrap it again in {{...}} to avoid double-wrapping.
    // Use comment markers instead of <span> to avoid changing DOM structure.
    if (goExpr.startsWith('{{')) {
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
   * Render a client-only conditional as comment markers.
   * Used when @client directive is applied to an unsupported conditional.
   * The condition is evaluated on the client side via insert().
   */
  private renderClientOnlyConditional(cond: IRConditional): string {
    if (cond.slotId) {
      // Render comment markers (empty initially, client will populate)
      return `{{bfComment "cond-start:${cond.slotId}"}}{{bfComment "cond-end:${cond.slotId}"}}`
    }
    return ''
  }

  /**
   * Render a ParsedExpr to Go template syntax via the shared
   * dispatcher (#1250 phase 1). The per-kind logic lives in the
   * `ParsedExprEmitter` methods below; this method is a thin wrapper
   * so existing call sites keep working.
   */
  private renderParsedExpr(expr: ParsedExpr): string {
    return emitParsedExpr(expr, this)
  }

  // ===========================================================================
  // ParsedExprEmitter implementation (Go template syntax)
  // ===========================================================================

  identifier(name: string): string {
    return `.${this.capitalizeFieldName(name)}`
  }

  literal(value: string | number | boolean | null, literalType: LiteralType): string {
    if (literalType === 'string') return `"${value}"`
    if (literalType === 'null') return 'nil'
    return String(value)
  }

  call(callee: ParsedExpr, args: ParsedExpr[], emit: (e: ParsedExpr) => string): string {
    // Signal call: count() -> .Count
    if (callee.kind === 'identifier' && args.length === 0) {
      return `.${this.capitalizeFieldName(callee.name)}`
    }
    // Array methods (`.join` and any others added to ArrayMethod, #1443)
    // are lifted into the `array-method` IR kind at parse time, so
    // they never reach this dispatcher. See `arrayMethod()` below.
    // Identifier-path primitive callee (#1188): if the JS call resolves
    // to a path registered on `templatePrimitives` (e.g. `JSON.stringify`,
    // `Math.floor`), substitute the Go template form. The emit fn
    // receives args already rendered to Go template syntax. Wrap in
    // parens to preserve operator precedence in the surrounding
    // expression (e.g. `bf_floor x` composed inside `gt (bf_floor x) 3`).
    //
    // Arity is checked against `templatePrimitiveArities` so a wrong-arity
    // call (`JSON.stringify()`, `JSON.stringify(x, replacer)`) falls
    // through to the standard BF101 path instead of emitting invalid
    // Go template syntax via `args[0]` on a missing or extra argument.
    const path = identifierPath(callee)
    if (path && this.templatePrimitives[path]) {
      const expected = this.templatePrimitiveArities[path]
      if (expected === undefined || args.length === expected) {
        const renderedArgs = args.map(emit)
        return `(${this.templatePrimitives[path](renderedArgs)})`
      }
      this.errors.push({
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
    // .length on higher-order filter → len (bf_filter ...)
    if (property === 'length' && object.kind === 'higher-order') {
      const result = this.renderFilterLengthExpr(object, emit)
      if (result) return result
    }

    // find().property / findLast().property → {{with bf_find ...}}{{.Property}}{{end}}
    if (object.kind === 'higher-order' && (object.method === 'find' || object.method === 'findLast')) {
      const findResult = this.renderHigherOrderExpr(object, emit)
      if (findResult) {
        return `{{with ${findResult}}}{{.${this.capitalizeFieldName(property)}}}{{end}}`
      }
      const templateBlock = this.renderFindTemplateBlock(
        object, emit, this.capitalizeFieldName(property),
      )
      if (templateBlock) return templateBlock
    }

    // SolidJS-style props pattern: props.xxx -> .Xxx
    if (object.kind === 'identifier' && this.propsObjectName && object.name === this.propsObjectName) {
      return `.${this.capitalizeFieldName(property)}`
    }

    // Inside a loop, the loop param variable refers to the current item
    // (dot). e.g. `msg.role` inside `{{range $_, $msg := .Messages}}` → `.Role`
    const currentLoopParam = this.loopParamStack[this.loopParamStack.length - 1]
    if (object.kind === 'identifier' && currentLoopParam && object.name === currentLoopParam) {
      return `.${this.capitalizeFieldName(property)}`
    }

    const obj = emit(object)
    if (property === 'length') return `len ${obj}`
    return `${obj}.${this.capitalizeFieldName(property)}`
  }

  binary(op: string, left: ParsedExpr, right: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    const l = emit(left)
    const r = emit(right)
    switch (op) {
      case '===':
      case '==':
        return `eq ${l} ${r}`
      case '!==':
      case '!=':
        return `ne ${l} ${r}`
      case '>':
        return `gt ${l} ${r}`
      case '<':
        return `lt ${l} ${r}`
      case '>=':
        return `ge ${l} ${r}`
      case '<=':
        return `le ${l} ${r}`
      case '+':
        return `bf_add ${l} ${r}`
      case '-':
        return `bf_sub ${l} ${r}`
      case '*':
        return `bf_mul ${l} ${r}`
      case '/':
        return `bf_div ${l} ${r}`
      case '%':
        return `bf_mod ${l} ${r}`
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
    const l = emit(left)
    const r = emit(right)
    const wrapLeft = this.needsParens(left) ? `(${l})` : l
    const wrapRight = this.needsParens(right) ? `(${r})` : r
    if (op === '&&') return `and ${wrapLeft} ${wrapRight}`
    return `or ${wrapLeft} ${wrapRight}`
  }

  // Note: JSX-level ternaries (`{expr ? a : b}`) are handled at the
  // IR level as IRConditional, which goes through convertConditionToGo
  // → renderConditionExpr (preamble-aware). This emitter method is
  // only reached for ternaries nested inside other ParsedExpr trees
  // (e.g. template-literal interpolation), where the test is always a
  // simple pipeline expression (runtime helpers, not template blocks).
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
        result += `{{${emit(part.expr)}}}`
      }
    }
    return result
  }

  arrowFn(param: string, _body: ParsedExpr, _emit: (e: ParsedExpr) => string): string {
    // Arrow functions shouldn't appear standalone in rendering.
    return `[ARROW-FN: ${param} => ...]`
  }

  arrayLiteral(elements: ParsedExpr[], emit: (e: ParsedExpr) => string): string {
    // `[a, b]` lowers to `bf_arr a b` (#1443) — a variadic runtime
    // helper that returns `[]any`. The Go template `slice` builtin
    // can't carry the JS-style heterogeneous element types (string,
    // signal call, prop reference) without coercion, so we use a
    // BF-owned helper. Elements get parens so a nested call doesn't
    // run together with its arguments (`bf_arr .A (bf_filter ...) .B`).
    // Empty `[]` is `bf_arr` with no args — the helper handles it.
    if (elements.length === 0) return 'bf_arr'
    const parts = elements.map(el => {
      const rendered = emit(el)
      // Wrap multi-token results (function calls, dotted paths with
      // arguments) in parens. Simple identifiers / literals stay bare.
      return rendered.includes(' ') ? `(${rendered})` : rendered
    })
    return `bf_arr ${parts.join(' ')}`
  }

  higherOrder(
    method: HigherOrderMethod,
    object: ParsedExpr,
    param: string,
    predicate: ParsedExpr,
    emit: (e: ParsedExpr) => string,
  ): string {
    const reconstructed = { kind: 'higher-order' as const, method, object, param, predicate }
    const result = this.renderHigherOrderExpr(reconstructed, emit)
    if (result) return result
    if (method === 'find' || method === 'findIndex' || method === 'findLast' || method === 'findLastIndex') {
      const templateBlock = this.renderFindTemplateBlock(reconstructed, emit)
      if (templateBlock) return templateBlock
    }
    if (method === 'every' || method === 'some') {
      const templateBlock = this.renderEverySomeTemplateBlock(reconstructed, emit)
      if (templateBlock) return templateBlock
    }
    // No Go template form for this higher-order shape. Pre-#1443 the
    // upstream `UNSUPPORTED_METHODS` parser gate refused most of these
    // before they reached the emitter, so this sentinel was unreachable
    // in practice; #1443 widened the parser surface (synthetic
    // identity predicate for `.filter(Boolean)`) and exposed the gap.
    // Record BF101 explicitly so the diagnostic surfaces at build time
    // instead of leaking `[UNSUPPORTED: filter]` into the template
    // (Copilot review on #1444). The stacked Go-side PR (#1445) adds
    // the actual identity-predicate lowering so the user-visible
    // case stops hitting this fallback altogether.
    this.errors.push({
      code: 'BF101',
      severity: 'error',
      message: `Higher-order method '.${method}' shape cannot be lowered to a Go template action`,
      loc: this.makeLoc(),
      suggestion: {
        message: 'Options:\n1. Use @client directive for client-side evaluation\n2. Pre-compute the value in Go code',
      },
    })
    return `""`
  }

  arrayMethod(
    method: ArrayMethod,
    object: ParsedExpr,
    args: ParsedExpr[],
    emit: (e: ParsedExpr) => string,
  ): string {
    // #1443: `bf_join` is registered in the runtime FuncMap as a
    // wrapper around `strings.Join`. The exhaustive switch on
    // `method` here mirrors the IR-level discriminator — adding a
    // new `ArrayMethod` variant becomes a TS compile error until
    // every adapter declares its lowering.
    switch (method) {
      case 'join': {
        const obj = emit(object)
        const sep = emit(args[0])
        // Both operands need paren-wrapping when they emit a
        // multi-token prefix-call form (e.g. `sep` lowering to
        // `bf_trim .Raw` would make Go template parse
        // `bf_join (...) bf_trim .Raw` as four args to `bf_join`).
        // Identifiers / literals stay bare to keep the common case
        // readable. Copilot review on #1445 surfaced the gap.
        return `bf_join (${obj}) ${wrapIfMultiToken(sep)}`
      }
      case 'includes': {
        // Both `arr.includes(x)` and `str.includes(sub)` route here —
        // the parser can't disambiguate the receiver type. The Go
        // runtime's `Includes` helper inspects `reflect.Kind()` and
        // dispatches: slices/arrays use DeepEqual element search,
        // strings use `strings.Contains`. See packages/adapter-go-
        // template/runtime/bf.go.
        const obj = emit(object)
        const needle = emit(args[0])
        return `bf_includes ${wrapIfMultiToken(obj)} ${wrapIfMultiToken(needle)}`
      }
      case 'indexOf':
      case 'lastIndexOf': {
        // Value-equality search (DeepEqual). The existing
        // `bf_find_index` operates on struct-field equality (used by
        // the higher-order `.find` lowering); the new helpers handle
        // the bare `.indexOf(x)` / `.lastIndexOf(x)` shape where
        // there's no `.field` accessor on the elements.
        const fn = method === 'indexOf' ? 'bf_index_of' : 'bf_last_index_of'
        const obj = emit(object)
        const needle = emit(args[0])
        return `${fn} ${wrapIfMultiToken(obj)} ${wrapIfMultiToken(needle)}`
      }
      case 'at': {
        // `.at(i)` supports negative indices (`.at(-1)` → last
        // element). The Go `bf_at` helper was already registered in
        // the FuncMap for the runtime — this PR wires it to the JS
        // method name at the adapter layer.
        const obj = emit(object)
        const idx = emit(args[0])
        return `bf_at ${wrapIfMultiToken(obj)} ${wrapIfMultiToken(idx)}`
      }
      case 'concat': {
        // `.concat(other)` merges two arrays. The runtime helper
        // `bf_concat` reflects over both operands so callers can
        // mix `[]string` + `[]string` or `[]any` + `[]string` etc.
        // without per-call-site type-juggling.
        const a = emit(object)
        const b = emit(args[0])
        return `bf_concat ${wrapIfMultiToken(a)} ${wrapIfMultiToken(b)}`
      }
      case 'slice': {
        // `.slice(start)` / `.slice(start, end)` — both forms route
        // through `bf_slice`. The runtime helper treats a `nil`
        // `end` (the variadic-arg absence) as "to length", matching
        // the JS semantic. Out-of-bounds indices clamp instead of
        // panicking (also JS-compat); same with `start > end`
        // returning an empty slice.
        const recv = emit(object)
        const start = emit(args[0])
        if (args.length === 1) {
          return `bf_slice ${wrapIfMultiToken(recv)} ${wrapIfMultiToken(start)}`
        }
        const end = emit(args[1])
        return `bf_slice ${wrapIfMultiToken(recv)} ${wrapIfMultiToken(start)} ${wrapIfMultiToken(end)}`
      }
      case 'reverse':
      case 'toReversed': {
        // SSR templates render a snapshot of state, so JS's
        // mutate-and-return-receiver (`reverse`) vs return-new-
        // array (`toReversed`) distinction has no template-level
        // meaning. Both shapes route through `bf_reverse`, which
        // always returns a fresh `[]any` (safest interpretation —
        // the input array is whatever the template binds).
        const recv = emit(object)
        return `bf_reverse ${wrapIfMultiToken(recv)}`
      }
      case 'toLowerCase': {
        // The Go runtime registers `bf_lower` from a prior code path;
        // this PR is purely the adapter wiring of the JS method name
        // to that helper.
        const recv = emit(object)
        return `bf_lower ${wrapIfMultiToken(recv)}`
      }
      case 'toUpperCase': {
        // Mirrors `toLowerCase` — pre-existing `bf_upper` runtime
        // helper, just adapter wiring.
        const recv = emit(object)
        return `bf_upper ${wrapIfMultiToken(recv)}`
      }
      case 'trim': {
        // Pre-existing `bf_trim` runtime helper (wraps
        // `strings.TrimSpace`). Adapter wiring only.
        const recv = emit(object)
        return `bf_trim ${wrapIfMultiToken(recv)}`
      }
      default: {
        const _exhaustive: never = method
        throw new Error(`Go arrayMethod: unhandled ArrayMethod '${(_exhaustive as string)}'`)
      }
    }
  }

  sortMethod(
    method: 'sort' | 'toSorted',
    object: ParsedExpr,
    comparator: SortComparator,
    emit: (e: ParsedExpr) => string,
  ): string {
    // `.sort(cmp)` / `.toSorted(cmp)` lowering (#1448 Tier B). Both
    // shapes share the helper — template SSR context renders a
    // snapshot, so the JS mutate vs return-new distinction has no
    // template-level meaning. The same emit serves the standalone
    // call site here and the chained `.sort().map()` loop hoist in
    // `renderLoop` below (both feed `bf_sort` the same 4 string
    // operands).
    //
    // `method` is preserved for future divergence (e.g. should one
    // flavour warn?) but is unused today.
    void method
    return emitBfSort(emit(object), comparator)
  }

  unsupported(raw: string, _reason: string): string {
    // Should not happen if `isSupported` was checked at parse time.
    return `[UNSUPPORTED: ${raw}]`
  }

  /**
   * Extract field name and negation from a simple predicate.
   * t => t.done → { field: "Done", negated: false }
   * t => !t.done → { field: "Done", negated: true }
   */
  private extractFieldPredicate(pred: ParsedExpr, param: string): { field: string | null; negated: boolean } {
    // t.done
    if (pred.kind === 'member' && pred.object.kind === 'identifier' && pred.object.name === param) {
      return { field: this.capitalizeFieldName(pred.property), negated: false }
    }
    // !t.done
    if (pred.kind === 'unary' && pred.op === '!' && pred.argument.kind === 'member') {
      const mem = pred.argument
      if (mem.object.kind === 'identifier' && mem.object.name === param) {
        return { field: this.capitalizeFieldName(mem.property), negated: true }
      }
    }
    return { field: null, negated: false }
  }

  /**
   * Extract field name and value from an equality predicate.
   * Extends extractFieldPredicate to also handle equality comparisons.
   *
   * t.done → { field: "Done", value: "true" }
   * !t.done → { field: "Done", value: "false" }
   * u.id === selectedId() → { field: "Id", value: <rendered expr> }
   * selectedId() === u.id → same (supports both operand orders)
   */
  private extractEqualityPredicate(
    pred: ParsedExpr,
    param: string,
    renderValue: (e: ParsedExpr) => string
  ): { field: string; value: string } | null {
    // Boolean field: t.done → { field: "Done", value: "true" }
    if (pred.kind === 'member' && pred.object.kind === 'identifier' && pred.object.name === param) {
      return { field: this.capitalizeFieldName(pred.property), value: 'true' }
    }
    // Negated boolean: !t.done → { field: "Done", value: "false" }
    if (pred.kind === 'unary' && pred.op === '!' && pred.argument.kind === 'member') {
      const mem = pred.argument
      if (mem.object.kind === 'identifier' && mem.object.name === param) {
        return { field: this.capitalizeFieldName(mem.property), value: 'false' }
      }
    }
    // Equality: u.id === expr or expr === u.id
    if (pred.kind === 'binary' && (pred.op === '===' || pred.op === '==')) {
      // Left is param.field
      if (pred.left.kind === 'member' && pred.left.object.kind === 'identifier' && pred.left.object.name === param) {
        return { field: this.capitalizeFieldName(pred.left.property), value: renderValue(pred.right) }
      }
      // Right is param.field (reversed operand order)
      if (pred.right.kind === 'member' && pred.right.object.kind === 'identifier' && pred.right.object.name === param) {
        return { field: this.capitalizeFieldName(pred.right.property), value: renderValue(pred.left) }
      }
    }
    return null
  }

  /**
   * Render a higher-order expression (filter, every, some, find, findIndex) to Go template.
   * Returns null if the expression is not supported.
   *
   * @param expr - The higher-order expression
   * @param renderArray - Function to render the array expression (allows recursion via different methods)
   */
  private renderHigherOrderExpr(
    expr: Extract<ParsedExpr, { kind: 'higher-order' }>,
    renderArray: (e: ParsedExpr) => string
  ): string | null {
    const arrayExpr = renderArray(expr.object)

    if (expr.method === 'every' || expr.method === 'some') {
      const { field } = this.extractFieldPredicate(expr.predicate, expr.param)
      if (!field) return null
      return expr.method === 'every'
        ? `bf_every ${arrayExpr} "${field}"`
        : `bf_some ${arrayExpr} "${field}"`
    }

    if (expr.method === 'filter') {
      // .filter(Boolean) — synthesised by the parser as an identity
      // predicate (`x => x`) so adapters can reuse the higher-order
      // lowering path (#1443). Lower to `bf_filter_truthy` so the
      // registry Slot's `[a, b].filter(Boolean).join(' ')` chain
      // renders server-side on Go templates.
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
    expr: Extract<ParsedExpr, { kind: 'higher-order' }>,
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
      const v = `$bf_r${this.templateVarCounter++}`
      const capture = propertyAccess ? `.${propertyAccess}` : '.'
      return `{{${v} := ""}}{{range ${arrayExpr}}}{{if ${condition}}}{{${v} = ${capture}}}{{end}}{{end}}{{${v}}}`
    }

    if (expr.method === 'findLastIndex') {
      const v = `$bf_r${this.templateVarCounter++}`
      return `{{${v} := -1}}{{range $i, $_ := ${arrayExpr}}}{{if ${condition}}}{{${v} = $i}}{{end}}{{end}}{{${v}}}`
    }

    return null
  }

  /**
   * Render every()/some() with complex predicates using {{range}}{{if}} with variable reassignment.
   * Falls back from bf_every/bf_some when extractFieldPredicate returns null.
   * Reuses renderFilterExpr for condition rendering.
   *
   * every: start true, set false on first failure, break early
   * some: start false, set true on first match, break early
   *
   * @param expr - The higher-order every/some expression
   * @param renderArray - Function to render the array expression
   */
  private renderEverySomeTemplateBlock(
    expr: Extract<ParsedExpr, { kind: 'higher-order' }>,
    renderArray: (e: ParsedExpr) => string
  ): string | null {
    const arrayExpr = renderArray(expr.object)
    const condition = this.renderFilterExpr(expr.predicate, expr.param)
    if (condition.includes('[UNSUPPORTED')) return null

    if (expr.method === 'every') {
      const v = `$bf_r${this.templateVarCounter++}`
      const negated = this.negateGoCondition(condition)
      return `{{${v} := true}}{{range ${arrayExpr}}}{{if ${negated}}}{{${v} = false}}{{break}}{{end}}{{end}}{{${v}}}`
    }

    if (expr.method === 'some') {
      const v = `$bf_r${this.templateVarCounter++}`
      return `{{${v} := false}}{{range ${arrayExpr}}}{{if ${condition}}}{{${v} = true}}{{break}}{{end}}{{end}}{{${v}}}`
    }

    return null
  }

  /**
   * Negate a Go template condition.
   * Wraps in `not (...)` when the condition is a Go function call (eq, ne, gt, etc.),
   * otherwise uses `not condition`.
   */
  private negateGoCondition(condition: string): string {
    const goFuncPattern = /^(eq|ne|gt|lt|ge|le|and|or|not|bf_)\b/
    if (goFuncPattern.test(condition)) {
      return `not (${condition})`
    }
    return `not ${condition}`
  }

  /**
   * Render .length on a filter higher-order expression.
   * e.g., todos().filter(t => !t.done).length → len (bf_filter .Todos "Done" false)
   *
   * @param filterExpr - The filter higher-order expression
   * @param renderArray - Function to render the array expression
   */
  private renderFilterLengthExpr(
    filterExpr: Extract<ParsedExpr, { kind: 'higher-order' }>,
    renderArray: (e: ParsedExpr) => string
  ): string | null {
    if (filterExpr.method !== 'filter') {
      return null
    }

    const { field, negated } = this.extractFieldPredicate(filterExpr.predicate, filterExpr.param)
    if (!field) {
      return null
    }

    const arrayExpr = renderArray(filterExpr.object)
    const value = negated ? 'false' : 'true'
    return `len (bf_filter ${arrayExpr} "${field}" ${value})`
  }

  /**
   * Render a predicate expression for use in Go template {{if}} conditions.
   * Substitutes the loop parameter (e.g., 't' in 't.done') with dot notation.
   */
  private renderPredicateCondition(pred: ParsedExpr, param: string): string {
    return this.renderFilterExpr(pred, param)
  }

  /**
   * Check if expression needs parentheses when used in and/or.
   */
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

  // =============================================================================
  // Block Body Condition Rendering
  // =============================================================================

  /**
   * Render block body filter into a single Go template condition.
   *
   * Example block body:
   * ```
   * filter(t => {
   *   const f = filter()
   *   if (f === 'active') return !t.done
   *   if (f === 'completed') return t.done
   *   return true
   * })
   * ```
   *
   * Becomes:
   * ```
   * or (and (eq $.Filter "active") (not .Done))
   *    (and (eq $.Filter "completed") .Done)
   *    (and (ne $.Filter "active") (ne $.Filter "completed"))
   * ```
   */
  private renderBlockBodyCondition(
    statements: ParsedStatement[],
    param: string
  ): string {
    // Build a map of local variables to their signal sources
    // e.g., { f: 'filter' } when we see `const f = filter()`
    const localVarMap = new Map<string, string>()

    // Collect all return paths through the block body
    const paths = this.collectReturnPaths(statements, [], localVarMap, param)

    if (paths.length === 0) {
      // No return paths found, default to true
      return 'true'
    }

    if (paths.length === 1) {
      // Single path: render conditions with AND, then check result
      const path = paths[0]
      return this.buildSinglePathCondition(path, param, localVarMap)
    }

    // Multiple paths: build OR condition
    return this.buildOrCondition(paths, param, localVarMap)
  }

  /**
   * Recursively collect all return paths through the statements.
   * Returns an array of ReturnPath objects.
   */
  private collectReturnPaths(
    statements: ParsedStatement[],
    currentConditions: ParsedExpr[],
    localVarMap: Map<string, string>,
    param: string
  ): Array<{ conditions: ParsedExpr[]; result: ParsedExpr }> {
    const paths: Array<{ conditions: ParsedExpr[]; result: ParsedExpr }> = []

    for (const stmt of statements) {
      if (stmt.kind === 'var-decl') {
        // Track local variable to signal mapping
        // e.g., const f = filter() -> f maps to 'filter'
        if (stmt.init.kind === 'call' && stmt.init.callee.kind === 'identifier') {
          localVarMap.set(stmt.name, stmt.init.callee.name)
        }
      } else if (stmt.kind === 'return') {
        // This is a return path
        paths.push({
          conditions: [...currentConditions],
          result: stmt.value
        })
        // After a return, subsequent statements in this branch are unreachable
        break
      } else if (stmt.kind === 'if') {
        // If statement: collect paths from both branches
        const thenConditions = [...currentConditions, stmt.condition]
        const thenPaths = this.collectReturnPaths(stmt.consequent, thenConditions, localVarMap, param)
        paths.push(...thenPaths)

        if (stmt.alternate) {
          // Negate the condition for the else branch
          const negatedCondition: ParsedExpr = { kind: 'unary', op: '!', argument: stmt.condition }
          const elseConditions = [...currentConditions, negatedCondition]
          const elsePaths = this.collectReturnPaths(stmt.alternate, elseConditions, localVarMap, param)
          paths.push(...elsePaths)
        } else {
          // No else branch: implicit fall-through (continue to next statement)
          // Need to track the negated condition for subsequent statements
          const negatedCondition: ParsedExpr = { kind: 'unary', op: '!', argument: stmt.condition }
          currentConditions.push(negatedCondition)
        }
      }
    }

    return paths
  }

  /**
   * Build a condition for a single return path.
   */
  private buildSinglePathCondition(
    path: { conditions: ParsedExpr[]; result: ParsedExpr },
    param: string,
    localVarMap: Map<string, string>
  ): string {
    // If result is a literal boolean
    if (path.result.kind === 'literal' && path.result.literalType === 'boolean') {
      if (path.result.value === true) {
        // Return true: the conditions themselves determine visibility
        if (path.conditions.length === 0) {
          return 'true'
        }
        return this.renderConditionsAnd(path.conditions, param, localVarMap)
      } else {
        // Return false: this path should NOT match
        return 'false'
      }
    }

    // Non-boolean result: combine conditions AND result
    if (path.conditions.length === 0) {
      return this.renderFilterExpr(path.result, param, localVarMap)
    }

    const condPart = this.renderConditionsAnd(path.conditions, param, localVarMap)
    const resultPart = this.renderFilterExpr(path.result, param, localVarMap)
    return `and (${condPart}) (${resultPart})`
  }

  /**
   * Build an OR condition from multiple return paths.
   */
  private buildOrCondition(
    paths: Array<{ conditions: ParsedExpr[]; result: ParsedExpr }>,
    param: string,
    localVarMap: Map<string, string>
  ): string {
    const parts: string[] = []

    for (const path of paths) {
      // Skip paths that always return false
      if (path.result.kind === 'literal' && path.result.literalType === 'boolean' && path.result.value === false) {
        continue
      }

      const pathCond = this.buildSinglePathCondition(path, param, localVarMap)
      if (pathCond !== 'false') {
        parts.push(pathCond)
      }
    }

    if (parts.length === 0) {
      return 'false'
    }
    if (parts.length === 1) {
      return parts[0]
    }

    // Wrap each part in parentheses for clarity
    return `or ${parts.map(p => `(${p})`).join(' ')}`
  }

  /**
   * Render multiple conditions combined with AND.
   */
  private renderConditionsAnd(
    conditions: ParsedExpr[],
    param: string,
    localVarMap: Map<string, string>
  ): string {
    if (conditions.length === 0) {
      return 'true'
    }
    if (conditions.length === 1) {
      return this.renderFilterExpr(conditions[0], param, localVarMap)
    }

    const parts = conditions.map(c => this.renderFilterExpr(c, param, localVarMap))
    // Build nested and: and (a) (and (b) (c))
    let result = parts[parts.length - 1]
    for (let i = parts.length - 2; i >= 0; i--) {
      result = `and (${parts[i]}) (${result})`
    }
    return result
  }

  /**
   * Unified method for rendering filter predicate expressions.
   * Used for both expression body (t => !t.done) and block body filters.
   *
   * @param expr - The parsed expression to render
   * @param param - The loop parameter name (e.g., 't' in filter(t => ...))
   * @param localVarMap - Optional map of local variables to signal names (for block body)
   */
  private renderFilterExpr(
    expr: ParsedExpr,
    param: string,
    localVarMap: Map<string, string> = new Map()
  ): string {
    // Top-of-recursion: clear the unsupported sentinel so a previous
    // filter expression's failure doesn't poison this one. Parents
    // (`member` / `binary` / `unary` / `logical` / `call`) check the
    // flag after each child render and propagate `false` upward so the
    // emitted template stays syntactically valid even when the default
    // branch had to bail out (#1440 review).
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
        // Check if it's the loop param
        if (expr.name === param) {
          return '.'
        }
        // Check if it's a local variable mapped to a signal
        const signal = localVarMap.get(expr.name)
        if (signal) {
          return `$.${this.capitalizeFieldName(signal)}`
        }
        return `.${this.capitalizeFieldName(expr.name)}`
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
          return `.${this.capitalizeFieldName(expr.property)}`
        }
        // `.length` on a higher-order filter result (e.g.
        // `x.tags.filter(t => t.active).length > 0`, #1443 PR4).
        // Reuse the top-level `renderFilterLengthExpr` path so the
        // inner filter lowers to `bf_filter <arr> "<field>" <value>`
        // and the outer `.length` wraps it in `len (...)`. Pre-PR4
        // this fell into the `default` arm and emitted BF101.
        //
        // Wrap in parens because the filter-context `binary` /
        // `unary` arms emit prefix function calls (`gt <l> <r>`) and
        // Go template would parse `gt len (bf_filter ...) 0` as four
        // siblings instead of `gt (len (bf_filter ...)) 0`.
        if (
          expr.property === 'length' &&
          expr.object.kind === 'higher-order' &&
          expr.object.method === 'filter'
        ) {
          const lenExpr = this.renderFilterLengthExpr(expr.object, e =>
            this.renderFilterExpr(e, param, localVarMap),
          )
          if (lenExpr) return `(${lenExpr})`
        }
        // Nested member access or local var.prop
        const obj = this.renderFilterExpr(expr.object, param, localVarMap)
        if (this.filterExprUnsupported) return 'false'
        return `${obj}.${this.capitalizeFieldName(expr.property)}`
      }

      case 'call': {
        // Handle calls like t.isDone() -> .IsDone
        if (expr.callee.kind === 'member' && expr.callee.object.kind === 'identifier' && expr.callee.object.name === param) {
          return `.${this.capitalizeFieldName(expr.callee.property)}`
        }
        // Signal calls: filter() -> $.Filter
        if (expr.callee.kind === 'identifier' && expr.args.length === 0) {
          return `$.${this.capitalizeFieldName(expr.callee.name)}`
        }
        const result = this.renderFilterExpr(expr.callee, param, localVarMap)
        if (this.filterExprUnsupported) return 'false'
        return result
      }

      case 'unary': {
        const arg = this.renderFilterExpr(expr.argument, param, localVarMap)
        if (this.filterExprUnsupported) return 'false'
        if (expr.op === '!') {
          // Wrap in parens if arg is a function call (eq, ne, gt, etc.) for Go template syntax
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

      default: {
        // The filter predicate body contains a node kind we can't lower
        // to a Go template action — most commonly a nested higher-order
        // (`x => x.tags.filter(...).length > 0`). Surface BF101 with the
        // offending expression so the user can either rewrite the
        // predicate or add `/* @client */`. Set the recursion-wide
        // `filterExprUnsupported` flag so parent branches return `false`
        // instead of wrapping the sentinel into `false.Length` / `gt
        // false.Length 0` etc. — the build will fail on BF101 anyway,
        // but the emitted template must still be syntactically valid
        // so `text/template` parsing doesn't blow up with a cascade of
        // confusing secondary errors (#1440 review).
        this.filterExprUnsupported = true
        this.errors.push({
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
    }
  }

  /**
   * Check if a ParsedExpr will render as a Go template function call.
   * Used to determine if parentheses are needed around the expression.
   */
  private isGoFunctionCall(expr: ParsedExpr): boolean {
    switch (expr.kind) {
      case 'binary':
        // Comparison operators become function calls (eq, ne, gt, lt, etc.)
        return ['===', '==', '!==', '!=', '>', '<', '>=', '<='].includes(expr.op)
      case 'logical':
        // Logical operators become function calls (and, or)
        return true
      case 'unary':
        // Unary operators become function calls (not, bf_neg)
        return true
      case 'member':
        // .length becomes len function call
        return expr.property === 'length'
      default:
        return false
    }
  }

  /**
   * Render a branch of a conditional expression.
   * String literals render as bare text (no quotes).
   * Nested conditionals render as complete {{if}}...{{end}} blocks.
   */
  private renderConditionalBranch(expr: ParsedExpr): string {
    if (expr.kind === 'literal' && expr.literalType === 'string') {
      // String literals return as bare text
      return String(expr.value)
    }
    if (expr.kind === 'conditional') {
      // Nested ternary renders as complete Go template block
      const test = this.renderParsedExpr(expr.test)
      const consequent = this.renderConditionalBranch(expr.consequent)
      const alternate = this.renderConditionalBranch(expr.alternate)
      return `{{if ${test}}}${consequent}{{else}}${alternate}{{end}}`
    }
    // Other expressions render normally with {{...}} wrapper
    return `{{${this.renderParsedExpr(expr)}}}`
  }

  /**
   * Check if a ParsedExpr renders to a Go template function call that needs parentheses.
   * In Go templates, function calls like `len .X` or `bf_add .A .B` need parentheses
   * when used as arguments to comparison operators (eq, gt, lt, etc.).
   */
  private needsParensInGoTemplate(expr: ParsedExpr): boolean {
    switch (expr.kind) {
      case 'member':
        // .length becomes `len .X` which is a function call
        return expr.property === 'length'

      case 'binary':
        // Arithmetic operators become function calls (bf_add, bf_sub, etc.)
        return ['+', '-', '*', '/', '%'].includes(expr.op)

      case 'unary':
        // Negation becomes `bf_neg .X`
        return expr.op === '-'

      default:
        return false
    }
  }

  /**
   * Convert a JS expression to Go template syntax.
   */
  private convertExpressionToGo(jsExpr: string): string {
    const trimmed = jsExpr.trim()

    // Handle null/undefined specially
    if (trimmed === 'null' || trimmed === 'undefined') {
      return '""'
    }

    const parsed = parseExpression(trimmed)
    const support = isSupported(parsed)

    if (!support.supported) {
      // Log error and return Go template comment (safe for parsing)
      this.errors.push({
        code: 'BF101',
        severity: 'error',
        message: `Expression not supported: ${trimmed}`,
        loc: this.makeLoc(),
        suggestion: {
          message: support.reason
            ? `${support.reason}\n\nOptions:\n1. Use @client directive for client-side evaluation\n2. Pre-compute the value in Go code`
            : 'Options:\n1. Use @client directive for client-side evaluation\n2. Pre-compute the value in Go code',
        },
      })
      // Return empty string - Go template comments must be separate actions
      return `""`
    }

    return this.renderParsedExpr(parsed)
  }

  /**
   * Create a source location for error reporting.
   */
  private makeLoc(): SourceLocation {
    return {
      file: this.componentName + '.tsx',
      start: { line: 1, column: 0 },
      end: { line: 1, column: 0 },
    }
  }

  private renderIfStatement(ifStmt: IRIfStatement, ctx?: { isRootOfClientComponent?: boolean }): string {
    const { condition: goCondition, preamble } = this.convertConditionToGo(ifStmt.condition)
    const consequent = this.renderNode(ifStmt.consequent, ctx)
    let result = `${preamble}{{if ${goCondition}}}${consequent}`

    if (ifStmt.alternate) {
      if (ifStmt.alternate.type === 'if-statement') {
        const altIfStmt = ifStmt.alternate as IRIfStatement
        const { condition: altCondition, preamble: altPreamble } = this.convertConditionToGo(altIfStmt.condition)
        if (altPreamble) {
          // Preamble in else-if context is not supported
          this.errors.push({
            code: 'BF102',
            severity: 'error',
            message: `Complex predicate in else-if is not supported: ${altIfStmt.condition}`,
            loc: this.makeLoc(),
            suggestion: {
              message: 'Options:\n1. Use @client directive for client-side evaluation\n2. Pre-compute the value in Go code',
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
    // Handle @client directive - render as comment markers for client-side evaluation
    if (cond.clientOnly) {
      return this.renderClientOnlyConditional(cond)
    }

    const { condition: goCondition, preamble } = this.convertConditionToGo(cond.condition)
    const whenTrue = this.renderNode(cond.whenTrue)

    // If reactive (has slotId), wrap each branch with cond marker
    if (cond.slotId) {
      const whenTrueWrapped = this.wrapWithCondMarker(whenTrue, cond.slotId)
      let result = `${preamble}{{if ${goCondition}}}${whenTrueWrapped}`

      if (cond.whenFalse) {
        // Handle null/undefined branches with empty comment markers for client hydration
        if (cond.whenFalse.type === 'expression') {
          const exprNode = cond.whenFalse as IRExpression
          if (exprNode.expr === 'null' || exprNode.expr === 'undefined') {
            // Output empty comment markers so client can insert content later
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

    // Non-reactive: original logic
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
   * Convert a JS condition to Go template condition syntax.
   * Returns { condition, preamble } where preamble contains template blocks
   * that must be emitted before the {{if}} (e.g., every/some range blocks).
   */
  private convertConditionToGo(jsCondition: string): { condition: string; preamble: string } {
    const trimmed = jsCondition.trim()
    const parsed = parseExpression(trimmed)
    const support = isSupported(parsed)

    if (!support.supported) {
      this.errors.push({
        code: 'BF102',
        severity: 'error',
        message: `Condition not supported: ${trimmed}`,
        loc: this.makeLoc(),
        suggestion: {
          message: support.reason
            ? `${support.reason}\n\nOptions:\n1. Use @client directive for client-side evaluation\n2. Pre-compute the value in Go code`
            : 'Expression contains unsupported syntax',
        },
      })
      // Return false - Go template comments must be separate actions
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
          const currentLoopParam = this.loopParamStack[this.loopParamStack.length - 1]
          if (currentLoopParam && expr.name === currentLoopParam) {
            return plain('.')
          }
        }
        return plain(`.${this.capitalizeFieldName(expr.name)}`)

      case 'literal':
        if (expr.literalType === 'string') return plain(`"${expr.value}"`)
        if (expr.literalType === 'null') return plain('nil')
        return plain(String(expr.value))

      case 'call': {
        if (expr.callee.kind === 'identifier' && expr.args.length === 0) {
          return plain(`.${this.capitalizeFieldName(expr.callee.name)}`)
        }
        return plain(this.renderParsedExpr(expr))
      }

      case 'member': {
        if (expr.property === 'length' && expr.object.kind === 'higher-order') {
          // renderFilterLengthExpr uses bf_filter runtime helpers (not
          // template blocks), so .preamble is always empty here today.
          // If a future higher-order method produces preambles through
          // this path, the callback would need to propagate them.
          const result = this.renderFilterLengthExpr(expr.object, e => this.renderConditionExpr(e).expr)
          if (result) return plain(result)
        }

        if (expr.object.kind === 'identifier' && this.propsObjectName && expr.object.name === this.propsObjectName) {
          return plain(`.${this.capitalizeFieldName(expr.property)}`)
        }

        {
          const currentLoopParam = this.loopParamStack[this.loopParamStack.length - 1]
          if (expr.object.kind === 'identifier' && currentLoopParam && expr.object.name === currentLoopParam) {
            return plain(`.${this.capitalizeFieldName(expr.property)}`)
          }
        }

        const obj = this.renderConditionExpr(expr.object)
        if (expr.property === 'length') {
          return { preamble: obj.preamble, expr: `len ${obj.expr}` }
        }
        return { preamble: obj.preamble, expr: `${obj.expr}.${this.capitalizeFieldName(expr.property)}` }
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
          case '==':
            result = `eq ${left} ${right}`; break
          case '!==':
          case '!=':
            result = `ne ${left} ${right}`; break
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

      case 'arrow-fn':
        return plain('[ARROW-FN]')

      case 'higher-order': {
        const rendered = this.renderParsedExpr(expr)
        const split = this.splitPreamble(rendered)
        if (split) return split
        return plain(rendered)
      }

      case 'array-literal':
        return plain(this.renderParsedExpr(expr))

      case 'array-method':
        return plain(this.renderParsedExpr(expr))

      case 'unsupported':
        return plain(expr.raw)
    }
  }

  renderLoop(loop: IRLoop): string {
    // clientOnly loops: emit SSR markers so client can insert DOM nodes.
    // The marker id disambiguates sibling `.map()` calls under the same parent (#1087).
    if (loop.clientOnly) {
      return `{{bfComment "loop:${loop.markerId}"}}{{bfComment "/loop:${loop.markerId}"}}`
    }

    // An array/object-destructure loop param (`([emoji, users]) => ...`
    // or `({ name, age }) => ...`) requires multi-variable
    // `{{range $k, $v := ...}}` semantics that Go templates don't
    // provide for arbitrary tuples — the adapter would otherwise emit
    // `{{range $_, $[emoji, users] := .Entries}}`, which is invalid Go
    // template syntax. Surface this at build time (#1266) instead of
    // shipping the broken `{{range}}` line for the user to discover at
    // request time.
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

    let goArray = this.convertExpressionToGo(loop.array)
    const param = loop.param
    const index = loop.index || '_'

    // Check if the loop contains a component child
    // If so, use .{ComponentName}s which has ScopeID for each item
    // e.g., TodoItem children use .TodoItems, ToggleItem children use .ToggleItems
    const childComponent = this.findChildComponent(loop.children)
    if (childComponent) {
      goArray = `.${childComponent.name}s`
    }

    this.inLoop = true
    this.loopParamStack.push(param)
    const children = this.renderChildren(loop.children)
    this.loopParamStack.pop()
    this.inLoop = false

    // Apply sort if present: wrap array with bf_sort pipeline. The
    // same `emitBfSort` helper feeds both this loop-chained call
    // site and the standalone `sortMethod()` arm above so a
    // regression in either path surfaces with the same emit shape.
    if (loop.sortComparator) {
      goArray = `(${emitBfSort(goArray, loop.sortComparator)})`
    }

    // Handle filter().map() pattern by adding if-condition
    if (loop.filterPredicate) {
      let filterCond: string

      if (loop.filterPredicate.blockBody) {
        // Block body: collect return paths and build OR condition
        filterCond = this.renderBlockBodyCondition(
          loop.filterPredicate.blockBody,
          loop.filterPredicate.param
        )
      } else if (loop.filterPredicate.predicate) {
        // Expression body: render predicate directly
        filterCond = this.renderPredicateCondition(
          loop.filterPredicate.predicate,
          loop.filterPredicate.param
        )
      } else {
        // Fallback: always true
        filterCond = 'true'
      }

      // Per-item start marker for multi-root Fragment items (#1212).
      const itemMarker = loop.bodyIsMultiRoot ? `{{bfComment "bf-loop-i"}}` : ''
      return `{{bfComment "loop:${loop.markerId}"}}{{range $${index}, $${param} := ${goArray}}}{{if ${filterCond}}}${itemMarker}${children}{{end}}{{end}}{{bfComment "/loop:${loop.markerId}"}}`
    }

    const itemMarker = loop.bodyIsMultiRoot ? `{{bfComment "bf-loop-i"}}` : ''
    return `{{bfComment "loop:${loop.markerId}"}}{{range $${index}, $${param} := ${goArray}}}${itemMarker}${children}{{end}}{{bfComment "/loop:${loop.markerId}"}}`
  }

  /**
   * Find the first component child in a list of nodes
   */
  private findChildComponent(nodes: IRNode[]): IRComponent | null {
    for (const node of nodes) {
      if (node.type === 'component') {
        return node as IRComponent
      }
      // Check children of elements
      if (node.type === 'element' && (node as IRElement).children) {
        const found = this.findChildComponent((node as IRElement).children)
        if (found) return found
      }
      // Check children of fragments
      if (node.type === 'fragment' && (node as IRFragment).children) {
        const found = this.findChildComponent((node as IRFragment).children)
        if (found) return found
      }
    }
    return null
  }

  renderComponent(comp: IRComponent, ctx?: { isRootOfClientComponent?: boolean }): string {
    // Handle Portal component specially - collect content for body end
    if (comp.name === 'Portal') {
      return this.renderPortalComponent(comp)
    }

    // In Go templates, components are rendered using {{template "name" data}}
    let templateCall: string
    if (this.inLoop) {
      // Loop children: dot becomes loop item (already has correct props)
      templateCall = `{{template "${comp.name}" .}}`
    } else if (comp.slotId) {
      // Static children with slotId: use unique field name based on slotId
      const suffix = slotIdToFieldSuffix(comp.slotId)
      templateCall = `{{template "${comp.name}" .${comp.name}${suffix}}}`
    } else {
      // Static children without slotId: fallback to .ComponentName
      templateCall = `{{template "${comp.name}" .${comp.name}}}`
    }

    // Root component in client component needs scope comment for hydration boundary
    if (ctx?.isRootOfClientComponent) {
      return `{{bfScopeComment .}}${templateCall}`
    }
    return templateCall
  }

  /**
   * Render a Portal component by adding its children to PortalCollector.
   * Portal content is rendered at </body> instead of inline.
   *
   * For static content: uses simple string literal with Add()
   * For dynamic content: uses bfPortalHTML() to parse and execute template string
   */
  private renderPortalComponent(comp: IRComponent): string {
    // Render children content
    const children = this.renderChildren(comp.children)

    // Escape for Go double-quoted string literal
    const escapedContent = children
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')

    // Check if content has template expressions (dynamic content)
    if (children.includes('{{')) {
      // Content has dynamic parts - use bfPortalHTML to capture and render
      // bfPortalHTML parses and executes the template string with provided data
      return `{{.Portals.Add .ScopeID (bfPortalHTML . "${escapedContent}")}}`
    }

    // Static content - can use simple string literal
    return `{{.Portals.Add .ScopeID "${escapedContent}"}}`
  }

  private renderFragment(fragment: IRFragment): string {
    const children = this.renderChildren(fragment.children)
    if (fragment.needsScopeComment) {
      // Emit comment-based scope marker for fragment roots
      return `{{bfScopeComment .}}${children}`
    }
    return children
  }

  private renderSlot(slot: IRSlot): string {
    // Use Go template's block for slots
    const slotName = slot.name === 'default' ? 'children' : slot.name
    return `{{block "${slotName}" .}}{{end}}`
  }

  renderAsync(node: IRAsync): string {
    const fallback = this.renderNode(node.fallback)
    const children = this.renderChildren(node.children)
    // Go templates use the OOS protocol: render a placeholder with fallback,
    // the StreamRenderer resolves boundaries and streams replacement chunks.
    return `{{bfAsyncBoundary "${node.id}" "${this.escapeGoString(fallback)}"}}\n${children}`
  }

  private escapeGoString(s: string): string {
    return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  }

  /**
   * AttrValue lowering for intrinsic-element attributes (Go templates).
   * Per-kind logic that used to live in a `switch (v.kind)` inside
   * `renderAttributes`; routed through the shared dispatcher so a new
   * AttrValue kind becomes a TS compile error here (#1290 step 2).
   *
   * Components have no equivalent AttrValueEmitter on this adapter:
   * Go templates pass component-instance props as Go struct fields
   * (`collectStaticChildInstances` builds them), not as string-emitted
   * markup, so that path does not share a contract with the
   * intrinsic-attribute one.
   */
  private readonly elementAttrEmitter: AttrValueEmitter = {
    emitLiteral: (value, name) => `${name}="${value.value}"`,
    emitExpression: (value, name) => {
      if (isBooleanAttr(name) || value.presenceOrUndefined) {
        const { condition: goCond, preamble } = this.convertConditionToGo(value.expr)
        return `${preamble}{{if ${goCond}}}${name}{{end}}`
      }
      const parsed = parseExpression(value.expr.trim())
      if (parsed.kind === 'conditional' || parsed.kind === 'template-literal') {
        // Inline Go template syntax with embedded `{{...}}` actions.
        return `${name}="${this.renderParsedExpr(parsed)}"`
      }
      return `${name}="{{${this.convertExpressionToGo(value.expr)}}}"`
    },
    emitBooleanAttr: (_value, name) => name,
    // Spread attributes (`<div {...attrs()} />`) lower through the
    // `bf_spread_attrs` runtime helper (#1407). Two paths:
    //   - Top-level spread: the bag was plumbed onto the component's
    //     Props struct as `.Spread_<slotId>` by `generatePropsStruct`
    //     + `generateNewPropsFunction`. Emit a reference to it.
    //   - Loop-internal spread: the bag lives in the loop iteration
    //     variable (which surfaces as Go template's `.` plus
    //     property access). Translate the JS expression via
    //     `convertExpressionToGo` and emit `{{bf_spread_attrs <e>}}`
    //     inline — no Props plumbing needed.
    // Slot IDs are assigned at IR build time so identity is stable
    // across re-emits; if one isn't present we fall back to BF101.
    emitSpread: (value) => {
      if (!value.slotId) {
        this.errors.push({
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
        // Inside `{{range $_, $t := .Tasks}}`, the iteration value
        // surfaces as Go template's `.` (current context). A bare
        // reference to the loop param therefore translates to `.`,
        // not `.T` (which is what `convertExpressionToGo` would emit
        // via the generic identifier path). Property access through
        // the loop param (`t.attrs`) is already handled by the
        // member-expression path that returns `.Attrs`.
        //
        // The emit path is wired up but end-to-end fixture coverage
        // is gated on two orthogonal harness gaps: (a) `buildGoPropsInit`
        // in `test-render.ts` can't pass nested-object arrays from JS
        // into the Go input struct, and (b) `convertInitialValue`
        // returns `nil` for complex literal arrays so signal-init
        // arrays of objects don't reach the SSR template. Both are
        // pre-existing limitations independent of #1407.
        const trimmed = value.expr.trim()
        const currentLoopParam = this.loopParamStack[this.loopParamStack.length - 1]
        if (currentLoopParam && trimmed === currentLoopParam) {
          return `{{bf_spread_attrs .}}`
        }
        const goExpr = this.convertExpressionToGo(value.expr)
        // `convertExpressionToGo` already pushes BF101 for
        // unsupported expressions and returns `""`; pass through to
        // produce a consistent template that still compiles.
        return `{{bf_spread_attrs ${goExpr}}}`
      }
      return `{{bf_spread_attrs .${value.slotId}}}`
    },
    emitTemplate: (value, name) => `${name}="${this.renderTemplateLiteralParts(value.parts)}"`,
    // Neither variant is legal on intrinsic elements.
    emitBooleanShorthand: () => '',
    emitJsxChildren: () => '',
  }

  private renderAttributes(element: IRElement): string {
    const parts: string[] = []

    for (const attr of element.attrs) {
      // Rewrite JSX special-prop names to their HTML-attribute
      // counterparts. The Hono reference adapter relies on its JSX
      // runtime to strip `key` and emit `data-key` from a separate
      // emit path; the Go template adapter has no such runtime, so
      // the rewrite happens at attribute-emit time. Mirror of
      // `packages/jsx/src/ir-to-client-js/html-template.ts:878`
      // (`a.name === 'key'` branch). #1475
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
   * Replace `${EXPR}` JS-template-literal interpolations in a static
   * string part with Go template actions (`{{<expr-as-go>}}`), and
   * HTML-escape the surrounding literal text so embedded characters
   * don't break the attribute quoting we render into.
   *
   * UnoCSS arbitrary-value classes like `[class*="size-"]:size-4`
   * legitimately contain `"`, which would otherwise terminate the
   * `class="..."` attribute early and produce invalid HTML / a
   * `html/template` error at execution time.
   *
   * The interpolation parser is brace-depth aware: nested `{...}`
   * inside an expression (object literals, nested template literals,
   * etc.) are skipped past correctly so the closing brace of the
   * outer `${...}` is found. An unterminated `${` falls back to
   * literal text — better to output something than swallow it.
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
        // Unterminated `${` — emit the rest as escaped literal so we
        // don't silently drop content.
        out += this.escapeAttrText(s.slice(open))
        break
      }
      const inner = s.slice(open + 2, close).trim()
      if (inner) {
        out += `{{${this.convertExpressionToGo(inner)}}}`
      } else {
        out += s.slice(open, close + 1)
      }
      i = close + 1
    }
    return out
  }

  /**
   * HTML-attribute-safe escaping for double-quoted attribute values.
   * `&`/`"`/`<` are non-negotiable — without them the surrounding
   * `class="..."` quoting breaks (a real bug we hit with UnoCSS's
   * `[class*="size-"]`). `>`/`'` are belt-and-suspenders: HTML5
   * permits both inside double-quoted attrs, but Go's `html/template`
   * lexer is contextual and we'd rather not bet on its edge cases
   * matching ours forever.
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
        // String parts can carry unresolved `${expr}` placeholders
        // (e.g. for function params like `className` that the IR
        // analyzer couldn't substitute structurally). Translate each
        // span to a Go template action so the SSR output matches the
        // JS-side runtime evaluation. Static text passes through as-is.
        output += this.substituteJsInterpolations(part.value)
      } else if (part.type === 'ternary') {
        const { condition: goCond, preamble } = this.convertConditionToGo(part.condition)
        output += `${preamble}{{if ${goCond}}}${part.whenTrue}{{else}}${part.whenFalse}{{end}}`
      } else if (part.type === 'lookup') {
        // `${MAP[KEY]}` against a Record<T, string> literal — emit a
        // chained `{{if eq .Key "<case>"}}<value>{{else if ...}}{{end}}`
        // so the right case lights up at SSR time. Empty when no
        // case matches; consumers shouldn't rely on a default fallback
        // here (the JSX-side `variant = 'default'` default already
        // shows up via the per-prop fallback in `NewXxxProps`).
        const keyExpr = this.convertExpressionToGo(part.key)
        const caseEntries = Object.entries(part.cases)
        if (caseEntries.length === 0) continue
        const branches = caseEntries.map(([k, v], i) => {
          const head = i === 0 ? '{{if' : '{{else if'
          return `${head} eq ${keyExpr} ${JSON.stringify(k)}}}${v}`
        })
        output += branches.join('') + '{{end}}'
      }
    }
    return output
  }

  renderScopeMarker(_instanceIdExpr: string): string {
    // bfScopeAttr returns the bare scope id (#1249 — no `~` prefix).
    // bfHydrationAttrs emits bf-h / bf-m / bf-r conditionally (slot
    // identity + root-of-client-component marker).
    return `bf-s="{{bfScopeAttr .}}" {{bfHydrationAttrs .}} {{bfPropsAttr .}}`
  }

  renderSlotMarker(slotId: string): string {
    return `bf="${slotId}"`
  }

  renderCondMarker(condId: string): string {
    return `bf-c="${condId}"`
  }

  private wrapWithCondMarker(content: string, condId: string): string {
    // If content is a single HTML element, add bf-c attribute.
    // For fragments (multiple sibling elements), use comment markers.
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
    // Text: use bfComment function to output comment markers
    // Go's html/template strips raw HTML comments, so we use a custom function
    // bfComment automatically adds "bf-" prefix, so "cond-start:x" becomes "<!--bf-cond-start:x-->"
    return `{{bfComment "cond-start:${condId}"}}${content}{{bfComment "cond-end:${condId}"}}`
  }
}

export const goTemplateAdapter = new GoTemplateAdapter()

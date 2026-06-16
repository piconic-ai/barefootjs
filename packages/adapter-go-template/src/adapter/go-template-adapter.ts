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
  TypeDefinition,
  CompilerError,
  SourceLocation,
  ParsedExpr,
  ParsedStatement,
  SortComparator,
  ReduceOp,
  FlatDepth,
  FlatMapOp,
  TemplatePart,
  IRIfStatement,
  IRProvider,
  IRAsync,
  IRMetadata,
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
  type SupportResult,
  isBooleanAttr,
  parseExpression,
  parseStyleObjectEntries,
  isSupported,
  exprToString,
  identifierPath,
  emitParsedExpr,
  emitIRNode,
  emitAttrValue,
  augmentInheritedPropAccesses,
  parseRecordIndexAccess,
  collectContextConsumers,
  isLowerableObjectRestDestructure,
  type ContextConsumer,
  collectModuleStringConsts as collectModuleStringConstsShared
} from '@barefootjs/jsx'
import { findInterpolationEnd } from '@barefootjs/jsx/scanner'
import { BF_REGION } from '@barefootjs/shared'

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
  /** The enclosing loop's `key` expression (e.g. `item.label`) and map param
   *  name (`item`), so the loop-child init can stamp `data-key` per item. */
  loopKey?: string
  loopParam?: string
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
  /** Go string-concat expression for hoisted-JSX children that carry a
   *  `needsScope` root (`children={<span/>}` — #1326 / #1335). The root's
   *  `bf-s` resolves to the PARENT scope (mirroring the client
   *  `__BF_PARENT_SCOPE__` placeholder + Mojo's begin/end capture), so the
   *  fragment can't bake to a static string — the runtime `scopeID` is
   *  spliced in (`"<span bf-s=\"" + scopeID + "\">x</span>"`). Null when the
   *  static `childrenHtml` path already covers the children, or when any
   *  other template action survives (genuinely dynamic — kept on the drop
   *  path). */
  childrenScopedHtmlExpr: string | null
  /**
   * Context values from enclosing `<Ctx.Provider value>` ancestors
   * (`createContext` identifier → Go value literal), wired into this child
   * slot's input against its own context-consumer fields. Empty/undefined when
   * the child isn't under any provider. (#1297)
   */
  contextBindings?: ReadonlyMap<string, string>
}

/**
 * Cross-component shape of a child component the parent renders (#checkbox).
 * `paramNames` are the child's declared `propsParams`; `restBagField` is the
 * Go field name of the child's open-ended rest bag (`Capitalize(restPropsName)`),
 * or null when the child has no `...props` rest spread.
 */
interface ChildComponentShape {
  paramNames: Set<string>
  restBagField: string | null
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
 *   bf_sort <recv> (<keyKind> <keyName> <compareType> <direction>)+
 *
 *   keyKind:      "self" | "field"
 *   keyName:      "" when keyKind=self; capitalised field name otherwise
 *   compareType:  "numeric" | "string" | "auto"
 *   direction:    "asc" | "desc"
 *
 * The 4-string group repeats once per comparison key: a simple
 * comparator emits one group; a `||`-chained multi-key comparator
 * emits one per operand, applied in order as tie-breakers by the
 * variadic `bf_sort` runtime.
 *
 * The capitalisation mirrors the Go-side struct-field convention
 * (`bf_sort .Items "field" "Price" "numeric" "asc"`) so the runtime
 * helper's reflect lookup matches without a recapitalise step.
 */
function emitBfSort(recv: string, c: SortComparator): string {
  // One 4-string group per comparison key (keyKind, keyName,
  // compareType, direction). A single-key comparator emits exactly the
  // pre-multi-key shape; `||`-chained keys append further groups, which
  // `bf_sort`'s variadic runtime applies in order as tie-breakers.
  const groups = c.keys.map((k) => {
    const keyName = k.key.kind === 'field' ? capitalize(k.key.field) : ''
    return `"${k.key.kind}" "${keyName}" "${k.type}" "${k.direction}"`
  })
  return `bf_sort ${wrapIfMultiToken(recv)} ${groups.join(' ')}`
}

/**
 * Emit the `bf_reduce` call for a `.reduce(fn, init)` arithmetic fold
 * (#1448 Tier C):
 *
 *   bf_reduce <recv> "<op>" "<keyKind>" "<keyName>" "<type>" "<init>" "<direction>"
 *
 *   op:        "+" | "*"
 *   keyKind:   "self" | "field"
 *   keyName:   "" when keyKind=self; capitalised field name otherwise
 *              (matches the Go struct-field convention, mirroring
 *              `emitBfSort`)
 *   type:      "numeric" | "string"
 *   init:      the fold's start value — the numeric literal's text for a
 *              numeric fold, or the string literal's contents for a
 *              concat fold
 *   direction: "left" (reduce) | "right" (reduceRight)
 *
 * The runtime folds `init <op> key(item)` in `direction` order and
 * returns the accumulated value (float64 for numeric, string for
 * concat). The order is only observable for string concat — numeric
 * sum / product commute.
 */
function emitBfReduce(recv: string, op: ReduceOp, direction: 'left' | 'right'): string {
  const keyName = op.key.kind === 'field' ? capitalize(op.key.field) : ''
  // `op.init` is already the decoded seed value (canonical decimal for
  // numeric folds — `strconv.ParseFloat`-safe; escape-free contents for
  // concat folds). Pass it as a quoted operand the runtime interprets
  // by `type`. `direction` is "left" (reduce) or "right" (reduceRight)
  // — only observable for string concatenation; numeric folds are
  // commutative.
  return `bf_reduce ${wrapIfMultiToken(recv)} "${op.op}" "${op.key.kind}" "${keyName}" "${op.type}" "${escapeGoString(op.init)}" "${direction}"`
}

/** Escape a value for embedding in a Go-template double-quoted string. */
function escapeGoString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function capitalize(s: string): string {
  if (s.length === 0) return s
  // Match the adapter's struct-field naming (`capitalizeFieldName`):
  // a whole-word Go initialism uppercases entirely (`id` → `ID`,
  // `url` → `URL`) so the `bf_sort` / `bf_reduce` reflect lookup
  // resolves the generated exported field instead of silently folding
  // a zero value. The class is fully initialised by the time any emit
  // helper runs, so referencing the static set here is safe.
  if (GoTemplateAdapter.GO_INITIALISMS.has(s.toLowerCase())) {
    return s.toUpperCase()
  }
  return s[0].toUpperCase() + s.slice(1)
}

/**
 * Lower a keyed-loop `key` expression to the Go field path on the loop's range
 * variable (always `item` in the generated `for i, item := range …`), e.g.
 * `item.label` → `item.Label`. Returns null for a non-simple key (computed
 * expression, whole-element key, mismatched param) so the loop-child init just
 * skips `data-key` rather than emitting something that won't compile. (#1297)
 */
function loopKeyToGoFieldPath(key: string | undefined, param: string | undefined): string | null {
  if (!key || !param) return null
  const segs = key.split('.')
  if (segs[0] !== param) return null
  const rest = segs.slice(1)
  if (rest.length === 0) return null
  if (!rest.every(s => /^[A-Za-z_]\w*$/.test(s))) return null
  return 'item.' + rest.map(capitalize).join('.')
}

/**
 * Collect the component's root scope element node(s) — the elements that become
 * the rendered root and so carry `data-key` for a keyed loop item. A plain
 * element root is itself; an `if-statement` (early-return) root contributes the
 * top element of each branch, since exactly one renders at runtime. (#1297)
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

// Generic remediation appended to BF101 / BF102 diagnostics whose reason
// doesn't already carry actionable next steps.
const GO_REMEDIATION_OPTIONS =
  'Options:\n1. Use @client directive for client-side evaluation\n2. Pre-compute the value in Go code'

// Build the `suggestion.message` for an unsupported expression/condition.
// A self-contained reason (it already spells out the fix — e.g. the
// pre-compute / @client hint or the tailored forEach message) is shown
// as-is; a low-level reason gets the generic options appended; with no
// reason at all we fall back to the options alone.
function buildUnsupportedSuggestion(support: SupportResult): string {
  if (!support.reason) return GO_REMEDIATION_OPTIONS
  if (support.selfContained) return support.reason
  return `${support.reason}\n\n${GO_REMEDIATION_OPTIONS}`
}

/**
 * Parenthesize a compound Go template argument (`or .Checked false`) so a
 * primitive call reads it as ONE argument — unwrapped, the parser splits
 * it into three and `bf_string` fails with "want 1 got 3" (#1896,
 * DropdownMenuCheckboxItem's `String(props.checked ?? false)`).
 */
function wrapGoArg(arg: string): string {
  if (!/\s/.test(arg)) return arg
  if (arg.startsWith('(') && arg.endsWith(')')) return arg
  return `(${arg})`
}

/**
 * Make an equality comparison string-tolerant when exactly one side is a
 * Go string literal (#1896): JS `sorted === 'asc'` is loosely false for
 * `sorted = false`, but Go's template `eq` ERRORS on bool-vs-string
 * (`incompatible types for comparison` — DataTableColumnHeader's
 * `'asc' | 'desc' | false` union prop). Routing the non-literal side
 * through `bf_string` preserves JS comparison semantics for every
 * concrete type while keeping same-kind comparisons untouched.
 */
function stringTolerantEqOperands(l: string, r: string): [string, string] {
  const isStrLit = (x: string) => /^"(?:[^"\\]|\\.)*"$/.test(x)
  if (isStrLit(l) === isStrLit(r)) return [l, r]
  // Keep `wrapGoArg`'s parentheses: a compound operand must reach
  // `bf_string` as ONE argument — `(bf_string (or .Placement "top"))`,
  // not `(bf_string or .Placement "top")` (which the template parser
  // reads as three arguments and fails at runtime).
  const wrap = (x: string) => (isStrLit(x) ? x : `(bf_string ${wrapGoArg(x)})`)
  return [wrap(l), wrap(r)]
}

const GO_TEMPLATE_PRIMITIVES: Record<string, PrimitiveSpec> = {
  'JSON.stringify': { arity: 1, emit: (args) => `bf_json ${wrapGoArg(args[0])}` },
  'String':         { arity: 1, emit: (args) => `bf_string ${wrapGoArg(args[0])}` },
  'Number':         { arity: 1, emit: (args) => `bf_number ${wrapGoArg(args[0])}` },
  'Math.floor':     { arity: 1, emit: (args) => `bf_floor ${wrapGoArg(args[0])}` },
  'Math.ceil':      { arity: 1, emit: (args) => `bf_ceil ${wrapGoArg(args[0])}` },
  'Math.round':     { arity: 1, emit: (args) => `bf_round ${wrapGoArg(args[0])}` },
}

export class GoTemplateAdapter extends BaseAdapter implements ParsedExprEmitter, IRNodeEmitter<GoRenderCtx> {
  name = 'go-template'
  extension = '.tmpl'

  // Sentinel marking a parent-scope `bf-s` slot inside a hoisted-JSX
  // children bake (see `extractScopedHtmlChildren`). The token can't appear
  // in real HTML text, so splitting on it is unambiguous.
  private static readonly SCOPE_SENTINEL = '__BF_SCOPE_SENTINEL__'
  // Template-string target with no component layer: `bf build` emits a static
  // `barefoot-importmap.html` to `{{ template }}` into the page <head> (#1644).
  importMapInjection = 'html-snippet' as const

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
  /**
   * Companion `{{define "<Component>__children_<slot>"}}` blocks queued
   * while rendering the template body (#1896): JSX children passed to an
   * imported child component that contain template actions (nested
   * components, dynamic text) can't be baked to a static `Children`
   * string — they render through a per-call-site define executed via
   * `bf_tmpl` with the PARENT's data, and the result is injected into
   * the child props with `bf_with_children`. Flushed after the main
   * define in `generate()`.
   */
  private pendingChildrenDefines: Array<{ name: string; content: string }> = []
  private loopParamStack: string[] = []
  private loopVarRefCount: Map<string, number> = new Map()
  /** Stack of destructure-param binding maps (binding name → Go accessor on the
   *  range var, e.g. `id` → `$__bf_item0.Id`, `rest` → `$__bf_item0`). Innermost last.
   *  Lets `.map(({ id, ...rest }) => …)` resolve `id` / `rest.flag` instead of
   *  refusing with BF104. (#1310) */
  private loopBindingStack: Array<Map<string, string>> = []
  private errors: CompilerError[] = []
  /** The current IR's memos, stashed like `localConstants` so nested memo
   *  resolution (a ternary memo whose condition is another memo, #1896)
   *  can recurse without threading the list through every signature. */
  private currentMemos: Array<{ name: string; computation: string; deps: string[] }> = []
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
  /**
   * Per-struct field map (type name → source TS key → Go field name), populated
   * during generateTypes. The object-literal baker consults this so a baked
   * struct literal only names fields the generated struct actually declares.
   */
  private localStructFields: Map<string, Map<string, string>> = new Map()
  /**
   * Synthesised array types for untyped object-array signals (signal getter →
   * `[]SynthStruct` TypeInfo), populated during generateTypes (#1680). An
   * untyped `createSignal([{ id: "a" }])` has no element type to bake against;
   * we infer a struct from the literal's shape so the field can be typed and
   * the items baked. Consulted by both the signal field-type emitter and the
   * initial-value baker.
   */
  private synthStructTypes: Map<string, TypeInfo> = new Map()

  /** Set during type generation when any emit references
   *  `template.HTML(...)`; toggles the `"html/template"` import. */
  private usesHtmlTemplate: boolean = false
  /** Component root scope element(s) — each carries `data-key` for a keyed loop
   *  item. A plain element root is one node; an `if-statement` (early-return)
   *  root contributes the top element of every branch. (#1297) */
  private rootScopeNodes: Set<IRNode> = new Set()

  /** Set during type generation when any emit references
   *  `fmt.Sprint(...)` — e.g. a `Record<staticKeys, scalar>[propKey]`
   *  indexed-map spread value (#checkbox); toggles the `"fmt"` import. */
  private usesFmt: boolean = false

  /**
   * Cross-component child shapes (#checkbox), keyed by child component name.
   * Populated out-of-band via `registerChildComponentShape` before the parent
   * component's `generateTypes` runs, so the static-child-init codegen can
   * route an attribute that is NOT a declared param of the child
   * (`<CheckIcon data-slot=.../>`) into the child's rest bag
   * (`Capitalize(restPropsName)` map field) instead of emitting an invalid
   * hyphenated top-level field (`Data-slot:`). A child with no rest bag and
   * an unknown attr is left as-is so the existing field path / Go compile
   * error still surfaces.
   */
  private childComponentShapes: Map<string, ChildComponentShape> = new Map()

  /**
   * Module-scope pure string-literal constants (`const X = 'literal'` at
   * file top-level), keyed by name → resolved literal value. Populated at
   * `generate()` entry from `ir.metadata.localConstants`. When an identifier
   * in an expression resolves to one of these, the adapter inlines the
   * literal value instead of emitting a struct-field reference
   * (`{{.X}}`) — the field never exists on the Props struct, so without
   * inlining Go's template engine fails with `can't evaluate field X`.
   * Hono inlines it for free (it evaluates real JS); this restores parity.
   * Only module-scope, pure string literals qualify — function-scope
   * locals legitimately become template vars/props, and `Record<T,string>`
   * indexed lookups / memos / signals are deliberately excluded.
   */
  private moduleStringConsts: Map<string, string> = new Map()

  /**
   * All local constants (module + function-scope) from the IR, retained for
   * the lifetime of `generate()` so the memo-computation path can resolve
   * `Record`-index lookups (`variantClasses[variant]`) without re-threading the
   * full `ir` through every helper. Reset at `generate()` entry.
   */
  private localConstants: IRMetadata['localConstants'] = []

  /**
   * `useContext(...)` consumers in the component being generated. Each becomes
   * a struct field defaulted to the `createContext` default, which an enclosing
   * `<Ctx.Provider value>` overwrites for descendant child slots. Reset at
   * `generate()` / `generateTypes()` entry. (#1297)
   */
  private contextConsumers: ContextConsumer[] = []

  /** Child component name → the contexts it consumes (cross-component, for provider wiring). */
  private childContextConsumers: Map<string, ContextConsumer[]> = new Map()

  /**
   * Set of prop NAMES whose resolved Go struct-field type is exactly
   * `interface{}` — i.e. nillable. Populated at `generate()` entry from
   * the SAME per-prop Go-type computation `generatePropsStruct` /
   * `generateInputStruct` use (`propTypeOverrides` + `typeInfoToGo`), so
   * it can't drift from the actual field types. Used by
   * `elementAttrEmitter.emitExpression` to omit a dynamic attribute whose
   * value is a bare reference to a nillable prop when that prop is nil
   * (Hono-style nullish-attribute omission: an `undefined`-valued
   * attribute is dropped rather than rendered as `attr=""`). Concrete
   * (`string`/`int`/`bool`) fields are never in this set and always emit
   * unconditionally, matching Hono's `value=""` / `data-count="0"`.
   */
  private nillablePropNames: Set<string> = new Set()

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
    this.pendingChildrenDefines = []
    this.propsObjectName = ir.metadata.propsObjectName
    this.restPropsName = ir.metadata.restPropsName ?? null
    this.moduleStringConsts = this.collectModuleStringConsts(ir.metadata.localConstants)
    this.localConstants = ir.metadata.localConstants ?? []
    this.currentMemos = ir.metadata.memos ?? []
    this.contextConsumers = collectContextConsumers(ir.metadata)
    // (#checkbox) Enumerate inherited-attribute accesses (props-object pattern)
    // before computing the nillable set / rendering, so the synthetic params
    // participate in attribute omission and field binding uniformly. Shared
    // with the Mojo adapter (single source of truth in `@barefootjs/jsx`).
    augmentInheritedPropAccesses(ir)
    this.nillablePropNames = this.collectNillablePropNames(ir)

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

    this.rootScopeNodes = collectRootScopeNodes(ir.root)
    const templateBody = isIfStatement
      ? this.renderIfStatement(ir.root as IRIfStatement, { isRootOfClientComponent: hasInteractivity })
      : this.renderNode(ir.root, { isRootOfClientComponent: hasInteractivity && isRootComponent })

    // Generate script registration code at template start (unless skipped)
    const scriptRegistrations = options?.skipScriptRegistration
      ? ''
      : this.generateScriptRegistrations(ir, options?.scriptBaseName)

    let template = `{{define "${this.componentName}"}}\n${scriptRegistrations}${templateBody}\n{{end}}\n`
    // Flush the companion children defines (#1896) — they execute with
    // the parent's data via `bf_tmpl`, so they belong to this
    // component's template output.
    for (const d of this.pendingChildrenDefines) {
      template += `{{define "${d.name}"}}${d.content}{{end}}\n`
    }
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

  /**
   * Register a child component's shape (#checkbox) so a parent's
   * static-child-init codegen can route non-param attributes into the child's
   * rest bag rather than emitting an invalid hyphenated top-level field. Call
   * once per known child IR (siblings in the same source, auto-inferred
   * `../<name>` imports) before generating the parent's types. Idempotent.
   */
  registerChildComponentShape(ir: ComponentIR): void {
    const name = ir.metadata.componentName
    if (!name) return
    const paramNames = new Set((ir.metadata.propsParams ?? []).map(p => p.name))
    const restPropsName = ir.metadata.restPropsName ?? null
    const restBagField = restPropsName ? this.capitalizeFieldName(restPropsName) : null
    this.childComponentShapes.set(name, { paramNames, restBagField })
    // Record the contexts this child consumes so a parent wrapping it in
    // `<Ctx.Provider value>` can set the matching field on the child's slot input.
    this.childContextConsumers.set(name, collectContextConsumers(ir.metadata))
  }

  /** Go field name for a `useContext` consumer (the capitalized local binding). */
  private contextFieldName(c: ContextConsumer): string {
    return this.capitalizeFieldName(c.localName)
  }

  /** Go type for a context-consumer field, from its `createContext` default's type. */
  private contextConsumerGoType(c: ContextConsumer): string {
    if (typeof c.defaultValue === 'number') return 'int'
    if (typeof c.defaultValue === 'boolean') return 'bool'
    return 'string'
  }

  /** Go literal for a context-consumer's default value (the `createContext` arg). */
  private contextConsumerGoDefault(c: ContextConsumer): string {
    if (typeof c.defaultValue === 'number') return String(c.defaultValue)
    if (typeof c.defaultValue === 'boolean') return String(c.defaultValue)
    if (typeof c.defaultValue === 'string') return `"${this.escapeGoString(c.defaultValue)}"`
    return '""'
  }

  /**
   * Context-consumer fields that don't collide with an already-emitted prop /
   * signal / memo field. The template reads them as `{{.Field}}` (the local
   * `useContext` binding lowered to a root field); the struct must carry them.
   */
  private nonCollidingContextConsumers(taken: ReadonlySet<string>): ContextConsumer[] {
    return this.contextConsumers.filter(c => !taken.has(this.contextFieldName(c)))
  }

  generateTypes(ir: ComponentIR): string | null {
    this.usesHtmlTemplate = false
    this.usesFmt = false
    // (#checkbox) Mirror `generate()`: enumerate inherited-attribute accesses
    // so the Input/Props structs expose `ClassName`/`ID`/`Disabled` fields the
    // template + caller bind against. `generateTypes` runs on a separately
    // round-tripped IR, so this must be applied here too; the method is
    // idempotent. `propsObjectName` is needed by the scan.
    this.propsObjectName = ir.metadata.propsObjectName
    // Mirror `generate()` for the rest binding too (#1896):
    // `classifySpreadBagSource` decides whether a `{...props}` slot is an
    // Input-side bag by comparing against `this.restPropsName`. Without
    // this line the stash holds whichever component `generate()` ran
    // LAST — in a multi-component file (`tabs/index.tsx`) that is a
    // different component, so the Input struct dropped its `Props`
    // bag field while `NewXxxProps` (which reads the per-IR metadata)
    // still emitted `Spread_N: in.Props` — `in.Props undefined`.
    this.restPropsName = ir.metadata.restPropsName ?? null
    augmentInheritedPropAccesses(ir)
    // Mirror `generate()`: the `NewXxxProps` initializer computes memo SSR
    // values, which inline module string consts and resolve `Record`-index
    // lookups — both need the const tables populated on this standalone entry.
    this.moduleStringConsts = this.collectModuleStringConsts(ir.metadata.localConstants)
    this.localConstants = ir.metadata.localConstants ?? []
    this.currentMemos = ir.metadata.memos ?? []
    this.contextConsumers = collectContextConsumers(ir.metadata)
    const lines: string[] = []

    const componentName = ir.metadata.componentName

    // Build set of locally-defined type names and aliases so typeInfoToGo can resolve them
    this.localTypeNames = new Set<string>()
    this.localTypeAliases = new Map<string, string>()
    this.localStructFields = new Map<string, Map<string, string>>()
    for (const td of ir.metadata.typeDefinitions) {
      // Skip the Props type itself (it's the component's own props, not a reusable type)
      if (td.name === 'Props' || td.name === `${componentName}Props`) continue
      // Skip child component Props — they are generated by the child's own generatePropsStruct()
      if (td.name.endsWith('Props')) continue
      this.localTypeNames.add(td.name)
      // Track string literal union aliases (e.g., type Filter = 'all' | 'active')
      if (td.definition.match(/^type \w+ = ('[^']*'(\s*\|\s*'[^']*')*)/)) {
        this.localTypeAliases.set(td.name, 'string')
      } else {
        // Record the struct's source-key → Go-field-name map for the baker,
        // from the same field derivation the struct emitter uses.
        const fields = this.structFieldsFor(td)
        if (fields.length > 0) {
          this.localStructFields.set(td.name, new Map(fields.map(f => [f.tsName, f.goName])))
        }
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

    // Synthesise a struct for each untyped object-array signal (#1680) and emit
    // it, so the signal field can be typed `[]Synth` and its inline items baked
    // (the loop body reaches each item via struct field access). Registered in
    // localTypeNames/localStructFields so the baker resolves the element type.
    this.synthStructTypes = new Map<string, TypeInfo>()
    for (const signal of ir.metadata.signals) {
      const synth = this.synthesizeStructFromSignal(signal, componentName)
      if (!synth) continue
      this.localTypeNames.add(synth.name)
      this.localStructFields.set(synth.name, new Map(synth.fields.map(f => [f.tsName, f.goName])))
      this.synthStructTypes.set(signal.getter, {
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
    this.generateNewPropsFunction(lines, ir, componentName, nestedComponents, spreadSlots, propTypeOverrides)

    // Imports come at the top, but `usesHtmlTemplate` is only known
    // after the body has been generated. Compose package + imports +
    // body once everything has been collected.
    const header: string[] = []
    header.push(`package ${this.options.packageName}`)
    header.push('')
    header.push('import (')
    // Go's import block is conventionally sorted; emit in lexical order
    // (`fmt` < `html/template` < `math/rand`).
    if (this.usesFmt) header.push('\t"fmt"')
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
  private typeDefinitionToGo(td: TypeDefinition): string | null {
    // String literal union: type Filter = 'all' | 'active' | 'completed'.
    // These carry no `properties`, so the analyzer leaves the field set empty;
    // detect the alias from the definition and map it to a Go string.
    if (td.definition.match(/^type \w+ = ('[^']*'(\s*\|\s*'[^']*')*)/)) {
      // Map to Go string (union of string literals → just string in Go)
      return `// ${td.name} is a string type.\ntype ${td.name} = string`
    }

    // Object/interface type: type Todo = { id: number; text: string; ... }
    const fields = this.structFieldsFor(td)
    if (fields.length === 0) return null

    const goFields = fields.map(
      f => `\t${f.goName} ${f.goType} \`json:"${this.toJsonTag(f.tsName)}"\``,
    )
    return `// ${td.name} represents a ${td.name.toLowerCase()}.\ntype ${td.name} struct {\n${goFields.join('\n')}\n}`
  }

  /**
   * Derive a struct's Go fields from the analyzer-provided structured
   * properties — no string parsing of the definition. This is the single
   * source of truth for which fields a generated struct has and each field's Go
   * name/type; both the struct emitter ({@link typeDefinitionToGo}) and the
   * object-literal baker ({@link tsLiteralToGo}) consume it, so a baked literal
   * can never name a field the struct doesn't declare.
   *
   * A property whose source key isn't a valid Go identifier (`"data-id"`, a
   * numeric key, …) can't become a struct field, so it's dropped here — and is
   * therefore absent from the baker's field map too, which bails to nil for any
   * literal that uses such a key.
   */
  private structFieldsFor(td: TypeDefinition): Array<{ tsName: string; goName: string; goType: string }> {
    const fields: Array<{ tsName: string; goName: string; goType: string }> = []
    for (const prop of td.properties ?? []) {
      if (!GoTemplateAdapter.GO_IDENTIFIER.test(prop.name)) continue
      fields.push({
        tsName: prop.name,
        goName: this.capitalizeFieldName(prop.name),
        goType: this.typeInfoToGo(prop.type),
      })
    }
    return fields
  }

  /**
   * Synthesise a Go struct from an untyped object-array signal's inline initial
   * value (#1680). Returns the struct name + fields, or `null` when synthesis
   * isn't possible so the caller keeps the field `[]interface{}`/`nil`.
   *
   * Synthesis applies only when:
   *   - the signal's type is an array with no usable element type (untyped),
   *   - the initial value is a non-empty array literal of object literals,
   *   - every element shares the same set of Go-identifier keys, and
   *   - every value is a scalar literal whose Go type is consistent per key
   *     (numeric keys widen int→float64 when mixed).
   *
   * Any deviation (heterogeneous shape, a nested object/array value, a
   * non-literal value, a non-identifier key, or a name collision with an
   * existing type) returns `null`.
   */
  private synthesizeStructFromSignal(
    signal: { getter: string; type: TypeInfo; initialValue: string },
    componentName: string,
  ): { name: string; fields: Array<{ tsName: string; goName: string; goType: string }> } | null {
    // Only untyped arrays: a typed (`Item[]`) or scalar (`string[]`) element
    // already bakes through the normal path.
    if (signal.type.kind !== 'array') return null
    const elem = signal.type.elementType
    if (elem && elem.kind !== 'unknown') return null

    const node = this.parseLiteralExpression(signal.initialValue)
    if (!node || !ts.isArrayLiteralExpression(node) || node.elements.length === 0) return null

    // Collect the field order + per-key Go types from the first element, then
    // require every other element to match exactly.
    const order: string[] = []
    const goTypes = new Map<string, string>()
    for (let i = 0; i < node.elements.length; i++) {
      const el = node.elements[i]
      if (!ts.isObjectLiteralExpression(el)) return null
      const seen = new Set<string>()
      for (const prop of el.properties) {
        if (!ts.isPropertyAssignment(prop)) return null
        if (
          !ts.isIdentifier(prop.name) &&
          !ts.isStringLiteral(prop.name) &&
          !ts.isNumericLiteral(prop.name)
        ) {
          return null
        }
        const key = prop.name.text
        if (!GoTemplateAdapter.GO_IDENTIFIER.test(key)) return null
        const goType = this.scalarLiteralGoType(prop.initializer)
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
      // Every key from the first element must be present in this element too.
      if (seen.size !== order.length) return null
    }

    const name = `${componentName}${this.capitalizeFieldName(signal.getter)}Item`
    // Don't shadow a user-defined or already-synthesised type.
    if (this.localTypeNames.has(name)) return null

    return {
      name,
      fields: order.map(key => ({
        tsName: key,
        goName: this.capitalizeFieldName(key),
        goType: goTypes.get(key)!,
      })),
    }
  }

  /**
   * The Go type for a scalar JS literal used as a synthesised struct field
   * value, or `null` for anything non-scalar (objects, arrays, identifiers,
   * calls, interpolated templates) so the caller bails out of synthesis.
   */
  private scalarLiteralGoType(node: ts.Expression): string | null {
    if (
      ts.isPrefixUnaryExpression(node) &&
      node.operator === ts.SyntaxKind.MinusToken &&
      ts.isNumericLiteral(node.operand)
    ) {
      return this.numericLiteralGoType(node.operand.text)
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return 'string'
    if (ts.isNumericLiteral(node)) return this.numericLiteralGoType(node.text)
    if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) {
      return 'bool'
    }
    return null
  }

  /** `int` for an integer literal, `float64` when the literal has a fraction
   *  or exponent. */
  private numericLiteralGoType(text: string): string {
    return /[.eE]/.test(text) && !text.startsWith('0x') ? 'float64' : 'int'
  }

  /** Reconcile two inferred Go types for the same key across elements: equal
   *  types stay; mixed numeric (int/float64) widens to float64; otherwise null
   *  (incompatible → bail). */
  private mergeScalarGoType(a: string, b: string): string | null {
    if (a === b) return a
    const numeric = new Set(['int', 'float64'])
    if (numeric.has(a) && numeric.has(b)) return 'float64'
    return null
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
   * Resolve a prop param's Go struct-field type using the SAME logic
   * `generatePropsStruct` / `generateInputStruct` use for the field
   * declaration: a `propTypeOverrides` entry (signal-inferred override)
   * wins, otherwise `typeInfoToGo(param.type, param.defaultValue)`.
   * Factored out so the nillable-field set (`collectNillablePropNames`)
   * can't drift from the actual emitted field types.
   */
  private resolvePropGoType(
    param: IRMetadata['propsParams'][number],
    propTypeOverrides: Map<string, string>,
  ): string {
    return propTypeOverrides.get(param.name) ?? this.typeInfoToGo(param.type, param.defaultValue)
  }

  /**
   * Build the set of prop NAMES whose resolved Go field type is exactly
   * `interface{}` (nillable). Uses the same `propTypeOverrides` +
   * `resolvePropGoType` pipeline as the struct generators, so a prop
   * that ends up `interface{}` on the Props struct — and only such a
   * prop — is treated as nillable for Hono-style attribute omission.
   * Concrete (`string`/`int`/`bool`/`[]T`/struct) types are excluded.
   */
  private collectNillablePropNames(ir: ComponentIR): Set<string> {
    const propTypeOverrides = this.buildPropTypeOverrides(ir)
    const nillable = new Set<string>()
    for (const param of ir.metadata.propsParams) {
      if (this.resolvePropGoType(param, propTypeOverrides) === 'interface{}') {
        nillable.add(param.name)
      }
    }
    return nillable
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
      const goType = this.resolvePropGoType(param, propTypeOverrides)
      lines.push(`\t${fieldName} ${goType}`)
    }

    // Add nested component input arrays
    for (const nested of inputNested) {
      lines.push(`\t${nested.name}s []${nested.name}Input`)
    }

    // `useContext` consumer fields — settable by an enclosing provider on the
    // parent's side; default applied in NewXxxProps.
    const takenInput = new Set(ir.metadata.propsParams.map(p => this.capitalizeFieldName(p.name)))
    for (const c of this.nonCollidingContextConsumers(takenInput)) {
      lines.push(`\t${this.contextFieldName(c)} ${this.contextConsumerGoType(c)}`)
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
    // (#1297) Keyed-loop reconciliation key, stamped per item by the parent's
    // loop init and emitted as `data-key` on this component's scope root.
    lines.push('\tBfDataKey string `json:"-"`')

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
      const goType = this.resolvePropGoType(param, propTypeOverrides)
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
      // A synthesised struct type (#1680) wins outright — the signal is an
      // untyped object array we gave a concrete element type.
      const synthType = this.synthStructTypes.get(signal.getter)
      if (synthType) {
        lines.push(`\t${fieldName} ${this.typeInfoToGo(synthType)} \`json:"${jsonTag}"\``)
        continue
      }
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

    // Add memos to Props (they are computed values needed for SSR).
    // Skip a memo whose name collides with an already-emitted prop field
    // (#1896): `const className = createMemo(() => props.className ?? '')`
    // — common in site/ui (AccordionContent, PaginationLink) — would
    // otherwise redeclare `ClassName`. Both readers (the memo usage and
    // the inherited `props.className` access) lower to the same `.Field`,
    // so the prop field carries the value; the memo's `?? fallback` is
    // folded into the prop's initializer in `generateNewPropsFunction`.
    for (const memo of ir.metadata.memos) {
      const fieldName = this.capitalizeFieldName(memo.name)
      if (propFieldNames.has(fieldName)) continue
      const jsonTag = this.toJsonTag(memo.name)
      // Memos that depend on number signals are usually numbers
      const goType = this.inferMemoType(memo, ir.metadata.signals, propsParamMap)
      lines.push(`\t${fieldName} ${goType} \`json:"${jsonTag}"\``)
    }

    // `useContext` consumer fields (skip names already taken by a prop /
    // signal / memo field).
    const takenProps = new Set<string>([
      ...ir.metadata.propsParams.map(p => this.capitalizeFieldName(p.name)),
      ...ir.metadata.signals.map(s => this.capitalizeFieldName(s.getter)),
      ...ir.metadata.memos.map(m => this.capitalizeFieldName(m.name)),
    ])
    for (const c of this.nonCollidingContextConsumers(takenProps)) {
      const jsonTag = this.toJsonTag(c.localName)
      lines.push(`\t${this.contextFieldName(c)} ${this.contextConsumerGoType(c)} \`json:"${jsonTag}"\``)
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
    spreadSlots: SpreadSlotInfo[],
    propTypeOverrides: Map<string, string>,
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
        // (#1297) Stamp the keyed-loop `data-key` per item from the loop's
        // `key` expression (`item.label` → `item.Label`), matching Hono.
        const keyField = loopKeyToGoFieldPath(nested.loopKey, nested.loopParam)
        if (keyField) {
          lines.push(`\t\t${varName}[i].BfDataKey = fmt.Sprint(${keyField})`)
          this.usesFmt = true
        }
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
    // (#1896) A memo that shadows a prop of the same name
    // (`const className = createMemo(() => props.className ?? '')`)
    // shares the prop's struct field (see `generatePropsStruct`). Fold
    // the memo's `?? fallback` into the prop's own initializer so the
    // SSR value matches the memo semantics when the caller omits it.
    const memoFallbacks = new Map<string, { goFallback: string; goType: string }>()
    for (const memo of ir.metadata.memos) {
      const stripped = memo.computation.replace(/^\(\)\s*=>\s*/, '')
      const m = this.extractPropFallback(stripped)
      if (!m) continue
      if (this.capitalizeFieldName(m.propName) !== this.capitalizeFieldName(memo.name)) continue
      // `applyGoFallback` emits a string-typed zero-value check; folding
      // onto a prop whose Input field resolved to `interface{}` (e.g. a
      // string-literal-union type the resolver can't narrow —
      // PaginationLink's `size`) would not compile. Such props keep the
      // plain `in.<Field>` assignment.
      const param = ir.metadata.propsParams.find(
        p => this.capitalizeFieldName(p.name) === this.capitalizeFieldName(memo.name),
      )
      if (!param) continue
      const goType = this.resolvePropGoType(param, propTypeOverrides)
      if (goType !== 'string' && goType !== 'interface{}') continue
      memoFallbacks.set(this.capitalizeFieldName(memo.name), { goFallback: m.goFallback, goType })
    }

    const propFieldNames = new Set<string>()
    for (const param of ir.metadata.propsParams) {
      const fieldName = this.capitalizeFieldName(param.name)
      if (nestedArrayFields.has(fieldName)) continue
      const hoisted = propFallbackVars.get(param.name)
      if (hoisted) {
        lines.push(`\t\t${fieldName}: ${hoisted.varName},`)
      } else {
        const paramDefault = this.goPropDefault(param.defaultValue)
        const memoFold = memoFallbacks.get(fieldName)
        if (paramDefault !== null) {
          lines.push(`\t\t${fieldName}: ${this.applyGoFallback(`in.${fieldName}`, paramDefault)},`)
        } else if (memoFold !== undefined && memoFold.goType === 'string') {
          lines.push(`\t\t${fieldName}: ${this.applyGoFallback(`in.${fieldName}`, memoFold.goFallback)},`)
        } else if (memoFold !== undefined) {
          // interface{} field (#1896, PaginationLink's `size ?? 'icon'`):
          // applyGoFallback's string zero-check doesn't compile here, so
          // emit a nil/empty-tolerant wrapper instead.
          lines.push(
            `\t\t${fieldName}: func() interface{} { v := interface{}(in.${fieldName}); if v == nil || v == "" { return ${memoFold.goFallback} }; return v }(),`,
          )
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
        // Bake against the synthesised struct type when one was inferred for
        // this untyped object-array signal (#1680), else the signal's own type.
        const bakeType = this.synthStructTypes.get(signal.getter) ?? signal.type
        const initialValue = this.convertInitialValue(signal.initialValue, bakeType, ir.metadata.propsParams)
        lines.push(`\t\t${fieldName}: ${initialValue},`)
      }
    }

    // Add nested component arrays (static only; dynamic ones are set by the handler)
    for (const nested of staticNested) {
      const varName = `${nested.name.charAt(0).toLowerCase()}${nested.name.slice(1)}s`
      lines.push(`\t\t${nested.name}s: ${varName},`)
    }

    // Add memo initial values (computed from signal initial values).
    // Prop-shadowing memos were folded into the prop field above (#1896).
    const memoPropsParamMap = new Map(ir.metadata.propsParams.map(p => [p.name, p]))
    for (const memo of ir.metadata.memos) {
      const fieldName = this.capitalizeFieldName(memo.name)
      if (propFieldNames.has(fieldName)) continue
      // (#checkbox) Pass the memo's inferred Go type so an unresolved
      // computation falls back to that type's zero value (`false` for a
      // boolean memo like `isChecked`), not the int `0`.
      const goType = this.inferMemoType(memo, ir.metadata.signals, memoPropsParamMap)
      const memoValue = this.computeMemoInitialValue(memo, ir.metadata.signals, ir.metadata.propsParams, propFallbackVars, goType)
      lines.push(`\t\t${fieldName}: ${memoValue},`)
    }

    // `useContext` consumer fields: default to the `createContext` default
    // when the caller (a provider) didn't set them.
    const takenInit = new Set<string>([
      ...ir.metadata.propsParams.map(p => this.capitalizeFieldName(p.name)),
      ...ir.metadata.signals.map(s => this.capitalizeFieldName(s.getter)),
      ...ir.metadata.memos.map(m => this.capitalizeFieldName(m.name)),
    ])
    for (const c of this.nonCollidingContextConsumers(takenInit)) {
      const field = this.contextFieldName(c)
      const def = this.contextConsumerGoDefault(c)
      const defaulted =
        c.defaultValue === null || def === '""' || def === '0' || def === 'false'
          ? `in.${field}`
          : this.applyGoFallback(`in.${field}`, def)
      lines.push(`\t\t${field}: ${defaulted},`)
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
      // SSR context propagation: if this child is wrapped in a `<Ctx.Provider
      // value>` it consumes, set its context-consumer field to the provider
      // value (else the child's own NewProps applies the `createContext`
      // default). (#1297)
      if (child.contextBindings) {
        for (const consumer of this.childContextConsumers.get(child.name) ?? []) {
          const goVal = child.contextBindings.get(consumer.contextName)
          if (goVal !== undefined) {
            lines.push(`\t\t\t${this.contextFieldName(consumer)}: ${goVal},`)
          }
        }
      }
      // (#checkbox) Cross-component shape lookup: an attribute that is NOT a
      // declared param of the child but the child has a `...props` rest bag
      // (`<CheckIcon data-slot=.../>`, where CheckIcon's params are
      // `size`/`className` and the rest binding is `props`) must be routed
      // into the child's rest-bag map field — emitting `Data-slot:` as a
      // top-level Go field is a syntax error (hyphen). `restBagEntries`
      // collects `"jsx-attr-name": goValue` pairs for that map.
      const childShape = this.childComponentShapes.get(child.name)
      const restBagEntries: string[] = []
      // Emit a child input field, OR collect it as a rest-bag entry when the
      // attr isn't a declared child param and a rest bag exists.
      const emitChildField = (jsxName: string, goValue: string): void => {
        if (
          childShape &&
          childShape.restBagField &&
          !childShape.paramNames.has(jsxName)
        ) {
          restBagEntries.push(`${JSON.stringify(jsxName)}: ${goValue}`)
          return
        }
        // A hyphenated attribute (`aria-label`) can't be a Go struct
        // field, and with no rest bag on the child there is nowhere to
        // route it — the child has no `{...props}` spread, so the Hono
        // reference drops it on the child's root too. Skip rather than
        // emit invalid Go (#1896, data-table's selection sibling).
        if (jsxName.includes('-')) return
        lines.push(`\t\t\t${this.capitalizeFieldName(jsxName)}: ${goValue},`)
      }
      // Add prop values
      for (const prop of child.props) {
        switch (prop.value.kind) {
          case 'literal':
            emitChildField(prop.name, this.goLiteral(prop.value.value))
            break
          case 'boolean-shorthand':
          case 'boolean-attr':
            emitChildField(prop.name, 'true')
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
                emitChildField(prop.name, goExpr)
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
              emitChildField(prop.name, resolvedValue)
            }
            break
          }
          case 'jsx-children':
            // Handled separately via `child.childrenText` / `child.childrenHtml` below.
            break
        }
      }
      // (#checkbox) Emit the collected rest-bag entries as the child's
      // open-ended bag field (`Props: map[string]any{...}`), matching how the
      // child's `NewXxxProps` maps `in.Props` onto its `Spread_<N>` field.
      if (childShape?.restBagField && restBagEntries.length > 0) {
        lines.push(
          `\t\t\t${childShape.restBagField}: map[string]any{${restBagEntries.join(', ')}},`,
        )
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
      } else if (child.childrenScopedHtmlExpr !== null) {
        // Hoisted-JSX children with a needsScope root (#1326 / #1335): the
        // root `bf-s` is the runtime parent scopeID, spliced into the bake.
        this.usesHtmlTemplate = true
        lines.push(`\t\t\tChildren: template.HTML(${child.childrenScopedHtmlExpr}),`)
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
            loopKey: loop.key ?? undefined,
            loopParam: loop.param ?? undefined,
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
    } else if (node.type === 'if-statement') {
      const stmt = node as IRIfStatement
      this.collectNestedComponents(stmt.consequent, result)
      if (stmt.alternate) {
        this.collectNestedComponents(stmt.alternate, result)
      }
    } else if (node.type === 'component') {
      // (#1896) JSX children passed to an imported component render via
      // a companion define with the PARENT's data, so a keyed loop
      // nested inside them (DataTablePreviewDemo's `sortedData().map(…)`
      // inside `<TableBody>`) needs its `<Name>s` slice on THIS
      // component's props like any other nested loop.
      const comp = node as IRComponent
      for (const child of comp.children) {
        this.collectNestedComponents(child, result)
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
    this.collectStaticChildInstancesRecursive(node, result, false, new Map())
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
  /**
   * Pull the IR nodes out of a `children={<…/>}` attribute (a `jsx-children`
   * prop value). Empty when the component takes no such prop. (#1326 / #1335)
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
   * carries `needsScope` (`children={<span/>}` — #1326 / #1335). Such roots
   * render in the PARENT's scope, so their `bf-s` is the runtime parent
   * `scopeID`, not a bake-time constant. We render the fragment, swap the
   * parent-scope hydration marker for a sentinel, and splice `scopeID` back
   * in. Returns null when the plain static `childrenHtml` path already
   * applies, or when any other template action survives (genuinely dynamic —
   * those stay on the drop path).
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
  ): void {
    if (node.type === 'component') {
      const comp = node as IRComponent
      // Dynamic-tag locals (`const Tag = children.tag`) have no registrable
      // template, so they get no `.<Name>SlotN` struct field. Recurse into
      // their children (which lower as a passthrough) so any real static
      // child components nested inside still get their slot fields.
      if (comp.dynamicTag) {
        for (const child of comp.children) {
          this.collectStaticChildInstancesRecursive(child, result, inLoop, providerCtx)
        }
        return
      }
      // Skip Portal components (handled separately via PortalCollector)
      // Skip components inside loops (handled by nestedComponents)
      if (comp.name !== 'Portal' && !inLoop && comp.slotId) {
        const suffix = slotIdToFieldSuffix(comp.slotId)
        // Children handed in as a `children={<…/>}` attribute (#1326 / #1335)
        // land as a `jsx-children` prop rather than nested between the tags;
        // treat them as the child's effective children when no nested ones
        // exist, so the bake paths below see them.
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
        // (#1896) Action-bearing JSX children render through a companion
        // define with the PARENT's data (see `queueDynamicChildrenDefine`),
        // so component instances nested inside them need their own
        // `<Name>SlotN` fields + constructor inits on THIS component's
        // props. Statically-baked children never contain components
        // (any nested component renders a `{{template}}` action, which
        // the bake extractors reject), so recursing is a no-op for them.
        for (const child of effectiveChildren) {
          this.collectStaticChildInstancesRecursive(child, result, inLoop, providerCtx)
        }
      }
      // Recurse into Portal's children to find nested components
      if (comp.name === 'Portal' && comp.children) {
        for (const child of comp.children) {
          this.collectStaticChildInstancesRecursive(child, result, inLoop, providerCtx)
        }
      }
    } else if (node.type === 'loop') {
      const loop = node as IRLoop
      // Mark children as inside loop
      for (const child of loop.children) {
        this.collectStaticChildInstancesRecursive(child, result, true, providerCtx)
      }
    } else if (node.type === 'element') {
      const element = node as IRElement
      for (const child of element.children) {
        this.collectStaticChildInstancesRecursive(child, result, inLoop, providerCtx)
      }
    } else if (node.type === 'fragment') {
      const fragment = node as IRFragment
      for (const child of fragment.children) {
        this.collectStaticChildInstancesRecursive(child, result, inLoop, providerCtx)
      }
    } else if (node.type === 'conditional') {
      const cond = node as IRConditional
      this.collectStaticChildInstancesRecursive(cond.whenTrue, result, inLoop, providerCtx)
      if (cond.whenFalse) {
        this.collectStaticChildInstancesRecursive(cond.whenFalse, result, inLoop, providerCtx)
      }
    } else if (node.type === 'if-statement') {
      // (#1896) An early-return if-statement root (AccordionTrigger's
      // asChild split) keeps its subtrees in consequent/alternate — the
      // non-asChild branch's ChevronDownIcon needs its slot field like
      // any other static child.
      const stmt = node as IRIfStatement
      this.collectStaticChildInstancesRecursive(stmt.consequent, result, inLoop, providerCtx)
      if (stmt.alternate) {
        this.collectStaticChildInstancesRecursive(stmt.alternate, result, inLoop, providerCtx)
      }
    } else if (node.type === 'provider') {
      // SSR context propagation: record the provider's value against its
      // context name and extend the active binding map for descendants. A
      // literal value lowers to a Go literal; a non-literal is left unbound
      // (the consumer keeps its default). (#1297)
      const p = node as IRProvider
      const childCtx = this.extendProviderContext(providerCtx, p)
      for (const child of p.children) {
        this.collectStaticChildInstancesRecursive(child, result, inLoop, childCtx)
      }
    } else if (node.type === 'async') {
      // Async fallback + children render server-side via the OOS
      // protocol; static child components inside them still need slot
      // fields on the parent struct.
      const a = node as IRAsync
      this.collectStaticChildInstancesRecursive(a.fallback, result, inLoop, providerCtx)
      for (const child of a.children) {
        this.collectStaticChildInstancesRecursive(child, result, inLoop, providerCtx)
      }
    }
  }

  /**
   * Extend the active provider-context map with one `<Ctx.Provider value>`. A
   * string/number/boolean literal value is lowered to a Go literal; any other
   * shape is skipped (the descendant consumer keeps its `createContext` default).
   */
  private extendProviderContext(
    current: ReadonlyMap<string, string>,
    p: IRProvider,
  ): ReadonlyMap<string, string> {
    const v = p.valueProp?.value as { kind?: string; value?: unknown } | undefined
    if (!v || v.kind !== 'literal') return current
    let goLit: string | null = null
    if (typeof v.value === 'string') goLit = `"${this.escapeGoString(v.value)}"`
    else if (typeof v.value === 'number' || typeof v.value === 'boolean') goLit = String(v.value)
    if (goLit === null) return current
    const next = new Map(current)
    next.set(p.contextName, goLit)
    return next
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
    // Conditional inline-object spread:
    //   `{...(COND ? { 'k': v } : {})}` (either branch possibly `{}`).
    // Lower to an immediately-invoked func literal that conditionally
    // builds the bag, so the falsy branch yields an empty map (the key
    // is OMITTED rather than rendered as `k=""` — `SpreadAttrs` does
    // NOT filter empty strings). Returns null for any shape it can't
    // faithfully convert so the caller falls back to BF101 (#textarea).
    const conditional = this.buildConditionalSpreadInitializer(trimmed, ir)
    if (conditional !== undefined) return conditional
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
      // 4. Function-scope local const holding a conditional inline-object
      //    spread: `const sizeAttrs = size ? {…} : {}` then `{...sizeAttrs}`
      //    (#checkbox / icon). Resolve the identifier to its initializer
      //    text and route through the conditional-spread lowering. Only
      //    function-scope (`!isModule`) consts qualify — a module const is
      //    a different shape, and the resolved initializer must itself be a
      //    conditional-of-object-literals (else `buildConditionalSpreadInitializer`
      //    returns undefined and we fall through to BF101). Guard against a
      //    const that resolves to another bare identifier (loop / non-literal).
      const localConst = (ir.metadata.localConstants ?? []).find(
        c => c.name === trimmed && !c.isModule,
      )
      if (localConst?.value !== undefined) {
        const initTrimmed = localConst.value.trim()
        // Reject a const resolving to a bare identifier to avoid an
        // unbounded resolution loop / non-literal forwarding.
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(initTrimmed)) {
          const resolved = this.buildConditionalSpreadInitializer(initTrimmed, ir)
          // `undefined` → not a conditional-spread shape; fall through to
          // BF101. `null` → that shape but unconvertible; also BF101.
          if (resolved) return resolved
          if (resolved === null) return null
        }
      }
    }
    return null
  }

  /**
   * Lower a conditional inline-object spread bag value:
   *   `(COND ? { 'aria-describedby': describedBy } : {})`
   * into an immediately-invoked Go func literal that conditionally
   * builds the map (so the falsy branch OMITS the key rather than
   * rendering it as an empty string, which `SpreadAttrs` does not
   * filter):
   *
   *   func() map[string]any {
   *     if in.DescribedBy != nil && in.DescribedBy != "" {
   *       return map[string]any{"aria-describedby": in.DescribedBy}
   *     }
   *     return map[string]any{}
   *   }()
   *
   * Returns:
   *   - `undefined` when the expression is NOT a parenthesized ternary
   *     of object literals — the caller falls through to other shapes.
   *   - `null` when it IS that shape but a part can't be faithfully
   *     converted (non-static key, unsupported condition, …) — the
   *     caller raises BF101.
   *   - the Go IIFE string when fully convertible.
   */
  private buildConditionalSpreadInitializer(
    spreadExpr: string,
    ir: ComponentIR,
  ): string | null | undefined {
    const expr = this.parseLiteralExpression(spreadExpr)
    if (!expr || !ts.isConditionalExpression(expr)) return undefined
    const whenTrue = this.unwrapParens(expr.whenTrue)
    const whenFalse = this.unwrapParens(expr.whenFalse)
    if (!ts.isObjectLiteralExpression(whenTrue) || !ts.isObjectLiteralExpression(whenFalse)) {
      return undefined
    }
    // Condition → Go bool against `in.`, type-aware on the prop.
    const goCond = this.conditionToGoBool(expr.condition, ir)
    if (goCond === null) return null
    const trueMap = this.objectLiteralToGoSpreadMap(whenTrue, ir)
    const falseMap = this.objectLiteralToGoSpreadMap(whenFalse, ir)
    if (trueMap === null || falseMap === null) return null
    return (
      `func() map[string]any {\n` +
      `\t\tif ${goCond} {\n` +
      `\t\t\treturn ${trueMap}\n` +
      `\t\t}\n` +
      `\t\treturn ${falseMap}\n` +
      `\t}()`
    )
  }

  /** Strip redundant parenthesised wrappers off a TS expression. */
  private unwrapParens(node: ts.Expression): ts.Expression {
    let e = node
    while (ts.isParenthesizedExpression(e)) e = e.expression
    return e
  }

  /**
   * Convert a conditional-spread condition expression to a Go bool in
   * the `in.` context. Supports a bare prop identifier (`describedBy`)
   * and its negation (`!describedBy`), type-aware on the prop:
   *   string  → `in.X != ""`
   *   boolean → `in.X`
   *   number  → `in.X != 0`
   *   unknown / interface{} → `in.X != nil && in.X != ""`
   *     (faithful JS string-truthiness for an interface holding a
   *     string — textarea's `describedBy` resolves to interface{}).
   * Returns null for any other shape (caller → BF101).
   */
  private conditionToGoBool(
    condition: ts.Expression,
    ir: ComponentIR,
  ): string | null {
    let node = this.unwrapParens(condition)
    let negate = false
    if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken) {
      negate = true
      node = this.unwrapParens(node.operand)
    }
    if (!ts.isIdentifier(node)) return null
    const param = ir.metadata.propsParams.find(p => p.name === node.text)
    if (!param) return null
    const field = `in.${this.capitalizeFieldName(param.name)}`
    const prim = param.type.kind === 'primitive' ? param.type.primitive : undefined
    let truthy: string
    if (prim === 'boolean') {
      truthy = field
    } else if (prim === 'number') {
      truthy = `${field} != 0`
    } else if (prim === 'string') {
      truthy = `${field} != ""`
    } else {
      // unknown / interface{}: the runtime value may be a string, number,
      // bool, etc., so a string-biased `!= ""` test would diverge from JS
      // truthiness (e.g. an `interface{}` holding `0` or `false` is falsy in
      // JS but `!= ""` reads true). Route through `bf.Truthy`, the exported
      // `Boolean(x)` equivalent, for a faithful check (Copilot review #1752).
      truthy = `bf.Truthy(${field})`
    }
    if (!negate) return truthy
    // Negation: wrap so `!` applies to the whole truthiness test.
    if (prim === 'boolean') return `!${field}`
    if (prim === 'number') return `${field} == 0`
    if (prim === 'string') return `${field} == ""`
    return `!bf.Truthy(${field})`
  }

  /**
   * Convert a static object literal (`{ 'aria-describedby': describedBy }`)
   * into a Go `map[string]any{...}` literal for a conditional spread.
   * Only static string/identifier keys are allowed; values resolve
   * prop-identifier references to `in.FieldName` and string literals to
   * Go string literals. Returns null for any computed/spread/dynamic
   * key or unsupported value (caller → BF101). Empty object → `map[string]any{}`.
   */
  private objectLiteralToGoSpreadMap(
    obj: ts.ObjectLiteralExpression,
    ir: ComponentIR,
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
      const val = this.unwrapParens(prop.initializer)
      let goVal: string
      if (ts.isStringLiteral(val) || ts.isNoSubstitutionTemplateLiteral(val)) {
        goVal = JSON.stringify(val.text)
      } else if (ts.isIdentifier(val)) {
        const param = ir.metadata.propsParams.find(p => p.name === val.text)
        if (!param) return null
        goVal = `in.${this.capitalizeFieldName(param.name)}`
      } else {
        const indexed = this.recordIndexAccessToGoMap(val, ir)
        if (indexed === null) return null
        goVal = indexed
      }
      entries.push(`${JSON.stringify(key)}: ${goVal}`)
    }
    return `map[string]any{${entries.join(', ')}}`
  }

  /**
   * Lower a spread-object VALUE of the form `IDENT[KEY]` where:
   *   - `IDENT` resolves via `localConstants` to a MODULE-scope object
   *     literal whose property values are all scalar (number/string)
   *     literals under static (string-literal or identifier) keys
   *     (a `Record<staticKeys, scalar>` map like `sizeMap`), AND
   *   - `KEY` is a bare identifier that is a prop.
   * Emits an inline indexed Go map:
   *   `map[string]any{"sm": 16, ...}[fmt.Sprint(in.Size)]`
   * (`fmt.Sprint` coerces the `interface{}`/typed prop to the map's
   * string key space — sets `usesFmt` so the `"fmt"` import is added).
   *
   * Returns the Go string when convertible, else `null` (caller → BF101)
   * for any non-scalar value, non-static key, or non-prop index so
   * unrelated shapes don't regress. (#checkbox / icon `sizeMap[size]`.)
   */
  private recordIndexAccessToGoMap(
    val: ts.Expression,
    ir: ComponentIR,
  ): string | null {
    // Shared structural parse (single source of truth in `@barefootjs/jsx`);
    // this wrapper only does the Go-specific emit from the structured result.
    const parsed = parseRecordIndexAccess(
      val,
      ir.metadata.localConstants ?? [],
      ir.metadata.propsParams,
    )
    if (!parsed) return null
    const entries = parsed.entries.map(e => {
      const mapVal = e.value.kind === 'number' ? e.value.text : JSON.stringify(e.value.text)
      return `${JSON.stringify(e.key)}: ${mapVal}`
    })
    this.usesFmt = true
    const field = `in.${this.capitalizeFieldName(parsed.indexPropName)}`
    return `map[string]any{${entries.join(', ')}}[fmt.Sprint(${field})]`
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

    // For arrays, bake a fully-literal initial value into a Go slice literal
    // so the SSR data context carries the items (#1672). Empty / nullish
    // literals collapse to nil, and any non-literal element (a call, a
    // variable reference, …) falls back to nil so the handler populates it.
    //
    // The baked literal is element-type-aware so it both compiles and renders:
    //   - scalar elements →  `[]string{…}` / `[]interface{}{…}`  (template `{{.}}`)
    //   - struct elements →  `[]Item{Item{ID: …}}`               (template `.ID`)
    // An untyped object array would land in a `[]interface{}` field whose
    // `map[string]interface{}` items the template can't reach via field access
    // (`.ID` → <nil>), so `jsLiteralToGo` returns null there and we keep nil.
    if (typeInfo.kind === 'array') {
      // Bake a fully-literal initial value into a Go slice literal; anything
      // the parser can't reduce to a literal — a call, an identifier, `null` /
      // `undefined`, or an empty array — yields null and we keep `nil`.
      return this.jsLiteralToGo(value, typeInfo) ?? 'nil'
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
   * Convert a fully-literal JS expression string into an equivalent Go literal
   * whose Go type matches `typeInfo` (#1672), used to bake a signal's inline
   * initial value into the SSR data context:
   *
   *   `["x", "y"]`             (string[])  → `[]string{"x", "y"}`
   *   `["x", "y"]`             (unknown[]) → `[]interface{}{"x", "y"}`
   *   `[{ id: "a" }]`          (Item[])    → `[]Item{Item{ID: "a"}}`
   *
   * Returns `null` — so the caller keeps `nil` — when the expression (or any
   * nested element) is not a pure literal (a call, identifier, template with
   * interpolation, …) or cannot be expressed in the target Go type without a
   * render/compile mismatch (e.g. an object element in a `[]interface{}` field,
   * which the SSR template reaches via struct field access the map lacks).
   */
  private jsLiteralToGo(value: string, typeInfo: TypeInfo): string | null {
    const expr = this.parseLiteralExpression(value)
    if (!expr) return null
    return this.tsLiteralToGo(expr, typeInfo)
  }

  /**
   * Parse a JS expression string into its TS AST node (parentheses unwrapped),
   * or `null` when it isn't a single expression. Shared by the literal baker
   * and the struct-shape synthesiser.
   */
  private parseLiteralExpression(value: string): ts.Expression | null {
    const sf = ts.createSourceFile(
      '__lit.ts', `(${value})`, ts.ScriptTarget.Latest, /* setParentNodes */ true,
    )
    // Require exactly one expression statement. A value that error-recovers
    // into multiple statements (e.g. `1; 2`) isn't a single literal — bail
    // rather than silently baking only the first.
    if (sf.statements.length !== 1) return null
    const stmt = sf.statements[0]
    if (!ts.isExpressionStatement(stmt)) return null
    let expr: ts.Expression = stmt.expression
    while (ts.isParenthesizedExpression(expr)) expr = expr.expression
    return expr
  }

  /**
   * Recursively convert a TS literal AST node to a Go literal typed as
   * `typeInfo`, or null when the node is not a pure literal / cannot be
   * represented in that Go type.
   */
  private tsLiteralToGo(node: ts.Expression, typeInfo?: TypeInfo): string | null {
    // Unwrap a leading unary minus on a numeric literal (`-1`).
    if (
      ts.isPrefixUnaryExpression(node) &&
      node.operator === ts.SyntaxKind.MinusToken &&
      ts.isNumericLiteral(node.operand)
    ) {
      return `-${node.operand.text}`
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      return JSON.stringify(node.text)
    }
    // Pass the numeric literal's source spelling through verbatim. Every form
    // the TS parser accepts here (`1`, `1.5`, `1e3`, `0x10`, `1_000`) is also a
    // valid Go numeric literal, so no re-formatting is needed.
    if (ts.isNumericLiteral(node)) return node.text
    if (node.kind === ts.SyntaxKind.TrueKeyword) return 'true'
    if (node.kind === ts.SyntaxKind.FalseKeyword) return 'false'
    if (node.kind === ts.SyntaxKind.NullKeyword) return 'nil'

    if (ts.isArrayLiteralExpression(node)) {
      // An empty array literal (`[]`, and — since the TS parser tolerates
      // whitespace/comments — `[ ]`, `[/* */]`) carries no items, so there's
      // nothing to bake. Returning null keeps the field `nil`, which JSON-
      // marshals as `null` rather than the `[]` an empty slice would produce.
      if (node.elements.length === 0) return null

      // Slice header mirrors the field's Go type (`[]string`, `[]Item`,
      // `[]interface{}`); elements are converted against the element type.
      const elemType = typeInfo?.kind === 'array' ? typeInfo.elementType : undefined
      const sliceHeader = typeInfo?.kind === 'array'
        ? this.typeInfoToGo(typeInfo)
        : '[]interface{}'
      const elems: string[] = []
      for (const el of node.elements) {
        const go = this.tsLiteralToGo(el, elemType)
        if (go === null) return null
        elems.push(go)
      }
      return `${sliceHeader}{${elems.join(', ')}}`
    }

    if (ts.isObjectLiteralExpression(node)) {
      // An object can only be baked when the target Go type is a concrete
      // struct — otherwise it would land in `interface{}` / a map the SSR
      // template can't reach via field access. The struct's field map is the
      // source of truth: it tells us the exact Go field name for each source
      // key and, by omission, which keys the struct doesn't declare. Bail
      // (→ nil) when the type isn't a known struct.
      const goType = typeInfo ? this.typeInfoToGo(typeInfo) : 'interface{}'
      const structFields = this.localStructFields.get(goType)
      if (!structFields) return null
      const entries: string[] = []
      for (const prop of node.properties) {
        // Only plain `key: scalar` pairs are baked; spreads, methods,
        // shorthand, computed/accessor members, and nested object/array
        // values (whose struct field types we don't track here) bail to nil.
        if (!ts.isPropertyAssignment(prop)) return null
        if (
          !ts.isIdentifier(prop.name) &&
          !ts.isStringLiteral(prop.name) &&
          !ts.isNumericLiteral(prop.name)
        ) {
          return null
        }
        // Resolve the Go field name from the struct's own field map rather
        // than re-deriving it. A key the struct doesn't declare (a typo, or a
        // non-identifier key like `"data-id"` that never became a field) is
        // absent here, so we bail to nil instead of emitting a literal that
        // names a nonexistent field and won't compile.
        const goField = structFields.get(prop.name.text)
        if (!goField) return null
        const init = prop.initializer
        if (ts.isObjectLiteralExpression(init) || ts.isArrayLiteralExpression(init)) {
          return null
        }
        const go = this.tsLiteralToGo(init)
        if (go === null) return null
        entries.push(`${goField}: ${go}`)
      }
      return `${goType}{${entries.join(', ')}}`
    }
    return null
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
        // `fmt.Sprint` is type-tolerant: the key field is `interface{}`
        // when the analyzer typed the prop, but a `string` when the
        // shared inherited-prop augmentation synthesised it (#1896) — a
        // `.(string)` assertion compiles for the former only.
        this.usesFmt = true
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
    // `getter() === 'lit'` / `!==` as a child-instance prop value
    // (#1896 — accordion's `open={openItem() === 'item-1'}`): resolves
    // to a Go bool when the signal's initial value is a string literal.
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

    // Match signal/memo getter calls like count(), doubled()
    const getterMatch = expr.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\(\)$/)
    if (getterMatch) {
      const getterName = getterMatch[1]

      // Check if it's a signal
      const signal = signals.find(s => s.getter === getterName)
      if (signal) {
        return this.convertInitialValue(signal.initialValue, signal.type, propsParams)
      }

      // Check if it's a memo. Use the pattern-matching core: when no
      // pattern applies, return null so the caller OMITS the field and
      // Go's typed zero value applies (#1896).
      const memo = memos.find(m => m.name === getterName)
      if (memo) {
        return this.computeMemoInitialValueOrNull(memo, signals, propsParams)
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
  /**
   * (#checkbox) Compute the SSR initial value of a template-literal memo as a
   * Go `string` expression. The memo computation looks like
   * `() => `${a} ${b} ${props.className ?? ''} grid place-content-center``.
   *
   * Each quasi (literal text span) becomes a Go string literal; each
   * interpolation is resolved:
   *   - an identifier naming a module string const → its inlined literal
   *     (covers both pure-string and `[...].join(' ')` consts);
   *   - `props.<name> ?? '<fallback>'` or bare `props.<name>` → `in.<Field>`
   *     when `<name>` is a known prop param (typed `string`); the `?? ''`
   *     fallback maps to Go's zero value for an unset string field, matching
   *     the Hono reference's empty-string result.
   *
   * Returns the `"a" + in.Field + " grid..."` concatenation, or null when the
   * computation isn't a single template literal or any interpolation isn't
   * representable (so the caller keeps its existing pattern matching).
   */
  private computeTemplateLiteralMemoInitialValue(
    computation: string,
    propsParams: { name: string; type?: TypeInfo; defaultValue?: string }[],
  ): string | null {
    const sf = ts.createSourceFile(
      '__memo.ts',
      `const __x = (${computation});`,
      ts.ScriptTarget.Latest,
      /*setParentNodes*/ false,
    )
    const stmt = sf.statements[0]
    if (!stmt || !ts.isVariableStatement(stmt)) return null
    let init = stmt.declarationList.declarations[0]?.initializer
    while (init && ts.isParenthesizedExpression(init)) init = init.expression
    if (!init || !ts.isArrowFunction(init)) return null
    let body = init.body as ts.Node
    while (ts.isParenthesizedExpression(body as ts.Expression)) {
      body = (body as ts.ParenthesizedExpression).expression
    }

    // Block-bodied arrow (the Toggle `classes` memo): collect leading
    // `const X = props.Y ?? 'lit'` key bindings, then resolve against the
    // single returned template literal. The bindings let `variantClasses[variant]`
    // resolve `variant` to prop `variant` with its `'default'` fallback key.
    const localKeyBindings = new Map<string, { propName: string; defaultLiteral?: string }>()
    if (ts.isBlock(body)) {
      let returned: ts.Node | null = null
      for (const s of body.statements) {
        if (ts.isVariableStatement(s)) {
          for (const d of s.declarationList.declarations) {
            if (!ts.isIdentifier(d.name) || !d.initializer) continue
            const binding = this.parseLocalKeyBinding(d.initializer)
            if (binding) localKeyBindings.set(d.name.text, binding)
          }
        } else if (ts.isReturnStatement(s) && s.expression) {
          returned = s.expression
        } else if (ts.isExpressionStatement(s) || ts.isEmptyStatement(s)) {
          // ignore
        } else {
          return null // unsupported statement shape — bail to existing patterns
        }
      }
      if (!returned) return null
      body = returned
      while (ts.isParenthesizedExpression(body as ts.Expression)) {
        body = (body as ts.ParenthesizedExpression).expression
      }
    }

    if (!ts.isTemplateExpression(body) && !ts.isNoSubstitutionTemplateLiteral(body)) {
      return null
    }
    const propNames = new Set(propsParams.map(p => p.name))
    const escGo = (s: string) => `"${this.escapeGoString(s)}"`
    const segments: string[] = []

    if (ts.isNoSubstitutionTemplateLiteral(body)) {
      return escGo(body.text)
    }
    // head + each span
    if (body.head.text) segments.push(escGo(body.head.text))
    for (const span of body.templateSpans) {
      const resolved = this.resolveTemplateInterpolation(span.expression, propNames, localKeyBindings)
      if (resolved === null) return null
      segments.push(resolved)
      if (span.literal.text) segments.push(escGo(span.literal.text))
    }
    if (segments.length === 0) return '""'
    return segments.join(' + ')
  }

  /**
   * (#checkbox) Resolve one `${expr}` interpolation of a template-literal memo
   * to a Go string expression, or null when unsupported. See
   * `computeTemplateLiteralMemoInitialValue` for the supported shapes.
   */
  private resolveTemplateInterpolation(
    expr: ts.Expression,
    propNames: Set<string>,
    localKeyBindings: ReadonlyMap<string, { propName: string; defaultLiteral?: string }> = new Map(),
  ): string | null {
    let node: ts.Expression = expr
    while (ts.isParenthesizedExpression(node)) node = node.expression

    // Identifier → module string const inline.
    if (ts.isIdentifier(node)) {
      const inlined = this.resolveModuleStringConst(node.text)
      if (inlined !== null) return inlined
      return null
    }

    // `recordConst[key]` → inline indexed Go map (the Toggle `classes` memo's
    // `variantClasses[variant]` / `sizeClasses[size]`).
    if (ts.isElementAccessExpression(node)) {
      const indexed = this.recordIndexInterpolationToGo(node, propNames, localKeyBindings)
      if (indexed !== null) return indexed
      return null
    }

    // `props.X ?? '...'` — string-typed prop with an empty-string fallback.
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
    ) {
      const right = node.right
      const isEmptyStr =
        (ts.isStringLiteral(right) || ts.isNoSubstitutionTemplateLiteral(right)) &&
        right.text === ''
      const propName = this.propsAccessName(node.left)
      if (propName && propNames.has(propName) && isEmptyStr) {
        // Unset string field is "" in Go — same as `?? ''`.
        return `in.${this.capitalizeFieldName(propName)}`
      }
      return null
    }

    // Bare `props.X` (string-typed prop).
    const propName = this.propsAccessName(node)
    if (propName && propNames.has(propName)) {
      return `in.${this.capitalizeFieldName(propName)}`
    }
    return null
  }

  /**
   * Parse a memo-local `const X = …` initializer into a `Record`-index key
   * binding: `props.Y ?? 'lit'` → `{ propName: 'Y', defaultLiteral: 'lit' }`,
   * or bare `props.Y` → `{ propName: 'Y' }`. Returns null for any other shape
   * (a literal const, a call, etc.) so it simply isn't registered as a key.
   */
  private parseLocalKeyBinding(
    init: ts.Expression,
  ): { propName: string; defaultLiteral?: string } | null {
    let node: ts.Expression = init
    while (ts.isParenthesizedExpression(node)) node = node.expression
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
    ) {
      const propName = this.propsAccessName(node.left)
      const right = node.right
      if (
        propName &&
        (ts.isStringLiteral(right) || ts.isNoSubstitutionTemplateLiteral(right))
      ) {
        return { propName, defaultLiteral: right.text }
      }
      return null
    }
    const propName = this.propsAccessName(node)
    if (propName) return { propName }
    return null
  }

  /**
   * Lower a `recordConst[key]` interpolation to an inline indexed Go map,
   * emitting `map[string]string{…}[fmt.Sprint(in.Field)]` (or `map[string]any`
   * for mixed values). `key` is a bare prop or a memo-local const bound to
   * `props.X ?? 'default'` (resolved via `localKeyBindings`); a `'default'`
   * fallback also maps `""` to that entry, so an unset prop (Go zero value `""`)
   * renders the default — matching Hono's `props.X ?? 'default'`. Returns null
   * for any non-record / non-resolvable key so the caller falls through.
   */
  private recordIndexInterpolationToGo(
    node: ts.ElementAccessExpression,
    propNames: Set<string>,
    localKeyBindings: ReadonlyMap<string, { propName: string; defaultLiteral?: string }>,
  ): string | null {
    const parsed = parseRecordIndexAccess(
      node,
      this.localConstants ?? [],
      [...propNames].map(name => ({ name })),
      name => localKeyBindings.get(name) ?? null,
    )
    if (!parsed) return null
    const goVal = (v: { kind: 'number' | 'string'; text: string }) =>
      v.kind === 'number' ? v.text : JSON.stringify(v.text)
    const entries = parsed.entries.map(e => `${JSON.stringify(e.key)}: ${goVal(e.value)}`)
    if (parsed.defaultKey !== undefined) {
      const def = parsed.entries.find(e => e.key === parsed.defaultKey)
      if (def) entries.unshift(`"": ${goVal(def.value)}`)
    }
    const allString = parsed.entries.every(e => e.value.kind === 'string')
    const mapType = allString ? 'map[string]string' : 'map[string]any'
    this.usesFmt = true
    return `${mapType}{${entries.join(', ')}}[fmt.Sprint(in.${this.capitalizeFieldName(parsed.indexPropName)})]`
  }

  /**
   * If `node` is a `<propsObjectName>.<name>` access, return `<name>`, else
   * null. Used to recognize props-object reads inside memo interpolations.
   */
  private propsAccessName(node: ts.Expression): string | null {
    if (!ts.isPropertyAccessExpression(node)) return null
    if (!ts.isIdentifier(node.expression)) return null
    if (!this.propsObjectName || node.expression.text !== this.propsObjectName) return null
    return node.name.text
  }

  private computeMemoInitialValue(
    memo: { name: string; computation: string; deps: string[] },
    signals: { getter: string; initialValue: string }[],
    propsParams: { name: string; type?: TypeInfo; defaultValue?: string }[],
    propFallbackVars: ReadonlyMap<string, PropFallbackVar> = GoTemplateAdapter.EMPTY_PROP_FALLBACK_VARS,
    // (#checkbox) Go type of the memo field; used to pick the zero-value
    // fallback for an unresolved computation (`false` for `bool`, `""` for
    // `string`, else the historical `0`).
    goType?: string,
  ): string {
    const resolved = this.computeMemoInitialValueOrNull(
      memo, signals, propsParams, propFallbackVars,
    )
    if (resolved !== null) return resolved
    // Default: zero value for the memo's Go type (#checkbox). A boolean memo
    // (`isChecked`) renders `false`, a string memo `""`; reference types
    // (map / slice / interface / pointer) take `nil` — `0` is not
    // assignable to them and broke the struct literal for a
    // block-bodied string-building memo whose type inferred to
    // `map[string]any` (#1896, select-demo's `summary`). Other types
    // keep the historical int `0`.
    if (goType === 'bool') return 'false'
    if (goType === 'string') return '""'
    if (
      goType !== undefined &&
      (goType.startsWith('map[') ||
        goType.startsWith('[]') ||
        goType.startsWith('*') ||
        goType.includes('interface{}') ||
        goType === 'any')
    ) {
      return 'nil'
    }
    return '0'
  }

  /**
   * Pattern-matching core of `computeMemoInitialValue`: returns the
   * memo's SSR initial value as a Go expression, or `null` when no
   * pattern applies. Callers that have a typed field to fill use the
   * zero-value-defaulting wrapper above; callers that can simply OMIT
   * the field (a child-instance prop init — Go's zero values then apply
   * with the right type for free) use this directly (#1896,
   * data-table's `Checked: 0` into a bool field).
   */
  private computeMemoInitialValueOrNull(
    memo: { name: string; computation: string; deps: string[] },
    signals: { getter: string; initialValue: string }[],
    propsParams: { name: string; type?: TypeInfo; defaultValue?: string }[],
    propFallbackVars: ReadonlyMap<string, PropFallbackVar> = GoTemplateAdapter.EMPTY_PROP_FALLBACK_VARS,
  ): string | null {
    const computation = memo.computation
    // Helper to pick the hoisted var (if any) or fall back to `in.X`.
    const propRef = (propName: string): string => {
      const hoisted = propFallbackVars.get(propName)
      if (hoisted) return hoisted.varName
      return `in.${this.capitalizeFieldName(propName)}`
    }

    // (#checkbox) Pattern: () => `...${expr}...` — a template-literal memo
    // (the classes memo: `${baseClasses} ${focusClasses} ... ${props.className
    // ?? ''} grid place-content-center`). Build a Go string concatenation that
    // inlines module string consts (incl. `[...].join(' ')` consts resolved by
    // `resolveModuleStringConst`) and resolves `props.X ?? ''` / bare `props.X`
    // to the corresponding `in.Field`. Returns null when any interpolation
    // isn't representable, so the existing patterns below still apply.
    const tmplMemo = this.computeTemplateLiteralMemoInitialValue(computation, propsParams)
    if (tmplMemo !== null) return tmplMemo

    // Pattern: () => getter() === 'lit' / !== 'lit' — a selection memo
    // (#1896, tabs' `isAccountSelected = createMemo(() => activeTab() ===
    // 'account')`). Resolves to a Go bool when the signal's initial value
    // is itself a string literal.
    const eqMatch = computation.match(
      /^\(\)\s*=>\s*(\w+)\(\)\s*([!=]==?)\s*'([^']*)'\s*$/,
    )
    if (eqMatch) {
      const [, depName, op, lit] = eqMatch
      const signal = signals.find(sg => sg.getter === depName)
      const initLit = signal ? /^'([^'\\]*)'$/.exec(signal.initialValue.trim()) : null
      if (initLit) {
        const equal = initLit[1] === lit
        return String(op.startsWith('!') ? !equal : equal)
      }
    }

    // Pattern: () => props.X ?? false — a boolean passthrough memo
    // (#1896, SelectItem's `isDisabled`). Go's bool zero value IS the
    // `?? false` fallback, so the raw input field carries the memo
    // semantics exactly.
    const boolPassthrough = computation.match(
      /^\(\)\s*=>\s*props\.(\w+)\s*\?\?\s*false\s*$/,
    )
    if (boolPassthrough) {
      return propRef(boolPassthrough[1])
    }

    // Pattern: () => cond() ? A : B where each branch is a module string
    // const or a string literal, and `cond` is a signal/memo this
    // resolver can already evaluate (#1896, SelectItem's
    // `stateClasses`). Emits a Go conditional so the SSR value tracks
    // the caller's input rather than a baked branch.
    const ternMatch = computation.match(
      /^\(\)\s*=>\s*(\w+)\(\)\s*\?\s*([\w$]+|'[^']*')\s*:\s*([\w$]+|'[^']*')\s*$/,
    )
    if (ternMatch) {
      const [, condName, whenTrue, whenFalse] = ternMatch
      const resolveBranch = (b: string): string | null => {
        const lit = /^'([^']*)'$/.exec(b)
        if (lit) return JSON.stringify(lit[1])
        const constVal = this.moduleStringConsts.get(b)
        return constVal !== undefined ? JSON.stringify(constVal) : null
      }
      const t = resolveBranch(whenTrue)
      const f = resolveBranch(whenFalse)
      if (t !== null && f !== null) {
        let condGo: string | null = null
        const condSignal = signals.find(sg => sg.getter === condName)
        if (condSignal) {
          condGo = this.getSignalInitialValueAsGo(condSignal.initialValue, propsParams, propFallbackVars)
        } else {
          const condMemo = (this.currentMemos ?? []).find(m => m.name === condName)
          if (condMemo) {
            condGo = this.computeMemoInitialValueOrNull(condMemo, signals, propsParams, propFallbackVars)
          }
        }
        if (condGo === 'true') return t
        if (condGo === 'false') return f
        if (condGo !== null) {
          return `func() string { if ${condGo} { return ${t} }; return ${f} }()`
        }
      }
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

    return null
  }

  /**
   * Whether a memo is an arrow whose result is a template literal — either a
   * concise body (`() => \`…\``) or a block body whose `return` is one.
   */
  private isTemplateLiteralMemo(computation: string): boolean {
    const sf = ts.createSourceFile(
      '__memo.ts', `const __x = (${computation});`, ts.ScriptTarget.Latest, /*setParentNodes*/ false,
    )
    const stmt = sf.statements[0]
    if (!stmt || !ts.isVariableStatement(stmt)) return false
    let init = stmt.declarationList.declarations[0]?.initializer
    while (init && ts.isParenthesizedExpression(init)) init = init.expression
    if (!init || !ts.isArrowFunction(init)) return false
    let body = init.body as ts.Node
    while (ts.isParenthesizedExpression(body as ts.Expression)) {
      body = (body as ts.ParenthesizedExpression).expression
    }
    if (ts.isBlock(body)) {
      const ret = body.statements.find(ts.isReturnStatement)
      if (!ret || !ret.expression) return false
      body = ret.expression
      while (ts.isParenthesizedExpression(body as ts.Expression)) {
        body = (body as ts.ParenthesizedExpression).expression
      }
    }
    return ts.isTemplateExpression(body) || ts.isNoSubstitutionTemplateLiteral(body)
  }

  /**
   * Infer the Go type for a memo based on its computation and dependencies.
   */
  private inferMemoType(
    memo: { name: string; computation: string; type: TypeInfo; deps: string[] },
    signals: { getter: string; initialValue: string; type: TypeInfo }[],
    propsParamMap: Map<string, { name: string; type: TypeInfo; defaultValue?: string }>
  ): string {
    // A template-literal memo always produces a string. Decide this first so a
    // class-string `/` (e.g. `ring-ring/50`) doesn't trip the arithmetic
    // heuristic below into `int`.
    if (this.isTemplateLiteralMemo(memo.computation)) return 'string'

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

    // (#checkbox) Boolean memo: a comparison/negation/ternary whose dependency
    // signals are all boolean (`isChecked = isControlled() ? controlledChecked()
    // : internalChecked()`). Inferring `bool` makes the field render `false`
    // (not the int `0`) for `aria-checked={isChecked()}`, matching Hono's SSR
    // initial value. Only fires when the declared memo type is unknown so an
    // explicitly-typed memo still wins.
    if (this.typeInfoToGo(memo.type) === 'interface{}' && this.isBooleanMemo(memo, signals, propsParamMap)) {
      return 'bool'
    }

    // Default to the memo's declared type
    return this.typeInfoToGo(memo.type)
  }

  /**
   * (#checkbox) Heuristic: does this memo evaluate to a boolean? True when its
   * computation is a comparison (`!==`/`===`/`!=`/`==`), a negation (`!x`), or
   * a ternary whose branches are all boolean signals/props. Used to pick `bool`
   * (zero value `false`) over the int `0` default for the SSR initial value.
   */
  private isBooleanMemo(
    memo: { computation: string; deps: string[] },
    signals: { getter: string; initialValue: string; type: TypeInfo }[],
    propsParamMap: Map<string, { name: string; type: TypeInfo; defaultValue?: string }>,
  ): boolean {
    const c = memo.computation
    if (/(!==|===|!=(?!=)|==(?!=))/.test(c)) return true
    if (/=>\s*!/.test(c)) return true
    // Ternary `() => cond() ? a() : b()` — boolean when both branches are
    // boolean-resolving getters (signals whose value is boolean, or boolean
    // props).
    const isBoolGetter = (name: string): boolean => {
      const sig = signals.find(s => s.getter === name)
      if (sig) {
        if (this.typeInfoToGo(sig.type) === 'bool') return true
        // Signal initialised from `props.X ?? false` / a boolean prop.
        if (/\?\?\s*(true|false)\b/.test(sig.initialValue)) return true
        const propName = this.extractPropNameFromInitialValue(sig.initialValue) ?? sig.initialValue
        const prop = propsParamMap.get(propName)
        if (prop && this.typeInfoToGo(prop.type, prop.defaultValue) === 'bool') return true
        return false
      }
      const prop = propsParamMap.get(name)
      return !!prop && this.typeInfoToGo(prop.type, prop.defaultValue) === 'bool'
    }
    const ternary = c.match(/=>\s*\w+\(\)\s*\?\s*(\w+)\(\)\s*:\s*(\w+)\(\)/)
    if (ternary) {
      return isBoolGetter(ternary[1]) && isBoolGetter(ternary[2])
    }
    return false
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

  /**
   * A source key that can become a Go struct field — i.e. a valid Go
   * identifier. TS object keys that aren't (e.g. `"data-id"`, numeric keys)
   * can't be exported struct fields, so they're excluded from struct generation
   * and from the baker's field map.
   */
  private static GO_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

  /** Go common initialisms that should be fully uppercased (https://go.dev/wiki/CodeReviewComments#initialisms) */
  // Not `private`: the module-level `capitalize` helper reads this so
  // `bf_sort` / `bf_reduce` field projection matches `capitalizeFieldName`.
  static GO_INITIALISMS = new Set([
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
    // (#1297) A root scope element carries `data-key` for a keyed loop item —
    // the parent's loop init stamped `.BfDataKey`, so a non-keyed render emits
    // nothing. Mirrors Hono stamping data-key on each loop item's scope root,
    // including early-return (if-statement) roots where every branch's top
    // element qualifies.
    if (this.rootScopeNodes.has(element) && element.needsScope) {
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
    // `undefined` / `null` inside a larger expression tree (a ternary
    // branch like `props.isActive ? 'page' : undefined`, #1896
    // pagination) renders as the empty string — the top-level
    // `convertExpressionToGo` short-circuit doesn't see nested ones.
    if (name === 'undefined' || name === 'null') return '""'
    // Module pure-string const (e.g. `const baseClasses = '...'` used in a
    // className template literal): inline the literal value rather than
    // emit `{{.BaseClasses}}` against a Props field that never exists.
    // Destructure-param bindings (`.map(({ id, ...rest }) => …)`): resolve the
    // binding name to its accessor on the range var. Innermost loop wins, and
    // this runs *before* module-const inlining so a binding whose name collides
    // with a module string const still resolves to the loop item. (#1310)
    for (let i = this.loopBindingStack.length - 1; i >= 0; i--) {
      const acc = this.loopBindingStack[i].get(name)
      if (acc !== undefined) return acc
    }
    const inlined = this.resolveModuleStringConst(name)
    if (inlined !== null) return inlined
    const currentLoopParam = this.loopParamStack[this.loopParamStack.length - 1]
    if (currentLoopParam && name === currentLoopParam) return '.'
    // An *outer* loop's value variable (we're in a nested loop) is in scope as
    // the Go range variable `$name` declared by that loop's `{{range … := …}}`;
    // the inner dot no longer refers to it, and it's not a root field. (#1677)
    if (this.isOuterLoopParam(name)) return `$${name}`
    if (this.loopVarRefCount.has(name)) return `$${name}`
    return this.rootFieldRef(name)
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
   * rebinds. Outside any loop the root *is* the dot, so we emit `.Field` (#1677).
   */
  private rootFieldRef(name: string): string {
    const prefix = this.loopParamStack.length > 0 ? '$.' : '.'
    return `${prefix}${this.capitalizeFieldName(name)}`
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
    // Single source of truth shared with the Mojo / Xslate adapters
    // (fixed-point resolution incl. composed template-literal consts and
    // `[...].join(sep)` — #1896 / #1897).
    return collectModuleStringConstsShared(constants)
  }



  /**
   * (#checkbox) Statically evaluate `[<string literals>].join(<sep?>)`.
   * Returns the joined string, or null when the shape doesn't match (non-call,
   * non-`.join`, non-array receiver, any non-string-literal element, or a
   * non-string-literal separator). Comments/whitespace between elements are
   * irrelevant — the TS parser already discarded them.
   */
  /**
   * Resolve an identifier to its inlined Go string literal when it names a
   * module pure-string const. Returns the Go template literal form
   * (`"<escaped>"`) so callers can drop it straight into a `{{...}}` action,
   * or `null` when the name is not such a const (the caller then falls back
   * to its normal field-ref lowering). The value is escaped for a Go
   * double-quoted string literal — Go's `html/template` then applies the
   * same contextual auto-escaping it applies to any literal, matching Hono.
   */
  private resolveModuleStringConst(name: string): string | null {
    if (this.loopParamStack.length > 0 && this.loopParamStack[this.loopParamStack.length - 1] === name) {
      return null
    }
    if (this.loopVarRefCount.has(name)) return null
    if (this.isOuterLoopParam(name)) return null
    const value = this.moduleStringConsts.get(name)
    if (value === undefined) return null
    return `"${this.escapeGoString(value)}"`
  }

  literal(value: string | number | boolean | null, literalType: LiteralType): string {
    if (literalType === 'string') return `"${value}"`
    if (literalType === 'null') return 'nil'
    return String(value)
  }

  call(callee: ParsedExpr, args: ParsedExpr[], emit: (e: ParsedExpr) => string): string {
    // Signal call: count() -> .Count (or $.Count inside a loop, #1677)
    if (callee.kind === 'identifier' && args.length === 0) {
      return this.rootFieldRef(callee.name)
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

    // SolidJS-style props pattern: props.xxx -> .Xxx (or $.Xxx inside a loop,
    // since props live on the root data struct, not the iteration element #1677)
    if (object.kind === 'identifier' && this.propsObjectName && object.name === this.propsObjectName) {
      return this.rootFieldRef(property)
    }

    // Static property access on a module object-literal const
    // (`variantClasses.ghost` in a class template literal, #1896
    // pagination) resolves at compile time — same lookup as the
    // bracket-index form in `resolveStaticRecordLiteralIndex`, reached
    // here when the access is nested inside a larger ParsedExpr tree.
    if (object.kind === 'identifier') {
      const staticValue = this.resolveStaticRecordLiteralIndex(
        `${object.name}.${property}`,
      )
      if (staticValue !== null) return staticValue
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

  indexAccess(object: ParsedExpr, index: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    // Go's `index` builtin: `index $arr $i`. Both operands render
    // through the same emitter so a loop-variable / arithmetic index
    // lowers correctly. A multi-token operand (`bf_add $i 1`) must be
    // parenthesised or Go parses it as extra `index` arguments. #1897
    // (`selected()[index]`). (data-table's broader keyed-loop SSR stays
    // tracked under #1896.)
    return `index ${wrapIfMultiToken(emit(object))} ${wrapIfMultiToken(emit(index))}`
  }

  binary(op: string, left: ParsedExpr, right: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    const l = emit(left)
    const r = emit(right)
    switch (op) {
      case '===':
      case '==': {
        const [el, er] = stringTolerantEqOperands(l, r)
        return `eq ${el} ${er}`
      }
      case '!==':
      case '!=': {
        const [el, er] = stringTolerantEqOperands(l, r)
        return `ne ${el} ${er}`
      }
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
        // A nested ternary emits a complete `{{if …}}…{{end}}` action
        // chain (see `conditional` above) — wrapping it again produces
        // `{{{{if …}}` and a template parse error (#1896, the tooltip
        // open/closed class ternary with module-const branches). Same
        // guard as `renderExpression`.
        const e = emit(part.expr)
        result += e.startsWith('{{') ? e : `{{${e}}}`
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
        message: GO_REMEDIATION_OPTIONS,
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
        // `.join()` defaults the separator to `,` (JS); any extra
        // argument is ignored. Only `args[0]` is read.
        const sep = args.length >= 1 ? emit(args[0]) : '","'
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
        // method name at the adapter layer. `.at()` with no argument is
        // `.at(0)` (the first element); extra arguments are ignored.
        const obj = emit(object)
        const idx = args.length >= 1 ? emit(args[0]) : '0'
        return `bf_at ${wrapIfMultiToken(obj)} ${wrapIfMultiToken(idx)}`
      }
      case 'concat': {
        // `.concat(other)` merges two arrays. The runtime helper
        // `bf_concat` reflects over both operands so callers can
        // mix `[]string` + `[]string` or `[]any` + `[]string` etc.
        // without per-call-site type-juggling. `.concat()` with no
        // argument is a shallow copy — indistinguishable from the
        // receiver in an SSR snapshot, so it lowers to the receiver.
        if (args.length === 0) {
          return emit(object)
        }
        const a = emit(object)
        const b = emit(args[0])
        return `bf_concat ${wrapIfMultiToken(a)} ${wrapIfMultiToken(b)}`
      }
      case 'slice': {
        // `.slice()` / `.slice(start)` / `.slice(start, end)` — route
        // through `bf_slice`. A missing `start` defaults to 0 (full
        // copy); the runtime helper treats an absent `end` as "to
        // length". Out-of-bounds indices clamp instead of panicking
        // (JS-compat); `start > end` returns an empty slice. JS ignores
        // a third+ argument, so only `args[0]` / `args[1]` are read.
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
      case 'toFixed': {
        // `.toFixed(digits?)` → `bf_to_fixed` (`fmt.Sprintf("%.*f", …)`).
        // Default 0 digits when the argument is omitted. #1897.
        const recv = emit(object)
        const digits = args.length >= 1 ? emit(args[0]) : '0'
        return `bf_to_fixed ${wrapIfMultiToken(recv)} ${wrapIfMultiToken(digits)}`
      }
      case 'split': {
        // `.split()` / `.split(sep)` / `.split(sep, limit)` — string →
        // `[]any`. No separator → the whole string as a single element
        // (`bf_arr`). Otherwise `bf_split` (wraps `strings.Split`,
        // normalised to `[]any`); a second `limit` argument caps the
        // pieces. JS ignores a third+ argument. See #1448 Tier B.
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
        // `.startsWith(prefix, position?)` / `.endsWith(suffix,
        // endPosition?)` — string → boolean via the `bf_starts_with` /
        // `bf_ends_with` helpers (`strings.HasPrefix` /
        // `strings.HasSuffix`). The optional second argument re-anchors
        // the test; JS ignores a third+ argument. See #1448 Tier B.
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
        // `.replace(old, new)` — string-pattern form, first occurrence
        // only, via the new `bf_replace` helper (`strings.Replace` with
        // n=1). The regex-pattern form is refused upstream at the
        // parser. See #1448 Tier B.
        const recv = emit(object)
        const oldS = emit(args[0])
        const newS = emit(args[1])
        return `bf_replace ${wrapIfMultiToken(recv)} ${wrapIfMultiToken(oldS)} ${wrapIfMultiToken(newS)}`
      }
      case 'repeat': {
        // `.repeat(n)` — string repeated `n` times via the `bf_repeat`
        // helper. The helper clamps a negative count to "" instead of
        // letting `strings.Repeat` panic. Full JS arity: the no-argument
        // form is `repeat(0)` → ""; a second+ argument is ignored.
        // See #1448 Tier B.
        const recv = emit(object)
        const count = args.length === 0 ? '0' : emit(args[0])
        return `bf_repeat ${wrapIfMultiToken(recv)} ${wrapIfMultiToken(count)}`
      }
      case 'padStart':
      case 'padEnd': {
        // `.padStart(target, pad?)` / `.padEnd(target, pad?)` — pad to
        // `target` runes with `pad` (default a single space, supplied
        // by the variadic helper when the arg is absent). Full JS arity:
        // the no-argument form is `padStart(0)` → the receiver
        // unchanged; a third+ argument is ignored. See #1448 Tier B.
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

  reduceMethod(
    method: 'reduce' | 'reduceRight',
    object: ParsedExpr,
    reduceOp: ReduceOp,
    emit: (e: ParsedExpr) => string,
  ): string {
    // `.reduce(fn, init)` / `.reduceRight(fn, init)` arithmetic-fold
    // lowering (#1448 Tier C). The structured `ReduceOp` (op / key /
    // type / init) plus the fold direction feed the `bf_reduce` runtime
    // helper, which folds the receiver into a scalar.
    const direction = method === 'reduceRight' ? 'right' : 'left'
    return emitBfReduce(emit(object), reduceOp, direction)
  }

  flatMethod(object: ParsedExpr, depth: FlatDepth, emit: (e: ParsedExpr) => string): string {
    // `.flat(depth?)` → `bf_flat <recv> <depth>`. The `Infinity` form
    // lowers to the `-1` sentinel (flatten fully); a finite depth flattens
    // that many levels (`0` = shallow copy). See packages/adapter-go-
    // template/runtime/bf.go.
    const d = depth === 'infinity' ? -1 : depth
    return `bf_flat ${wrapIfMultiToken(emit(object))} ${d}`
  }

  flatMapMethod(object: ParsedExpr, op: FlatMapOp, emit: (e: ParsedExpr) => string): string {
    const recv = wrapIfMultiToken(emit(object))
    const proj = op.projection
    // Tuple projection `i => [i.a, i.b]` → `bf_flat_map_tuple <recv>
    // "<kind>" "<name>" ...` (one quoted pair per leaf). flat(1) removes
    // only the literal's wrapper, so the runtime appends each leaf verbatim.
    if (proj.kind === 'tuple') {
      const pairs = proj.elements
        .map(l => (l.kind === 'self' ? `"self" ""` : `"field" "${capitalize(l.field)}"`))
        .join(' ')
      return `bf_flat_map_tuple ${recv} ${pairs}`
    }
    // Scalar `.flatMap(i => i)` / `.flatMap(i => i.field)` → `bf_flat_map
    // <recv> "<kind>" "<name>"`. The runtime projects each item then
    // flattens one level. The field name uses the Go struct-field
    // capitalisation, matching `bf_reduce` / `bf_sort`.
    if (proj.kind === 'self') {
      return `bf_flat_map ${recv} "self" ""`
    }
    return `bf_flat_map ${recv} "field" "${capitalize(proj.field)}"`
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

    // `IDENT['key']` over a module object-literal const with a STRING
    // LITERAL key is a fully static lookup — resolve it at compile time
    // (#1896). The generic member lowering below would otherwise
    // capitalize the bracket access into a field reference and emit an
    // invalid hyphenated path (`strokePaths['chevron-down']` →
    // `.StrokePaths.Chevron-down`, a template parse error).
    const staticIndexed = this.resolveStaticRecordLiteralIndex(trimmed)
    if (staticIndexed !== null) {
      return staticIndexed
    }

    // A bare identifier bound to a literal const inlines at compile time
    // (#1896 — pagination's `Page {currentPage()} of {totalPages}`:
    // `totalPages` is a function-scope `const totalPages = 5`, not a
    // prop, so the generic lowering would reference a nonexistent
    // `.TotalPages` field). Only pure numeric / single-quoted-string
    // initializers qualify; anything else may be runtime-dependent.
    if (/^[A-Za-z_$][\w$]*$/.test(trimmed)) {
      const litConst = (this.localConstants ?? []).find(c => c.name === trimmed)
      if (litConst?.value !== undefined) {
        const v = litConst.value.trim()
        if (/^-?\d+(\.\d+)?$/.test(v)) return v
        const strLit = /^'([^'\\]*)'$/.exec(v) ?? /^"([^"\\]*)"$/.exec(v)
        if (strLit) return JSON.stringify(strLit[1])
      }
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
          message: buildUnsupportedSuggestion(support),
        },
      })
      // Return empty string - Go template comments must be separate actions
      return `""`
    }

    return this.renderParsedExpr(parsed)
  }

  /**
   * Resolve `IDENT['key']` / `IDENT["key"]` where `IDENT` is a
   * module-scope object-literal const and the key is a string literal —
   * a compile-time-static lookup (the icon registry's
   * `strokePaths['chevron-down']`, #1896). Returns the looked-up value
   * as a Go literal (quoted string / bare number) usable inside a
   * template action, or `null` for any other shape so the caller falls
   * through to the generic lowering. The prop-keyed variant of the same
   * pattern lives in `parseRecordIndexAccess` (shared with Mojo); this
   * helper covers the literal-key case that parse rejects.
   */
  private resolveStaticRecordLiteralIndex(jsExpr: string): string | null {
    const m =
      /^([A-Za-z_$][\w$]*)\[\s*(?:'([^']*)'|"([^"]*)")\s*\]$/.exec(jsExpr) ??
      // Property-access form of the same static lookup
      // (`variantClasses.ghost`, #1896 pagination) — only when the base
      // resolves to a module object-literal const below, so ordinary
      // props/locals never match.
      /^([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)$/.exec(jsExpr)
    if (!m) return null
    const key = m[2] ?? m[3]
    const constInfo = (this.localConstants ?? []).find(
      c => c.name === m[1] && c.isModule,
    )
    if (constInfo?.value === undefined) return null
    const sf = ts.createSourceFile(
      '__rec.ts',
      `(${constInfo.value})`,
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
    )
    if (sf.statements.length !== 1) return null
    const stmt = sf.statements[0]
    if (!ts.isExpressionStatement(stmt)) return null
    let parsed: ts.Expression = stmt.expression
    while (ts.isParenthesizedExpression(parsed)) parsed = parsed.expression
    if (!ts.isObjectLiteralExpression(parsed)) return null
    for (const prop of parsed.properties) {
      if (!ts.isPropertyAssignment(prop)) continue
      const name = prop.name
      const propKey =
        ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)
          ? name.text
          : null
      if (propKey !== key) continue
      let v: ts.Expression = prop.initializer
      while (ts.isParenthesizedExpression(v)) v = v.expression
      if (ts.isNumericLiteral(v)) return v.text
      if (ts.isStringLiteral(v) || ts.isNoSubstitutionTemplateLiteral(v)) {
        return JSON.stringify(v.text)
      }
      return null
    }
    return null
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
          message: buildUnsupportedSuggestion(support),
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
        // template primitive. There is no honest way to evaluate it at SSR time,
        // and silently forcing it (to true OR false) is a correctness hazard —
        // a forced-true could expose auth-gated content, a forced-false could
        // hide required content, and a warning is too easily ignored. Refuse
        // with a hard BF102 error so the author must move the predicate to a
        // supported primitive or defer it with `/* @client */`.
        if (
          expr.callee.kind === 'identifier' &&
          !this.templatePrimitives[identifierPath(expr.callee) ?? '']
        ) {
          const path = identifierPath(expr.callee) ?? expr.callee.name
          this.errors.push({
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
          return plain(this.rootFieldRef(expr.property))
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

      case 'index-access': {
        // Go's `index` builtin: `index $arr $i`. A multi-token operand
        // (`bf_add $i 1`) must be parenthesised or Go parses it as extra
        // `index` arguments. #1897.
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

  /**
   * Map each destructure binding to its Go accessor on the range var: a named
   * binding → `$<rangeVar>.<Field>`, an object-rest binding → the bare
   * `$<rangeVar>` so the member emitter renders `rest.flag` → `$<rangeVar>.Flag`.
   * (#1310)
   */
  private buildDestructureBindingMap(loop: IRLoop, rangeVar: string): Map<string, string> {
    const m = new Map<string, string>()
    for (const b of loop.paramBindings ?? []) {
      if (b.rest) {
        m.set(b.name, `$${rangeVar}`)
      } else {
        m.set(b.name, `$${rangeVar}.${this.capitalizeFieldName(b.path.slice(1))}`)
      }
    }
    return m
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
    // A destructure loop param is lowerable only for the object-rest /
    // simple-field shape (`.map(({ id, title, ...rest }) => …)`, where `rest`
    // is read via member access): each binding resolves to a field on a named
    // range var (`$__bf_item0.Id`, and `rest.flag` → `$__bf_item0.Flag`). Array-index
    // / nested / rest-spread shapes (`[a, ...t]`, `{ cells: [h] }`, `{...rest}`)
    // still need machinery Go's `{{range}}` can't express inline → BF104. (#1310)
    const destructure = !!(loop.paramBindings && loop.paramBindings.length > 0)
    const supportableDestructure = destructure && isLowerableObjectRestDestructure(loop)
    if (destructure && !supportableDestructure) {
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
    let index = loop.index || '_'

    // `.keys().map(k => ...)` — the callback param is the *index*, not
    // the value. Swap into the Go range's first binding slot so
    // `{{range $k, $_ := .Arr}}` makes `$k` the 0-based index.
    let rangeIndex = index
    // A supported destructure param can't be the Go range var verbatim
    // (`$__bf_itemN` is a synthetic single name; bindings resolve against it via
    // `loopBindingStack`); otherwise the value var is the param itself. The
    // reserved `__bf_item` prefix avoids colliding with a user binding, and the
    // nesting-depth suffix keeps an inner destructure loop from shadowing an
    // outer one's range var (a binding referenced across levels keeps resolving
    // against its own item).
    let rangeValue = supportableDestructure ? `__bf_item${this.loopBindingStack.length}` : param
    if (loop.iterationShape === 'keys') {
      rangeIndex = param
      rangeValue = '_'
    }

    // Check if the loop contains a component child
    // If so, use .{ComponentName}s which has ScopeID for each item
    // e.g., TodoItem children use .TodoItems, ToggleItem children use .ToggleItems
    const childComponent = this.findChildComponent(loop.children)
    if (childComponent) {
      goArray = `.${childComponent.name}s`
    }

    this.inLoop = true
    // Track Go template loop variables. The range *value* variable
    // is the dot context (`.`) and goes on `loopParamStack`; the
    // range *index* variable needs `$name` notation and goes on
    // `loopVarRefCount`. For `.keys()`, the user's param IS the index
    // (in the `$k, $_` position), so it needs `$name` — don't push
    // it to loopParamStack (`.` would resolve to the value, not key).
    // Push `''` instead — falsy, so the `currentLoopParam &&` guard
    // in `identifier()` / `renderConditionExpr` short-circuits and
    // no name ever matches the empty string.
    // Uses ref-counting (not a flat Set) so nested loops with the
    // same index var name don't clobber the outer loop's entry on
    // cleanup.
    const addedLoopVars: string[] = []
    let pushedBindingMap = false
    if (supportableDestructure) {
      // Bindings resolve against the synthetic `$__bf_item` range var; don't push
      // a loop param (the param is a pattern, not a name).
      this.loopBindingStack.push(this.buildDestructureBindingMap(loop, rangeValue))
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
    const children = this.renderChildren(loop.children)
    // Build the per-item anchor marker while the loop param is still on the
    // stack, so a `bodyIsItemConditional` key expression (#1665) resolves
    // against the range item (`.` context) like `data-key` does — popping
    // first would rewrite `t.id` to `.T.ID` instead of `.ID`.
    const itemMarker = this.loopItemMarker(loop)
    for (const v of addedLoopVars) {
      const rc = (this.loopVarRefCount.get(v) ?? 1) - 1
      if (rc <= 0) this.loopVarRefCount.delete(v)
      else this.loopVarRefCount.set(v, rc)
    }
    this.loopParamStack.pop()
    if (pushedBindingMap) this.loopBindingStack.pop()
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

      return `{{bfComment "loop:${loop.markerId}"}}{{range $${rangeIndex}, $${rangeValue} := ${goArray}}}{{if ${filterCond}}}${itemMarker}${children}{{end}}{{end}}{{bfComment "/loop:${loop.markerId}"}}`
    }

    return `{{bfComment "loop:${loop.markerId}"}}{{range $${rangeIndex}, $${rangeValue} := ${goArray}}}${itemMarker}${children}{{end}}{{bfComment "/loop:${loop.markerId}"}}`
  }

  /**
   * Per-item `<!--bf-loop-i-->` / `<!--bf-loop-i:KEY-->` start marker emitted
   * inside a `{{range}}` body. Multi-root Fragment items (#1212) get the bare
   * anchor; whole-item conditional items (#1665) get the key-bearing anchor so
   * the client's `mapArrayAnchored` can hydrate items that render no element.
   */
  private loopItemMarker(loop: { bodyIsMultiRoot?: boolean; bodyIsItemConditional?: boolean; key?: string | null }): string {
    if (loop.bodyIsMultiRoot) return `{{bfComment "bf-loop-i"}}`
    if (loop.bodyIsItemConditional && loop.key) {
      // `bfComment` prepends `bf-`, so `printf "loop-i:%v"` yields
      // `<!--bf-loop-i:KEY-->`. The key expression resolves against the
      // current range item (`.` context), matching `data-key`'s emission.
      return `{{bfComment (printf "loop-i:%v" ${this.convertExpressionToGo(loop.key)})}}`
    }
    return ''
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

  /**
   * When `comp`'s JSX children contain template actions (nested
   * components, dynamic text) — i.e. none of the static bake paths in
   * `collectStaticChildInstances` apply — render them into a companion
   * define and return its name; `renderComponent` then routes the child
   * call through `bf_with_children` + `bf_tmpl` (#1896). Returns null
   * for childless or statically-bakeable children, which keep the
   * constructor-baked `Children` value.
   */
  private queueDynamicChildrenDefine(comp: IRComponent): string | null {
    const effectiveChildren = comp.children.length > 0
      ? comp.children
      : this.jsxChildrenPropNodes(comp.props)
    if (effectiveChildren.length === 0) return null
    if (this.extractTextChildren(effectiveChildren) !== null) return null
    if (this.extractHtmlChildren(effectiveChildren) !== null) return null
    if (this.extractScopedHtmlChildren(effectiveChildren) !== null) return null
    const name = `${this.componentName}__children_${comp.slotId}`
    if (!this.pendingChildrenDefines.some(d => d.name === name)) {
      this.pendingChildrenDefines.push({
        name,
        content: this.renderChildren(effectiveChildren),
      })
    }
    return name
  }

  renderComponent(comp: IRComponent, ctx?: { isRootOfClientComponent?: boolean }): string {
    // Handle Portal component specially - collect content for body end
    if (comp.name === 'Portal') {
      return this.renderPortalComponent(comp)
    }

    // Dynamic-tag local (`const Tag = children.tag`): there is no template
    // named `<Tag>` to call — emitting `{{template "Tag" .TagSlot0}}` would
    // reference a template that can never be registered, and Go's
    // html/template escape-walks ALL registered templates (even dead
    // branches), so the whole render fails with `no such template "Tag"`.
    // Lower it to its children passthrough instead, so the dead branch
    // renders harmlessly and the Slot template registers cleanly. (Real
    // server-side asChild prop-merge on Go is a separate, deferred concern.)
    if (comp.dynamicTag) {
      return this.renderChildren(comp.children)
    }

    // In Go templates, components are rendered using {{template "name" data}}
    let templateCall: string
    if (this.inLoop) {
      // Loop children: dot becomes loop item (already has correct props)
      templateCall = `{{template "${comp.name}" .}}`
    } else if (comp.slotId) {
      // Static children with slotId: use unique field name based on slotId
      const suffix = slotIdToFieldSuffix(comp.slotId)
      const childrenDefine = this.queueDynamicChildrenDefine(comp)
      templateCall = childrenDefine
        ? `{{template "${comp.name}" (bf_with_children .${comp.name}${suffix} (bf_tmpl "${childrenDefine}" .))}}`
        : `{{template "${comp.name}" .${comp.name}${suffix}}}`
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

  override renderAsync(node: IRAsync): string {
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
      // `style={{ … }}` object literal → a CSS string with dynamic values
      // interpolated, instead of refusing the bare object with BF101.
      if (name === 'style') {
        const css = this.tryLowerStyleObject(value.expr)
        if (css !== null) return `style="${css}"`
      }
      if (isBooleanAttr(name) || value.presenceOrUndefined) {
        const { condition: goCond, preamble } = this.convertConditionToGo(value.expr)
        // ARIA attributes are string-valued ("true"/"false"), not HTML5
        // presence booleans — Hono renders the truthy presence form as
        // `aria-x="true"` (#1896, SelectItem's
        // `aria-disabled={isDisabled() || undefined}`).
        const body = name.startsWith('aria-') ? `${name}="true"` : name
        return `${preamble}{{if ${goCond}}}${body}{{end}}`
      }
      const parsed = parseExpression(value.expr.trim())
      if (parsed.kind === 'conditional') {
        // A ternary whose falsy branch is `undefined` / `null` OMITS the
        // attribute entirely on Hono (`aria-current={props.isActive ?
        // 'page' : undefined}`, #1896 pagination) — wrap the whole
        // attribute in the condition instead of rendering `attr=""`.
        const undef = (e: ParsedExpr): boolean =>
          (e.kind === 'identifier' && (e.name === 'undefined' || e.name === 'null')) ||
          (e.kind === 'literal' && (e.value === null || e.value === undefined))
        const test = parsed.test
        if (undef(parsed.alternate) && !undef(parsed.consequent)) {
          const { condition: goCond, preamble } = this.convertConditionToGo(
            // Re-render the test from its source span via the parsed tree.
            this.renderParsedExpr(test).startsWith('{{')
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
      // Hono-style nullish-attribute omission (#textarea rows): when the
      // attribute value is a BARE reference to a nillable (`interface{}`)
      // prop field, guard emission on `ne .X nil` so an unset optional
      // prop drops the attribute entirely instead of rendering `attr=""`.
      // Hono omits `undefined`/`null`-valued attributes; this restores
      // parity. Scope is deliberately narrow — bare identifiers only — so
      // member exprs, calls, ternaries, template literals, and
      // concrete-typed props (which are never nil) are unaffected and
      // still emit `attr=""` / `attr="0"` exactly as Hono does.
      const bareId = value.expr.trim()
      // Normalize a props-object access (`props.id`) to its bare prop name
      // (`id`) so the nillable set — which is keyed by bare prop name —
      // matches the SolidJS-style props-object pattern too, not just
      // destructured params (#checkbox `id={props.id}`).
      const propName =
        this.propsObjectName && bareId.startsWith(`${this.propsObjectName}.`)
          ? bareId.slice(this.propsObjectName.length + 1)
          : bareId
      if (/^[A-Za-z_$][\w$]*$/.test(propName) && this.nillablePropNames.has(propName)) {
        const field = `.${this.capitalizeFieldName(propName)}`
        return `{{if ne ${field} nil}}${name}="{{${this.convertExpressionToGo(value.expr)}}}"{{end}}`
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

  /**
   * Lower a `style={{ … }}` object-literal value to a CSS string with dynamic
   * values interpolated as Go template actions, e.g.
   * `{ backgroundColor: color, padding: '8px' }` →
   * `background-color:{{.Color}};padding:8px`. Returns null when the object
   * shape is unsupported or any value expression can't be lowered (the caller
   * then falls through to the generic BF101 path). (#1322)
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
        // Same double-wrap guard as `renderExpression` / `templateLiteral`
        // (#1896): a ternary lowers to a complete action chain.
        const goExpr = this.convertExpressionToGo(inner)
        out += goExpr.startsWith('{{') ? goExpr : `{{${goExpr}}}`
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
        const rawKeyExpr = this.convertExpressionToGo(part.key)
        // A compound key (`props.placement ?? 'top'` → `or .Placement
        // "top"`) must be parenthesized inside `eq` — unwrapped, Go's
        // template parser reads `eq or .Placement "top" "left"` as four
        // arguments with a zero-arg `or` (#1896, tooltip placement).
        const keyExpr = /\s/.test(rawKeyExpr) ? `(${rawKeyExpr})` : rawKeyExpr
        const caseEntries = Object.entries(part.cases)
        if (caseEntries.length === 0) continue
        const branches = caseEntries.map(([k, v], i) => {
          const head = i === 0 ? '{{if' : '{{else if'
          // The case value is a static Record<T,string> literal emitted
          // straight into attribute-value text, so HTML-escape it the same
          // way `string` parts are (via substituteJsInterpolations →
          // escapeAttrText). Without this, UnoCSS tokens like
          // `has-[>svg]:px-2.5` would leak a raw `>` and diverge from the
          // Hono reference, which escapes it to `&gt;`.
          return `${head} eq ${keyExpr} ${JSON.stringify(k)}}}${this.escapeAttrText(v)}`
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

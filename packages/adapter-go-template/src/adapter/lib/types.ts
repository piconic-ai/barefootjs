/**
 * Internal type definitions for the Go html/template adapter: the adapter's
 * intermediate bookkeeping shapes (nested-component info, static child
 * instances, spread slots, ctor-lowering scope, …) plus the public
 * `GoTemplateAdapterOptions`. Pure type surface — no behaviour.
 */

import type {
  BindingScope,
  IRLoopChildComponent,
  IRNode,
  IRProp,
  ParsedExpr,
  TypeInfo,
} from '@barefootjs/jsx'

/**
 * Go-template adapter's IRNode render context. Only `isRootOfClientComponent`
 * is consumed today (forwarded into `renderComponent` / `renderIfStatement`);
 * the type stays open so future render-position flags can be added without
 * widening the `IRNodeEmitter` contract.
 */
export type GoRenderCtx = {
  isRootOfClientComponent?: boolean
}

/**
 * Extended nested component info that tracks whether the component
 * comes from a dynamic (signal) array loop vs a static array loop.
 */
export interface NestedComponentInfo extends IRLoopChildComponent {
  isDynamic: boolean
  isPropDerived: boolean
  /**
   * True when the enclosing loop carries a `/* @client *\/` directive
   * (`loop.clientOnly`, #2627). `renderLoop`'s FIRST branch short-circuits a
   * clientOnly loop to bare start/end comment markers — the SSR template
   * never references this nested component's Go field, no matter how
   * `isDynamic`/`isPropDerived` classify its array. Combined with
   * `!isDynamic && !isPropDerived` (a clientOnly loop whose array is
   * neither a real signal/memo NOR a direct prop reference — e.g.
   * `Object.entries(props.tags).filter(...)`), there is no Go value to
   * seed an Input/Props field FROM at all: the array is a function-scope
   * computed local that `renderLoop`'s own BF101 gate refuses to bind as a
   * template variable for a non-clientOnly loop. See
   * `GoTemplateAdapter.isOrphanedClientOnlyNested`.
   */
  clientOnly?: boolean
  /** The enclosing loop's `key` expression (e.g. `item.label`) and map param
   *  name (`item`), so the loop-child init can stamp `data-key` per item. */
  loopKey?: string
  loopParam?: string
  /** The loop body component's JSX children. Non-empty when those children need
   *  a companion define rendered via `bf_with_children` + `bf_tmpl`. */
  bodyChildren?: IRNode[]
  /** The loop's array expression for baking (e.g. `sortedData()`) */
  loopArray?: string
  /** Structured parse of `loopArray` (the loop's `array` string), carried so
   *  scalar-literal loop typing reads the tree instead of re-parsing. */
  loopArrayParsed?: ParsedExpr
  /** The enclosing loop's `markerId` (e.g. `l0`) for unique naming */
  loopMarkerId?: string
  /** The loop item's TS type (`Payment` from `sortedData().map(payment => …)`),
   *  resolved to Go struct fields for the wrapper struct's datum fields. */
  loopItemType?: TypeInfo | null
  /**
   * The row scope of the loop whose body IS this component — every loop from
   * the component root down to it, entered via `BindingScope.enterLoopRow`
   * (`findNestedComponents`). A prop reading one of these names is row-
   * dependent: the constructor runs once, outside the row, so the wrapper-
   * construction sites skip it.
   */
  rowScope?: BindingScope
  /**
   * The loop-body component's own full `IRProp`s (minus `key`) — unlike the
   * trimmed `props` copy on `IRLoopChildComponent`, these carry
   * `freeIdentifiers`, `loc` and `clientOnly`, which the constructor-side
   * prop lowering (`lowerChildInputFields`) needs.
   */
  rowProps?: readonly IRProp[]
}

export interface StaticChildInstance {
  name: string
  slotId: string
  props: IRProp[]
  fieldName: string
  /** Concatenated text content from JSX children (e.g. `+1` for
   *  `<Button>+1</Button>`). Null when children include any non-text node;
   *  those take the `childrenHtml` path if purely static HTML, else dropped. */
  childrenText: string | null
  /** Rendered Go-template fragment for purely-static, non-text JSX children,
   *  forwarded via `Children: template.HTML(...)` so the child's
   *  `{{or .Children ""}}` skips re-escaping. Null when children are text-only
   *  or absent, OR when the fragment contains any `{{...}}` action (those
   *  wouldn't re-evaluate through the parent's `{{.Children}}` read — kept on
   *  the drop path). */
  childrenHtml: string | null
  /** Go string-concat expression for hoisted-JSX children that carry a
   *  `needsScope` root (`children={<span/>}`). The root's `bf-s` resolves to
   *  the PARENT scope, so the fragment can't bake to a static string — the
   *  runtime `scopeID` is spliced in (`"<span bf-s=\"" + scopeID + "\">x</span>"`).
   *  Null when static `childrenHtml` already covers the children, or when any
   *  other template action survives (genuinely dynamic — drop path). */
  childrenScopedHtmlExpr: string | null
  /**
   * Context values from enclosing `<Ctx.Provider value>` ancestors
   * (`createContext` identifier → Go value literal), wired into this child
   * slot's input against its own context-consumer fields. Empty/undefined when
   * the child isn't under any provider.
   */
  contextBindings?: ReadonlyMap<string, string>
  /**
   * The row scope enclosing this instance: the scope the collection walk
   * started from (a loop-body component's `rowScope` for its forwarded
   * children) plus every loop it descended through, entered via
   * `BindingScope.enterLoopRow`. The loop-row wrapper sites read it to skip
   * a row-dependent prop at constructor time.
   */
  rowScope: BindingScope
}

/**
 * Cross-component shape of a child component the parent renders.
 * `paramNames` are the child's declared `propsParams`; `restBagField` is the
 * Go field name of the child's open-ended rest bag
 * (`Capitalize(restPropsName)`), or null when the child has no `...props` rest.
 */
export interface ChildComponentShape {
  paramNames: Set<string>
  restBagField: string | null
  /**
   * The Go field name(s) an element-spread of the child's OWN rest binding
   * (`{...rest}` on the child's root, as opposed to a member read like
   * `rest.header`) actually renders from — `Spread_<slotId>` fields
   * (IR-build-time-assigned, `jsx-to-ir.ts`'s `spreadIdCounter`), collected
   * structurally off the child's own JSX tree at shape-registration time.
   * `restBagField` (`Rest`) is a SEPARATE struct field the child's own
   * `New<Child>Props` seeds with the identical map (`Spread_0: in.Rest,
   * Rest: in.Rest`) but which the template never reads back — a dynamic
   * per-instance override (`bf_with_bag`, #2805/#3062) that patches only
   * `restBagField` leaves whichever `Spread_N` field the render actually
   * consults stale. Empty when the child has no such element spread (the
   * #2805 shape, `rest.header`, needs no entry here — `restBagField` alone
   * is what that read consults). See `routesToRestBag`'s docstring for the
   * shared-decision rule this closes for `emitChildField` /
   * `queueDynamicPropDefine` / `loopRowChildPropOverrides` alike.
   */
  restBagSpreadFields: readonly string[]
  /**
   * Child param names whose Go field is `map[string]interface{}` — an optional
   * object/named-interface prop (`opts?: EmblaOptionsType`), OR a REQUIRED
   * anonymous-object prop whose synthesized struct name (#2674) collided with
   * an existing local type and fell back to the map convention (#2925). A
   * parent passing an inline object literal to such a param bakes it to a Go
   * map literal so the keys round-trip faithfully.
   */
  mapTypedParamNames: Set<string>
  /**
   * Child param names whose Go field is a synthesized struct (#2674) — a
   * REQUIRED anonymous-object prop (`value: { v: () => number }`; an OPTIONAL
   * one lowers to `map[string]interface{}` instead, see `mapTypedParamNames`
   * above). A parent baking an inline object literal into such a param must
   * target the named struct (`DisplayValue{V: 5}`), not a map — the two are
   * NOT Go-interchangeable (#2925). `goType` is the struct's synthesized Go
   * name; `fields` maps each source property key to its Go field name
   * (`planSynthPropStructs`/`structFieldNamePairs`'s shared naming decision).
   */
  structTypedObjectParams: ReadonlyMap<string, { goType: string; fields: ReadonlyMap<string, string> }>
}

/**
 * True when a JSX attribute the parent passes has no declared field on the
 * child at all and can only reach it through the child's rest-bag spread
 * (`function Card({ children, ...rest }) { ... rest.header ... }`) — the
 * shape #2805's `bf_with_bag` route exists for. Shared by every call site
 * that must decide field-targeted delivery (`bf_with_props`) vs rest-bag
 * delivery (`bf_with_bag`) for the SAME prop: the static bake
 * (`emitChildField`), the dynamic named-children-prop route
 * (`queueDynamicPropDefine`), and the loop-row override route
 * (`loopRowChildPropOverrides`) all answer this question and must agree —
 * "one decision, two implementations" is exactly the defect class a single
 * shared predicate closes.
 */
export function routesToRestBag(shape: ChildComponentShape | undefined, jsxName: string): boolean {
  return !!shape?.restBagField && !shape.paramNames.has(jsxName)
}

/**
 * Every Go field name a dynamic per-instance rest-bag override (`bf_with_bag`,
 * #2805/#3062) must patch to actually reach the child's render — `restBagField`
 * (`Rest`, what a `rest.x` member read consults) PLUS any `restBagSpreadFields`
 * (`Spread_N`, what a `{...rest}` element spread consults). Both are seeded
 * from the identical map at construction time but are SEPARATE struct fields
 * (`New<Child>Props`: `Spread_0: in.Rest, Rest: in.Rest`) — patching only one
 * leaves whichever one the child's render actually reads stale. Empty (never
 * called) when `shape` has no rest bag at all.
 */
export function restBagOverrideFields(shape: ChildComponentShape | undefined): readonly string[] {
  if (!shape?.restBagField) return []
  return [shape.restBagField, ...shape.restBagSpreadFields]
}

/**
 * A parent baking an inline object literal (`value={{ v: count }}`) into a
 * child prop must know whether the child's Go field for that prop is a
 * `map[string]interface{}` or a synthesized struct — the two literal forms
 * are not interchangeable Go (#2925). `undefined` means neither registry
 * entry applies (the prop isn't object-typed on the child at all, or its
 * type is a named interface/`interface` reference rather than an anonymous
 * object — out of scope for this decision, see `structTypedObjectParams`'s
 * docstring).
 */
export type ObjectBakeTarget =
  | { kind: 'map' }
  | { kind: 'struct'; goType: string; fields: ReadonlyMap<string, string> }

export function objectBakeTargetFor(
  shape: ChildComponentShape | undefined,
  jsxName: string,
): ObjectBakeTarget | undefined {
  const struct = shape?.structTypedObjectParams.get(jsxName)
  if (struct) return { kind: 'struct', goType: struct.goType, fields: struct.fields }
  if (shape?.mapTypedParamNames.has(jsxName)) return { kind: 'map' }
  return undefined
}

/**
 * Top-level (non-loop) JSX intrinsic-element spread slot. The adapter emits one
 * `Spread_<slotId> map[string]any` field on the component's Props struct and
 * initialises it in `NewXxxProps` from the source JS expression. Loop-internal
 * spreads don't appear here — they emit the bag inline via the loop's iteration
 * variable instead.
 *
 * `bagSource` records how the bag is supplied:
 * - `'inline'`: constructed inside `NewXxxProps` from compile-time-known data
 *   (signal initial values, prop refs, propsObject enumeration). No Input field.
 * - `'input-bag'`: provided by the caller as a `Spread_<slotId> map[string]any`
 *   field on the Input struct (for `restPropsName` spreads whose keys are
 *   open-ended and can't be enumerated under Go's static typing).
 */
export interface SpreadSlotInfo {
  slotId: string
  expr: string
  /**
   * Best-effort structured parse of `expr`. Lets the conditional inline-object
   * spread lower from the tree instead of re-parsing `expr`. When absent, a
   * non-conditional / `unsupported` tree falls through to the other spread
   * shapes.
   */
  parsed: ParsedExpr | undefined
  templateExpr: string | undefined
  bagSource: 'inline' | 'input-bag'
}

/**
 * Hoisted local var representing a prop with a signal-time `??` fallback. Used
 * to share the fallback-applied value across the prop, signal, and memo fields.
 */
export interface PropFallbackVar {
  /** Local variable name (typically the lowercase prop identifier). */
  varName: string
  /**
   * Capitalised Go field name on the `Input` struct — caller-facing
   * (`sourceName ?? name`, #2525), since every reader does `in.${fieldName}`.
   */
  fieldName: string
  /** Go literal used when the input value equals its zero value. */
  goFallback: string
  /** Go zero literal for the prop's type (`0`, `""`, etc.). */
  zeroLiteral: string
  /**
   * Set when the prop lowered to the nillable `interface{}` representation
   * (#2248): the concrete scalar Go type (`string`/`int`/`float64`/`bool`)
   * the constructor materializes the hoisted local as. Presence switches
   * the emission from the zero-value check (`if v == 0`) to a nil check
   * (`if in.X != nil`), which is what makes an explicit `''`/`0` input
   * distinguishable from an absent one.
   */
  assertType?: string
  /**
   * #2683: set when this fallback var was hoisted from a signal's
   * COLLISION-DERIVATION initializer (`(props.X ?? <lit>) <op> <int>`, where
   * the signal's Go field name collides with prop X's) rather than a plain
   * `props.X ?? <lit>`. `varName` above still holds only the coalesced RAW
   * value (the presence-check declaration is unchanged) — this records the
   * arithmetic wrap the props-field loop applies ON TOP of it so the shared
   * field carries the FULLY DERIVED value, not just the coalesce result.
   */
  collisionWrap?: { operator: string; operand: string }
}

/**
 * Scope for `lowerCtorExpr` — lowering a JS expression to Go in the
 * `NewXxxProps` constructor context.
 */
export interface CtorLowerEnv {
  /** Local names bound to `searchParams()` (`const sp = searchParams()`). */
  searchParamsVars: Set<string>
  /** Helper-param name → its already-lowered Go argument, for inlining. */
  params: Map<string, string>
  /** Component-scope const names currently being inlined (cycle guard). */
  consts?: Set<string>
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
 * Single source of truth for the Go adapter's template-primitive surface. Each
 * entry pairs the expected arity with the emit function so the two derived maps
 * (`templatePrimitives` and `templatePrimitiveArities`) can't drift out of sync.
 */
export interface PrimitiveSpec {
  arity: number
  emit: (args: string[]) => string
}

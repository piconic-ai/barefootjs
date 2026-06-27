/**
 * Internal type definitions for the Go html/template adapter: the adapter's
 * intermediate bookkeeping shapes (nested-component info, static child
 * instances, spread slots, ctor-lowering scope, …) plus the public
 * `GoTemplateAdapterOptions`. Pure type surface — no behaviour.
 */

import type {
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
   * Child param names whose Go field is `map[string]interface{}` — an optional
   * object/named-interface prop (`opts?: EmblaOptionsType`). A parent passing
   * an inline object literal to such a param bakes it to a Go map literal so
   * the keys round-trip faithfully.
   */
  mapTypedParamNames: Set<string>
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
  /** Capitalised Go field name on the `Input` struct. */
  fieldName: string
  /** Go literal used when the input value equals its zero value. */
  goFallback: string
  /** Go zero literal for the prop's type (`0`, `""`, etc.). */
  zeroLiteral: string
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

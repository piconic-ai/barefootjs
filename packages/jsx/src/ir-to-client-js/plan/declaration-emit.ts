/**
 * Plan types for emitting one local declaration (constant / signal / memo /
 * function) and the optional controlled-signal sync effect that follows
 * a `signal` declaration.
 *
 * Replaces the inline 4-branch `if/else` cascade that used to live in
 * the legacy `emitDeclaration::signal` (selecting the
 * `initialValue` expression based on whether the signal is controlled,
 * whether the user wrote `??`, and whether `propsObjectName` is set).
 *
 * Every decision is resolved at build time so the stringifier emits one
 * line per declaration without inspecting `ctx`.
 */

export interface ConstantEmitPlan {
  kind: 'constant'
  /** Declaration keyword — `const` | `let` | `var`. */
  keyword: 'const' | 'let' | 'var'
  name: string
  /** Initializer expression. `null` when emitting a bare `let X` placeholder. */
  valueExpr: string | null
}

export interface SignalEmitPlan {
  kind: 'signal'
  /** Getter identifier (the first tuple slot of `createSignal`). */
  getter: string
  /** Setter identifier — `null` for read-only signals. */
  setter: string | null
  /**
   * Fully-resolved initial value expression. Prop rewrites
   * (`<propsName>.X` → `_p.X`) and `?? <default>` insertions for controlled
   * signals are already applied.
   */
  initialValueExpr: string
  /**
   * When non-null, the stringifier emits a `createEffect` block after
   * the signal declaration that syncs the prop value into the setter.
   */
  controlledEffect: ControlledSignalEffectPlan | null
  /**
   * When set, the signal was declared inside an early-return `if`-block
   * and only the marked branch reaches its `createSignal(...)` call.
   * Stringifier emits:
   *
   *     let getter, setter
   *     if (<branchCondition>) [getter, setter] = createSignal(<initial>)
   *
   * instead of the standard unconditional `const [getter, setter] = …`.
   * Closures and event handlers hoisted to outer init scope close over
   * the `let` bindings and resolve regardless of branch. See #1414
   * cell #8.
   */
  branchCondition?: string
  /** Profile-mode IR-aligned id, appended as the `createSignal` 2nd arg (#1690). */
  bfId?: string
  /**
   * When set, the full initializer expression to emit verbatim instead of
   * `createSignal(<initialValueExpr>)`. Env signals (#2057) emit their own
   * factory call — e.g. `createSearchParams()` — with no baked initial value,
   * profile id, controlled effect, or branch condition (the tuple is a stable
   * request-scoped view, not stored state). When present the stringifier emits
   * `const [<getter>, <setter>] = <initializerOverride>` and nothing else.
   */
  initializerOverride?: string
}

export interface ControlledSignalEffectPlan {
  /** Receiver setter — must equal the parent signal's `setter`. */
  setter: string
  /** Fully-resolved accessor expression read inside the effect. */
  accessorExpr: string
  /** Profile-mode IR-aligned id, appended as the `createEffect` 2nd arg (#1690). */
  bfId?: string
}

export interface MemoEmitPlan {
  kind: 'memo'
  name: string
  /** Source expression passed to `createMemo(...)`. */
  computationExpr: string
  /** Profile-mode IR-aligned id, appended as the `createMemo` 2nd arg (#1690). */
  bfId?: string
}

export interface FunctionEmitPlan {
  kind: 'function'
  name: string
  /** `${param1}, ${param2}, …` — already joined. Empty string when no params. */
  paramList: string
  /** Arrow body — verbatim from the IR (block statement or expression). */
  body: string
  /** When true, the lowered arrow keeps the `async` modifier (#1130). */
  isAsync: boolean
}

export type DeclarationEmitPlan =
  | ConstantEmitPlan
  | SignalEmitPlan
  | MemoEmitPlan
  | FunctionEmitPlan

/**
 * Plan types for emitting one local declaration (constant / signal / memo /
 * function) and the optional controlled-signal sync effect that follows
 * a `signal` declaration.
 *
 * Replaces the inline 4-branch `if/else` cascade that used to live in
 * `emit-init-sections.ts::emitDeclaration::signal` (selecting the
 * `initialValue` expression based on whether the signal is controlled,
 * whether the user wrote `??`, and whether `propsObjectName` is set).
 *
 * Every decision is resolved at build time so the stringifier emits one
 * line per declaration without inspecting `ctx`.
 *
 * A2 of the post-#1054 emit-init maintainability plan.
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
}

export interface ControlledSignalEffectPlan {
  /** Receiver setter — must equal the parent signal's `setter`. */
  setter: string
  /** Fully-resolved accessor expression read inside the effect. */
  accessorExpr: string
}

export interface MemoEmitPlan {
  kind: 'memo'
  name: string
  /** Source expression passed to `createMemo(...)`. */
  computationExpr: string
}

export interface FunctionEmitPlan {
  kind: 'function'
  name: string
  /** `${param1}, ${param2}, …` — already joined. Empty string when no params. */
  paramList: string
  /** Arrow body — verbatim from the IR (block statement or expression). */
  body: string
}

export type DeclarationEmitPlan =
  | ConstantEmitPlan
  | SignalEmitPlan
  | MemoEmitPlan
  | FunctionEmitPlan

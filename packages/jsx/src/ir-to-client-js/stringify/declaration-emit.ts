/**
 * Stringify a `DeclarationEmitPlan` to source lines.
 *
 * Output shapes (preserved byte-identical from the legacy
 * the legacy `emitDeclaration` + `emitControlledSignalEffect`):
 *
 *   constant (with value):  <kw> <name> = <valueExpr>
 *   constant (bare):        <kw> <name>
 *   memo:                   const <name> = createMemo(<computationExpr>)
 *   function:               const <name> = (<paramList>) => <body>
 *   async function:         const <name> = async (<paramList>) => <body>
 *
 *   signal (no setter):     const [<getter>] = createSignal(<initialValueExpr>)
 *   signal (with setter):   const [<getter>, <setter>] = createSignal(<initialValueExpr>)
 *
 *   controlled-signal effect (only when signal.controlledEffect != null):
 *     createEffect(() => {
 *       const __val = <accessorExpr>
 *       if (__val !== undefined) <setter>(__val)
 *     })
 *
 * Indent: every line is `  ` (2 spaces) — same as the legacy emitter.
 */

import type {
  ConstantEmitPlan,
  ControlledSignalEffectPlan,
  DeclarationEmitPlan,
  FunctionEmitPlan,
  MemoEmitPlan,
  SignalEmitPlan,
} from '../plan/declaration-emit.ts'

export function stringifyDeclarationEmit(
  lines: string[],
  plan: DeclarationEmitPlan,
): void {
  switch (plan.kind) {
    case 'constant':
      emitConstant(lines, plan)
      break
    case 'signal':
      emitSignal(lines, plan)
      break
    case 'memo':
      emitMemo(lines, plan)
      break
    case 'function':
      emitFunction(lines, plan)
      break
  }
}

function emitConstant(lines: string[], plan: ConstantEmitPlan): void {
  if (plan.valueExpr !== null) {
    lines.push(`  ${plan.keyword} ${plan.name} = ${plan.valueExpr}`)
  } else {
    lines.push(`  ${plan.keyword} ${plan.name}`)
  }
}

/** Profile-mode trailing `__bfId` argument (`, "Comp#signal:x"`), or '' when off. */
function bfIdArg(bfId: string | undefined): string {
  return bfId ? `, ${JSON.stringify(bfId)}` : ''
}

function emitSignal(lines: string[], plan: SignalEmitPlan): void {
  const id = bfIdArg(plan.bfId)
  if (plan.branchCondition) {
    // #1414 cell #8: signal declared inside an early-return `if`-block.
    // Hoist as `let` so closures and event handlers hoisted to outer
    // init scope can close over the bindings, and assign inside an
    // `if (<branchCondition>) { ... }` so the `createSignal(...)` only
    // runs when the branch is taken. Sibling branches with different
    // signals coexist because each gets its own `let` + guarded assign.
    if (plan.setter) {
      lines.push(`  let ${plan.getter}, ${plan.setter}`)
      lines.push(`  if (${plan.branchCondition}) {`)
      lines.push(`    ;[${plan.getter}, ${plan.setter}] = createSignal(${plan.initialValueExpr}${id})`)
      lines.push(`  }`)
    } else {
      lines.push(`  let ${plan.getter}`)
      lines.push(`  if (${plan.branchCondition}) {`)
      lines.push(`    ;[${plan.getter}] = createSignal(${plan.initialValueExpr}${id})`)
      lines.push(`  }`)
    }
    // Controlled effects don't apply to branch-conditioned signals — a
    // controlled signal is one whose initial value comes from `props.X`,
    // which doesn't intersect with the early-return-branch case.
    return
  }
  if (plan.setter) {
    lines.push(`  const [${plan.getter}, ${plan.setter}] = createSignal(${plan.initialValueExpr}${id})`)
  } else {
    lines.push(`  const [${plan.getter}] = createSignal(${plan.initialValueExpr}${id})`)
  }
  if (plan.controlledEffect) {
    emitControlledEffect(lines, plan.controlledEffect)
  }
}

function emitControlledEffect(lines: string[], plan: ControlledSignalEffectPlan): void {
  lines.push(`  createEffect(() => {`)
  lines.push(`    const __val = ${plan.accessorExpr}`)
  lines.push(`    if (__val !== undefined) ${plan.setter}(__val)`)
  lines.push(`  }${bfIdArg(plan.bfId)})`)
}

function emitMemo(lines: string[], plan: MemoEmitPlan): void {
  lines.push(`  const ${plan.name} = createMemo(${plan.computationExpr}${bfIdArg(plan.bfId)})`)
}

function emitFunction(lines: string[], plan: FunctionEmitPlan): void {
  const asyncKw = plan.isAsync ? 'async ' : ''
  lines.push(`  const ${plan.name} = ${asyncKw}(${plan.paramList}) => ${plan.body}`)
}
